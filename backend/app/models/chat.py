from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, nullable=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    sender_name = Column(String(150), nullable=False)
    sender_role = Column(String(50), nullable=False)  # provider, ngo, volunteer
    recipient_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    message = Column(Text, nullable=False)
    photo_url = Column(Text, nullable=True)  # supports URL or data URI
    people_served = Column(Integer, nullable=True)
    message_type = Column(String(50), default="text", nullable=False)  # text, feedback_photo, thank_you
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    sender = relationship("User", foreign_keys=[sender_id])
    recipient = relationship("User", foreign_keys=[recipient_id])

