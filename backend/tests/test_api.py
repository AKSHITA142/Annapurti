import os
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Generator
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_db
from app.db import Base
from app.main import app
from app.models.listing import FoodListing
from app.models.user import ReceiverProfile, User
from app.models.vehicle import Vehicle


@pytest.fixture
def client_and_db() -> Generator:
    """Creates an isolated temporary SQLite database and TestClient with dependency overrides."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)

    engine = create_engine(
        f"sqlite:///{path}",
        connect_args={"timeout": 30, "check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client, TestingSessionLocal

    app.dependency_overrides.clear()
    engine.dispose()
    if os.path.exists(path):
        os.remove(path)


def test_docs_and_health(client_and_db):
    client, _ = client_and_db
    res = client.get("/docs")
    assert res.status_code == 200

    res = client.get("/openapi.json")
    assert res.status_code == 200
    paths = res.json()["paths"]
    assert "/auth/login" in paths
    assert "/listings" in paths
    assert "/requests" in paths
    assert "/allocate/run" in paths
    assert "/jobs/{job_id}/delivered" in paths
    assert "/admin/decisions" in paths
    assert "/impact/summary" in paths


def test_auth_login_and_roles(client_and_db):
    client, _ = client_and_db

    # 1. Provider login
    res = client.post(
        "/auth/login",
        json={"email": "chef@provider.com", "name": "Grand Palace", "role": "provider"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "provider"
    provider_token = data["access_token"]

    # 2. Get me
    res = client.get("/auth/me", headers={"Authorization": f"Bearer {provider_token}"})
    assert res.status_code == 200
    assert res.json()["email"] == "chef@provider.com"

    # 3. NGO login
    res = client.post(
        "/auth/login",
        json={"email": "help@ngo.org", "name": "Akshaya Shelter", "role": "ngo"},
    )
    assert res.status_code == 200
    ngo_token = res.json()["access_token"]

    # 4. Wrong role guard: NGO cannot create listing
    now = datetime.now(timezone.utc)
    listing_data = {
        "name": "Surplus Biryani",
        "category": "cooked_hot",
        "veg": True,
        "lot_size": 10,
        "total_lots": 5,
        "prepared_at": now.isoformat(),
        "pickup_lat": 23.0225,
        "pickup_lng": 72.5714,
        "pickup_window_start": now.isoformat(),
        "pickup_window_end": (now + timedelta(hours=2)).isoformat(),
    }
    res = client.post(
        "/listings",
        json=listing_data,
        headers={"Authorization": f"Bearer {ngo_token}"},
    )
    assert res.status_code == 403
    assert "Access denied" in res.json()["detail"]


def test_listings_and_feasibility_badges(client_and_db):
    client, SessionLocal = client_and_db
    now = datetime.now(timezone.utc)

    # Provider logs in and creates two listings: one fresh, one near expiry
    prov_res = client.post(
        "/auth/login",
        json={"email": "hotel@taj.com", "role": "provider"},
    )
    p_token = prov_res.json()["access_token"]

    # Listing 1: Feasible cooked_hot
    res1 = client.post(
        "/listings",
        json={
            "name": "Hot Khichdi",
            "category": "cooked_hot",
            "veg": True,
            "lot_size": 10,
            "total_lots": 10,
            "prepared_at": now.isoformat(),
            "pickup_lat": 23.0225,
            "pickup_lng": 72.5714,
            "pickup_window_start": now.isoformat(),
            "pickup_window_end": (now + timedelta(hours=1)).isoformat(),
        },
        headers={"Authorization": f"Bearer {p_token}"},
    )
    assert res1.status_code == 201
    l1_id = res1.json()["id"]

    # Listing 2: Tight deadline (prepared 3.5 hours ago, max window is 4h -> 30 mins left)
    res2 = client.post(
        "/listings",
        json={
            "name": "Chapatis & Dal",
            "category": "cooked_hot",
            "veg": True,
            "lot_size": 10,
            "total_lots": 4,
            "prepared_at": (now - timedelta(minutes=210)).isoformat(),
            "pickup_lat": 23.0250,
            "pickup_lng": 72.5800,
            "pickup_window_start": now.isoformat(),
            "pickup_window_end": (now + timedelta(minutes=20)).isoformat(),
        },
        headers={"Authorization": f"Bearer {p_token}"},
    )
    assert res2.status_code == 201
    l2_id = res2.json()["id"]

    # Receiver logs in
    rec_res = client.post(
        "/auth/login",
        json={"email": "ngo@ahmedabad.org", "role": "ngo", "lat": 23.0300, "lng": 72.5600},
    )
    r_token = rec_res.json()["access_token"]

    # Browse listings as receiver
    res = client.get("/listings", headers={"Authorization": f"Bearer {r_token}"})
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 2

    l1_data = next(i for i in items if i["id"] == l1_id)
    l2_data = next(i for i in items if i["id"] == l2_id)

    assert l1_data["feasibility_badge"] == "feasible"
    assert l1_data["journey_slack_minutes"] > 45

    assert l2_data["feasibility_badge"] == "tight"
    assert l2_data["journey_slack_minutes"] < 45


def test_double_request_oversell_prevention(client_and_db):
    """
    Acceptance check:
    The double-request scenario through the API returns exactly one success
    when only one request can fit.
    """
    client, _ = client_and_db
    now = datetime.now(timezone.utc)

    # Provider logs in & creates listing with total_lots = 1
    prov_res = client.post(
        "/auth/login",
        json={"email": "bakery@amul.com", "role": "provider"},
    )
    p_token = prov_res.json()["access_token"]

    list_res = client.post(
        "/listings",
        json={
            "name": "Last Bread Crate",
            "category": "sealed_packaged",
            "veg": True,
            "lot_size": 10,
            "total_lots": 1,
            "prepared_at": now.isoformat(),
            "pickup_lat": 23.0225,
            "pickup_lng": 72.5714,
            "pickup_window_start": now.isoformat(),
            "pickup_window_end": (now + timedelta(hours=3)).isoformat(),
        },
        headers={"Authorization": f"Bearer {p_token}"},
    )
    assert list_res.status_code == 201
    listing_id = list_res.json()["id"]

    # Receiver 1 logs in
    r1_res = client.post("/auth/login", json={"email": "ngo1@trust.org", "role": "ngo"})
    r1_token = r1_res.json()["access_token"]

    # Receiver 2 logs in
    r2_res = client.post("/auth/login", json={"email": "ngo2@trust.org", "role": "ngo"})
    r2_token = r2_res.json()["access_token"]

    # Receiver 1 requests 1 lot -> MUST SUCCEED
    req1_res = client.post(
        "/requests",
        json={"listing_id": listing_id, "requested_lots": 1},
        headers={"Authorization": f"Bearer {r1_token}"},
    )
    assert req1_res.status_code == 201
    assert req1_res.json()["status"] == "reserved"
    assert req1_res.json()["allocated_lots"] == 1

    # Receiver 2 requests 1 lot -> MUST FAIL with 400 INVENTORY_EXHAUSTED
    req2_res = client.post(
        "/requests",
        json={"listing_id": listing_id, "requested_lots": 1},
        headers={"Authorization": f"Bearer {r2_token}"},
    )
    assert req2_res.status_code == 400
    assert "INVENTORY_EXHAUSTED" in req2_res.json()["detail"]


def test_allocation_delivery_and_otp_workflow(client_and_db):
    """
    Tests end-to-end allocation solver, routing, delivery confirmation via OTP,
    utilization reporting, and impact computation.
    """
    client, SessionLocal = client_and_db
    now = datetime.now(timezone.utc)

    # 1. Setup Provider & Vehicle in DB
    db = SessionLocal()
    provider = User(name="City Kitchen", email="kitchen@city.com", role="provider", verified=True)
    db.add(provider)
    db.commit()

    vehicle = Vehicle(
        owner_id=provider.id,
        type="van",
        capacity_lots=50,
        has_cold_storage=True,
        lat=23.0225,
        lng=72.5714,
        service_radius_km=30.0,
        is_simulated=False,
    )
    db.add(vehicle)
    db.commit()
    db.close()

    # Provider logs in & creates listing with 20 lots
    prov_res = client.post("/auth/login", json={"email": "kitchen@city.com", "role": "provider"})
    p_token = prov_res.json()["access_token"]

    list_res = client.post(
        "/listings",
        json={
            "name": "Pulao Large Batch",
            "category": "cooked_hot",
            "veg": True,
            "lot_size": 10,
            "total_lots": 20,
            "prepared_at": now.isoformat(),
            "pickup_lat": 23.0225,
            "pickup_lng": 72.5714,
            "pickup_window_start": now.isoformat(),
            "pickup_window_end": (now + timedelta(hours=3)).isoformat(),
        },
        headers={"Authorization": f"Bearer {p_token}"},
    )
    assert list_res.status_code == 201
    listing_id = list_res.json()["id"]

    # Receiver 1 logs in & requests 8 lots
    r1_res = client.post("/auth/login", json={"email": "shelter1@ahmedabad.org", "role": "ngo"})
    r1_token = r1_res.json()["access_token"]
    req1 = client.post(
        "/requests",
        json={"listing_id": listing_id, "requested_lots": 8},
        headers={"Authorization": f"Bearer {r1_token}"},
    )
    assert req1.status_code == 201
    req1_id = req1.json()["id"]

    # Receiver 2 logs in & requests 6 lots
    r2_res = client.post("/auth/login", json={"email": "shelter2@ahmedabad.org", "role": "ngo"})
    r2_token = r2_res.json()["access_token"]
    req2 = client.post(
        "/requests",
        json={"listing_id": listing_id, "requested_lots": 6},
        headers={"Authorization": f"Bearer {r2_token}"},
    )
    assert req2.status_code == 201
    req2_id = req2.json()["id"]

    # 2. Trigger Batch Allocation (POST /allocate/run)
    alloc_res = client.post(
        "/allocate/run",
        json={"listing_id": listing_id, "max_repair_rounds": 3},
        headers={"Authorization": f"Bearer {p_token}"},
    )
    assert alloc_res.status_code == 200
    alloc_data = alloc_res.json()
    assert alloc_data["success"] is True
    assert alloc_data["allocated_count"] == 2
    assert alloc_data["jobs_created"] >= 1

    # 3. Retrieve planned delivery job
    jobs_res = client.get("/jobs", headers={"Authorization": f"Bearer {p_token}"})
    assert jobs_res.status_code == 200
    jobs = jobs_res.json()
    assert len(jobs) >= 1
    job = jobs[0]
    job_id = job["id"]
    correct_otp = job["otp_code"]
    assert len(correct_otp) == 6

    # 4. Driver marks collected (POST /jobs/{id}/collected)
    col_res = client.post(
        f"/jobs/{job_id}/collected",
        headers={"Authorization": f"Bearer {p_token}"},
    )
    assert col_res.status_code == 200
    assert col_res.json()["status"] == "in_transit"

    # 5. Handover delivery confirmation: Wrong OTP test -> MUST FAIL 400
    deliv_wrong = client.post(
        f"/jobs/{job_id}/delivered",
        json={"otp_code": "000000", "notes": "Wrong code attempt"},
        headers={"Authorization": f"Bearer {r1_token}"},
    )
    assert deliv_wrong.status_code == 400
    assert "Invalid OTP" in deliv_wrong.json()["detail"]

    # Correct OTP handover -> MUST SUCCEED 200
    deliv_ok = client.post(
        f"/jobs/{job_id}/delivered",
        json={"otp_code": correct_otp, "notes": "All lots received in hot condition"},
        headers={"Authorization": f"Bearer {r1_token}"},
    )
    assert deliv_ok.status_code == 200
    assert deliv_ok.json()["job_id"] == job_id

    # 6. Post-delivery utilization report (POST /jobs/{id}/utilization)
    util_res = client.post(
        f"/jobs/{job_id}/utilization",
        json={
            "request_id": req1_id,
            "reported_distributed_lots": 8,
            "people_served": 80,
            "notes": "Served 80 evening community dinner plates",
        },
        headers={"Authorization": f"Bearer {r1_token}"},
    )
    assert util_res.status_code == 201
    assert util_res.json()["people_served"] == 80

    # 7. Impact summary (GET /impact/summary)
    impact_res = client.get("/impact/summary")
    assert impact_res.status_code == 200
    impact_data = impact_res.json()
    assert impact_data["published_lots"] == 20
    assert impact_data["delivered_lots"] == 14  # 8 + 6 delivered
    assert impact_data["reported_distributed_lots"] == 8
    assert impact_data["estimated_people_served"] >= 80
    assert impact_data["co2_saved_kg"] > 0
    assert "UNEP/FAO" in impact_data["co2_assumption"]


def test_admin_decisions_and_overview(client_and_db):
    client, _ = client_and_db

    admin_res = client.post(
        "/auth/login",
        json={"email": "admin@fr.org", "name": "Super Admin", "role": "admin"},
    )
    admin_token = admin_res.json()["access_token"]

    # Overview endpoint
    overview_res = client.get(
        "/admin/overview",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert overview_res.status_code == 200
    overview = overview_res.json()
    assert "total_users" in overview
    assert "listings_by_status" in overview

    # Decisions explain view feed
    decisions_res = client.get(
        "/admin/decisions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert decisions_res.status_code == 200
    assert isinstance(decisions_res.json(), list)


def test_expired_reservation_handling(client_and_db):
    """Verifies that expired reservations are properly reclaimed by the background/event system."""
    client, SessionLocal = client_and_db
    now = datetime.now(timezone.utc)

    db = SessionLocal()
    provider = User(name="Hotel Apex", email="apex@hotel.com", role="provider", verified=True)
    receiver = User(name="City Care", email="care@ngo.com", role="ngo", verified=True)
    db.add_all([provider, receiver])
    db.commit()

    listing = FoodListing(
        provider_id=provider.id,
        name="Fresh Bread",
        category="cooked_hot",
        veg=True,
        lot_size=10,
        total_lots=5,
        available_lots=3,
        reserved_lots=2,
        collected_lots=0,
        delivered_lots=0,
        closed_lots=0,
        prepared_at=now,
        safe_deadline=now + timedelta(hours=3),
        pickup_lat=23.0225,
        pickup_lng=72.5714,
        pickup_window_start=now,
        pickup_window_end=now + timedelta(hours=1),
        status="active",
    )
    db.add(listing)
    db.commit()

    from app.models.request import DonationRequest
    req = DonationRequest(
        listing_id=listing.id,
        receiver_id=receiver.id,
        requested_lots=2,
        allocated_lots=2,
        status="reserved",
        reservation_expires_at=now - timedelta(minutes=5),  # already expired
    )
    db.add(req)
    db.commit()
    target_listing_id = listing.id
    db.close()

    # Trigger simulation event for expired reservation
    admin_res = client.post("/auth/login", json={"email": "admin@amc.gov", "role": "admin"})
    admin_token = admin_res.json()["access_token"]

    event_res = client.post(
        "/admin/sim/event",
        json={"event_type": "reservation_expired", "payload": {}},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert event_res.status_code == 200
    data = event_res.json()
    assert data["expired_count"] >= 1

    # Check listing inventory was restored
    db = SessionLocal()
    refreshed_listing = db.query(FoodListing).filter(FoodListing.id == target_listing_id).first()
    assert refreshed_listing.available_lots == 5
    assert refreshed_listing.reserved_lots == 0
    db.close()
