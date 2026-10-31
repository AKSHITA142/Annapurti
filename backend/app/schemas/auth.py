from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    email: str
    name: Optional[str] = None
    role: Optional[str] = "ngo"  # provider, ngo, volunteer, admin
    city: Optional[str] = "Ahmedabad"
    address: Optional[str] = None
    lat: Optional[float] = 23.0225
    lng: Optional[float] = 72.5714


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    city: Optional[str] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str
    verified: bool
    city: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
