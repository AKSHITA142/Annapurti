import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_roles
from app.models.delivery import DeliveryJob
from app.models.listing import FoodListing
from app.models.request import DonationRequest
from app.models.user import ReceiverProfile, User
from app.models.vehicle import Vehicle
from app.schemas.allocation import (
    AllocationDetailResponse,
    AllocationRunRequest,
    AllocationRunResponse,
)
from app.solver.feedback_loop import FeedbackLoopCoordinator

router = APIRouter(tags=["Allocation & Solver"])


@router.post("/allocate/run", response_model=AllocationRunResponse)
def run_allocation(
    payload: AllocationRunRequest = AllocationRunRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "provider"])),
) -> AllocationRunResponse:
    """
    Triggers batch allocation-routing feedback loop using CSP solver and routing engine.
    Solves constraints, routes vehicles, validates safety deadlines, and creates DeliveryJobs.
    """
    now = datetime.now(timezone.utc)

    # 1. Fetch relevant donation requests
    query = db.query(DonationRequest).filter(
        DonationRequest.status.in_(["pending", "reserved"])
    )
    if payload.listing_id is not None:
        query = query.filter(DonationRequest.listing_id == payload.listing_id)

    requests = query.all()
    if not requests:
        return AllocationRunResponse(
            success=True,
            total_requests=0,
            allocated_count=0,
            unallocated_count=0,
            repair_rounds_run=0,
            all_routes_valid=True,
            jobs_created=0,
            summary={"message": "No pending or reserved requests to allocate"},
        )

    # 2. Gather context objects
    listing_ids = list({r.listing_id for r in requests})
    receiver_ids = list({r.receiver_id for r in requests})

    listings = {l.id: l for l in db.query(FoodListing).filter(FoodListing.id.in_(listing_ids)).all()}
    receivers = {u.id: u for u in db.query(User).filter(User.id.in_(receiver_ids)).all()}
    profiles_list = db.query(ReceiverProfile).filter(ReceiverProfile.user_id.in_(receiver_ids)).all()
    profiles = {p.user_id: p for p in profiles_list}
    vehicles = db.query(Vehicle).all()

    # 3. Execute feedback loop coordinator
    coordinator = FeedbackLoopCoordinator(
        db=db,
        max_repair_rounds=payload.max_repair_rounds,
        traffic_level=payload.traffic_level,
    )

    result = coordinator.run(
        requests=requests,
        listings=listings,
        receivers=receivers,
        profiles=profiles,
        vehicles=vehicles,
        now=now,
    )

    # 4. Create delivery jobs for feasible vehicle routes
    created_jobs_count = 0
    for v_id, stops in result.vehicle_routes.items():
        if not stops:
            continue

        assigned_req_ids = list({s.request_id for s in stops if s.request_id})
        otp = f"{random.randint(100000, 999999)}"

        route_payload = {
            "vehicle_id": v_id,
            "stops": [
                {
                    "stop_id": s.stop_id,
                    "request_id": s.request_id,
                    "stop_type": s.stop_type,
                    "coord": list(s.coord),
                    "lot_change": s.lot_change,
                    "name": s.name,
                    "safe_deadline": s.safe_deadline.isoformat() if s.safe_deadline else None,
                }
                for s in stops
            ],
        }

        job = DeliveryJob(
            vehicle_id=v_id,
            request_ids=assigned_req_ids,
            route=route_payload,
            planned_start_time=now,
            status="assigned",
            otp_code=otp,
        )
        db.add(job)
        created_jobs_count += 1

        # Update request statuses to allocated
        for req_id in assigned_req_ids:
            req_obj = db.query(DonationRequest).filter(DonationRequest.id == req_id).first()
            if req_obj:
                req_obj.status = "allocated"

    db.commit()

    allocated_cnt = sum(1 for opt in result.allocations.values() if opt and not opt.is_unallocated)
    unallocated_cnt = len(requests) - allocated_cnt

    return AllocationRunResponse(
        success=result.all_routes_valid,
        total_requests=len(requests),
        allocated_count=allocated_cnt,
        unallocated_count=unallocated_cnt,
        repair_rounds_run=result.repair_rounds_run,
        all_routes_valid=result.all_routes_valid,
        jobs_created=created_jobs_count,
        summary={
            "learned_nogoods_count": len(result.learned_nogoods),
            "infeasible_requests": result.infeasible_requests,
        },
    )


@router.get("/allocations/{job_id}", response_model=AllocationDetailResponse)
@router.get("/allocate/{job_id}", response_model=AllocationDetailResponse)
def get_allocation_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AllocationDetailResponse:
    """Retrieves delivery job details for an allocation."""
    job = db.query(DeliveryJob).filter(DeliveryJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Allocation job {job_id} not found")
    return AllocationDetailResponse.model_validate(job)


@router.get("/allocations", response_model=List[AllocationDetailResponse])
@router.get("/allocate", response_model=List[AllocationDetailResponse])
def list_allocation_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AllocationDetailResponse]:
    """Lists all planned or active delivery jobs."""
    jobs = db.query(DeliveryJob).order_by(DeliveryJob.created_at.desc()).limit(50).all()
    return [AllocationDetailResponse.model_validate(j) for j in jobs]
