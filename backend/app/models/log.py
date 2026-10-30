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
