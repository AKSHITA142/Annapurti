from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ParseIntakeRequest(BaseModel):
    text: str


class ParseIntakeResponse(BaseModel):
    name: str
    category: str
    veg: bool
    unit: str
    lot_size: int
    total_lots: int
    estimated_meals: int
    prepared_at: str
    pickup_window_start: str
    pickup_window_end: str
    sender_declared_window_minutes: int
    storage_requirement: str
    raw_text: str
    confidence: float


class ListingCreate(BaseModel):
    name: str
    category: str  # cooked_hot, cooked_chilled, raw_refrigerated, sealed_packaged
    veg: bool = True
    unit: str = "meals"
    lot_size: int = Field(default=10, ge=1)
    total_lots: int = Field(..., ge=1)
    prepared_at: datetime
    pickup_lat: float
    pickup_lng: float
    pickup_window_start: datetime
    pickup_window_end: datetime
    sender_declared_window_minutes: Optional[int] = None
    storage_requirement: str = "ambient"
    delivery_mode_offered: str = "sender_vehicle"
    delivery_contribution_type: str = "free"
    contribution_amount: float = 0.0


class ListingUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    delivery_mode_offered: Optional[str] = None
    pickup_window_end: Optional[datetime] = None


class ListingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider_id: int
    name: str
    category: str
    veg: bool
    unit: str
    lot_size: int
    total_lots: int
    available_lots: int
    reserved_lots: int
    collected_lots: int
    delivered_lots: int
    closed_lots: int
    prepared_at: datetime
    safe_deadline: datetime
    storage_requirement: str
    pickup_lat: float
    pickup_lng: float
    pickup_window_start: datetime
    pickup_window_end: datetime
    delivery_mode_offered: str
    delivery_contribution_type: str
    contribution_amount: float
    status: str
    created_at: datetime
    provider_name: Optional[str] = None

    # Feasibility and countdown badges (dynamic computed fields)
    feasibility_badge: Optional[str] = None  # feasible, tight, infeasible
    journey_slack_minutes: Optional[float] = None
    spoilage_minutes_remaining: Optional[float] = None
