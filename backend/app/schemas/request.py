from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class RequestCreate(BaseModel):
    listing_id: int
    requested_lots: int = Field(..., ge=1)


class RequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    listing_id: int
    receiver_id: int
    requested_lots: int
    allocated_lots: int
    status: str  # pending, reserved, allocated, rejected, cancelled, expired, completed
    reservation_expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    listing_name: Optional[str] = None
    listing_category: Optional[str] = None
