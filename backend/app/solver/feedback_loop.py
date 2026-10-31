import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
from sqlalchemy.orm import Session

from app.models.listing import FoodListing
from app.models.request import DonationRequest
from app.models.user import User, ReceiverProfile
from app.models.vehicle import Vehicle
from app.solver.csp import CSPSolver, DomainOption
from app.solver.routing import RoutingEngine
from app.solver.validator import RouteStop, RouteValidationResult, validate_route


@dataclass
class FeedbackLoopResult:
    """Outcome of the allocation-routing feedback loop."""
    allocations: Dict[int, DomainOption]
    vehicle_routes: Dict[int, List[RouteStop]]
    route_validations: Dict[int, RouteValidationResult]
    infeasible_requests: List[int]
    repair_rounds_run: int
    learned_nogoods: Set[Tuple[int, str, Optional[int]]]
    all_routes_valid: bool


class FeedbackLoopCoordinator:
    """
    Coordinates the Allocation -> Routing -> Validation -> Repair feedback loop.
    Guarantees that an allocation is NEVER confirmed unless it can be safely delivered.
    Learns nogoods from routing violations and iteratively repairs candidate plans.
    """

    def __init__(
        self,
        db: Optional[Session] = None,
        max_repair_rounds: int = 5,
        traffic_level: str = "medium",
        seed: int = 42,
    ) -> None:
        self.db = db
        self.max_repair_rounds = max_repair_rounds
        self.traffic_level = traffic_level
        self.seed = seed
        self.learned_nogoods: Set[Tuple[int, str, Optional[int]]] = set()

    def _build_route_stops_for_vehicle(
        self,
        vehicle_id: int,
        vehicle_allocations: List[Tuple[int, DomainOption]],
        requests_dict: Dict[int, DonationRequest],
        listings_dict: Dict[int, FoodListing],
        receivers_dict: Dict[int, User],
        now: datetime,
    ) -> List[RouteStop]:
        """
        Converts allocated requests into pairs of (pickup, delivery) RouteStops.
        """
        stops: List[RouteStop] = []
        for req_id, opt in vehicle_allocations:
            req = requests_dict.get(req_id)
            listing = listings_dict.get(opt.listing_id)
            receiver = receivers_dict.get(req.receiver_id) if req else None

            if not req or not listing or not receiver:
                continue

            pickup_coord = (listing.pickup_lat, listing.pickup_lng)
            receiver_coord = (
                (receiver.lat, receiver.lng)
                if receiver.lat is not None and receiver.lng is not None
                else pickup_coord
            )

            # Pickup Stop
            p_stop = RouteStop(
                stop_id=req_id * 2 - 1,
                request_id=req_id,
                stop_type="pickup",
                coord=pickup_coord,
                lot_change=opt.lots,
                name=f"Pickup for Req {req_id} ({listing.name})",
                time_window_start=listing.pickup_window_start,
                time_window_end=listing.pickup_window_end,
                safe_deadline=listing.safe_deadline,
                service_time_minutes=10,
                needs_cold_storage=(listing.category in ("cooked_chilled", "raw_refrigerated")),
            )

            # Delivery Stop
            d_stop = RouteStop(
                stop_id=req_id * 2,
                request_id=req_id,
                stop_type="delivery",
                coord=receiver_coord,
                lot_change=-opt.lots,
                name=f"Delivery to {receiver.name} (Req {req_id})",
                time_window_start=listing.pickup_window_start,
                time_window_end=listing.safe_deadline,
                safe_deadline=listing.safe_deadline,
                service_time_minutes=5,
                needs_cold_storage=(listing.category in ("cooked_chilled", "raw_refrigerated")),
            )

            stops.extend([p_stop, d_stop])

        return stops

    def run(
        self,
        requests: List[DonationRequest],
        listings: Dict[int, FoodListing],
        receivers: Dict[int, User],
        profiles: Dict[int, ReceiverProfile],
        vehicles: List[Vehicle],
        now: Optional[datetime] = None,
        committed_request_ids: Optional[Set[int]] = None,
    ) -> FeedbackLoopResult:
        """
        Executes the feedback loop:
        1. Allocate using CSP solver (pruning any learned nogoods).
        2. Route per vehicle using RoutingEngine.
        3. Validate per vehicle using validate_route.
        4. If violations exist:
           - identify conflicting request IDs
           - learn nogoods (forbidden allocations)
           - re-allocate and re-route
        5. Terminate when all routes valid or max rounds reached.
        """
        if now is None:
            now = datetime.now(timezone.utc)

        requests_dict = {r.id: r for r in requests}
        vehicles_dict = {v.id: v for v in vehicles}
        committed_ids = committed_request_ids or set()

        current_allocations: Dict[int, DomainOption] = {}
        vehicle_routes: Dict[int, List[RouteStop]] = {}
        route_validations: Dict[int, RouteValidationResult] = {}
        infeasible_requests: List[int] = []

        round_num = 0

        while round_num < self.max_repair_rounds:
            round_num += 1

            # 1. CSP Allocation
            solver = CSPSolver(
                db=self.db,
                traffic_level=self.traffic_level,
                seed=self.seed + round_num,
            )

            # Prune domain options that match learned nogoods
            raw_domains = solver.generate_domains(
                requests, listings, receivers, profiles, vehicles, now=now
            )
            filtered_domains: Dict[int, List[DomainOption]] = {}

            for r_id, opts in raw_domains.items():
                valid_opts = []
                for opt in opts:
                    nogood_key = (r_id, opt.mode, opt.vehicle_id)
                    if nogood_key in self.learned_nogoods:
                        solver.log_decision(
                            entity_type="request",
                            entity_id=r_id,
                            step="repair",
                            decision="prune",
                            reason_code="ROUTING_NOGOOD_PRUNED",
                            message=(
                                f"Option {opt.mode} on vehicle {opt.vehicle_id} "
                                f"pruned by learned routing nogood"
                            ),
                            payload={"nogood": str(nogood_key)},
                        )
                    else:
                        valid_opts.append(opt)

                # Ensure unallocated fallback remains available
                if not any(o.is_unallocated for o in valid_opts):
                    listing_id = requests_dict[r_id].listing_id if r_id in requests_dict else 0
                    valid_opts.append(
                        DomainOption(
                            request_id=r_id,
                            listing_id=listing_id,
                            lots=0,
                            mode="unallocated",
                            is_unallocated=True,
                        )
                    )
                filtered_domains[r_id] = valid_opts

            # Solve CSP with filtered domains
            # Override solver domains with filtered ones
            solver.generate_domains = lambda *args, **kwargs: filtered_domains
            current_allocations = solver.solve(
                requests, listings, receivers, profiles, vehicles, now=now
            )

            # 2. Group allocations by vehicle
            by_vehicle: Dict[int, List[Tuple[int, DomainOption]]] = {}
            for req_id, opt in current_allocations.items():
                if opt and not opt.is_unallocated and opt.vehicle_id is not None:
                    by_vehicle.setdefault(opt.vehicle_id, []).append((req_id, opt))

            # 3. Route and Validate each vehicle
            new_violations_found = False
            vehicle_routes.clear()
            route_validations.clear()

            for v_id, v_allocs in by_vehicle.items():
                veh = vehicles_dict.get(v_id)
                if not veh:
                    continue

                stops = self._build_route_stops_for_vehicle(
                    v_id, v_allocs, requests_dict, listings, receivers, now
                )
                start_coord = (veh.lat, veh.lng)

                # Optimize route
                route, val_result = RoutingEngine.optimize_route(
                    stops=stops,
                    start_coord=start_coord,
                    vehicle_capacity=veh.capacity_lots,
                    vehicle_has_cold_storage=veh.has_cold_storage,
                    start_time=now,
                    traffic_level=self.traffic_level,
                )

                vehicle_routes[v_id] = route
                route_validations[v_id] = val_result

                # Check if this route has violations
                if not val_result.is_valid:
                    new_violations_found = True
                    for viol in val_result.violations:
                        for conf_req_id in viol.request_ids:
                            # NEVER move committed requests
                            if conf_req_id in committed_ids:
                                continue

                            conf_opt = current_allocations.get(conf_req_id)
                            if conf_opt:
                                nogood = (conf_req_id, conf_opt.mode, conf_opt.vehicle_id)
                                self.learned_nogoods.add(nogood)

                                if self.db is not None:
                                    solver.log_decision(
                                        entity_type="request",
                                        entity_id=conf_req_id,
                                        step="repair",
                                        decision="reject",
                                        reason_code="ROUTING_FEEDBACK_REPAIR",
                                        message=(
                                            f"Round {round_num}: Learned nogood for request {conf_req_id} "
                                            f"due to {viol.violation_type} on vehicle {v_id}"
                                        ),
                                        payload={
                                            "round": round_num,
                                            "violation_type": viol.violation_type,
                                            "vehicle_id": v_id,
                                        },
                                    )

            # If all vehicle routes are 100% valid, feedback loop succeeded!
            if not new_violations_found:
                break

        # Check final route validity
        all_valid = all(v.is_valid for v in route_validations.values())

        # Collect requests that ended up unallocated or in an invalid route
        infeasible_requests = [
            req.id
            for req in requests
            if (req.id not in current_allocations)
            or (current_allocations[req.id].is_unallocated)
            or (
                current_allocations[req.id].vehicle_id is not None
                and not route_validations.get(
                    current_allocations[req.id].vehicle_id, RouteValidationResult(False, [])
                ).is_valid
            )
        ]

        return FeedbackLoopResult(
            allocations=current_allocations,
            vehicle_routes=vehicle_routes,
            route_validations=route_validations,
            infeasible_requests=infeasible_requests,
            repair_rounds_run=round_num,
            learned_nogoods=self.learned_nogoods,
            all_routes_valid=all_valid,
        )

