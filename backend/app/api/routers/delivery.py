from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.delivery import DeliveryConfirmation, DeliveryJob, UtilizationReport
from app.models.request import DonationRequest
from app.models.user import User
from app.schemas.delivery import (
    DeliveryConfirmationRequest,
    DeliveryConfirmationResponse,
    DeliveryJobResponse,
    UtilizationReportCreate,
    UtilizationReportResponse,
)
from app.services.inventory import InventoryService

router = APIRouter(prefix="/jobs", tags=["Delivery & Tracking"])


@router.post("/{job_id}/collected", response_model=DeliveryJobResponse)
def mark_job_collected(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DeliveryJobResponse:
    """
    Transitions delivery job to 'in_transit' and confirms physical pickup,
    moving inventory lots from reserved to collected.
    """
    job = db.query(DeliveryJob).filter(DeliveryJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Delivery job {job_id} not found")

    job.status = "in_transit"
    req_ids = job.request_ids or []
    for req_id in req_ids:
        InventoryService.confirm_collected(db, req_id)

    db.commit()
    db.refresh(job)
    return DeliveryJobResponse.model_validate(job)


@router.post("/{job_id}/delivered", response_model=DeliveryConfirmationResponse)
def confirm_job_delivered(
    job_id: int,
    payload: DeliveryConfirmationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DeliveryConfirmationResponse:
    """
    Confirms food delivery with 6-digit OTP verification at handover.
    Transitions inventory lots from collected to delivered.
    """
    job = db.query(DeliveryJob).filter(DeliveryJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Delivery job {job_id} not found")

    if job.otp_code != payload.otp_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid OTP verification code. Provided {payload.otp_code} does not match required OTP.",
        )

    job.status = "delivered"
    req_ids = job.request_ids or []
    for req_id in req_ids:
        InventoryService.confirm_delivered(db, req_id)

    conf = DeliveryConfirmation(
        job_id=job.id,
        receiver_id=current_user.id,
        confirmed_at=datetime.now(timezone.utc),
        otp_entered=payload.otp_code,
        notes=payload.notes,
    )
    db.add(conf)
    db.commit()
    db.refresh(conf)

    return DeliveryConfirmationResponse.model_validate(conf)


@router.post("/{job_id}/utilization", response_model=UtilizationReportResponse, status_code=status.HTTP_201_CREATED)
def submit_utilization_report(
    job_id: int,
    payload: UtilizationReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UtilizationReportResponse:
    """
    Submits a post-delivery food utilization report documenting distributed lots,
    number of people served, optional photo and notes.
    """
    req = db.query(DonationRequest).filter(DonationRequest.id == payload.request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"Request {payload.request_id} not found")

    report = UtilizationReport(
        request_id=payload.request_id,
        receiver_id=current_user.id,
        reported_distributed_lots=payload.reported_distributed_lots,
        people_served=payload.people_served,
        photo_url=payload.photo_url,
        notes=payload.notes,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return UtilizationReportResponse.model_validate(report)


@router.get("/{job_id}", response_model=DeliveryJobResponse)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DeliveryJobResponse:
    """Retrieves delivery job status and route coordinates."""
    job = db.query(DeliveryJob).filter(DeliveryJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Delivery job {job_id} not found")
    return DeliveryJobResponse.model_validate(job)


@router.get("", response_model=List[DeliveryJobResponse])
def get_my_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[DeliveryJobResponse]:
    """Lists recent delivery jobs."""
    jobs = db.query(DeliveryJob).order_by(DeliveryJob.created_at.desc()).limit(30).all()
    return [DeliveryJobResponse.model_validate(j) for j in jobs]
