import math
import random
from datetime import datetime, timedelta, timezone
import pytest

from app.solver.astar import (
    RouteStateAStar,
    brute_force_optimal_route,
    graph_astar,
)
from app.solver.routing import RoutingEngine
from app.solver.validator import (
    RouteStop,
    RouteViolation,
    RouteValidationResult,
    validate_route,
)


def create_random_stops(
    num_requests: int,
    center_coord: tuple = (23.0225, 72.5714),
    seed: int = 42,
    safe_hours: int = 4,
    vehicle_capacity: int = 30,
) -> tuple:
    rng = random.Random(seed)
    now = datetime(2026, 10, 31, 10, 0, 0, tzinfo=timezone.utc)
    stops = []

    for req_id in range(1, num_requests + 1):
        lots = rng.choice([5, 10])
        pickup_coord = (
            center_coord[0] + rng.uniform(-0.02, 0.02),
            center_coord[1] + rng.uniform(-0.02, 0.02),
        )
        delivery_coord = (
            center_coord[0] + rng.uniform(-0.02, 0.02),
            center_coord[1] + rng.uniform(-0.02, 0.02),
        )

        p_stop = RouteStop(
            stop_id=req_id * 2 - 1,
            request_id=req_id,
            stop_type="pickup",
            coord=pickup_coord,
            lot_change=lots,
            name=f"Pickup {req_id}",
            time_window_start=now,
            time_window_end=now + timedelta(hours=3),
            safe_deadline=now + timedelta(hours=safe_hours),
            service_time_minutes=10,
        )

        d_stop = RouteStop(
            stop_id=req_id * 2,
            request_id=req_id,
            stop_type="delivery",
            coord=delivery_coord,
            lot_change=-lots,
            name=f"Delivery {req_id}",
            time_window_start=now,
            time_window_end=now + timedelta(hours=safe_hours),
            safe_deadline=now + timedelta(hours=safe_hours),
            service_time_minutes=5,
        )

        stops.extend([p_stop, d_stop])

    return stops, center_coord, now


# --- Test 1: Graph A* Shortest Path ---

def test_graph_astar_shortest_path():
    """
    Test standard Graph A* on a grid network.
    Admissible heuristic: Euclidean distance.
    """
    # Simple grid: (x, y) coordinates
    neighbors = {
        (0, 0): [((1, 0), 1.0), ((0, 1), 1.0)],
        (1, 0): [((0, 0), 1.0), ((1, 1), 1.0), ((2, 0), 1.0)],
        (0, 1): [((0, 0), 1.0), ((1, 1), 1.0), ((0, 2), 1.0)],
        (1, 1): [((1, 0), 1.0), ((0, 1), 1.0), ((2, 1), 1.0), ((1, 2), 1.0)],
        (2, 0): [((1, 0), 1.0), ((2, 1), 1.0)],
        (0, 2): [((0, 1), 1.0), ((1, 2), 1.0)],
        (2, 1): [((2, 0), 1.0), ((1, 1), 1.0), ((2, 2), 1.0)],
        (1, 2): [((0, 2), 1.0), ((1, 1), 1.0), ((2, 2), 1.0)],
        (2, 2): [((2, 1), 1.0), ((1, 2), 1.0)],
    }

    def neighbors_fn(node):
        return neighbors.get(node, [])

    def heuristic_fn(n1, n2):
        return math.hypot(n1[0] - n2[0], n1[1] - n2[1])

    path, cost = graph_astar((0, 0), (2, 2), neighbors_fn, heuristic_fn)

    assert path[0] == (0, 0)
    assert path[-1] == (2, 2)
    assert cost == 4.0  # (0,0) -> (1,0) -> (2,0) -> (2,1) -> (2,2) or similar Manhattan path


# --- Test 2: A* Equals Brute-Force on 50 Seeded Instances ---

def test_astar_equals_brute_force_50_instances():
    """
    Acceptance check: Route-State A* and Brute-Force baseline agree on 50 seeded instances
    of up to 5 stops (2 requests = 4 stops, or 1 request + dummy).
    """
    agreed_count = 0
    instances_tested = 50

    for seed in range(100, 100 + instances_tested):
        stops, start_coord, start_time = create_random_stops(
            num_requests=2,  # 4 stops total (2 pickups + 2 deliveries)
            seed=seed,
            vehicle_capacity=25,
        )

        astar_result = RouteStateAStar.solve(
            stops=stops,
            start_coord=start_coord,
            vehicle_capacity=25,
            vehicle_has_cold_storage=True,
            start_time=start_time,
            traffic_level="low",
        )

        brute_result = brute_force_optimal_route(
            stops=stops,
            start_coord=start_coord,
            vehicle_capacity=25,
            vehicle_has_cold_storage=True,
            start_time=start_time,
            traffic_level="low",
        )

        if astar_result is None and brute_result is None:
            # Both agree instance is infeasible
            agreed_count += 1
        elif astar_result is not None and brute_result is not None:
            astar_route, astar_time = astar_result
            brute_route, brute_time = brute_result

            # Validate that A* cost matches brute-force optimal cost within 1e-4
            assert math.isclose(astar_time, brute_time, abs_tol=1e-4), (
                f"Seed {seed}: A* time ({astar_time}) != Brute-force time ({brute_time})"
            )
            agreed_count += 1
        else:
            pytest.fail(f"Seed {seed}: Mismatch between A* ({astar_result}) and brute force ({brute_result})")

    assert agreed_count == instances_tested


# --- Test 3: Heuristic Route Cost Gap vs. Optimal ---

def test_heuristic_vs_optimal_gap():
    """
    Acceptance check: Measure percentage gap of heuristic routes vs exact optimal A*.
    Records this gap percentage for the report.
    """
    total_gap_pct = 0.0
    valid_comparisons = 0

    for seed in range(200, 220):
        stops, start_coord, start_time = create_random_stops(
            num_requests=2,
            seed=seed,
            vehicle_capacity=25,
        )

        astar_result = RouteStateAStar.solve(
            stops=stops,
            start_coord=start_coord,
            vehicle_capacity=25,
            vehicle_has_cold_storage=True,
            start_time=start_time,
        )

        heuristic_route, validation = RoutingEngine.optimize_route(
            stops=stops,
            start_coord=start_coord,
            vehicle_capacity=25,
            vehicle_has_cold_storage=True,
            start_time=start_time,
        )

        if astar_result is not None and validation.is_valid:
            _, opt_time = astar_result
            heur_time = validation.total_time_minutes
            gap = ((heur_time - opt_time) / opt_time) * 100.0
            total_gap_pct += gap
            valid_comparisons += 1

    if valid_comparisons > 0:
        avg_gap = total_gap_pct / valid_comparisons
        print(f"\n[EVALUATION METRIC] Heuristic average optimality gap on small instances: {avg_gap:.2f}%")
        # Assert heuristic is within 15% of exact optimal on average
        assert avg_gap <= 15.0


# --- Test 4: Validator Catches Precedence Violation ---

def test_validator_catches_precedence_violation():
    """
    Validator test: Delivery stop positioned before pickup stop must trigger
    PRECEDENCE_VIOLATION naming the conflicting request ID.
    """
    now = datetime(2026, 10, 31, 10, 0, 0, tzinfo=timezone.utc)
    coord = (23.0225, 72.5714)

    pickup = RouteStop(
        stop_id=1,
        request_id=42,
        stop_type="pickup",
        coord=coord,
        lot_change=10,
        name="Pickup",
    )
    delivery = RouteStop(
        stop_id=2,
        request_id=42,
        stop_type="delivery",
        coord=coord,
        lot_change=-10,
        name="Delivery",
    )

    # Inverted order: Delivery before pickup
    inverted_route = [delivery, pickup]
    res = validate_route(
        route=inverted_route,
        vehicle_capacity=30,
        vehicle_has_cold_storage=True,
        start_time=now,
    )

    assert res.is_valid is False
    assert len(res.violations) >= 1
    viol = res.violations[0]
    assert viol.violation_type == "PRECEDENCE_VIOLATION"
    assert 42 in viol.request_ids
    assert "before its pickup was completed" in viol.message


# --- Test 5: Validator Catches Capacity Overflow ---

def test_validator_catches_capacity_overflow():
    """
    Validator test: Cumulative load exceeding vehicle_capacity must trigger
    CAPACITY_OVERFLOW naming the carried request IDs.
    """
    now = datetime(2026, 10, 31, 10, 0, 0, tzinfo=timezone.utc)
    coord = (23.0225, 72.5714)

    p1 = RouteStop(stop_id=1, request_id=101, stop_type="pickup", coord=coord, lot_change=15, name="P1")
    p2 = RouteStop(stop_id=2, request_id=102, stop_type="pickup", coord=coord, lot_change=15, name="P2")

    # Cumulative load = 30 lots > vehicle capacity (20 lots)
    route = [p1, p2]
    res = validate_route(
        route=route,
        vehicle_capacity=20,
        vehicle_has_cold_storage=True,
        start_time=now,
    )

    assert res.is_valid is False
    capacity_viols = [v for v in res.violations if v.violation_type == "CAPACITY_OVERFLOW"]
    assert len(capacity_viols) >= 1
    assert 101 in capacity_viols[0].request_ids or 102 in capacity_viols[0].request_ids
    assert "exceeds capacity (20 lots)" in capacity_viols[0].message


# --- Test 6: Validator Catches Deadline Miss ---

def test_validator_catches_deadline_miss():
    """
    Validator test: Delivery arrival past food safe_deadline must trigger
    SAFETY_DEADLINE_EXCEEDED.
    """
    now = datetime(2026, 10, 31, 10, 0, 0, tzinfo=timezone.utc)
    p_coord = (23.0225, 72.5714)
    # Distant point 25 km away (~ 65 minutes travel)
    d_coord = (23.2500, 72.6500)

    # Safe deadline only 20 minutes from now (impossible)
    p = RouteStop(
        stop_id=1,
        request_id=201,
        stop_type="pickup",
        coord=p_coord,
        lot_change=5,
        name="P",
        safe_deadline=now + timedelta(minutes=20),
        service_time_minutes=10,
    )
    d = RouteStop(
        stop_id=2,
        request_id=201,
        stop_type="delivery",
        coord=d_coord,
        lot_change=-5,
        name="D",
        safe_deadline=now + timedelta(minutes=20),
        service_time_minutes=5,
    )

    route = [p, d]
    res = validate_route(
        route=route,
        vehicle_capacity=20,
        vehicle_has_cold_storage=True,
        start_time=now,
    )

    assert res.is_valid is False
    deadline_viols = [v for v in res.violations if v.violation_type == "SAFETY_DEADLINE_EXCEEDED"]
    assert len(deadline_viols) >= 1
    assert 201 in deadline_viols[0].request_ids
    assert "exceeds hard safe deadline" in deadline_viols[0].message


# --- Test 7: Validator Catches Cold Chain Violation ---

def test_validator_catches_cold_chain_violation():
    """
    Validator test: Temperature-controlled item loaded on non-cold storage vehicle
    triggers COLD_CHAIN_VIOLATION.
    """
    now = datetime(2026, 10, 31, 10, 0, 0, tzinfo=timezone.utc)
    coord = (23.0225, 72.5714)

    p = RouteStop(
        stop_id=1,
        request_id=301,
        stop_type="pickup",
        coord=coord,
        lot_change=5,
        name="Chilled Food Pickup",
        needs_cold_storage=True,
    )
    d = RouteStop(
        stop_id=2,
        request_id=301,
        stop_type="delivery",
        coord=coord,
        lot_change=-5,
        name="Chilled Food Delivery",
        needs_cold_storage=True,
    )

    res = validate_route(
        route=[p, d],
        vehicle_capacity=20,
        vehicle_has_cold_storage=False,  # Vehicle lacks cold storage!
        start_time=now,
    )

    assert res.is_valid is False
    cold_viols = [v for v in res.violations if v.violation_type == "COLD_CHAIN_VIOLATION"]
    assert len(cold_viols) >= 1
    assert 301 in cold_viols[0].request_ids

