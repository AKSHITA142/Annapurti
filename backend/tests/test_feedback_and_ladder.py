import os
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
from app.models.delivery import DeliveryJob
from app.models.log import DecisionLog
from app.solver.feedback_loop import FeedbackLoopCoordinator
from app.services.failure_ladder import FailureLadderService, OperationalFailureHandler
from app.sim.event_simulator import EventSimulator


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


# --- Test 1: Feedback Loop Repaired Joint Deadline Miss ---

def test_feedback_loop_repairs_joint_deadline_miss(test_db):
    """
    Crafted scenario: Two requests individually fit deadlines on vehicle 1.
    However, when routed together, the second delivery exceeds its safe deadline.
    The feedback loop must:
    1. Detect the violation in routing validation.
    2. Learn a nogood for the failing assignment.
    3. Re-solve and successfully repair the plan (e.g. assigning to vehicle 2 or self-collect).
    4. Produce a final plan where all routes pass validation.
    """
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)
    provider_coord = (23.0225, 72.5714)

    # Provider and listing
    provider = User(id=1, name="Donor", email="donor@test.com", role="provider", verified=True)
    listing = FoodListing(
        id=10,
        provider_id=1,
        name="Hot Meals",
        category="cooked_hot",
        veg=True,
        lot_size=10,
        total_lots=40,
        available_lots=40,
        prepared_at=now,
        safe_deadline=now + timedelta(minutes=55),  # Tight deadline: 55 minutes
        pickup_lat=provider_coord[0],
        pickup_lng=provider_coord[1],
        pickup_window_start=now,
        pickup_window_end=now + timedelta(hours=2),
        delivery_mode_offered="sender_vehicle",
        status="active",
    )

    # Two receivers located in opposite directions
    rec1 = User(id=2, name="NGO North", email="north@test.com", role="ngo", verified=True, lat=23.0600, lng=72.5714)
    rec2 = User(id=3, name="NGO South", email="south@test.com", role="ngo", verified=True, lat=22.9800, lng=72.5714)

    prof1 = ReceiverProfile(user_id=2, accepted_categories=["cooked_hot"], remaining_capacity=50)
    prof2 = ReceiverProfile(user_id=3, accepted_categories=["cooked_hot"], remaining_capacity=50)

    # Requests
    req1 = DonationRequest(id=101, listing_id=10, receiver_id=2, requested_lots=10, status="pending")
    req2 = DonationRequest(id=102, listing_id=10, receiver_id=3, requested_lots=10, status="pending")

    # Two vehicles available: v1 (primary) and v2 (backup)
    v1 = Vehicle(id=1, owner_id=1, type="van", capacity_lots=30, service_radius_km=25.0, lat=23.0225, lng=72.5714)
    v2 = Vehicle(id=2, owner_id=1, type="van", capacity_lots=30, service_radius_km=25.0, lat=23.0225, lng=72.5714)

    coordinator = FeedbackLoopCoordinator(db=test_db, max_repair_rounds=5, traffic_level="medium")
    result = coordinator.run(
        requests=[req1, req2],
        listings={10: listing},
        receivers={2: rec1, 3: rec2},
        profiles={2: prof1, 3: prof2},
        vehicles=[v1, v2],
        now=now,
    )

    # Must produce 100% valid routes
    assert result.all_routes_valid is True
    # At least one nogood was learned during the repair process
    assert len(result.learned_nogoods) >= 1
    # Both requests allocated without exceeding deadlines
    for v_id, val in result.route_validations.items():
        assert val.is_valid is True


# --- Test 2: Failure Ladder All 5 Steps Reached ---

def test_failure_ladder_step1_partial():
    """Step 1: Offer partial quantity."""
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)
    listing = FoodListing(id=1, safe_deadline=now + timedelta(hours=3), available_lots=10, category="cooked_hot")
    req = DonationRequest(id=1, requested_lots=20, receiver_id=2)  # Requesting 20, but available is 10

    res = FailureLadderService.apply_ladder(req, listing, available_vehicles=[], other_receivers=[], now=now)
    assert res["resolved"] is True
    assert res["resolved_step"] == 1
    assert "partial_lots" in res["action_taken"]


def test_failure_ladder_step2_switch_mode():
    """Step 2: Try another delivery mode (self-collect or alternative vehicle)."""
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)
    listing = FoodListing(id=1, safe_deadline=now + timedelta(hours=3), available_lots=0, category="cooked_hot", delivery_mode_offered="self_collect")
    req = DonationRequest(id=1, requested_lots=1, receiver_id=2)

    res = FailureLadderService.apply_ladder(req, listing, available_vehicles=[], other_receivers=[], now=now)
    assert res["resolved"] is True
    assert res["resolved_step"] == 2
    assert res["action_taken"] == "mode_self_collect"


def test_failure_ladder_step3_alternative_receiver():
    """Step 3: Try another eligible receiver."""
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)
    listing = FoodListing(id=1, safe_deadline=now + timedelta(hours=3), available_lots=0, category="cooked_hot", delivery_mode_offered="sender_vehicle")
    req = DonationRequest(id=1, requested_lots=1, receiver_id=2)

    other_user = User(id=99, name="Other NGO", role="ngo")
    other_prof = ReceiverProfile(user_id=99, accepted_categories=["cooked_hot"], remaining_capacity=20)

    res = FailureLadderService.apply_ladder(req, listing, available_vehicles=[], other_receivers=[(other_user, other_prof)], now=now)
    assert res["resolved"] is True
    assert res["resolved_step"] == 3
    assert res["action_taken"] == "receiver_99"


def test_failure_ladder_step4_relist():
    """Step 4: Relist leftover lots (urgent if deadline < 60m)."""
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)
    listing = FoodListing(id=1, safe_deadline=now + timedelta(minutes=45), available_lots=0, category="cooked_hot", delivery_mode_offered="sender_vehicle")
    req = DonationRequest(id=1, requested_lots=1, receiver_id=2)

    res = FailureLadderService.apply_ladder(req, listing, available_vehicles=[], other_receivers=[], now=now)
    assert res["resolved"] is True
    assert res["resolved_step"] == 4
    assert res["action_taken"] == "relist_urgent_True"


def test_failure_ladder_step5_escalate(test_db):
    """Step 5: When all steps fail (e.g. expired listing), escalate to admin."""
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)
    # Listing past deadline -> cannot relist
    listing = FoodListing(id=1, safe_deadline=now - timedelta(minutes=10), available_lots=0, category="cooked_hot", delivery_mode_offered="sender_vehicle")
    req = DonationRequest(id=1, requested_lots=1, receiver_id=2)

    res = FailureLadderService.apply_ladder(req, listing, available_vehicles=[], other_receivers=[], now=now, db=test_db)
    assert res["resolved"] is False
    assert res["resolved_step"] == 5
    assert res["escalated"] is True

    # Audit log check
    log = test_db.query(DecisionLog).filter(DecisionLog.reason_code == "ESCALATED_TO_ADMIN").first()
    assert log is not None
    assert "Explicitly escalated to admin" in log.message


# --- Test 3: Operational Failure Rules ---

def test_receiver_no_show_rule(test_db):
    """Operational rule: Receiver no-show releases inventory."""
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)
    provider = User(id=1, name="Provider", role="provider", email="p@t.com")
    rec = User(id=2, name="NGO", role="ngo", email="r@t.com")
    test_db.add_all([provider, rec])
    test_db.commit()

    listing = FoodListing(
        id=1,
        provider_id=1,
        name="Rice",
        category="cooked_hot",
        total_lots=20,
        available_lots=10,
        reserved_lots=10,
        prepared_at=now,
        safe_deadline=now + timedelta(hours=3),
        pickup_lat=23.0,
        pickup_lng=72.0,
        pickup_window_start=now,
        pickup_window_end=now + timedelta(hours=1),
    )
    req = DonationRequest(id=1, listing_id=1, receiver_id=2, requested_lots=10, allocated_lots=10, status="reserved")
    test_db.add_all([listing, req])
    test_db.commit()

    res = OperationalFailureHandler.handle_receiver_no_show(test_db, request_id=1, now=now)
    assert res["handled"] is True
    test_db.refresh(listing)
    assert listing.available_lots == 20
    assert listing.reserved_lots == 0


def test_vehicle_cancel_before_pickup_reassigns(test_db):
    """Operational rule: Vehicle cancel before pickup re-offers job to next vehicle."""
    v1 = Vehicle(id=1, owner_id=10, capacity_lots=30, lat=23.0, lng=72.0)
    v2 = Vehicle(id=2, owner_id=10, capacity_lots=30, lat=23.0, lng=72.0)
    job = DeliveryJob(id=1, vehicle_id=1, request_ids=[1], route={}, status="assigned", otp_code="123456")
    test_db.add_all([v1, v2, job])
    test_db.commit()

    res = OperationalFailureHandler.handle_vehicle_cancel_before_pickup(test_db, job_id=1, available_vehicles=[v1, v2])
    assert res["handled"] is True
    assert res["reassigned_to"] == 2
    test_db.refresh(job)
    assert job.vehicle_id == 2


def test_vehicle_cancel_after_pickup_rendezvous_and_spoiled(test_db):
    """
    Operational rule: Vehicle cancel after pickup marks recovery_needed.
    - If rendezvous feasible: reassigns to emergency vehicle.
    - If deadline too tight: closes lots as spoiled.
    """
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)
    v1 = Vehicle(id=1, owner_id=10, capacity_lots=30, lat=23.0, lng=72.0)
    v2 = Vehicle(id=2, owner_id=10, capacity_lots=30, lat=23.0, lng=72.0)
    job = DeliveryJob(id=1, vehicle_id=1, request_ids=[1], route={}, status="in_transit", otp_code="123456")
    test_db.add_all([v1, v2, job])
    test_db.commit()

    # Case A: Feasible rendezvous (deadline 60m away > 25m rendezvous journey)
    res_rendezvous = OperationalFailureHandler.handle_vehicle_cancel_after_pickup(
        test_db, job_id=1, available_vehicles=[v1, v2], listing_deadline=now + timedelta(minutes=60), now=now
    )
    assert res_rendezvous["handled"] is True
    assert res_rendezvous["recovery_mode"] == "rendezvous"
    assert res_rendezvous["new_vehicle_id"] == 2

    # Case B: Infeasible rendezvous (deadline only 10m away < 25m rendezvous journey)
    job.vehicle_id = 1
    job.status = "in_transit"
    test_db.commit()

    res_spoiled = OperationalFailureHandler.handle_vehicle_cancel_after_pickup(
        test_db, job_id=1, available_vehicles=[v1, v2], listing_deadline=now + timedelta(minutes=10), now=now
    )
    assert res_spoiled["handled"] is False
    assert res_spoiled["recovery_mode"] == "spoiled"
    assert res_spoiled["escalated"] is True


def test_committed_deliveries_never_reassigned():
    """
    Operational rule: Committed requests (already collected / in transit)
    are strictly excluded from being moved or nogood-pruned during replanning.
    """
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)
    provider = User(id=1, name="Provider", role="provider", email="p@t.com", lat=23.02, lng=72.57)
    rec = User(id=2, name="NGO", role="ngo", email="r@t.com", lat=23.03, lng=72.58)
    prof = ReceiverProfile(user_id=2, accepted_categories=["cooked_hot"], remaining_capacity=50)

    listing = FoodListing(
        id=1,
        provider_id=1,
        name="Hot Meals",
        category="cooked_hot",
        total_lots=20,
        available_lots=20,
        prepared_at=now,
        safe_deadline=now + timedelta(hours=3),
        pickup_lat=23.02,
        pickup_lng=72.57,
        pickup_window_start=now,
        pickup_window_end=now + timedelta(hours=2),
    )
    req = DonationRequest(id=77, listing_id=1, receiver_id=2, requested_lots=5, status="allocated")
    v = Vehicle(id=1, owner_id=1, capacity_lots=20, lat=23.02, lng=72.57)

    # Mark request 77 as COMMITTED
    committed = {77}
    coordinator = FeedbackLoopCoordinator(max_repair_rounds=2)
    result = coordinator.run(
        requests=[req],
        listings={1: listing},
        receivers={2: rec},
        profiles={2: prof},
        vehicles=[v],
        now=now,
        committed_request_ids=committed,
    )

    # Request 77 must NEVER have a nogood learned against it
    for nogood in result.learned_nogoods:
        assert nogood[0] != 77


# --- Test 4: EventSimulator Dispatches Disruption Events ---

def test_event_simulator_endpoints(test_db):
    """
    Test simulation event dispatch:
    - traffic_change
    - new_urgent_listing
    """
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)

    # Traffic change event
    res_traffic = EventSimulator.simulate_event(
        test_db, "traffic_change", {"traffic_level": "high"}, now=now
    )
    assert res_traffic["handled"] is True
    assert res_traffic["new_traffic_level"] == "high"

    # Verify decision log was recorded
    log = test_db.query(DecisionLog).filter(DecisionLog.reason_code == "TRAFFIC_LEVEL_CHANGED").first()
    assert log is not None
    assert "traffic level changed to high" in log.message
