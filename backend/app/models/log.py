from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Integer, JSON, String, Text
from app.db import Base


class DecisionLog(Base):
    __tablename__ = "decision_log"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    entity_type = Column(String(50), nullable=False)  # request, listing, route, vehicle, system
    entity_id = Column(Integer, nullable=False)
    step = Column(
        String(50), nullable=False
    )  # inventory, domain_pruning, backtracking, ac3, repair, ladder, expiry, routing
    decision = Column(String(50), nullable=False)  # accept, reject, reassign, reserve, release, expire, prune
    reason_code = Column(
        String(50), nullable=False
    )  # INVENTORY_EXHAUSTED, RESERVED_SUCCESS, SAFETY_DEADLINE, CAPACITY, HOURS_CLOSED, CATEGORY_REJECTED, etc.
    message = Column(Text, nullable=False)  # Human-readable sentence
    payload = Column(JSON, default=dict, nullable=False)  # Additional machine-readable structured details


class InventoryLog(Base):
    __tablename__ = "inventory_logs"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, nullable=False, index=True)
    action = Column(String(50), nullable=False)  # created, reserved, released, allocated, delivered, expired, archived, deleted
    previous_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=False)
    available_lots = Column(Integer, nullable=False)
    reserved_lots = Column(Integer, nullable=False)
    note = Column(Text, nullable=True)
    timestamp = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    @staticmethod
    def log(
        db,
        listing_id: int,
        action: str,
        new_status: str,
        available_lots: int,
        reserved_lots: int,
        previous_status: str = None,
        note: str = None,
    ):
        """Helper to safely record an inventory state transition audit log."""
        try:
            entry = InventoryLog(
                listing_id=listing_id,
                action=action,
                previous_status=previous_status,
                new_status=new_status,
                available_lots=available_lots,
                reserved_lots=reserved_lots,
                note=note,
                timestamp=datetime.now(timezone.utc),
            )
            db.add(entry)
        except Exception:
            pass
