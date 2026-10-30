from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "FoodRescue-AI"
    assert "version" in data


def test_root_endpoint() -> None:
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "FoodRescue-AI" in data["message"]

