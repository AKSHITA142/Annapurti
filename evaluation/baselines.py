from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.models.listing import FoodListing
from app.models.request import DonationRequest
from app.models.user import User, ReceiverProfile
from app.models.vehicle import Vehicle
from app.services.safety_rules import safety_service
from app.services.travel import haversine_distance_km
from app.solver.routing import RoutingEngine
from app.solver.validator import RouteStop, RouteValidationResult, validate_route


@dataclass
class BaselineResult:
    method_name: str
    allocated_lots: int
    unallocated_lots: int
    safely_delivered_lots: int
    deadline_violations: int
    capacity_violations: int
    precedence_violations: int
    total_distance_km: float
    total_time_minutes: float
    solve_time_seconds: float
    fairness_variance: float


def run_nearest_first_baseline(
    requests: List[DonationRequest],
    listings: Dict[int, FoodListing],
    receivers: Dict[int, User],
    profiles: Dict[int, ReceiverProfile],
    vehicles: List[Vehicle],
    now: datetime,
    traffic_level: str = "medium",
) -> BaselineResult:
    """
    Baseline B1: Nearest-Receiver-First Greedy.
    Prioritises requests strictly by proximity (closest donor-to-receiver distance first).
    """
    start_t = datetime.now()

    # Calculate distance for each request
    def req_dist(r: DonationRequest) -> float:
        l = listings.get(r.listing_id)
        u = receivers.get(r.receiver_id)
        if not l or not u or u.lat is None or u.lng is None:
            return 999.0
        return haversine_distance_km((l.pickup_lat, l.pickup_lng), (u.lat, u.lng))

    sorted_reqs = sorted(requests, key=req_dist)

    # Greedy allocation tracking
    listing_avail = {lid: l.available_lots for lid, l in listings.items()}
    receiver_cap = {rid: p.remaining_capacity for rid, p in profiles.items()}
    vehicle_routes_stops: Dict[int, List[RouteStop]] = {v.id: [] for v in vehicles}
    vehicle_current_load: Dict[int, int] = {v.id: 0 for v in vehicles}

    allocated_reqs: Dict[int, int] = {}

    for req in sorted_reqs:
        l = listings.get(req.listing_id)
        rec = receivers.get(req.receiver_id)
        prof = profiles.get(req.receiver_id)

        if not l or not rec or not prof:
            continue

        # Check inventory and intake capacity
        avail = listing_avail.get(req.listing_id, 0)
        rec_rem = receiver_cap.get(req.receiver_id, 0)
        lots_to_take = min(req.requested_lots, avail, rec_rem)

        if lots_to_take <= 0:
            continue

        # Check category
        if l.category not in prof.accepted_categories:
            continue

        # Find first capable vehicle (greedy)
        assigned_veh = None
        for v in vehicles:
            if v.capacity_lots - vehicle_current_load[v.id] >= lots_to_take:
                if l.category not in ("cooked_chilled", "raw_refrigerated") or v.has_cold_storage:
                    assigned_veh = v
                    break

        if assigned_veh:
            listing_avail[req.listing_id] -= lots_to_take
            receiver_cap[req.receiver_id] -= lots_to_take
            vehicle_current_load[assigned_veh.id] += lots_to_take
            allocated_reqs[req.id] = lots_to_take

            p_stop = RouteStop(
                stop_id=req.id * 2 - 1,
                request_id=req.id,
                stop_type="pickup",
                coord=(l.pickup_lat, l.pickup_lng),
                lot_change=lots_to_take,
                name="Pickup",
                safe_deadline=l.safe_deadline,
                service_time_minutes=10,
            )
            d_stop = RouteStop(
                stop_id=req.id * 2,
                request_id=req.id,
                stop_type="delivery",
                coord=(rec.lat, rec.lng) if rec.lat else (l.pickup_lat, l.pickup_lng),
                lot_change=-lots_to_take,
                name="Delivery",
                safe_deadline=l.safe_deadline,
                service_time_minutes=5,
            )
            vehicle_routes_stops[assigned_veh.id].extend([p_stop, d_stop])

    # Validate all routes and check violations
    total_distance = 0.0
    total_time = 0.0
    deadline_viols = 0
    cap_viols = 0
    prec_viols = 0
    safely_delivered = 0

    for v in vehicles:
        stops = vehicle_routes_stops[v.id]
        if stops:
            val = validate_route(
                route=stops,
                vehicle_capacity=v.capacity_lots,
                vehicle_has_cold_storage=v.has_cold_storage,
                start_time=now,
                start_coord=(v.lat, v.lng),
                traffic_level=traffic_level,
            )
            total_distance += val.total_distance_km
            total_time += val.total_time_minutes

            viol_reqs_in_this_route = set()
            for viol in val.violations:
                viol_reqs_in_this_route.update(viol.request_ids)
                if viol.violation_type == "SAFETY_DEADLINE_EXCEEDED":
                    deadline_viols += 1
                elif viol.violation_type == "CAPACITY_OVERFLOW":
                    cap_viols += 1
                elif viol.violation_type == "PRECEDENCE_VIOLATION":
                    prec_viols += 1

            for s in stops:
                if s.stop_type == "delivery":
                    if s.request_id not in viol_reqs_in_this_route:
                        safely_delivered += abs(s.lot_change)

    total_requested = sum(r.requested_lots for r in requests)
    total_allocated = sum(allocated_reqs.values())
    unallocated = total_requested - total_allocated
    elapsed = (datetime.now() - start_t).total_seconds()

    return BaselineResult(
        method_name="B1_Nearest_Receiver",
        allocated_lots=total_allocated,
        unallocated_lots=unallocated,
        safely_delivered_lots=safely_delivered,
        deadline_violations=deadline_viols,
        capacity_violations=cap_viols,
        precedence_violations=prec_viols,
        total_distance_km=round(total_distance, 2),
        total_time_minutes=round(total_time, 2),
        solve_time_seconds=round(elapsed, 4),
        fairness_variance=0.0,
    )


def run_fcfs_baseline(
    requests: List[DonationRequest],
    listings: Dict[int, FoodListing],
    receivers: Dict[int, User],
    profiles: Dict[int, ReceiverProfile],
    vehicles: List[Vehicle],
    now: datetime,
    traffic_level: str = "medium",
) -> BaselineResult:
    """
    Baseline B2: First-Come-First-Served (FCFS).
    Allocates requests strictly in chronological creation order.
    """
    start_t = datetime.now()
    sorted_reqs = sorted(requests, key=lambda r: (r.created_at or datetime.min))

    listing_avail = {lid: l.available_lots for lid, l in listings.items()}
    receiver_cap = {rid: p.remaining_capacity for rid, p in profiles.items()}
    vehicle_routes_stops: Dict[int, List[RouteStop]] = {v.id: [] for v in vehicles}
    vehicle_current_load: Dict[int, int] = {v.id: 0 for v in vehicles}

    allocated_reqs: Dict[int, int] = {}

    for req in sorted_reqs:
        l = listings.get(req.listing_id)
        rec = receivers.get(req.receiver_id)
        prof = profiles.get(req.receiver_id)

        if not l or not rec or not prof:
            continue

        avail = listing_avail.get(req.listing_id, 0)
        rec_rem = receiver_cap.get(req.receiver_id, 0)
        lots_to_take = min(req.requested_lots, avail, rec_rem)

        if lots_to_take <= 0 or l.category not in prof.accepted_categories:
            continue

        assigned_veh = None
        for v in vehicles:
            if v.capacity_lots - vehicle_current_load[v.id] >= lots_to_take:
                if l.category not in ("cooked_chilled", "raw_refrigerated") or v.has_cold_storage:
                    assigned_veh = v
                    break

        if assigned_veh:
            listing_avail[req.listing_id] -= lots_to_take
            receiver_cap[req.receiver_id] -= lots_to_take
            vehicle_current_load[assigned_veh.id] += lots_to_take
            allocated_reqs[req.id] = lots_to_take

            p_stop = RouteStop(
                stop_id=req.id * 2 - 1,
                request_id=req.id,
                stop_type="pickup",
                coord=(l.pickup_lat, l.pickup_lng),
                lot_change=lots_to_take,
                name="Pickup",
                safe_deadline=l.safe_deadline,
                service_time_minutes=10,
            )
            d_stop = RouteStop(
                stop_id=req.id * 2,
                request_id=req.id,
                stop_type="delivery",
                coord=(rec.lat, rec.lng) if rec.lat else (l.pickup_lat, l.pickup_lng),
                lot_change=-lots_to_take,
                name="Delivery",
                safe_deadline=l.safe_deadline,
                service_time_minutes=5,
            )
            vehicle_routes_stops[assigned_veh.id].extend([p_stop, d_stop])

    total_distance = 0.0
    total_time = 0.0
    deadline_viols = 0
    cap_viols = 0
    prec_viols = 0
    safely_delivered = 0

    for v in vehicles:
        stops = vehicle_routes_stops[v.id]
        if stops:
            val = validate_route(
                route=stops,
                vehicle_capacity=v.capacity_lots,
                vehicle_has_cold_storage=v.has_cold_storage,
                start_time=now,
                start_coord=(v.lat, v.lng),
                traffic_level=traffic_level,
            )
            total_distance += val.total_distance_km
            total_time += val.total_time_minutes

            viol_reqs = set()
            for viol in val.violations:
                viol_reqs.update(viol.request_ids)
                if viol.violation_type == "SAFETY_DEADLINE_EXCEEDED":
                    deadline_viols += 1
                elif viol.violation_type == "CAPACITY_OVERFLOW":
                    cap_viols += 1
                elif viol.violation_type == "PRECEDENCE_VIOLATION":
                    prec_viols += 1

            for s in stops:
                if s.stop_type == "delivery":
                    if s.request_id not in viol_reqs:
                        safely_delivered += abs(s.lot_change)

    total_requested = sum(r.requested_lots for r in requests)
    total_allocated = sum(allocated_reqs.values())
    unallocated = total_requested - total_allocated
    elapsed = (datetime.now() - start_t).total_seconds()

    return BaselineResult(
        method_name="B2_FCFS",
        allocated_lots=total_allocated,
        unallocated_lots=unallocated,
        safely_delivered_lots=safely_delivered,
        deadline_violations=deadline_viols,
        capacity_violations=cap_viols,
        precedence_violations=prec_viols,
        total_distance_km=round(total_distance, 2),
        total_time_minutes=round(total_time, 2),
        solve_time_seconds=round(elapsed, 4),
        fairness_variance=0.0,
    )

