import random
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from app.models.listing import FoodListing
from app.models.request import DonationRequest
from app.models.log import DecisionLog, InventoryLog

# Process-level reentrant lock for thread safety across concurrent requests
_inventory_lock = threading.RLock()


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Helper to guarantee comparison between timezone-aware and naive timestamps."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class InventoryService:
    @staticmethod
    def reserve(
        db: Session,
        listing_id: int,
        request_id: int,
        lots: int,
        reservation_duration_minutes: int = 30,
        now: Optional[datetime] = None,
        max_retries: int = 8,
    ) -> bool:
        """
        Atomically reserve lots from a listing for a donation request using row locking.
        Guarantees that available_lots >= lots and maintains the quantity invariant:
        available + reserved + collected + delivered + closed = total.
        Retries on transient lock contention.
        """
        if lots <= 0:
            return False

        if now is None:
            now = datetime.now(timezone.utc)

        with _inventory_lock:
            for attempt in range(max_retries):
                try:
                    # SELECT ... FOR UPDATE locks the listing row for the duration of this transaction
                    listing = (
                        db.query(FoodListing)
                        .filter(FoodListing.id == listing_id)
                        .with_for_update()
                        .first()
                    )

                    if not listing:
                        db.add(
                            DecisionLog(
                                entity_type="request",
                                entity_id=request_id,
                                step="inventory",
                                decision="reject",
                                reason_code="LISTING_NOT_FOUND",
                                message=f"Listing {listing_id} not found",
                                payload={"listing_id": listing_id, "requested_lots": lots},
                            )
                        )
                        db.commit()
                        return False

                    # Food safety check: cannot reserve if now >= safe_deadline
                    if _ensure_utc(now) >= _ensure_utc(listing.safe_deadline):
                        unallocated = listing.available_lots
                        listing.closed_lots += unallocated
                        listing.available_lots = 0
                        listing.status = "expired"

                        db.add(
                            DecisionLog(
                                entity_type="listing",
                                entity_id=listing.id,
                                step="inventory",
                                decision="reject",
                                reason_code="SAFETY_DEADLINE_EXPIRED",
                                message=f"Listing {listing.id} has expired past safe deadline ({listing.safe_deadline}). Lots closed.",
                                payload={"listing_id": listing.id, "closed_lots": unallocated},
                            )
                        )
                        db.commit()
                        return False

                    request = (
                        db.query(DonationRequest)
                        .filter(DonationRequest.id == request_id)
                        .with_for_update()
                        .first()
                    )

                    if not request:
                        db.add(
                            DecisionLog(
                                entity_type="request",
                                entity_id=request_id,
                                step="inventory",
                                decision="reject",
                                reason_code="REQUEST_NOT_FOUND",
                                message=f"Request {request_id} not found",
                                payload={"request_id": request_id},
                            )
                        )
                        db.commit()
                        return False

                    if listing.available_lots < lots:
                        db.add(
                            DecisionLog(
                                entity_type="request",
                                entity_id=request_id,
                                step="inventory",
                                decision="reject",
                                reason_code="INVENTORY_EXHAUSTED",
                                message=(
                                    f"Request {request_id} requested {lots} lots, but only "
                                    f"{listing.available_lots} lots available for listing {listing_id}"
                                ),
                                payload={
                                    "listing_id": listing_id,
                                    "requested_lots": lots,
                                    "available_lots": listing.available_lots,
                                },
                            )
                        )
                        db.commit()
                        return False

                    # Deduct available lots and move to reserved
                    listing.available_lots -= lots
                    listing.reserved_lots += lots
                    if listing.available_lots == 0:
                        listing.status = "fully_reserved"

                    request.status = "reserved"
                    request.allocated_lots = lots
                    request.reservation_expires_at = now + timedelta(minutes=reservation_duration_minutes)

                    # Enforce invariant
                    assert listing.check_invariant(), (
                        f"Quantity invariant violated on listing {listing.id}: "
                        f"avail={listing.available_lots}, res={listing.reserved_lots}, "
                        f"coll={listing.collected_lots}, deliv={listing.delivered_lots}, "
                        f"closed={listing.closed_lots}, total={listing.total_lots}"
                    )

                    db.add(
                        DecisionLog(
                            entity_type="request",
                            entity_id=request_id,
                            step="inventory",
                            decision="reserve",
                            reason_code="RESERVED_SUCCESS",
                            message=f"Successfully reserved {lots} lots for request {request_id} from listing {listing_id}",
                            payload={
                                "listing_id": listing_id,
                                "reserved_lots": lots,
                                "remaining_available": listing.available_lots,
                                "expires_at": request.reservation_expires_at.isoformat(),
                            },
                        )
                    )
                    InventoryLog.log(
                        db=db,
                        listing_id=listing_id,
                        action="reserved",
                        previous_status="active",
                        new_status=listing.status,
                        available_lots=listing.available_lots,
                        reserved_lots=listing.reserved_lots,
                        note=f"Reserved {lots} lots for request #{request_id} ({listing.available_lots} lots remaining)",
                    )

                    db.commit()
                    return True

                except OperationalError as e:
                    db.rollback()
                    if attempt < max_retries - 1:
                        time.sleep(0.02 * (2**attempt) + random.uniform(0.005, 0.02))
                        continue
                    raise e

            return False

    @staticmethod
    def release(
        db: Session,
        request_id: int,
        reason_code: str = "VOLUNTARY_CANCEL",
        now: Optional[datetime] = None,
    ) -> bool:
        """
        Releases reserved lots for a request.
        Invariant rule: Returns lots to available ONLY if now < safe_deadline;
        otherwise moves them to closed_lots (discarded/expired) and logs the reason.
        """
        if now is None:
            now = datetime.now(timezone.utc)

        with _inventory_lock:
            request = (
                db.query(DonationRequest)
                .filter(DonationRequest.id == request_id)
                .with_for_update()
                .first()
            )

            if not request or request.status not in ("reserved", "allocated"):
                return False

            listing = (
                db.query(FoodListing)
                .filter(FoodListing.id == request.listing_id)
                .with_for_update()
                .first()
            )

            if not listing:
                return False

            lots = request.allocated_lots
            if lots <= 0:
                return False

            listing.reserved_lots -= lots

            # Food safety deadline check:
            # Return lots to available ONLY if now < safe_deadline
            if _ensure_utc(now) < _ensure_utc(listing.safe_deadline):
                listing.available_lots += lots
                if listing.status == "fully_reserved":
                    listing.status = "active"

                request.status = "expired" if reason_code == "RESERVATION_EXPIRED" else "cancelled"
                request.allocated_lots = 0

                db.add(
                    DecisionLog(
                        entity_type="request",
                        entity_id=request_id,
                        step="inventory",
                        decision="release",
                        reason_code=reason_code,
                        message=f"Released {lots} lots back to available for listing {listing.id}",
                        payload={
                            "listing_id": listing.id,
                            "released_lots": lots,
                            "available_lots": listing.available_lots,
                        },
                    )
                )
            else:
                # Past safe deadline: move to closed_lots (discarded / expired)
                listing.closed_lots += lots
                if listing.available_lots == 0:
                    listing.status = "expired"

                request.status = "expired"
                request.allocated_lots = 0

                db.add(
                    DecisionLog(
                        entity_type="request",
                        entity_id=request_id,
                        step="inventory",
                        decision="expire",
                        reason_code="SAFETY_DEADLINE_EXPIRED",
                        message=(
                            f"Listing {listing.id} is past safe deadline ({listing.safe_deadline}). "
                            f"Released {lots} lots moved to closed_lots (discarded)."
                        ),
                        payload={
                            "listing_id": listing.id,
                            "closed_lots": lots,
                            "safe_deadline": listing.safe_deadline.isoformat(),
                        },
                    )
                )

            # Enforce invariant
            assert listing.check_invariant(), f"Quantity invariant violated on listing {listing.id}"
            db.commit()

            return True

    @staticmethod
    def confirm_collected(db: Session, request_id: int) -> bool:
        """
        Transition lots from reserved to collected upon physical pickup.
        """
        with _inventory_lock:
            request = (
                db.query(DonationRequest)
                .filter(DonationRequest.id == request_id)
                .with_for_update()
                .first()
            )

            if not request or request.status not in ("reserved", "allocated"):
                return False

            listing = (
                db.query(FoodListing)
                .filter(FoodListing.id == request.listing_id)
                .with_for_update()
                .first()
            )

            if not listing:
                return False

            lots = request.allocated_lots
            if lots <= 0 or listing.reserved_lots < lots:
                return False

            listing.reserved_lots -= lots
            listing.collected_lots += lots
            request.status = "allocated"

            assert listing.check_invariant(), f"Quantity invariant violated on listing {listing.id}"

            db.add(
                DecisionLog(
                    entity_type="request",
                    entity_id=request_id,
                    step="inventory",
                    decision="collect",
                    reason_code="COLLECTED_CONFIRMED",
                    message=f"Confirmed collection of {lots} lots for request {request_id}",
                    payload={"listing_id": listing.id, "collected_lots": lots},
                )
            )
            db.commit()

            return True

    @staticmethod
    def confirm_delivered(db: Session, request_id: int) -> bool:
        """
        Transition lots from collected to delivered upon receiver handover.
        """
        with _inventory_lock:
            request = (
                db.query(DonationRequest)
                .filter(DonationRequest.id == request_id)
                .with_for_update()
                .first()
            )

            if not request:
                return False

            listing = (
                db.query(FoodListing)
                .filter(FoodListing.id == request.listing_id)
                .with_for_update()
                .first()
            )

            if not listing:
                return False

            lots = request.allocated_lots
            if lots <= 0 or listing.collected_lots < lots:
                return False

            listing.collected_lots -= lots
            listing.delivered_lots += lots
            request.status = "completed"

            if listing.delivered_lots + listing.closed_lots == listing.total_lots:
                listing.status = "completed"

            assert listing.check_invariant(), f"Quantity invariant violated on listing {listing.id}"

            db.add(
                DecisionLog(
                    entity_type="request",
                    entity_id=request_id,
                    step="inventory",
                    decision="deliver",
                    reason_code="DELIVERED_CONFIRMED",
                    message=f"Confirmed delivery of {lots} lots for request {request_id}",
                    payload={"listing_id": listing.id, "delivered_lots": lots},
                )
            )
            db.commit()

            return True

    @staticmethod
    def expire_stale_reservations(db: Session, now: Optional[datetime] = None) -> int:
        """
        Expires all pending reservations that have passed reservation_expires_at.
        Returns the number of expired reservations processed.
        """
        if now is None:
            now = datetime.now(timezone.utc)

        with _inventory_lock:
            all_reserved = (
                db.query(DonationRequest)
                .filter(DonationRequest.status == "reserved")
                .all()
            )

            expired_count = 0
            for req in all_reserved:
                if req.reservation_expires_at and _ensure_utc(req.reservation_expires_at) <= _ensure_utc(now):
                    success = InventoryService.release(
                        db, req.id, reason_code="RESERVATION_EXPIRED", now=now
                    )
                    if success:
                        expired_count += 1

            return expired_count

    @staticmethod
    def expire_spoiled_listings(db: Session, now: Optional[datetime] = None) -> int:
        """
        Scans all active/fully_reserved listings; if now >= safe_deadline, marks status as 'expired',
        closes remaining available lots, cancels pending unallocated requests, and persists audit logs.
        Returns the number of expired listings processed.
        """
        if now is None:
            now = datetime.now(timezone.utc)
        now_utc = _ensure_utc(now)

        with _inventory_lock:
            active_listings = (
                db.query(FoodListing)
                .filter(FoodListing.status.in_(["active", "fully_reserved"]))
                .all()
            )
            expired_count = 0
            for l in active_listings:
                if _ensure_utc(l.safe_deadline) <= now_utc:
                    unallocated = l.available_lots
                    l.closed_lots += unallocated
                    l.available_lots = 0
                    l.status = "expired"
                    expired_count += 1

                    # Cancel any pending unallocated claims for this expired batch
                    pending_reqs = (
                        db.query(DonationRequest)
                        .filter(
                            DonationRequest.listing_id == l.id,
                            DonationRequest.status.in_(["pending", "reserved", "offered"]),
                        )
                        .all()
                    )
                    for pr in pending_reqs:
                        pr.status = "cancelled"

                    db.add(
                        DecisionLog(
                            entity_type="listing",
                            entity_id=l.id,
                            step="inventory",
                            decision="expire",
                            reason_code="SAFETY_DEADLINE_EXPIRED",
                            message=f"Listing {l.id} ({l.name}) automatically purged past safety deadline ({l.safe_deadline}). Available lots moved to closed.",
                            payload={"listing_id": l.id, "closed_lots": unallocated},
                        )
                    )
                    InventoryLog.log(
                        db=db,
                        listing_id=l.id,
                        action="expired",
                        previous_status="active",
                        new_status="expired",
                        available_lots=0,
                        reserved_lots=l.reserved_lots,
                        note=f"Listing automatically expired past safe deadline ({l.safe_deadline}). {unallocated} unallocated lots closed.",
                    )

            if expired_count > 0:
                db.commit()
            return expired_count
