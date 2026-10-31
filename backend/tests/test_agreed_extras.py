import os
import tempfile
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_db
from app.db import Base
from app.main import app
from app.models.delivery import DeliveryJob
from app.models.user import ReceiverProfile, User
from app.services.plain_intake import PlainLanguageIntakeParser
from app.solver.objective import ObjectiveEvaluator


@pytest.fixture
def client_and_session():
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

    with TestClient(app) as client:
        yield client, TestingSessionLocal

    app.dependency_overrides.clear()
    engine.dispose()
    if os.path.exists(path):
        os.remove(path)


def test_plain_language_parser():
    """Validates NLP/rule-based intake parser on typical donor food descriptions."""
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)

    # Example 1: 50 veg biryani boxes
    res1 = PlainLanguageIntakeParser.parse("50 veg biryani boxes made at 1 pm, pickup till 4", base_time=now)
    assert res1["total_lots"] == 5
    assert res1["category"] == "cooked_hot"
    assert res1["veg"] is True
    assert "Biryani" in res1["name"]
    assert res1["sender_declared_window_minutes"] >= 60

    # Example 2: Non-veg chilled curry
    res2 = PlainLanguageIntakeParser.parse("30 chilled chicken curry containers prepared at 11 am, pickup until 3 pm", base_time=now)
    assert res2["total_lots"] == 3
    assert res2["category"] == "cooked_chilled"
    assert res2["veg"] is False
    assert res2["storage_requirement"] == "chilled"

    # Example 3: Raw dairy / paneer
    res3 = PlainLanguageIntakeParser.parse("100 raw fresh paneer packets made at 9 am, pickup till 1 pm", base_time=now)
    assert res3["category"] == "raw_refrigerated"
    assert res3["total_lots"] == 10


def test_plain_language_intake_api(client_and_session):
    """Tests POST /listings/parse-intake endpoint."""
    client, _ = client_and_session
    auth_res = client.post("/auth/login", json={"email": "donor@biryani.com", "role": "provider"})
    token = auth_res.json()["access_token"]

    res = client.post(
        "/listings/parse-intake",
        json={"text": "80 veg pulao meals cooked at 12 pm, pickup till 3 pm"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_lots"] == 8
    assert data["category"] == "cooked_hot"
    assert data["veg"] is True
    assert "Pulao" in data["name"] or "Veg" in data["name"]


def test_what_if_stress_analysis_endpoint(client_and_session):
    """Tests POST /admin/sim/what-if endpoint comparing FoodRescue-AI vs baselines."""
    client, _ = client_and_session
    auth_res = client.post("/auth/login", json={"email": "admin@amc.gov", "role": "admin"})
    token = auth_res.json()["access_token"]

    res = client.post(
        "/admin/sim/what-if",
        json={
            "traffic_level": "high",
            "vehicle_count": 3,
            "deadline_tightness": "tight",
            "seed": 42,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "results" in data
    assert len(data["results"]) >= 1

    our_result = next((r for r in data["results"] if "FoodRescue-AI" in r["method"]), None)
    assert our_result is not None
    assert our_result["deadline_violations"] == 0
    assert our_result["valid"] is True


def test_ngo_fairness_priority_weighting(client_and_session):
    """Tests NGO receiver priority class weighting in objective evaluator and admin update."""
    client, SessionLocal = client_and_session
    evaluator = ObjectiveEvaluator()

    # Priority weighting: orphanage (1.5) vs standard (1.0)
    # If orphanage gets 50% and standard gets 50%, the priority penalty is non-zero
    penalty_equal = evaluator.compute_fairness_penalty(
        allocated_by_receiver={1: 5, 2: 5},
        requested_by_receiver={1: 10, 2: 10},
        receiver_priorities={1: "orphanage", 2: "standard"},
    )
    assert penalty_equal > 0.0

    # Test admin priority update endpoint
    db = SessionLocal()
    user = User(name="Child Care", email="orphan@ngo.org", role="ngo", verified=True)
    db.add(user)
    db.commit()
    profile = ReceiverProfile(user_id=user.id, priority_class="standard")
    db.add(profile)
    db.commit()
    receiver_id = user.id
    db.close()

    auth_res = client.post("/auth/login", json={"email": "super@admin.com", "role": "admin"})
    admin_token = auth_res.json()["access_token"]

    patch_res = client.patch(
        f"/admin/receivers/{receiver_id}/priority?priority_class=orphanage",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["priority_class"] == "orphanage"


def test_qr_payload_generation(client_and_session):
    """Tests that DeliveryJob outputs QR payload for digital handover tracking."""
    client, SessionLocal = client_and_session
    db = SessionLocal()
    job = DeliveryJob(
        request_ids=[101],
        route={"stops": []},
        status="assigned",
        otp_code="948201",
    )
    db.add(job)
    db.commit()
    job_id = job.id
    db.close()

    auth_res = client.post("/auth/login", json={"email": "driver@express.com", "role": "volunteer"})
    token = auth_res.json()["access_token"]

    res = client.get(f"/jobs/{job_id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert "qr_payload" in data
    assert f"fr-handover://job/{job_id}?otp=948201" in data["qr_payload"]
