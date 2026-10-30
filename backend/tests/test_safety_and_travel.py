import os
import tempfile
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app.models.user import User
from app.services.safety_rules import SafetyRulesService, safety_service
from app.services.travel import (
    RoadGraphLoader,
    haversine_distance_km,
    travel_minutes,
    DistanceMatrix,
)
from app.services.listing_service import ListingService


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


# --- 1. Safety Deadline & Sender Window Tests ---

def test_sender_cannot_extend_safe_window():
    """
    Hard constraint: safe_deadline = prepared_at + min(sender_declared, category_max).
    Sender can shorten the safety window but NEVER extend it.
    """
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)

    # cooked_hot has 240 minutes max
    # Attempt 1: Sender declares 360 mins (6 hours) -> Must be clamped to 240 mins (4 hours)
    deadline_over = safety_service.compute_safe_deadline(
        prepared_at=now,
        category="cooked_hot",
        sender_declared_window_minutes=360,
    )
    assert deadline_over == now + timedelta(minutes=240)

    # Attempt 2: Sender declares 120 mins (2 hours) -> Valid shorter window allowed (120 mins)
    deadline_under = safety_service.compute_safe_deadline(
        prepared_at=now,
        category="cooked_hot",
        sender_declared_window_minutes=120,
    )
    assert deadline_under == now + timedelta(minutes=120)

    # Attempt 3: Sender declares None -> Defaults to category max (240 mins)
    deadline_default = safety_service.compute_safe_deadline(
        prepared_at=now,
        category="cooked_hot",
        sender_declared_window_minutes=None,
    )
    assert deadline_default == now + timedelta(minutes=240)


def test_category_windows():
    """
    Verify all 4 core category maximum safety windows.
    """
    now = datetime(2026, 10, 31, 10, 0, 0, tzinfo=timezone.utc)
    assert safety_service.compute_safe_deadline(now, "cooked_hot") == now + timedelta(minutes=240)
    assert safety_service.compute_safe_deadline(now, "cooked_chilled") == now + timedelta(minutes=480)
    assert safety_service.compute_safe_deadline(now, "raw_refrigerated") == now + timedelta(minutes=720)
    assert safety_service.compute_safe_deadline(now, "sealed_packaged") == now + timedelta(minutes=10080)


# --- 2. Cold Chain Vehicle Suitability Tests ---

def test_cold_chain_vehicle_suitability():
    """
    Cold-chain categories require active vehicle cold storage.
    Vehicles without cold storage must be rejected.
    """
    # cooked_hot does not require cold storage
    assert safety_service.is_vehicle_suitable("cooked_hot", vehicle_has_cold_storage=False) is True
    assert safety_service.is_vehicle_suitable("cooked_hot", vehicle_has_cold_storage=True) is True

    # cooked_chilled requires cold storage
    assert safety_service.is_vehicle_suitable("cooked_chilled", vehicle_has_cold_storage=False) is False
    assert safety_service.is_vehicle_suitable("cooked_chilled", vehicle_has_cold_storage=True) is True

    # raw_refrigerated requires cold storage
    assert safety_service.is_vehicle_suitable("raw_refrigerated", vehicle_has_cold_storage=False) is False
    assert safety_service.is_vehicle_suitable("raw_refrigerated", vehicle_has_cold_storage=True) is True

    # sealed_packaged does not require cold storage
    assert safety_service.is_vehicle_suitable("sealed_packaged", vehicle_has_cold_storage=False) is True


# --- 3. Journey Feasibility & Deadline Boundary Tests ---

def test_journey_check_boundary():
    """
    Journey check: arrival_at_receiver = depart + travel_pickup + load(10) + travel_receiver + handover(5)
    Must be <= safe_deadline.
    Test exact boundary condition: arrival == deadline is feasible; arrival == deadline + 1s is infeasible.
    """
    depart = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)
    # Total journey time = 15m (travel_pickup) + 10m (load) + 20m (travel_receiver) + 5m (handover) = 50 minutes
    travel_pickup = 15.0
    travel_receiver = 20.0
    load_time = 10
    handover_time = 5

    # Case A: Deadline is exactly at 50 minutes (arrival == deadline) -> Feasible (slack == 0.0)
    deadline_exact = depart + timedelta(minutes=50)
    is_feasible, arrival, slack = safety_service.check_journey_feasibility(
        depart_time=depart,
        travel_to_pickup_minutes=travel_pickup,
        travel_to_receiver_minutes=travel_receiver,
        safe_deadline=deadline_exact,
        load_time_minutes=load_time,
        handover_time_minutes=handover_time,
    )
    assert is_feasible is True
    assert arrival == deadline_exact
    assert round(slack, 2) == 0.0

    # Case B: Deadline is 1 second earlier (arrival > deadline) -> Infeasible (slack < 0)
    deadline_missed = deadline_exact - timedelta(seconds=1)
    is_feasible, arrival, slack = safety_service.check_journey_feasibility(
        depart_time=depart,
        travel_to_pickup_minutes=travel_pickup,
        travel_to_receiver_minutes=travel_receiver,
        safe_deadline=deadline_missed,
        load_time_minutes=load_time,
        handover_time_minutes=handover_time,
    )
    assert is_feasible is False
    assert slack < 0


# --- 4. Travel-Time Layer & Traffic Multiplier Tests ---

def test_haversine_distance():
    """
    Verify Haversine distance calculations between known Ahmedabad coordinates.
    Navrangpura (23.0365, 72.5611) to Maninagar (22.9978, 72.6033) ~ 6.1 km
    """
    navrangpura = (23.0365, 72.5611)
    maninagar = (22.9978, 72.6033)

    dist = haversine_distance_km(navrangpura, maninagar)
    assert 5.0 <= dist <= 7.0

    # Distance to same point must be 0
    assert haversine_distance_km(navrangpura, navrangpura) == 0.0


def test_travel_minutes_consistency_and_traffic():
    """
    Deterministic output: travel_minutes returns identical values for same inputs.
    Sensitivity: low < medium < high.
    """
    p1 = (23.0365, 72.5611)
    p2 = (22.9978, 72.6033)

    # Identical inputs yield identical results
    t1 = travel_minutes(p1, p2, traffic_level="medium")
    t2 = travel_minutes(p1, p2, traffic_level="medium")
    assert t1 == t2
    assert t1 > 0

    # Traffic level multipliers: low (1.0) < medium (1.3) < high (1.7)
    t_low = travel_minutes(p1, p2, traffic_level="low")
    t_med = travel_minutes(p1, p2, traffic_level="medium")
    t_high = travel_minutes(p1, p2, traffic_level="high")

    assert t_low < t_med < t_high
    assert round(t_med / t_low, 1) == 1.3
    assert round(t_high / t_low, 1) == 1.7


def test_distance_matrix_cache():
    """
    Test DistanceMatrix caching and N x N building.
    """
    locations = [
        (23.0365, 72.5611),  # Navrangpura
        (22.9978, 72.6033),  # Maninagar
        (23.0525, 72.5322),  # Vastrapur
    ]
    dm = DistanceMatrix(traffic_level="medium")
    matrix = dm.build_matrix(locations)

    assert len(matrix) == 9
    assert matrix[(0, 0)] == 0.0
    assert matrix[(1, 1)] == 0.0
    assert matrix[(0, 1)] > 0.0
    # Symmetric distance for identical road/traffic parameters
    assert matrix[(0, 1)] == matrix[(1, 0)]


def test_road_graph_fallback_when_osmnx_unavailable():
    """
    Verify fallback is cleanly triggered and logged when OSMnx graph cache is absent.
    """
    loader = RoadGraphLoader(cache_file="non_existent_graph.graphml")
    success = loader.load_graph()
    assert success is False
    assert loader.using_fallback is True
    assert loader.graph is None


# --- 5. Service Integration: Listing gets safe_deadline on creation ---

def test_listing_service_computes_safe_deadline(test_db):
    """
    Acceptance check: a listing created via ListingService gets a computed safe_deadline
    respecting category rules and clamping declared window.
    """
    provider = User(name="Restaurant Owner", email="owner@kitchen.com", role="provider", verified=True)
    test_db.add(provider)
    test_db.commit()

    now = datetime(2026, 10, 31, 14, 0, 0, tzinfo=timezone.utc)
    listing = ListingService.create_listing(
        db=test_db,
        provider_id=provider.id,
        name="Hot Dal Makhani & Rice",
        category="cooked_hot",  # 240 min max window
        veg=True,
        lot_size=10,
        total_lots=20,
        prepared_at=now,
        pickup_lat=23.0365,
        pickup_lng=72.5611,
        pickup_window_start=now,
        pickup_window_end=now + timedelta(hours=2),
        sender_declared_window_minutes=300,  # 300 mins > 240 mins max -> must be clamped to 240
    )

    assert listing.id is not None
    # Clamped to 240 minutes = 4 hours
    expected_deadline = now + timedelta(minutes=240)
    deadline_utc = listing.safe_deadline
    if deadline_utc.tzinfo is None:
        deadline_utc = deadline_utc.replace(tzinfo=timezone.utc)
    assert deadline_utc == expected_deadline
    assert listing.check_invariant()
