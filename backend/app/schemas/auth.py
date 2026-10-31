from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    email: str
    name: Optional[str] = None
    role: Optional[str] = "ngo"  # provider, ngo, volunteer, admin
    city: Optional[str] = "Ahmedabad"
    lat: Optional[float] = 23.0225
    lng: Optional[float] = 72.5714


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str
    verified: bool
    city: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
