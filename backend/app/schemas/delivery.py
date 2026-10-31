from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class DeliveryJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: Optional[int] = None
    request_ids: List[int]
    route: Dict[str, Any]
    planned_start_time: Optional[datetime] = None
    planned_end_time: Optional[datetime] = None
    status: str
    otp_code: str
    qr_payload: Optional[str] = None
    created_at: datetime


class DeliveryConfirmationRequest(BaseModel):
    otp_code: str = Field(..., min_length=6, max_length=6)
    notes: Optional[str] = None


class DeliveryConfirmationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    receiver_id: int
    confirmed_at: datetime
    notes: Optional[str] = None


class UtilizationReportCreate(BaseModel):
    request_id: int
    reported_distributed_lots: int = Field(..., ge=0)
    people_served: int = Field(default=0, ge=0)
    photo_url: Optional[str] = None
    notes: Optional[str] = None


class UtilizationReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    request_id: int
    receiver_id: int
    reported_distributed_lots: int
    people_served: int
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
