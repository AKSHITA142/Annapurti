from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from app.db import Base


class DonationRequest(Base):
    __tablename__ = "donation_requests"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey("food_listings.id", ondelete="CASCADE"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    requested_lots = Column(Integer, nullable=False)
    allocated_lots = Column(Integer, default=0, nullable=False)
    status = Column(
        String(50),
        default="pending",
        nullable=False,
    )  # pending, reserved, allocated, rejected, cancelled, expired, completed
    reservation_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    listing = relationship("FoodListing", back_populates="requests")
    receiver = relationship("User", back_populates="requests")
    utilization_reports = relationship("UtilizationReport", back_populates="request")
