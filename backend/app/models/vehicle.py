from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from app.db import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(50), default="van", nullable=False)  # van, bike, auto, truck
    capacity_lots = Column(Integer, nullable=False)
    service_radius_km = Column(Float, default=15.0, nullable=False)
    available_from = Column(String(10), default="08:00", nullable=False)  # HH:MM
    available_to = Column(String(10), default="22:00", nullable=False)  # HH:MM
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    is_simulated = Column(Boolean, default=False, nullable=False)
    has_cold_storage = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    owner = relationship("User", back_populates="vehicles")
    jobs = relationship("DeliveryJob", back_populates="vehicle")

