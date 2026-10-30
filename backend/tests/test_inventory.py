import concurrent.futures
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
from app.models.user import User
from app.models.log import DecisionLog
from app.services.inventory import InventoryService


@pytest.fixture
def test_db():
    """Create a temporary thread-safe SQLite database for testing."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)

    # SQLite with timeout=30 and serialized thread-safety
    engine = create_engine(
        f"sqlite:///{path}",
        connect_args={"timeout": 30, "check_same_thread": False},
        pool_size=20,
        max_overflow=20,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = TestingSessionLocal()
    try:
        yield TestingSessionLocal, db
    finally:
        db.close()
        engine.dispose()
        if os.path.exists(path):
            os.remove(path)


def create_test_entities(db, total_lots=100, safe_in_hours=4):
    now = datetime.now(timezone.utc)
    provider = User(
        name="Test Provider",
        email=f"provider_{random.randint(1000, 999999)}@test.com",
        role="provider",
        verified=True,
    )
    receiver = User(
        name="Test NGO",
        email=f"ngo_{random.randint(1000, 999999)}@test.com",
        role="ngo",
        verified=True,
    )
    db.add_all([provider, receiver])
    db.commit()

    listing = FoodListing(
        provider_id=provider.id,
        name="Cooked Meals",
        category="cooked_hot",
        veg=True,
        unit="meals",
        lot_size=10,
        total_lots=total_lots,
        available_lots=total_lots,
        reserved_lots=0,
        collected_lots=0,
        delivered_lots=0,
        closed_lots=0,
        prepared_at=now,
        safe_deadline=now + timedelta(hours=safe_in_hours),
        pickup_lat=23.0225,
        pickup_lng=72.5714,
        pickup_window_start=now,
        pickup_window_end=now + timedelta(hours=2),
        status="active",
    )
    db.add(listing)
    db.commit()
    return provider, receiver, listing


def test_inventory_invariant_random_sequences(test_db):
    """
    Property-style test: Runs randomized sequences of reserve, release,
    collect and deliver operations. At every stage, the quantity invariant must hold.
    """
    SessionMaker, db = test_db
    random.seed(42)

    TOTAL = 150
    provider, receiver, listing = create_test_entities(db, total_lots=TOTAL, safe_in_hours=6)

    active_request_ids = []

    for step in range(50):
        action = random.choice(["reserve", "release", "collect", "deliver"])

        if action == "reserve":
            lots = random.randint(1, 20)
            req = DonationRequest(
                listing_id=listing.id,
                receiver_id=receiver.id,
                requested_lots=lots,
                status="pending",
            )
            db.add(req)
            db.commit()

            success = InventoryService.reserve(db, listing.id, req.id, lots)
            if success:
                active_request_ids.append((req.id, "reserved", lots))

        elif action == "release" and active_request_ids:
            idx = random.randrange(len(active_request_ids))
            req_id, status, lots = active_request_ids[idx]
            if status == "reserved":
                success = InventoryService.release(db, req_id)
                if success:
                    active_request_ids.pop(idx)

        elif action == "collect" and active_request_ids:
            idx = random.randrange(len(active_request_ids))
            req_id, status, lots = active_request_ids[idx]
            if status == "reserved":
                success = InventoryService.confirm_collected(db, req_id)
                if success:
                    active_request_ids[idx] = (req_id, "collected", lots)

        elif action == "deliver" and active_request_ids:
            idx = random.randrange(len(active_request_ids))
            req_id, status, lots = active_request_ids[idx]
            if status == "collected":
                success = InventoryService.confirm_delivered(db, req_id)
                if success:
                    active_request_ids.pop(idx)

        # Invariant check at every single step
        db.refresh(listing)
        assert listing.check_invariant(), f"Invariant failed at step {step}: {listing.__dict__}"
        assert listing.available_lots >= 0
        assert listing.reserved_lots >= 0
        assert listing.collected_lots >= 0
        assert listing.delivered_lots >= 0
        assert listing.closed_lots >= 0


def test_twenty_thread_concurrency(test_db):
    """
    Concurrency test: 20 threads simultaneously request 10 lots from a listing of 100 lots.
    Must end with exactly 100 lots reserved and no negative quantities (no overselling).
    """
    SessionMaker, db = test_db
    TOTAL_LOTS = 100
    NUM_THREADS = 20
    LOTS_PER_THREAD = 10

    provider, receiver, listing = create_test_entities(db, total_lots=TOTAL_LOTS)

    # Pre-create 20 requests
    listing_id = listing.id
    req_ids = []
    for _ in range(NUM_THREADS):
        req = DonationRequest(
            listing_id=listing_id,
            receiver_id=receiver.id,
            requested_lots=LOTS_PER_THREAD,
            status="pending",
        )
        db.add(req)
        db.flush()
        req_ids.append(req.id)
    db.commit()

    results = []

    def attempt_reservation(r_id: int):
        thread_db = SessionMaker()
        try:
            res = InventoryService.reserve(
                thread_db,
                listing_id=listing_id,
                request_id=r_id,
                lots=LOTS_PER_THREAD,
            )
            return res
        finally:
            thread_db.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=NUM_THREADS) as executor:
        futures = [executor.submit(attempt_reservation, r_id) for r_id in req_ids]
        for f in concurrent.futures.as_completed(futures):
            results.append(f.result())

    # Exactly 10 successful reservations and 10 rejected
    assert results.count(True) == 10
    assert results.count(False) == 10

    fresh_listing = db.query(FoodListing).filter(FoodListing.id == listing_id).first()
    assert fresh_listing.available_lots == 0
    assert fresh_listing.reserved_lots == 100
    assert fresh_listing.collected_lots == 0
    assert fresh_listing.delivered_lots == 0
    assert fresh_listing.closed_lots == 0
    assert fresh_listing.check_invariant()


def test_twenty_thread_concurrency_repeated(test_db):
    """
    Run the 20-thread concurrency test 10 times repeatedly to prove absence of race conditions.
    """
    for iteration in range(10):
        SessionMaker, db = test_db
        test_twenty_thread_concurrency((SessionMaker, db))


def test_reservation_expiry_before_safe_deadline(test_db):
    """
    When a reservation expires BEFORE safe_deadline, lots return to available_lots.
    """
    SessionMaker, db = test_db
    now = datetime.now(timezone.utc)
    provider, receiver, listing = create_test_entities(db, total_lots=50, safe_in_hours=4)

    req = DonationRequest(
        listing_id=listing.id,
        receiver_id=receiver.id,
        requested_lots=20,
        status="pending",
    )
    db.add(req)
    db.commit()

    # Reserve 20 lots
    assert InventoryService.reserve(db, listing.id, req.id, 20, reservation_duration_minutes=15, now=now)
    db.refresh(listing)
    assert listing.available_lots == 30
    assert listing.reserved_lots == 20

    # Advance time past reservation expiry (20 min), but well before safe deadline (4 hours)
    future_time = now + timedelta(minutes=20)
    expired_count = InventoryService.expire_stale_reservations(db, now=future_time)
    assert expired_count == 1

    db.refresh(listing)
    db.refresh(req)
    assert req.status == "expired"
    assert listing.available_lots == 50  # Lots returned to available!
    assert listing.reserved_lots == 0
    assert listing.closed_lots == 0
    assert listing.check_invariant()


def test_reservation_expiry_after_safe_deadline(test_db):
    """
    When a reservation expires AFTER safe_deadline, lots must NEVER return to available;
    they must be moved to closed_lots (discarded) and logged as expired.
    """
    SessionMaker, db = test_db
    now = datetime.now(timezone.utc)
    provider, receiver, listing = create_test_entities(db, total_lots=50, safe_in_hours=2)

    req = DonationRequest(
        listing_id=listing.id,
        receiver_id=receiver.id,
        requested_lots=20,
        status="pending",
    )
    db.add(req)
    db.commit()

    # Reserve 20 lots
    assert InventoryService.reserve(db, listing.id, req.id, 20, reservation_duration_minutes=15, now=now)

    # Advance time past safe deadline (3 hours > 2 hours safe deadline)
    past_deadline = now + timedelta(hours=3)
    expired_count = InventoryService.expire_stale_reservations(db, now=past_deadline)
    assert expired_count == 1

    db.refresh(listing)
    db.refresh(req)
    assert req.status == "expired"
    assert listing.available_lots == 30  # NOT returned to available!
    assert listing.reserved_lots == 0
    assert listing.closed_lots == 20    # Moved to closed_lots
    assert listing.check_invariant()


def test_decision_log_recorded(test_db):
    """
    Verify that every solver and inventory decision writes a structured row to decision_log.
    """
    SessionMaker, db = test_db
    provider, receiver, listing = create_test_entities(db, total_lots=30)

    req = DonationRequest(
        listing_id=listing.id,
        receiver_id=receiver.id,
        requested_lots=10,
        status="pending",
    )
    db.add(req)
    db.commit()

    # Successful reserve
    InventoryService.reserve(db, listing.id, req.id, 10)
    log1 = (
        db.query(DecisionLog)
        .filter(DecisionLog.entity_id == req.id, DecisionLog.decision == "reserve")
        .first()
    )
    assert log1 is not None
    assert log1.reason_code == "RESERVED_SUCCESS"
    assert "Successfully reserved" in log1.message

    # Rejected reserve (requesting 50 lots when only 20 left)
    req2 = DonationRequest(
        listing_id=listing.id,
        receiver_id=receiver.id,
        requested_lots=50,
        status="pending",
    )
    db.add(req2)
    db.commit()

    res = InventoryService.reserve(db, listing.id, req2.id, 50)
    assert res is False
    log2 = (
        db.query(DecisionLog)
        .filter(DecisionLog.entity_id == req2.id, DecisionLog.decision == "reject")
        .first()
    )
    assert log2 is not None
    assert log2.reason_code == "INVENTORY_EXHAUSTED"
    assert "requested 50 lots" in log2.message
