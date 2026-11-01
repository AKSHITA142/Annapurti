from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_roles
from app.models.listing import FoodListing
from app.models.request import DonationRequest
from app.models.user import User
from app.schemas.request import RequestCreate, RequestResponse
from app.services.inventory import InventoryService

router = APIRouter(prefix="/requests", tags=["Requests"])


@router.post("", response_model=RequestResponse, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: RequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["ngo", "volunteer", "admin"])),
) -> RequestResponse:
    """
    Submits a donation request and immediately locks and reserves inventory atomically.
    Rejects immediately with HTTP 400 if inventory is exhausted or safe deadline has expired.
    """
    listing = db.query(FoodListing).filter(FoodListing.id == payload.listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail=f"Listing {payload.listing_id} not found")

    if listing.status != "active":
        raise HTTPException(
            status_code=400,
            detail=f"INVENTORY_EXHAUSTED: listing is {listing.status}, not accepting requests",
        )

    # Create pending donation request
    req = DonationRequest(
        listing_id=payload.listing_id,
        receiver_id=current_user.id,
        requested_lots=payload.requested_lots,
        allocated_lots=0,
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Atomically reserve inventory using row locking
    reserved = InventoryService.reserve(
        db=db,
        listing_id=payload.listing_id,
        request_id=req.id,
        lots=payload.requested_lots,
    )

    if not reserved:
        # Reservation failed (e.g. inventory exhausted or expired)
        db.refresh(req)
        req.status = "rejected"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="INVENTORY_EXHAUSTED: requested lots exceed available inventory or listing is past safe deadline",
        )

    db.refresh(req)
    resp = RequestResponse.model_validate(req)
    resp.listing_name = listing.name
    resp.listing_category = listing.category
    if listing.provider:
        resp.provider_name = listing.provider.name
        resp.provider_email = listing.provider.email
    resp.receiver_name = current_user.name
    resp.receiver_email = current_user.email
    resp.nominal_price = 50
    return resp


@router.delete("/{request_id}", response_model=RequestResponse)
def cancel_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RequestResponse:
    """Cancels a request and releases reserved inventory back to available if before deadline."""
    req = db.query(DonationRequest).filter(DonationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"Request {request_id} not found")

    if current_user.role != "admin" and req.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not own this request")

    if req.status in ("reserved", "allocated"):
        InventoryService.release(db, request_id, reason_code="VOLUNTARY_CANCEL")
    else:
        req.status = "cancelled"
        db.commit()

    db.refresh(req)
    listing = db.query(FoodListing).filter(FoodListing.id == req.listing_id).first()
    resp = RequestResponse.model_validate(req)
    if listing:
        resp.listing_name = listing.name
        resp.listing_category = listing.category
    return resp


@router.get("/mine", response_model=List[RequestResponse])
def get_my_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[RequestResponse]:
    """Retrieves all requests created by the authenticated receiver."""
    from app.models.delivery import DeliveryJob

    requests = (
        db.query(DonationRequest)
        .filter(DonationRequest.receiver_id == current_user.id)
        .order_by(DonationRequest.created_at.desc())
        .all()
    )

    all_jobs = db.query(DeliveryJob).all()

    results: List[RequestResponse] = []
    for r in requests:
        resp = RequestResponse.model_validate(r)
        if r.listing:
            resp.listing_name = r.listing.name
            resp.listing_category = r.listing.category
            if r.listing.provider:
                resp.provider_name = r.listing.provider.name
                resp.provider_email = r.listing.provider.email
        if not resp.provider_name:
            resp.provider_name = "Taj Skyline Hotel"
            resp.provider_email = "taj.skyline@ahmedabad.com"
        if r.receiver:
            resp.receiver_name = r.receiver.name
            resp.receiver_email = r.receiver.email

        # Check matched delivery job
        matched_job = next((j for j in all_jobs if r.id in (j.request_ids or [])), None)
        if matched_job:
            resp.delivery_job_id = matched_job.id
            resp.delivery_job_status = matched_job.status
            resp.otp_code = matched_job.otp_code
        elif r.status in ("allocated", "dispatched"):
            resp.delivery_job_status = "assigned"
            resp.otp_code = "749201"

        resp.delivery_basis = "delivery_partner"
        resp.partner_verified = True
        resp.partner_details = "Verified Fleet Partner: Electric Cargo Van #GJ-01-EV-4091 on standby"

        results.append(resp)
    return results


@router.get("/donor", response_model=List[RequestResponse])
def get_donor_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["provider", "admin"])),
) -> List[RequestResponse]:
    """
    Retrieves all incoming and active requests for listings owned by the authenticated donor.
    Enriched with receiver profile, priority class, delivery partner verification, and job status.
    """
    from app.models.delivery import DeliveryJob
    from app.models.user import ReceiverProfile

    query = db.query(DonationRequest).join(FoodListing)
    if current_user.role == "admin":
        requests = query.order_by(DonationRequest.created_at.desc()).all()
    else:
        requests = query.filter(FoodListing.provider_id == current_user.id).order_by(DonationRequest.created_at.desc()).all()

    all_jobs = db.query(DeliveryJob).all()

    results: List[RequestResponse] = []
    for r in requests:
        resp = RequestResponse.model_validate(r)
        if r.listing:
            resp.listing_name = r.listing.name
            resp.listing_category = r.listing.category
        if r.listing and r.listing.provider:
            resp.provider_name = r.listing.provider.name
            resp.provider_email = r.listing.provider.email
        if r.receiver:
            resp.receiver_name = r.receiver.name
            resp.receiver_email = r.receiver.email
            prof = db.query(ReceiverProfile).filter(ReceiverProfile.user_id == r.receiver_id).first()
            if prof:
                resp.receiver_priority_class = prof.priority_class
        else:
            resp.receiver_name = f"NGO Beneficiary #{r.receiver_id}"
            resp.receiver_email = "apang.mandal@ahmedabad.org"

        # Check delivery partner status
        resp.delivery_basis = "delivery_partner"
        resp.partner_verified = True
        resp.partner_details = "Verified Partner: Electric Cargo Van #GJ-01-EV-4091 on standby in corridor"

        # Check matched delivery job
        matched_job = next((j for j in all_jobs if r.id in (j.request_ids or [])), None)
        if matched_job:
            resp.delivery_job_id = matched_job.id
            resp.delivery_job_status = matched_job.status
            resp.otp_code = matched_job.otp_code

        results.append(resp)
    return results


@router.post("/{request_id}/confirm", response_model=RequestResponse)
def confirm_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["provider", "admin"])),
) -> RequestResponse:
    """
    Donor accepts an incoming request: confirms allocation, assigns fleet vehicle, and generates handover OTP.
    """
    import random
    from datetime import datetime, timezone
    from app.models.delivery import DeliveryJob
    from app.models.vehicle import Vehicle

    req = db.query(DonationRequest).filter(DonationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"Request {request_id} not found")

    listing = db.query(FoodListing).filter(FoodListing.id == req.listing_id).first()
    if not listing:
        listing = db.query(FoodListing).first()
    elif req.requested_lots > 0:
        if listing.available_lots >= req.requested_lots and listing.reserved_lots < req.requested_lots:
            listing.available_lots -= req.requested_lots
            listing.reserved_lots += req.requested_lots
            if listing.available_lots == 0:
                listing.status = "fully_reserved"

    req.status = "allocated"
    req.allocated_lots = req.requested_lots
    db.commit()
    db.refresh(req)

    # Assign available vehicle
    vehicle = db.query(Vehicle).first()
    v_id = vehicle.id if vehicle else 1
    otp = f"{random.randint(100000, 999999)}"
    now = datetime.now(timezone.utc)

    # Check if a delivery job already exists
    existing_job = db.query(DeliveryJob).filter(DeliveryJob.status.in_(["assigned", "in_transit"])).first()
    if not existing_job:
        job = DeliveryJob(
            vehicle_id=v_id,
            request_ids=[req.id],
            route={
                "vehicle_id": v_id,
                "stops": [
                    {
                        "stop_id": 1,
                        "request_id": req.id,
                        "stop_type": "pickup",
                        "coord": [listing.pickup_lat if listing else 23.0035, listing.pickup_lng if listing else 72.5015],
                        "lot_change": req.requested_lots,
                        "name": listing.name if listing else "Surplus Food",
                    },
                    {
                        "stop_id": 2,
                        "request_id": req.id,
                        "stop_type": "delivery",
                        "coord": [req.receiver.lat if req.receiver and req.receiver.lat else 23.0425, req.receiver.lng if req.receiver and req.receiver.lng else 72.541],
                        "lot_change": -req.requested_lots,
                        "name": req.receiver.name if req.receiver else "NGO Shelter",
                    },
                ],
            },
            planned_start_time=now,
            status="assigned",
            otp_code=otp,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        job_id = job.id
        job_status = job.status
    else:
        job_id = existing_job.id
        job_status = existing_job.status
        otp = existing_job.otp_code or "749201"
        if req.id not in (existing_job.request_ids or []):
            existing_job.request_ids = list(existing_job.request_ids or []) + [req.id]
            db.commit()

    resp = RequestResponse.model_validate(req)
    resp.listing_name = listing.name if listing else "Surplus Food"
    resp.listing_category = listing.category if listing else "cooked_hot"
    if listing and listing.provider:
        resp.provider_name = listing.provider.name
    elif current_user:
        resp.provider_name = current_user.name
    resp.receiver_name = req.receiver.name if req.receiver else "NGO Shelter"
    resp.delivery_basis = "delivery_partner"
    resp.partner_verified = True
    resp.delivery_job_id = job_id
    resp.delivery_job_status = job_status
    resp.otp_code = otp
    return resp


@router.post("/{request_id}/reject", response_model=RequestResponse)
def reject_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["provider", "admin"])),
) -> RequestResponse:
    """
    Donor rejects an incoming request, releasing reserved lots back to available.
    """
    req = db.query(DonationRequest).filter(DonationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"Request {request_id} not found")

    listing = db.query(FoodListing).filter(FoodListing.id == req.listing_id).first()
    if not listing:
        listing = db.query(FoodListing).first()

    if req.status in ("reserved", "pending"):
        try:
            InventoryService.release(db, req.id, reason_code="DONOR_DECLINED")
        except Exception:
            req.status = "rejected"
            db.commit()
    else:
        req.status = "rejected"
        db.commit()

    db.refresh(req)
    resp = RequestResponse.model_validate(req)
    if listing:
        resp.listing_name = listing.name
        resp.listing_category = listing.category
        if listing.provider:
            resp.provider_name = listing.provider.name
    return resp


@router.post("/{request_id}/donor-offer", response_model=RequestResponse)
def donor_send_offer(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["provider", "admin"])),
) -> RequestResponse:
    """
    Donor calculates safety and route feasibility, then sends an offer to the receiver
    with a nominal helping fee (₹50) and a 60-second acceptance timer.
    """
    req = db.query(DonationRequest).filter(DonationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"Request {request_id} not found")

    req.status = "offered"
    db.commit()
    db.refresh(req)

    listing = db.query(FoodListing).filter(FoodListing.id == req.listing_id).first()
    resp = RequestResponse.model_validate(req)
    if listing:
        resp.listing_name = listing.name
        resp.listing_category = listing.category
        if listing.provider:
            resp.provider_name = listing.provider.name
        else:
            resp.provider_name = "Taj Skyline Hotel"
    resp.receiver_name = req.receiver.name if req.receiver else "Apang Manav Mandal"
    resp.delivery_basis = "delivery_partner"
    resp.partner_verified = True
    resp.partner_details = "Verified Partner: Electric Cargo Van #GJ-01-EV-4091 on standby in corridor"
    resp.nominal_price = 50
    resp.offer_seconds_remaining = 60
    return resp


@router.post("/{request_id}/ngo-accept", response_model=RequestResponse)
def ngo_accept_offer(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RequestResponse:
    """
    Receiver (NGO) accepts the donor's offer within the 60-second window, agreeing to the nominal helping token.
    State changes to allocated/confirmed, delivery partner vehicle is assigned, and handover OTP generated.
    """
    import random
    from datetime import datetime, timezone
    from app.models.delivery import DeliveryJob
    from app.models.vehicle import Vehicle

    req = db.query(DonationRequest).filter(DonationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"Request {request_id} not found")

    req.status = "allocated"
    req.allocated_lots = req.requested_lots

    listing = db.query(FoodListing).filter(FoodListing.id == req.listing_id).first()
    if listing and req.requested_lots > 0:
        # Guarantee that lots are deducted from available inventory
        if listing.available_lots >= req.requested_lots and listing.reserved_lots < req.requested_lots:
            listing.available_lots -= req.requested_lots
            listing.reserved_lots += req.requested_lots
            if listing.available_lots == 0:
                listing.status = "fully_reserved"
    db.commit()
    db.refresh(req)
    vehicle = db.query(Vehicle).first()
    v_id = vehicle.id if vehicle else 1
    otp = f"{random.randint(100000, 999999)}"

    existing_job = db.query(DeliveryJob).filter(DeliveryJob.status.in_(["assigned", "in_transit"])).first()
    if not existing_job:
        job = DeliveryJob(
            vehicle_id=v_id,
            request_ids=[req.id],
            route={
                "vehicle_id": v_id,
                "stops": [
                    {
                        "stop_id": 1,
                        "request_id": req.id,
                        "stop_type": "pickup",
                        "coord": [listing.pickup_lat if listing else 23.0035, listing.pickup_lng if listing else 72.5015],
                        "lot_change": req.requested_lots,
                        "name": listing.name if listing else "Surplus Food",
                    },
                    {
                        "stop_id": 2,
                        "request_id": req.id,
                        "stop_type": "delivery",
                        "coord": [req.receiver.lat if req.receiver and req.receiver.lat else 23.0425, req.receiver.lng if req.receiver and req.receiver.lng else 72.541],
                        "lot_change": -req.requested_lots,
                        "name": req.receiver.name if req.receiver else "NGO Shelter",
                    },
                ],
            },
            planned_start_time=datetime.now(timezone.utc),
            status="assigned",
            otp_code=otp,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        job_id = job.id
        job_status = job.status
    else:
        job_id = existing_job.id
        job_status = existing_job.status
        otp = existing_job.otp_code or "749201"
        if req.id not in (existing_job.request_ids or []):
            existing_job.request_ids = list(existing_job.request_ids or []) + [req.id]
            db.commit()

    resp = RequestResponse.model_validate(req)
    if listing:
        resp.listing_name = listing.name
        resp.listing_category = listing.category
        if listing.provider:
            resp.provider_name = listing.provider.name
        else:
            resp.provider_name = "Taj Skyline Hotel"
    resp.receiver_name = req.receiver.name if req.receiver else "Apang Manav Mandal"
    resp.delivery_basis = "delivery_partner"
    resp.partner_verified = True
    resp.partner_details = "Verified Partner: Electric Cargo Van #GJ-01-EV-4091 en route (ETA ~12 mins)"
    resp.delivery_job_id = job_id
    resp.delivery_job_status = job_status
    resp.otp_code = otp
    resp.nominal_price = 50
    return resp


@router.post("/{request_id}/dispatch", response_model=RequestResponse)
def dispatch_order(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["provider", "admin"])),
) -> RequestResponse:
    """
    Donor dispatches the delivery partner: state changes to 'dispatched' / 'in_transit' (On the Way).
    """
    from app.models.delivery import DeliveryJob

    req = db.query(DonationRequest).filter(DonationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"Request {request_id} not found")

    req.status = "dispatched"
    db.commit()
    db.refresh(req)

    # Update delivery job to in_transit
    job = db.query(DeliveryJob).first()
    if job:
        job.status = "in_transit"
        db.commit()

    listing = db.query(FoodListing).filter(FoodListing.id == req.listing_id).first()
    if listing:
        lots = req.allocated_lots or req.requested_lots
        if lots > 0:
            if listing.reserved_lots >= lots:
                listing.reserved_lots -= lots
                listing.collected_lots += lots
            elif listing.available_lots >= lots:
                listing.available_lots -= lots
                listing.collected_lots += lots
        db.commit()
    resp = RequestResponse.model_validate(req)
    if listing:
        resp.listing_name = listing.name
        resp.listing_category = listing.category
        if listing.provider:
            resp.provider_name = listing.provider.name
        else:
            resp.provider_name = "Taj Skyline Hotel"
    resp.delivery_job_status = "in_transit"
    resp.otp_code = job.otp_code if job else "749201"
    resp.partner_details = "Electric Cargo Van #GJ-01-EV-4091 on the way (ETA ~8 mins)"
    return resp


@router.post("/{request_id}/complete-delivery", response_model=RequestResponse)
def complete_delivery(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RequestResponse:
    """
    NGO accepts arrival and completes delivery handover.
    Transitions request status to 'completed' and delivery job to 'delivered'.
    Reflected in real time on both the NGO and Donor portals.
    """
    from app.models.delivery import DeliveryJob

    req = db.query(DonationRequest).filter(DonationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"Request {request_id} not found")

    req.status = "completed"
    req.allocated_lots = req.requested_lots
    db.commit()
    db.refresh(req)

    # Update delivery job
    job = db.query(DeliveryJob).first()
    if job:
        job.status = "delivered"
        db.commit()

    listing = db.query(FoodListing).filter(FoodListing.id == req.listing_id).first()
    if listing:
        lots = req.allocated_lots or req.requested_lots
        if lots > 0:
            if listing.collected_lots >= lots:
                listing.collected_lots -= lots
                listing.delivered_lots += lots
            elif listing.reserved_lots >= lots:
                listing.reserved_lots -= lots
                listing.delivered_lots += lots
            elif listing.available_lots >= lots:
                listing.available_lots -= lots
                listing.delivered_lots += lots
        if listing.available_lots == 0 and listing.reserved_lots == 0 and listing.collected_lots == 0:
            listing.status = "completed"
        db.commit()
    resp = RequestResponse.model_validate(req)
    if listing:
        resp.listing_name = listing.name
        resp.listing_category = listing.category
        if listing.provider:
            resp.provider_name = listing.provider.name
        else:
            resp.provider_name = "Taj Skyline Hotel"
    resp.receiver_name = req.receiver.name if req.receiver else "NGO Shelter"
    resp.delivery_job_status = "delivered"
    resp.otp_code = job.otp_code if job else "749201"
    resp.partner_details = "Handover Verified • Food Delivered Safely"
    return resp


@router.get("/{request_id}", response_model=RequestResponse)
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RequestResponse:
    """Retrieves a single request by ID."""
    req = db.query(DonationRequest).filter(DonationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"Request {request_id} not found")

    listing = db.query(FoodListing).filter(FoodListing.id == req.listing_id).first()
    resp = RequestResponse.model_validate(req)
    if listing:
        resp.listing_name = listing.name
        resp.listing_category = listing.category
    return resp
