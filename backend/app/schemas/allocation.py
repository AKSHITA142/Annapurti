from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict


class AllocationRunRequest(BaseModel):
    listing_id: Optional[int] = None
    max_repair_rounds: int = 5
    traffic_level: str = "medium"


class AllocationRunResponse(BaseModel):
    success: bool
    total_requests: int
    allocated_count: int
    unallocated_count: int
    repair_rounds_run: int
    all_routes_valid: bool
    jobs_created: int
    summary: Dict[str, Any]


class AllocationDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: Optional[int]
    request_ids: List[int]
    status: str
    route: Dict[str, Any]
    otp_code: str
    qr_payload: Optional[str] = None
    created_at: datetime
