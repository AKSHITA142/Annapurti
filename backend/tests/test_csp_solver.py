import os
import random
import tempfile
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models.listing import FoodListing
from app.models.request import DonationRequest
from app.models.user import User, ReceiverProfile
from app.models.vehicle import Vehicle
from app.models.log import DecisionLog
from app.solver.csp import CSPSolver
from app.solver.explain import ExplainService


@pytest.fixture
def test_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(
        f"sqlite:///{path}",
        connect_args={"timeout": 30, "check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()
        if os.path.exists(path):
            os.remove(path)


def generate_scenario(
    num_listings: int = 2,
    num_requests: int = 6,
    num_vehicles: int = 2,
    seed: int = 42,
    tight_deadline: bool = False,
):
    rng = random.Random(seed)
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)

    # Coordinates in Ahmedabad area
    center_lat, center_lng = 23.0225, 72.5714

    providers = []
    listings = {}
    for i in range(num_listings):
        p = User(
            id=100 + i,
            name=f"Provider {i}",
            email=f"provider{i}_{seed}@test.com",
            role="provider",
            verified=True,
            lat=center_lat + rng.uniform(-0.03, 0.03),
            lng=center_lng + rng.uniform(-0.03, 0.03),
        )
        providers.append(p)

        cat = "cooked_hot" if i % 2 == 0 else "cooked_chilled"
        deadline_hours = 1 if tight_deadline else (4 if cat == "cooked_hot" else 8)

        l = FoodListing(
            id=200 + i,
            provider_id=p.id,
            name=f"Listing {i}",
            category=cat,
            veg=True,
            lot_size=10,
            total_lots=20,
            available_lots=20,
            reserved_lots=0,
            collected_lots=0,
            delivered_lots=0,
            closed_lots=0,
            prepared_at=now,
            safe_deadline=now + timedelta(hours=deadline_hours),
            pickup_lat=p.lat,
            pickup_lng=p.lng,
            pickup_window_start=now,
            pickup_window_end=now + timedelta(hours=2),
            delivery_mode_offered="all",
            status="active",
        )
        listings[l.id] = l

    receivers = {}
    profiles = {}
    for i in range(num_requests):
        r_id = 300 + i
        r = User(
            id=r_id,
            name=f"NGO {i}",
            email=f"ngo{i}_{seed}@test.com",
            role="ngo",
            verified=True,
            lat=center_lat + rng.uniform(-0.05, 0.05),
            lng=center_lng + rng.uniform(-0.05, 0.05),
        )
        receivers[r.id] = r
        profiles[r.id] = ReceiverProfile(
            user_id=r.id,
            accepted_categories=["cooked_hot", "cooked_chilled", "sealed_packaged"],
            daily_intake_capacity=50,
            remaining_capacity=50,
            operating_hours_start="08:00",
            operating_hours_end="22:00",
            has_vehicle=False,
        )

    requests = []
    listing_keys = list(listings.keys())
    for i in range(num_requests):
        l_id = listing_keys[i % len(listing_keys)]
        req = DonationRequest(
            id=400 + i,
            listing_id=l_id,
            receiver_id=300 + i,
            requested_lots=rng.choice([5, 10, 15]),
            status="pending",
        )
        requests.append(req)

    vehicles = []
    for i in range(num_vehicles):
        owner_id = providers[i % len(providers)].id
        v = Vehicle(
            id=500 + i,
            owner_id=owner_id,
            type="van",
            capacity_lots=30,
            service_radius_km=25.0,
            lat=center_lat,
            lng=center_lng,
            has_cold_storage=(i % 2 == 1),  # Odd vehicles have cold storage
            is_simulated=False,
        )
        vehicles.append(v)

    return requests, listings, receivers, profiles, vehicles, now


# --- Test 1: No Listing is Ever Over-Allocated ---

def test_no_listing_overallocated():
    """
    Hard constraint test: Sum of allocated lots per listing must never exceed available_lots.
    """
    requests, listings, receivers, profiles, vehicles, now = generate_scenario(
        num_listings=2, num_requests=10, num_vehicles=3, seed=101
    )
    solver = CSPSolver(seed=101)
    solution = solver.solve(requests, listings, receivers, profiles, vehicles, now=now)

    allocated_by_listing = {}
    for req_id, opt in solution.items():
        if opt and not opt.is_unallocated:
            allocated_by_listing[opt.listing_id] = (
                allocated_by_listing.get(opt.listing_id, 0) + opt.lots
            )

    for l_id, total_alloc in allocated_by_listing.items():
        assert total_alloc <= listings[l_id].available_lots, (
            f"Listing {l_id} over-allocated: {total_alloc} > {listings[l_id].available_lots}"
        )


# --- Test 2: Request Violating Safety Deadline Never Appears in Output ---

def test_safety_deadline_violation_never_allocated():
    """
    Food safety hard constraint: A request whose delivery arrival exceeds safe_deadline
    must NEVER be allocated.
    """
    requests, listings, receivers, profiles, vehicles, now = generate_scenario(
        num_listings=1, num_requests=4, num_vehicles=1, seed=202
    )

    # Set listing deadline to 10 minutes from now (impossible to deliver with load+travel+handover = 30m)
    listing = list(listings.values())[0]
    listing.safe_deadline = now + timedelta(minutes=10)

    solver = CSPSolver(seed=202)
    solution = solver.solve(requests, listings, receivers, profiles, vehicles, now=now)

    for req_id, opt in solution.items():
        if opt and not opt.is_unallocated:
            # If allocated, its estimated arrival must strictly be <= safe_deadline
            assert opt.estimated_arrival is not None
            assert opt.estimated_arrival <= listing.safe_deadline


# --- Test 3: MRV Reduces Nodes Visited Versus Naive Ordering ---

def test_mrv_reduces_nodes_visited():
    """
    Search efficiency: MRV heuristic should visit fewer or equal search nodes
    compared to naive variable ordering.
    """
    requests, listings, receivers, profiles, vehicles, now = generate_scenario(
        num_listings=3, num_requests=8, num_vehicles=3, seed=303
    )

    # Run with MRV
    solver_mrv = CSPSolver(use_mrv=True, use_degree=True, seed=303)
    sol_mrv = solver_mrv.solve(requests, listings, receivers, profiles, vehicles, now=now)
    nodes_mrv = solver_mrv.metrics.nodes_visited

    # Run without MRV (naive)
    solver_naive = CSPSolver(use_mrv=False, use_degree=False, seed=303)
    sol_naive = solver_naive.solve(requests, listings, receivers, profiles, vehicles, now=now)
    nodes_naive = solver_naive.metrics.nodes_visited

    assert nodes_mrv <= nodes_naive, (
        f"MRV nodes ({nodes_mrv}) should be <= naive nodes ({nodes_naive})"
    )


# --- Test 4: Min-Conflicts Fallback Returns Hard-Feasible Solution ---

def test_min_conflicts_fallback_hard_feasible():
    """
    Fallback robustness: When max_nodes is restricted, fallback triggers
    and returns a guaranteed hard-feasible assignment.
    """
    requests, listings, receivers, profiles, vehicles, now = generate_scenario(
        num_listings=2, num_requests=8, num_vehicles=2, seed=404
    )

    # Force fallback by setting max_nodes=1
    solver = CSPSolver(max_nodes=1, seed=404)
    solution = solver.solve(requests, listings, receivers, profiles, vehicles, now=now)

    assert solver.metrics.used_fallback is True

    # Verify no listing is over-allocated in fallback solution
    allocated_by_listing = {}
    for req_id, opt in solution.items():
        if opt and not opt.is_unallocated:
            allocated_by_listing[opt.listing_id] = (
                allocated_by_listing.get(opt.listing_id, 0) + opt.lots
            )

    for l_id, total_alloc in allocated_by_listing.items():
        assert total_alloc <= listings[l_id].available_lots


# --- Test 5: Deterministic Output for Same Seed ---

def test_deterministic_output_same_seed():
    """
    Reproducibility: Two solver runs on identical scenarios with the same seed
    must produce identical assignments and allocated lot quantities.
    """
    requests, listings, receivers, profiles, vehicles, now = generate_scenario(
        num_listings=2, num_requests=6, num_vehicles=2, seed=505
    )

    solver1 = CSPSolver(seed=505)
    sol1 = solver1.solve(requests, listings, receivers, profiles, vehicles, now=now)

    solver2 = CSPSolver(seed=505)
    sol2 = solver2.solve(requests, listings, receivers, profiles, vehicles, now=now)

    assert len(sol1) == len(sol2)
    for r_id in sol1:
        opt1 = sol1[r_id]
        opt2 = sol2[r_id]
        assert opt1.lots == opt2.lots
        assert opt1.mode == opt2.mode
        assert opt1.vehicle_id == opt2.vehicle_id
        assert opt1.is_unallocated == opt2.is_unallocated


# --- Test 6: 10 Seeded Scenarios Never Violate Invariants ---

def test_ten_seeded_scenarios_feasible():
    """
    Acceptance check: On 10 distinct seeded scenarios, the solver never returns
    an infeasible assignment.
    """
    for seed in range(1001, 1011):
        requests, listings, receivers, profiles, vehicles, now = generate_scenario(
            num_listings=3, num_requests=7, num_vehicles=3, seed=seed
        )
        solver = CSPSolver(seed=seed)
        solution = solver.solve(requests, listings, receivers, profiles, vehicles, now=now)

        # Check listing limits
        allocated = {}
        for r_id, opt in solution.items():
            if opt and not opt.is_unallocated:
                allocated[opt.listing_id] = allocated.get(opt.listing_id, 0) + opt.lots
                # Check safety deadline
                assert opt.estimated_arrival <= listings[opt.listing_id].safe_deadline

        for l_id, total_alloc in allocated.items():
            assert total_alloc <= listings[l_id].available_lots


# --- Test 7: ExplainService Extracts Audit Log ---

def test_explain_service_audit_trail(test_db):
    """
    Auditability: ExplainService formats decision logs into readable timelines.
    """
    requests, listings, receivers, profiles, vehicles, now = generate_scenario(
        num_listings=1, num_requests=3, num_vehicles=1, seed=606
    )

    # Run solver with db session attached
    solver = CSPSolver(db=test_db, seed=606)
    solution = solver.solve(requests, listings, receivers, profiles, vehicles, now=now)

    # Explain first request
    first_req_id = requests[0].id
    explanation = ExplainService.explain_request(test_db, first_req_id)

    assert explanation["request_id"] == first_req_id
    assert "timeline" in explanation
    assert len(explanation["timeline"]) > 0
    # Every event has machine-readable reason_code and message
    for event in explanation["timeline"]:
        assert "reason_code" in event
        assert "message" in event
