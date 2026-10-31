from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict


class DecisionLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    entity_type: str
    entity_id: int
    step: str
    decision: str
    reason_code: str
    message: str
    payload: Dict[str, Any]


class AdminOverviewResponse(BaseModel):
    total_users: int
    users_by_role: Dict[str, int]
    total_listings: int
    listings_by_status: Dict[str, int]
    total_requests: int
    requests_by_status: Dict[str, int]
    total_jobs: int
    jobs_by_status: Dict[str, int]
    total_vehicles: int


class SimScenarioRequest(BaseModel):
    preset: str = "small"  # small, medium, large, stress
    seed: int = 42


class SimEventRequest(BaseModel):
    event_type: str  # receiver_no_show, reservation_expired, vehicle_cancel_before_pickup, vehicle_cancel_after_pickup, new_urgent_listing, traffic_change
    payload: Dict[str, Any] = {}
