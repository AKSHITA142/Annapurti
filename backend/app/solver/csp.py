import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from sqlalchemy.orm import Session

from app.models.listing import FoodListing
from app.models.request import DonationRequest
from app.models.user import User, ReceiverProfile
from app.models.vehicle import Vehicle
from app.models.log import DecisionLog
from app.services.safety_rules import safety_service
from app.services.travel import travel_minutes, haversine_distance_km
from app.solver.ac3 import AC3Solver
from app.solver.min_conflicts import MinConflictsSolver
from app.solver.objective import objective_evaluator


@dataclass
class DomainOption:
    """Represents an allocation option in a request's domain."""
    request_id: int
    listing_id: int
    lots: int
    mode: str  # self_collect, sender_vehicle, simulated_partner, unallocated
    vehicle_id: Optional[int] = None
    vehicle: Optional[Vehicle] = None
    estimated_arrival: Optional[datetime] = None
    estimated_distance_km: float = 0.0
    estimated_cost_inr: float = 0.0
    is_unallocated: bool = False

    def __repr__(self) -> str:
        if self.is_unallocated:
            return f"<Option req={self.request_id} UNALLOCATED>"
        return (
            f"<Option req={self.request_id} lots={self.lots} "
            f"mode={self.mode} veh={self.vehicle_id}>"
        )


@dataclass
class CSPMetrics:
    """Telemetry and search performance metrics."""
    nodes_visited: int = 0
    backtracks: int = 0
    pruned_unary_count: int = 0
    ac3_pruned_count: int = 0
    used_fallback: bool = False
    solve_time_seconds: float = 0.0
    total_allocated_lots: int = 0
    hard_feasible: bool = True


class CSPSolver:
    def __init__(
        self,
        db: Optional[Session] = None,
        max_nodes: int = 10000,
        timeout_seconds: float = 2.0,
        traffic_level: str = "medium",
        seed: int = 42,
        use_mrv: bool = True,
        use_degree: bool = True,
        use_forward_checking: bool = True,
        use_ac3: bool = True,
    ) -> None:
        self.db = db
        self.max_nodes = max_nodes
        self.timeout_seconds = timeout_seconds
        self.traffic_level = traffic_level
        self.seed = seed
        self.use_mrv = use_mrv
        self.use_degree = use_degree
        self.use_forward_checking = use_forward_checking
        self.use_ac3 = use_ac3

        self.metrics = CSPMetrics()
        self.decision_logs: List[Dict[str, Any]] = []

    def log_decision(
        self,
        entity_type: str,
        entity_id: int,
        step: str,
        decision: str,
        reason_code: str,
        message: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Stores decision log record in memory and in database if session available."""
        record = {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "step": step,
            "decision": decision,
            "reason_code": reason_code,
            "message": message,
            "payload": payload or {},
            "created_at": datetime.now(timezone.utc),
        }
        self.decision_logs.append(record)

        if self.db is not None:
            db_log = DecisionLog(
                entity_type=entity_type,
                entity_id=entity_id,
                step=step,
                decision=decision,
                reason_code=reason_code,
                message=message,
                payload=payload or {},
            )
            self.db.add(db_log)

    def generate_domains(
        self,
        requests: List[DonationRequest],
        listings: Dict[int, FoodListing],
        receivers: Dict[int, User],
        profiles: Dict[int, ReceiverProfile],
        vehicles: List[Vehicle],
        now: Optional[datetime] = None,
    ) -> Dict[int, List[DomainOption]]:
        """
        Generates domain values for each request and applies unary constraint pruning.
        Every pruned option writes a decision log entry with the exact reason code.
        """
        if now is None:
            now = datetime.now(timezone.utc)

        domains: Dict[int, List[DomainOption]] = {}

        for req in requests:
            var_id = req.id
            listing = listings.get(req.listing_id)
            receiver = receivers.get(req.receiver_id)
            profile = profiles.get(req.receiver_id)

            if not listing or not receiver:
                domains[var_id] = [DomainOption(req.id, 0, 0, "unallocated", is_unallocated=True)]
                continue

            options: List[DomainOption] = []

            # 1. Discretized lot multiples: up to requested_lots and available/reserved lots
            lot_size = listing.lot_size or 10
            allocatable_lots = (listing.available_lots or 0) + (getattr(listing, "reserved_lots", 0) or 0)
            max_lots = min(req.requested_lots, allocatable_lots)
            if max_lots <= 0:
                self.log_decision(
                    entity_type="request",
                    entity_id=req.id,
                    step="domain_pruning",
                    decision="prune",
                    reason_code="INVENTORY_EXHAUSTED",
                    message=f"No available lots left for listing {listing.id}",
                    payload={"listing_id": listing.id},
                )
                domains[var_id] = [DomainOption(req.id, listing.id, 0, "unallocated", is_unallocated=True)]
                continue

            lot_quantities = [max_lots]
            if max_lots > 1:
                lot_quantities.append(max_lots // 2)
            lot_quantities = sorted(list(set(lot_quantities)), reverse=True)

            # Available delivery modes: self_collect, sender_vehicle, simulated_partner
            modes_to_try = []
            if listing.delivery_mode_offered in ("self_collect", "all"):
                modes_to_try.append(("self_collect", None))

            for v in vehicles:
                if v.owner_id == listing.provider_id:
                    modes_to_try.append(("sender_vehicle", v))
                elif v.is_simulated:
                    modes_to_try.append(("simulated_partner", v))

            # If no vehicles, at least try self-collection
            if not modes_to_try:
                modes_to_try.append(("self_collect", None))

            pickup_coord = (listing.pickup_lat, listing.pickup_lng)
            receiver_coord = (
                (receiver.lat, receiver.lng)
                if receiver.lat is not None and receiver.lng is not None
                else pickup_coord
            )

            # Evaluate each candidate (lot_qty, mode, vehicle)
            for lots in lot_quantities:
                for mode, veh in modes_to_try:
                    # Unary Constraint 1: Category accepted by receiver
                    if profile and profile.accepted_categories:
                        if listing.category not in profile.accepted_categories:
                            self.log_decision(
                                entity_type="request",
                                entity_id=req.id,
                                step="domain_pruning",
                                decision="prune",
                                reason_code="CATEGORY_REJECTED",
                                message=(
                                    f"Receiver {receiver.id} does not accept category "
                                    f"'{listing.category}'"
                                ),
                                payload={"category": listing.category},
                            )
                            self.metrics.pruned_unary_count += 1
                            continue

                    # Unary Constraint 2: Temperature-controlled cold chain
                    if veh is not None:
                        if not safety_service.is_vehicle_suitable(listing.category, veh.has_cold_storage):
                            self.log_decision(
                                entity_type="request",
                                entity_id=req.id,
                                step="domain_pruning",
                                decision="prune",
                                reason_code="COLD_CHAIN_REQUIRED",
                                message=(
                                    f"Food category '{listing.category}' requires cold storage, "
                                    f"but vehicle {veh.id} lacks it"
                                ),
                                payload={"vehicle_id": veh.id},
                            )
                            self.metrics.pruned_unary_count += 1
                            continue

                    # Unary Constraint 3: Vehicle capacity at least lots
                    if veh is not None and veh.capacity_lots < lots:
                        self.log_decision(
                            entity_type="request",
                            entity_id=req.id,
                            step="domain_pruning",
                            decision="prune",
                            reason_code="CAPACITY",
                            message=(
                                f"Requested {lots} lots exceeds vehicle {veh.id} "
                                f"capacity ({veh.capacity_lots} lots)"
                            ),
                            payload={"vehicle_id": veh.id, "lots": lots},
                        )
                        self.metrics.pruned_unary_count += 1
                        continue

                    # Unary Constraint 4: Vehicle service radius (for sender vehicles)
                    dist_km = haversine_distance_km(pickup_coord, receiver_coord)
                    if mode == "sender_vehicle" and veh is not None and veh.service_radius_km is not None:
                        if dist_km > veh.service_radius_km:
                            self.log_decision(
                                entity_type="request",
                                entity_id=req.id,
                                step="domain_pruning",
                                decision="prune",
                                reason_code="SERVICE_RADIUS",
                                message=(
                                    f"Distance {dist_km:.1f} km exceeds vehicle {veh.id} "
                                    f"radius {veh.service_radius_km} km"
                                ),
                                payload={"distance_km": dist_km, "radius_km": veh.service_radius_km},
                            )
                            self.metrics.pruned_unary_count += 1
                            continue

                    # Travel times & arrival calculation
                    veh_coord = (veh.lat, veh.lng) if veh else pickup_coord
                    travel_to_pickup = (
                        travel_minutes(veh_coord, pickup_coord, traffic_level=self.traffic_level)
                        if veh
                        else 0.0
                    )
                    travel_to_receiver = travel_minutes(
                        pickup_coord, receiver_coord, traffic_level=self.traffic_level
                    )

                    # Unary Constraint 5: Journey meets safe deadline
                    is_feasible, arrival, slack = safety_service.check_journey_feasibility(
                        depart_time=now,
                        travel_to_pickup_minutes=travel_to_pickup,
                        travel_to_receiver_minutes=travel_to_receiver,
                        safe_deadline=listing.safe_deadline,
                    )

                    if not is_feasible:
                        self.log_decision(
                            entity_type="request",
                            entity_id=req.id,
                            step="domain_pruning",
                            decision="prune",
                            reason_code="SAFETY_DEADLINE",
                            message=(
                                f"Delivery arrival ({arrival.isoformat()}) exceeds "
                                f"safe deadline ({listing.safe_deadline.isoformat()})"
                            ),
                            payload={"arrival": arrival.isoformat(), "slack_minutes": slack},
                        )
                        self.metrics.pruned_unary_count += 1
                        continue

                    # Cost estimation
                    cost_inr = 0.0
                    if mode == "sender_vehicle":
                        cost_inr = dist_km * 15.0
                    elif mode == "simulated_partner":
                        cost_inr = dist_km * 25.0

                    options.append(
                        DomainOption(
                            request_id=req.id,
                            listing_id=listing.id,
                            lots=lots,
                            mode=mode,
                            vehicle_id=veh.id if veh else None,
                            vehicle=veh,
                            estimated_arrival=arrival,
                            estimated_distance_km=dist_km,
                            estimated_cost_inr=cost_inr,
                            is_unallocated=False,
                        )
                    )

            # Always add unallocated fallback option (allowed but penalised)
            options.append(
                DomainOption(
                    request_id=req.id,
                    listing_id=listing.id,
                    lots=0,
                    mode="unallocated",
                    is_unallocated=True,
                )
            )

            domains[var_id] = options

        return domains

    def build_neighborhood(
        self,
        requests: List[DonationRequest],
    ) -> Dict[int, Set[int]]:
        """
        Builds graph neighbors for AC-3 and Degree heuristic.
        Two requests are neighbors if they share the same listing or potentially share vehicles.
        """
        neighbors: Dict[int, Set[int]] = {req.id: set() for req in requests}
        by_listing: Dict[int, List[int]] = {}

        for req in requests:
            by_listing.setdefault(req.listing_id, []).append(req.id)

        for req_list in by_listing.values():
            for i in range(len(req_list)):
                for j in range(i + 1, len(req_list)):
                    neighbors[req_list[i]].add(req_list[j])
                    neighbors[req_list[j]].add(req_list[i])

        return neighbors

    def check_binary_constraint(
        self,
        var_i: int,
        opt_i: DomainOption,
        var_j: int,
        opt_j: DomainOption,
        listings: Dict[int, FoodListing],
    ) -> bool:
        """
        Binary constraint checker for AC-3:
        1. Listing inventory: sum of lots from same listing cannot exceed total available lots.
        2. Vehicle overlap: two requests on same vehicle cannot exceed vehicle capacity.
        """
        if opt_i.is_unallocated or opt_j.is_unallocated:
            return True

        # Binary constraint 1: Same listing capacity
        if opt_i.listing_id == opt_j.listing_id:
            listing = listings.get(opt_i.listing_id)
            if listing:
                allocatable_capacity = (listing.available_lots or 0) + (getattr(listing, "reserved_lots", 0) or 0)
                if opt_i.lots + opt_j.lots > allocatable_capacity:
                    return False

        # Binary constraint 2: Same vehicle capacity
        if opt_i.vehicle_id is not None and opt_i.vehicle_id == opt_j.vehicle_id:
            if opt_i.vehicle and (opt_i.lots + opt_j.lots > opt_i.vehicle.capacity_lots):
                return False

        return True

    def select_unassigned_variable(
        self,
        assignment: Dict[int, DomainOption],
        domains: Dict[int, List[DomainOption]],
        neighbors: Dict[int, Set[int]],
    ) -> int:
        """
        Variable selection heuristic:
        1. MRV (Minimum Remaining Values): fewest legal remaining options
        2. Degree heuristic (tie-breaker): highest number of unassigned neighbors
        """
        unassigned = [v for v in domains if v not in assignment]
        if not unassigned:
            raise ValueError("No unassigned variables remaining")

        if not self.use_mrv:
            return unassigned[0]

        best_var = unassigned[0]
        min_domain_size = len(domains[best_var])
        max_degree = -1

        for var in unassigned:
            d_size = len(domains[var])
            # Count unassigned neighbors
            degree = len([n for n in neighbors.get(var, set()) if n not in assignment])

            if d_size < min_domain_size:
                min_domain_size = d_size
                max_degree = degree
                best_var = var
            elif d_size == min_domain_size and self.use_degree and degree > max_degree:
                max_degree = degree
                best_var = var

        return best_var

    def order_domain_values(
        self,
        var: int,
        domains: Dict[int, List[DomainOption]],
    ) -> List[DomainOption]:
        """
        Value ordering heuristic:
        Orders options by objective contribution: higher lots first, lower cost first,
        with unallocated option last.
        """
        options = domains[var]
        return sorted(
            options,
            key=lambda o: (
                1 if o.is_unallocated else 0,  # Real allocations before unallocated
                -o.lots,                        # Maximise lots
                o.estimated_cost_inr,          # Minimise cost
                o.estimated_distance_km,       # Minimise distance
            ),
        )

    def is_assignment_consistent(
        self,
        var: int,
        val: DomainOption,
        assignment: Dict[int, DomainOption],
        listings: Dict[int, FoodListing],
        profiles: Dict[int, ReceiverProfile],
        requests_dict: Dict[int, DonationRequest],
    ) -> bool:
        """
        Forward checking and running totals validator:
        1. Total allocated lots per listing <= available_lots
        2. Total receiver intake <= remaining capacity
        3. Total vehicle load <= vehicle capacity
        """
        if val.is_unallocated:
            return True

        # 1. Listing capacity running total
        listing = listings.get(val.listing_id)
        if listing:
            allocatable_capacity = (listing.available_lots or 0) + (getattr(listing, "reserved_lots", 0) or 0)
            current_listing_lots = sum(
                opt.lots
                for v_id, opt in assignment.items()
                if not opt.is_unallocated and opt.listing_id == val.listing_id
            )
            if current_listing_lots + val.lots > allocatable_capacity:
                return False

        # 2. Receiver profile intake capacity running total
        req = requests_dict.get(var)
        if req:
            profile = profiles.get(req.receiver_id)
            if profile:
                current_receiver_lots = sum(
                    opt.lots
                    for v_id, opt in assignment.items()
                    if not opt.is_unallocated
                    and requests_dict.get(v_id)
                    and requests_dict[v_id].receiver_id == req.receiver_id
                )
                if current_receiver_lots + val.lots > profile.remaining_capacity:
                    return False

        # 3. Vehicle capacity running total
        if val.vehicle_id is not None and val.vehicle:
            current_vehicle_load = sum(
                opt.lots
                for v_id, opt in assignment.items()
                if not opt.is_unallocated and opt.vehicle_id == val.vehicle_id
            )
            if current_vehicle_load + val.lots > val.vehicle.capacity_lots:
                return False

        return True

    def backtrack_search(
        self,
        assignment: Dict[int, DomainOption],
        domains: Dict[int, List[DomainOption]],
        neighbors: Dict[int, Set[int]],
        listings: Dict[int, FoodListing],
        profiles: Dict[int, ReceiverProfile],
        requests_dict: Dict[int, DonationRequest],
        start_time: float,
    ) -> Optional[Dict[int, DomainOption]]:
        """
        Recursive backtracking search with MRV, Degree, Forward Checking and AC-3.
        """
        self.metrics.nodes_visited += 1

        # Check node & time limits
        if self.metrics.nodes_visited > self.max_nodes or (time.time() - start_time) > self.timeout_seconds:
            self.metrics.used_fallback = True
            return None

        # Base case: all variables assigned
        if len(assignment) == len(domains):
            return assignment

        var = self.select_unassigned_variable(assignment, domains, neighbors)

        for val in self.order_domain_values(var, domains):
            if self.is_assignment_consistent(var, val, assignment, listings, profiles, requests_dict):
                assignment[var] = val

                result = self.backtrack_search(
                    assignment,
                    domains,
                    neighbors,
                    listings,
                    profiles,
                    requests_dict,
                    start_time,
                )
                if result is not None:
                    return result

                # Backtrack
                self.metrics.backtracks += 1
                self.log_decision(
                    entity_type="request",
                    entity_id=var,
                    step="backtracking",
                    decision="reassign",
                    reason_code="BACKTRACK",
                    message=f"Backtracking on request {var} from option {val}",
                    payload={"option": str(val)},
                )
                del assignment[var]

        return None

    def solve(
        self,
        requests: List[DonationRequest],
        listings: Dict[int, FoodListing],
        receivers: Dict[int, User],
        profiles: Dict[int, ReceiverProfile],
        vehicles: List[Vehicle],
        now: Optional[datetime] = None,
    ) -> Dict[int, DomainOption]:
        """
        Main entrypoint: Solves the allocation CSP.
        If backtracking hits node or time limits, seamlessly invokes Min-Conflicts fallback.
        """
        start_time = time.time()
        requests_dict = {r.id: r for r in requests}

        # 1. Unary pruning & domain generation
        domains = self.generate_domains(requests, listings, receivers, profiles, vehicles, now=now)
        neighbors = self.build_neighborhood(requests)

        # 2. AC-3 on binary constraints
        if self.use_ac3:
            checker = lambda vi, oi, vj, oj: self.check_binary_constraint(vi, oi, vj, oj, listings)
            is_consistent, domains, pruned = AC3Solver.run_ac3(
                list(domains.keys()), domains, checker, neighbors
            )
            self.metrics.ac3_pruned_count = len(pruned)
            for var_id, val, r_code in pruned:
                self.log_decision(
                    entity_type="request",
                    entity_id=var_id,
                    step="ac3",
                    decision="prune",
                    reason_code=r_code,
                    message=f"AC-3 pruned option {val} on request {var_id}",
                )

        # 3. Backtracking search with MRV, Degree, Forward Checking
        assignment: Dict[int, DomainOption] = {}
        solution = self.backtrack_search(
            assignment,
            domains,
            neighbors,
            listings,
            profiles,
            requests_dict,
            start_time,
        )

        # 4. Fallback: Min-Conflicts if search timed out or exceeded node limits
        if solution is None or self.metrics.used_fallback:
            self.metrics.used_fallback = True
            self.log_decision(
                entity_type="system",
                entity_id=0,
                step="search",
                decision="reassign",
                reason_code="SEARCH_LIMIT_EXCEEDED",
                message=(
                    f"Backtracking exceeded limits ({self.metrics.nodes_visited} nodes). "
                    "Running Min-Conflicts fallback."
                ),
            )

            # Conflict checkers for min-conflicts
            def conflict_counter(assign: Dict[int, Any]) -> int:
                c = 0
                for v_id, opt in assign.items():
                    if opt is not None and not opt.is_unallocated:
                        c += var_conflict_counter(v_id, opt, assign)
                return c

            def var_conflict_counter(v_id: int, opt: Any, assign: Dict[int, Any]) -> int:
                if opt is None or opt.is_unallocated:
                    return 0
                conflicts = 0
                # Check listing capacity overflow
                list_lots = sum(
                    o.lots
                    for other_v, o in assign.items()
                    if o is not None and not o.is_unallocated and o.listing_id == opt.listing_id
                )
                listing = listings.get(opt.listing_id)
                if listing and list_lots > listing.available_lots:
                    conflicts += (list_lots - listing.available_lots)

                # Check vehicle load overflow
                if opt.vehicle_id is not None and opt.vehicle:
                    v_load = sum(
                        o.lots
                        for other_v, o in assign.items()
                        if o is not None and not o.is_unallocated and o.vehicle_id == opt.vehicle_id
                    )
                    if v_load > opt.vehicle.capacity_lots:
                        conflicts += (v_load - opt.vehicle.capacity_lots)

                return conflicts

            def hard_validator(assign: Dict[int, Any]) -> bool:
                return conflict_counter(assign) == 0

            solution = MinConflictsSolver.solve(
                variables=list(domains.keys()),
                domains=domains,
                conflict_counter=conflict_counter,
                variable_conflict_counter=var_conflict_counter,
                hard_constraint_validator=hard_validator,
                seed=self.seed,
            )

        # 5. Record final allocation decisions for every request in decision_log
        for req_id, opt in solution.items():
            if opt and not opt.is_unallocated:
                self.log_decision(
                    entity_type="request",
                    entity_id=req_id,
                    step="allocation",
                    decision="accept",
                    reason_code="ALLOCATED_SUCCESS",
                    message=(
                        f"Request {req_id} allocated {opt.lots} lots via "
                        f"{opt.mode} (vehicle={opt.vehicle_id})"
                    ),
                    payload={
                        "lots": opt.lots,
                        "mode": opt.mode,
                        "vehicle_id": opt.vehicle_id,
                        "arrival": opt.estimated_arrival.isoformat() if opt.estimated_arrival else None,
                    },
                )
            else:
                req_obj = requests_dict.get(req_id)
                self.log_decision(
                    entity_type="request",
                    entity_id=req_id,
                    step="allocation",
                    decision="reject",
                    reason_code="UNALLOCATED",
                    message=f"Request {req_id} could not be allocated feasible delivery arrangement",
                    payload={"requested_lots": req_obj.requested_lots if req_obj else 0},
                )

        # 6. Finalize metrics
        self.metrics.solve_time_seconds = round(time.time() - start_time, 4)
        total_lots = sum(opt.lots for opt in solution.values() if opt and not opt.is_unallocated)
        self.metrics.total_allocated_lots = total_lots

        # Commit decision logs if db is attached
        if self.db is not None:
            self.db.commit()

        return solution
