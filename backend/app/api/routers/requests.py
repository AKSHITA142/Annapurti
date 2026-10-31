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
    requests = (
        db.query(DonationRequest)
        .filter(DonationRequest.receiver_id == current_user.id)
        .order_by(DonationRequest.created_at.desc())
        .all()
    )

    results: List[RequestResponse] = []
    for r in requests:
        resp = RequestResponse.model_validate(r)
        if r.listing:
            resp.listing_name = r.listing.name
            resp.listing_category = r.listing.category
        results.append(resp)
    return results


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
