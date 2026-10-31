from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_roles
from app.models.delivery import DeliveryJob
from app.models.listing import FoodListing
from app.models.log import DecisionLog
from app.models.request import DonationRequest
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.admin import (
    AdminOverviewResponse,
    DecisionLogResponse,
    SimEventRequest,
    SimScenarioRequest,
)
from app.sim.event_simulator import EventSimulator
from app.sim.generator import ScenarioGenerator

router = APIRouter(prefix="/admin", tags=["Admin & Simulation"])


@router.get("/decisions", response_model=List[DecisionLogResponse])
def get_decisions(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    step: Optional[str] = Query(None),
    reason_code: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "provider", "ngo"])),
) -> List[DecisionLogResponse]:
    """
    Explain view feed:
    Retrieves ordered solver decision logs with reason codes, domain prunings,
    and routing feedback repairs.
    """
    query = db.query(DecisionLog)

    if entity_type:
        query = query.filter(DecisionLog.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(DecisionLog.entity_id == entity_id)
    if step:
        query = query.filter(DecisionLog.step == step)
    if reason_code:
        query = query.filter(DecisionLog.reason_code == reason_code)

    logs = query.order_by(DecisionLog.id.desc()).limit(limit).all()
    return [DecisionLogResponse.model_validate(l) for l in logs]


@router.get("/overview", response_model=AdminOverviewResponse)
def get_admin_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"])),
) -> AdminOverviewResponse:
    """Summary overview counts of all users, listings, requests, jobs, and vehicles."""
    users = db.query(User).all()
    listings = db.query(FoodListing).all()
    requests = db.query(DonationRequest).all()
    jobs = db.query(DeliveryJob).all()
    vehicle_count = db.query(Vehicle).count()

    users_by_role: Dict[str, int] = {}
    for u in users:
        users_by_role[u.role] = users_by_role.get(u.role, 0) + 1

    listings_by_status: Dict[str, int] = {}
    for l in listings:
        listings_by_status[l.status] = listings_by_status.get(l.status, 0) + 1

    requests_by_status: Dict[str, int] = {}
    for r in requests:
        requests_by_status[r.status] = requests_by_status.get(r.status, 0) + 1

    jobs_by_status: Dict[str, int] = {}
    for j in jobs:
        jobs_by_status[j.status] = jobs_by_status.get(j.status, 0) + 1

    return AdminOverviewResponse(
        total_users=len(users),
        users_by_role=users_by_role,
        total_listings=len(listings),
        listings_by_status=listings_by_status,
        total_requests=len(requests),
        requests_by_status=requests_by_status,
        total_jobs=len(jobs),
        jobs_by_status=jobs_by_status,
        total_vehicles=vehicle_count,
    )


@router.post("/sim/scenario", status_code=status.HTTP_201_CREATED)
def generate_sim_scenario(
    payload: SimScenarioRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"])),
) -> Dict[str, Any]:
    """Generates a seeded simulation scenario (small, medium, large, stress)."""
    now = datetime.now(timezone.utc)
    scenario = ScenarioGenerator.generate(preset=payload.preset, seed=payload.seed, base_time=now)

    return {
        "status": "scenario_generated",
        "preset": payload.preset,
        "seed": payload.seed,
        "listings_count": len(scenario.listings),
        "requests_count": len(scenario.requests),
        "receivers_count": len(scenario.receivers),
        "vehicles_count": len(scenario.vehicles),
        "traffic_level": scenario.traffic_level,
    }


@router.post("/sim/event")
def trigger_sim_event(
    payload: SimEventRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"])),
) -> Dict[str, Any]:
    """Dispatches simulation disruption events to trigger automated replanning."""
    now = datetime.now(timezone.utc)
    result = EventSimulator.simulate_event(
        db=db,
        event_type=payload.event_type,
        payload=payload.payload,
        now=now,
    )
    return result


@router.patch("/users/{user_id}/verify")
def verify_user(
    user_id: int,
    verified: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"])),
) -> Dict[str, Any]:
    """Admin flag to verify or unverify a user/NGO."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")

    user.verified = verified
    db.commit()
    return {"user_id": user.id, "email": user.email, "verified": user.verified}

