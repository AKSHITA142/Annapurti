from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class ChatMessageCreate(BaseModel):
    request_id: Optional[int] = None
    recipient_id: Optional[int] = None
    message: str
    photo_url: Optional[str] = None
    people_served: Optional[int] = None
    message_type: str = "text"


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    request_id: Optional[int] = None
    sender_id: int
    sender_name: str
    sender_role: str
    recipient_id: Optional[int] = None
    message: str
    photo_url: Optional[str] = None
    people_served: Optional[int] = None
    message_type: str
    created_at: datetime

