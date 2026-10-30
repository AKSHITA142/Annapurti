from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship
from app.db import Base


class DeliveryJob(Base):
    __tablename__ = "delivery_jobs"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True)
    request_ids = Column(JSON, default=list, nullable=False)  # List of donation_request IDs included in this job
    route = Column(JSON, default=dict, nullable=False)  # JSON structure of stops, waypoints, and arrival times
    planned_start_time = Column(DateTime(timezone=True), nullable=True)
    planned_end_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(
        String(50), default="planned", nullable=False
    )  # planned, assigned, in_transit, delivered, cancelled, recovery_needed
    otp_code = Column(String(6), nullable=False)  # 6-digit confirmation OTP
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    vehicle = relationship("Vehicle", back_populates="jobs")
    confirmations = relationship("DeliveryConfirmation", back_populates="job")


class DeliveryConfirmation(Base):
    __tablename__ = "delivery_confirmations"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("delivery_jobs.id", ondelete="CASCADE"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    confirmed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    otp_entered = Column(String(6), nullable=False)
    notes = Column(Text, nullable=True)

    job = relationship("DeliveryJob", back_populates="confirmations")
    receiver = relationship("User")


class UtilizationReport(Base):
    __tablename__ = "utilization_reports"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("donation_requests.id", ondelete="CASCADE"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reported_distributed_lots = Column(Integer, nullable=False)
    people_served = Column(Integer, default=0, nullable=False)
    photo_url = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    request = relationship("DonationRequest", back_populates="utilization_reports")
    receiver = relationship("User")

