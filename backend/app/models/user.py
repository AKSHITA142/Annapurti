from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship
from app.db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    role = Column(String(50), nullable=False)  # provider, ngo, volunteer, admin
    verified = Column(Boolean, default=False, nullable=False)
    city = Column(String(100), default="Ahmedabad", nullable=False)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    receiver_profile = relationship("ReceiverProfile", back_populates="user", uselist=False)
    listings = relationship("FoodListing", back_populates="provider")
    requests = relationship("DonationRequest", back_populates="receiver")
    vehicles = relationship("Vehicle", back_populates="owner")


class ReceiverProfile(Base):
    __tablename__ = "receiver_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    accepted_categories = Column(JSON, default=list, nullable=False)  # ["cooked_hot", "cooked_chilled", etc.]
    daily_intake_capacity = Column(Integer, default=50, nullable=False)  # in lots
    remaining_capacity = Column(Integer, default=50, nullable=False)  # in lots
    operating_hours_start = Column(String(10), default="09:00", nullable=False)  # HH:MM
    operating_hours_end = Column(String(10), default="21:00", nullable=False)  # HH:MM
    has_vehicle = Column(Boolean, default=False, nullable=False)
    priority_class = Column(String(50), default="standard", nullable=False)  # shelter, orphanage, community_kitchen, standard

    user = relationship("User", back_populates="receiver_profile")
