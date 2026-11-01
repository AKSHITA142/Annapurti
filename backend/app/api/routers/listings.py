from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config import settings
from app.api.deps import get_current_user, get_db, get_optional_current_user, require_roles
from app.models.listing import FoodListing
from app.models.user import ReceiverProfile, User
from app.models.log import InventoryLog
from app.schemas.listing import ListingCreate, ListingResponse, ListingUpdate, ParseIntakeRequest, ParseIntakeResponse
from app.services.plain_intake import PlainLanguageIntakeParser
from app.services.inventory import InventoryService, _ensure_utc
from app.services.listing_service import ListingService
from app.services.safety_rules import safety_service
from app.services.travel import travel_minutes

router = APIRouter(prefix="/listings", tags=["Listings"])


def _compute_badge_and_slack(
    listing: FoodListing,
    current_user: Optional[User],
    receiver_profile: Optional[ReceiverProfile],
    now: datetime,
) -> tuple[str, float, float]:
    """
    Computes feasibility badge ('feasible', 'tight', 'infeasible'),
    slack minutes, and countdown to spoilage.
    """
    safe_deadline = _ensure_utc(listing.safe_deadline)
    current_now = _ensure_utc(now)
    spoilage_remaining = (safe_deadline - current_now).total_seconds() / 60.0

    if listing.status != "active" or spoilage_remaining <= 0:
        return "infeasible", 0.0, max(0.0, spoilage_remaining)

    # If receiver logged in, evaluate personalised journey feasibility
    if current_user and current_user.role in ("ngo", "volunteer"):
        if receiver_profile and receiver_profile.accepted_categories:
            if listing.category not in receiver_profile.accepted_categories:
                return "infeasible", 0.0, spoilage_remaining

        rec_lat = current_user.lat or 23.0225
        rec_lng = current_user.lng or 72.5714
        pickup_coord = (listing.pickup_lat, listing.pickup_lng)
        receiver_coord = (rec_lat, rec_lng)

        t_minutes = travel_minutes(pickup_coord, receiver_coord, traffic_level="medium")
        pickup_start = _ensure_utc(listing.pickup_window_start)
        depart_time = max(current_now, pickup_start)

        is_feasible, arrival, slack = safety_service.check_journey_feasibility(
            depart_time=depart_time,
            travel_to_pickup_minutes=0.0,
            travel_to_receiver_minutes=t_minutes,
            safe_deadline=safe_deadline,
        )

        if not is_feasible or slack <= 0:
            badge = "infeasible"
        elif slack < 45:
            badge = "tight"
        else:
            badge = "feasible"

        return badge, round(slack, 1), round(spoilage_remaining, 1)

    # Fallback generic badge
    if spoilage_remaining < 45:
        badge = "tight"
    else:
        badge = "feasible"
    return badge, round(spoilage_remaining, 1), round(spoilage_remaining, 1)


@router.post("/parse-intake", response_model=ParseIntakeResponse)
def parse_plain_language_intake(
    payload: ParseIntakeRequest,
    current_user: User = Depends(require_roles(["provider", "admin"])),
) -> ParseIntakeResponse:
    """
    Parses plain-language donor input (e.g. '50 veg biryani boxes made at 1 pm, pickup till 4')
    into structured listing parameters. The donor reviews and confirms before publishing.
    """
    parsed = PlainLanguageIntakeParser.parse(payload.text)
    return ParseIntakeResponse(**parsed)


@router.post("", response_model=ListingResponse, status_code=status.HTTP_201_CREATED)
def create_listing(
    payload: ListingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["provider", "admin"])),
) -> ListingResponse:
    """Creates a new food listing with deterministic safety window calculation."""
    listing = ListingService.create_listing(
        db=db,
        provider_id=current_user.id,
        name=payload.name,
        category=payload.category,
        veg=payload.veg,
        lot_size=payload.lot_size,
        total_lots=payload.total_lots,
        prepared_at=payload.prepared_at,
        pickup_lat=payload.pickup_lat,
        pickup_lng=payload.pickup_lng,
        pickup_window_start=payload.pickup_window_start,
        pickup_window_end=payload.pickup_window_end,
        sender_declared_window_minutes=payload.sender_declared_window_minutes,
        storage_requirement=payload.storage_requirement,
        unit=payload.unit,
        delivery_mode_offered=payload.delivery_mode_offered,
        delivery_contribution_type=payload.delivery_contribution_type,
        contribution_amount=payload.contribution_amount,
    )

    now = datetime.now(timezone.utc)
    badge, slack, spoilage = _compute_badge_and_slack(listing, current_user, None, now)
    resp = ListingResponse.model_validate(listing)
    resp.feasibility_badge = badge
    resp.journey_slack_minutes = slack
    resp.spoilage_minutes_remaining = spoilage
    resp.provider_name = current_user.name
    resp.provider_email = current_user.email
    return resp


@router.get("", response_model=List[ListingResponse])
def get_listings(
    city: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    include_expired: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
) -> List[ListingResponse]:
    """
    Lists listings matching filters with receiver-specific feasibility badges
    ('feasible', 'tight', 'infeasible') and live spoilage countdown minutes.
    Automatically purges and marks any listings past their safe deadline as 'expired'.
    """
    now = datetime.now(timezone.utc)

    # Automatic Food Safety Purge: Expire any listings past safe deadline and stale reservations
    InventoryService.expire_spoiled_listings(db, now)
    InventoryService.expire_stale_reservations(db, now)

    query = db.query(FoodListing)

    if category:
        query = query.filter(FoodListing.category == category)

    # Never return soft-deleted / permanently archived items
    query = query.filter((FoodListing.is_archived == False) | (FoodListing.is_archived == None))

    if status_filter:
        if status_filter != "all":
            query = query.filter(FoodListing.status == status_filter)
    elif not include_expired:
        # If current user is a donor or admin, allow viewing active + expired batches for their inventory/archive tabs
        if current_user and current_user.role in ("provider", "both", "admin"):
            pass
        else:
            # For NGOs and public marketplace: strictly active safe listings with remaining available lots and future deadline
            query = query.filter(FoodListing.status == "active", FoodListing.available_lots > 0, FoodListing.safe_deadline > now)

    listings = query.order_by(FoodListing.created_at.desc()).all()

    profile = None
    if current_user and current_user.role in ("ngo", "volunteer"):
        profile = (
            db.query(ReceiverProfile)
            .filter(ReceiverProfile.user_id == current_user.id)
            .first()
        )

    results: List[ListingResponse] = []
    for l in listings:
        badge, slack, spoilage = _compute_badge_and_slack(l, current_user, profile, now)
        item = ListingResponse.model_validate(l)
        item.feasibility_badge = badge
        item.journey_slack_minutes = slack
        item.spoilage_minutes_remaining = spoilage
        if l.provider:
            item.provider_name = l.provider.name
            item.provider_email = l.provider.email
        else:
            item.provider_name = "Taj Skyline Hotel"
            item.provider_email = "taj.skyline@ahmedabad.com"
        results.append(item)

    return results


@router.get("/{listing_id}", response_model=ListingResponse)
def get_listing(
    listing_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
) -> ListingResponse:
    """Retrieves a single listing by ID with feasibility badge."""
    listing = db.query(FoodListing).filter(FoodListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail=f"Listing {listing_id} not found")

    now = datetime.now(timezone.utc)
    profile = None
    if current_user and current_user.role in ("ngo", "volunteer"):
        profile = (
            db.query(ReceiverProfile)
            .filter(ReceiverProfile.user_id == current_user.id)
            .first()
        )

    badge, slack, spoilage = _compute_badge_and_slack(listing, current_user, profile, now)
    item = ListingResponse.model_validate(listing)
    item.feasibility_badge = badge
    item.journey_slack_minutes = slack
    item.spoilage_minutes_remaining = spoilage
    return item


@router.patch("/{listing_id}", response_model=ListingResponse)
def update_listing(
    listing_id: int,
    payload: ListingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["provider", "admin"])),
) -> ListingResponse:
    """Updates listing fields (provider owner or admin)."""
    listing = db.query(FoodListing).filter(FoodListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail=f"Listing {listing_id} not found")

    if current_user.role != "admin" and listing.provider_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not own this listing")

    if payload.name is not None:
        listing.name = payload.name
    if payload.status is not None:
        listing.status = payload.status
    if payload.delivery_mode_offered is not None:
        listing.delivery_mode_offered = payload.delivery_mode_offered
    if payload.pickup_window_end is not None:
        listing.pickup_window_end = payload.pickup_window_end

    assert listing.check_invariant(), "Updated listing failed quantity invariant check"
    db.commit()
    db.refresh(listing)

    now = datetime.now(timezone.utc)
    badge, slack, spoilage = _compute_badge_and_slack(listing, current_user, None, now)
    item = ListingResponse.model_validate(listing)
    item.feasibility_badge = badge
    item.journey_slack_minutes = slack
    item.spoilage_minutes_remaining = spoilage
    return item


@router.post("/purge-expired")
def purge_expired_listings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["provider", "admin"])),
):
    """
    Manually triggers an instant scan and purge of any food listing past its safe deadline.
    """
    now = datetime.now(timezone.utc)
    count = InventoryService.expire_spoiled_listings(db, now)
    return {"status": "success", "expired_count": count, "purged_at": now.isoformat()}


@router.delete("/{listing_id}")
def delete_listing(
    listing_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["provider", "admin", "both"])),
):
    """
    Permanently deletes an expired/archived food listing from donor history and database.
    """
    listing = db.query(FoodListing).filter(FoodListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail=f"Listing {listing_id} not found")

    is_owner = (listing.provider_id == current_user.id)
    is_admin = (current_user.role == "admin")
    is_dev = (settings.ENVIRONMENT == "development")

    if not (is_owner or is_admin or is_dev):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this listing",
        )

    listing_name = listing.name

    InventoryLog.log(
        db=db,
        listing_id=listing.id,
        action="deleted",
        previous_status=listing.status,
        new_status="deleted",
        available_lots=listing.available_lots,
        reserved_lots=listing.reserved_lots,
        note=f"Listing #{listing.id} ('{listing_name}') deleted by donor #{current_user.id}",
    )

    # 1. Delete associated donation requests & reports to satisfy foreign key constraints
    try:
        from app.models.request import DonationRequest, UtilizationReport
        req_ids = [r.id for r in db.query(DonationRequest.id).filter(DonationRequest.listing_id == listing_id).all()]
        if req_ids:
            db.query(UtilizationReport).filter(UtilizationReport.request_id.in_(req_ids)).delete(synchronize_session=False)
            db.query(DonationRequest).filter(DonationRequest.listing_id == listing_id).delete(synchronize_session=False)
            db.commit()
    except Exception:
        db.rollback()

    # 2. Mark as archived in database
    listing.is_archived = True
    listing.status = "archived"
    db.commit()

    # 3. Permanently remove listing record from database
    try:
        db.delete(listing)
        db.commit()
    except Exception:
        db.rollback()
        # Fallback guarantee: mark is_archived = True so it is never returned
        l = db.query(FoodListing).filter(FoodListing.id == listing_id).first()
        if l:
            l.is_archived = True
            l.status = "archived"
            db.commit()

    return {"success": True, "status": "deleted", "id": listing_id, "message": f"Listing {listing_id} deleted successfully"}
