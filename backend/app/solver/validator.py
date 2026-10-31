from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from app.services.travel import travel_minutes, haversine_distance_km


@dataclass
class RouteStop:
    """Represents a discrete stop along a vehicle route."""
    stop_id: int
    request_id: int
    stop_type: str  # "pickup" or "delivery"
    coord: Tuple[float, float]
    lot_change: int  # +lots for pickup, -lots for delivery
    name: str = ""
    time_window_start: Optional[datetime] = None
    time_window_end: Optional[datetime] = None
    safe_deadline: Optional[datetime] = None
    service_time_minutes: int = 5  # load (10) or handover (5)
    needs_cold_storage: bool = False
    arrival_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None


@dataclass
class RouteViolation:
    """Structured violation record identifying conflicting request IDs."""
    violation_type: str  # PRECEDENCE, CAPACITY, SAFETY_DEADLINE, WINDOW, COLD_CHAIN
    message: str
    request_ids: List[int]
    stop_index: int
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RouteValidationResult:
    """Comprehensive validation outcome for a proposed vehicle route."""
    is_valid: bool
    violations: List[RouteViolation]
    total_distance_km: float = 0.0
    total_time_minutes: float = 0.0
    stops_visited: int = 0
    timeline: List[Dict[str, Any]] = field(default_factory=list)


def validate_route(
    route: List[RouteStop],
    vehicle_capacity: int,
    vehicle_has_cold_storage: bool,
    start_time: datetime,
    start_coord: Optional[Tuple[float, float]] = None,
    traffic_level: str = "medium",
) -> RouteValidationResult:
    """
    Walks a vehicle route step-by-step and validates:
    1. Precedence: Pickup before delivery for every request.
    2. Capacity: Vehicle load at every step <= vehicle_capacity.
    3. Safe Deadline: Food safe deadline is never exceeded at handover.
    4. Time Windows: Pickup windows and receiver operating hours.
    5. Cold Chain: Temperature-controlled items require vehicle cold storage.
    
    Returns structured violations naming all conflicting request IDs.
    """
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)

    violations: List[RouteViolation] = []
    timeline: List[Dict[str, Any]] = []

    current_coord = start_coord if start_coord is not None else (route[0].coord if route else (0.0, 0.0))
    current_time = start_time
    current_load = 0
    total_distance_km = 0.0

    picked_up_requests: Set[int] = set()
    delivered_requests: Set[int] = set()

    for idx, stop in enumerate(route):
        # 1. Travel calculation
        leg_dist = haversine_distance_km(current_coord, stop.coord)
        leg_minutes = travel_minutes(current_coord, stop.coord, traffic_level=traffic_level)
        total_distance_km += leg_dist

        arrival = current_time + timedelta(minutes=leg_minutes)

        # 2. Window check: if vehicle arrives before window_start, it waits
        if stop.time_window_start is not None:
            w_start = stop.time_window_start
            if w_start.tzinfo is None:
                w_start = w_start.replace(tzinfo=timezone.utc)
            if arrival < w_start:
                arrival = w_start

        # Check window end violation (e.g. pickup window closed)
        if stop.time_window_end is not None:
            w_end = stop.time_window_end
            if w_end.tzinfo is None:
                w_end = w_end.replace(tzinfo=timezone.utc)
            if arrival > w_end:
                violations.append(
                    RouteViolation(
                        violation_type="WINDOW_EXCEEDED",
                        message=(
                            f"Arrival at stop {idx} ({stop.name}) at {arrival.isoformat()} "
                            f"exceeds window end {w_end.isoformat()}"
                        ),
                        request_ids=[stop.request_id],
                        stop_index=idx,
                        details={"arrival": arrival.isoformat(), "window_end": w_end.isoformat()},
                    )
                )

        # 3. Precedence check: delivery requires its pickup already visited
        if stop.stop_type == "delivery":
            if stop.request_id not in picked_up_requests:
                violations.append(
                    RouteViolation(
                        violation_type="PRECEDENCE_VIOLATION",
                        message=(
                            f"Delivery for request {stop.request_id} attempted at stop {idx} "
                            "before its pickup was completed"
                        ),
                        request_ids=[stop.request_id],
                        stop_index=idx,
                        details={"request_id": stop.request_id},
                    )
                )
            delivered_requests.add(stop.request_id)
        elif stop.stop_type == "pickup":
            picked_up_requests.add(stop.request_id)

        # 4. Capacity check
        current_load += stop.lot_change
        if current_load < 0:
            violations.append(
                RouteViolation(
                    violation_type="CAPACITY_UNDERFLOW",
                    message=f"Vehicle load dropped below 0 ({current_load}) at stop {idx}",
                    request_ids=[stop.request_id],
                    stop_index=idx,
                    details={"current_load": current_load},
                )
            )
        elif current_load > vehicle_capacity:
            violations.append(
                RouteViolation(
                    violation_type="CAPACITY_OVERFLOW",
                    message=(
                        f"Vehicle load ({current_load} lots) exceeds capacity "
                        f"({vehicle_capacity} lots) at stop {idx}"
                    ),
                    request_ids=list(picked_up_requests - delivered_requests),
                    stop_index=idx,
                    details={"current_load": current_load, "capacity": vehicle_capacity},
                )
            )

        # 5. Food Safety Deadline check at handover/arrival
        if stop.safe_deadline is not None:
            s_deadline = stop.safe_deadline
            if s_deadline.tzinfo is None:
                s_deadline = s_deadline.replace(tzinfo=timezone.utc)
            if arrival > s_deadline:
                violations.append(
                    RouteViolation(
                        violation_type="SAFETY_DEADLINE_EXCEEDED",
                        message=(
                            f"Handover arrival at stop {idx} ({arrival.isoformat()}) exceeds "
                            f"hard safe deadline ({s_deadline.isoformat()})"
                        ),
                        request_ids=[stop.request_id],
                        stop_index=idx,
                        details={"arrival": arrival.isoformat(), "safe_deadline": s_deadline.isoformat()},
                    )
                )

        # 6. Cold chain check
        if stop.needs_cold_storage and not vehicle_has_cold_storage:
            violations.append(
                RouteViolation(
                    violation_type="COLD_CHAIN_VIOLATION",
                    message=(
                        f"Stop {idx} requires cold storage, but vehicle lacks active cold chain"
                    ),
                    request_ids=[stop.request_id],
                    stop_index=idx,
                    details={"request_id": stop.request_id},
                )
            )

        # Service / handover duration
        departure = arrival + timedelta(minutes=stop.service_time_minutes)

        stop.arrival_time = arrival
        stop.departure_time = departure

        timeline.append({
            "stop_index": idx,
            "stop_id": stop.stop_id,
            "request_id": stop.request_id,
            "stop_type": stop.stop_type,
            "name": stop.name,
            "arrival": arrival.isoformat(),
            "departure": departure.isoformat(),
            "load_after": current_load,
            "distance_from_prev_km": leg_dist,
        })

        # Advance state
        current_coord = stop.coord
        current_time = departure

    total_time_minutes = (current_time - start_time).total_seconds() / 60.0

    return RouteValidationResult(
        is_valid=(len(violations) == 0),
        violations=violations,
        total_distance_km=round(total_distance_km, 2),
        total_time_minutes=round(total_time_minutes, 2),
        stops_visited=len(route),
        timeline=timeline,
    )

