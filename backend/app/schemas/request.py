from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class RequestCreate(BaseModel):
    listing_id: int
    requested_lots: int = Field(..., ge=1)
    delivery_basis: Optional[str] = "delivery_partner"  # delivery_partner, self_pickup, donor_vehicle


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
    receiver_name: Optional[str] = None
    receiver_priority_class: Optional[str] = None
    delivery_basis: Optional[str] = "delivery_partner"
    partner_verified: Optional[bool] = True
    partner_details: Optional[str] = None
    delivery_job_id: Optional[int] = None
    delivery_job_status: Optional[str] = None
    otp_code: Optional[str] = None
    provider_name: Optional[str] = None
    provider_email: Optional[str] = None
    receiver_email: Optional[str] = None
    nominal_price: Optional[int] = 50
    offer_seconds_remaining: Optional[int] = 60

