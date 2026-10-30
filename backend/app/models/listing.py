from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from app.db import Base


class FoodListing(Base):
    __tablename__ = "food_listings"

    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False)  # cooked_hot, cooked_chilled, raw_refrigerated, sealed_packaged
    veg = Column(Boolean, default=True, nullable=False)
    unit = Column(String(50), default="meals", nullable=False)
    lot_size = Column(Integer, default=10, nullable=False)  # items/meals per lot
    total_lots = Column(Integer, nullable=False)
    available_lots = Column(Integer, nullable=False)
    reserved_lots = Column(Integer, default=0, nullable=False)
    collected_lots = Column(Integer, default=0, nullable=False)
    delivered_lots = Column(Integer, default=0, nullable=False)
    closed_lots = Column(Integer, default=0, nullable=False)  # for discarded / expired / cancelled lots

    prepared_at = Column(DateTime(timezone=True), nullable=False)
    safe_deadline = Column(DateTime(timezone=True), nullable=False)
    storage_requirement = Column(String(50), default="ambient", nullable=False)  # ambient, hot_holding, chilled, frozen

    pickup_lat = Column(Float, nullable=False)
    pickup_lng = Column(Float, nullable=False)
    pickup_window_start = Column(DateTime(timezone=True), nullable=False)
    pickup_window_end = Column(DateTime(timezone=True), nullable=False)

    delivery_mode_offered = Column(String(50), default="sender_vehicle", nullable=False)  # sender_vehicle, self_collect, partner_pool
    delivery_contribution_type = Column(String(50), default="free", nullable=False)  # free, fixed, negotiable
    contribution_amount = Column(Float, default=0.0, nullable=False)
    status = Column(String(50), default="active", nullable=False)  # active, fully_reserved, completed, expired, cancelled
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    provider = relationship("User", back_populates="listings")
    requests = relationship("DonationRequest", back_populates="listing")

    def check_invariant(self) -> bool:
        """
        Quantity invariant:
        available + reserved + collected + delivered + closed = total
        """
        return (
            self.available_lots
            + self.reserved_lots
            + self.collected_lots
            + self.delivered_lots
            + self.closed_lots
            == self.total_lots
        )
