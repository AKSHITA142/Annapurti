from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.listing import FoodListing
from app.models.log import InventoryLog
from app.services.safety_rules import safety_service


class ListingService:
    @staticmethod
    def create_listing(
        db: Session,
        provider_id: int,
        name: str,
        category: str,
        veg: bool,
        lot_size: int,
        total_lots: int,
        prepared_at: datetime,
        pickup_lat: float,
        pickup_lng: float,
        pickup_window_start: datetime,
        pickup_window_end: datetime,
        sender_declared_window_minutes: Optional[int] = None,
        storage_requirement: str = "ambient",
        unit: str = "meals",
        delivery_mode_offered: str = "sender_vehicle",
        delivery_contribution_type: str = "free",
        contribution_amount: float = 0.0,
    ) -> FoodListing:
        """
        Creates a new FoodListing.
        Computes safe_deadline deterministically from the category safety rules table,
        enforcing the hard constraint that sender can only shorten, never extend the safe window.
        Strictly initializes status='active', is_archived=False, available_lots=total_lots.
        """
        if prepared_at.tzinfo is None:
            prepared_at = prepared_at.replace(tzinfo=timezone.utc)
        if pickup_window_start.tzinfo is None:
            pickup_window_start = pickup_window_start.replace(tzinfo=timezone.utc)
        if pickup_window_end.tzinfo is None:
            pickup_window_end = pickup_window_end.replace(tzinfo=timezone.utc)

        computed_deadline = safety_service.compute_safe_deadline(
            prepared_at=prepared_at,
            category=category,
            sender_declared_window_minutes=sender_declared_window_minutes,
        )

        listing = FoodListing(
            provider_id=provider_id,
            name=name,
            category=category,
            veg=veg,
            unit=unit,
            lot_size=lot_size,
            total_lots=total_lots,
            available_lots=total_lots,
            reserved_lots=0,
            collected_lots=0,
            delivered_lots=0,
            closed_lots=0,
            prepared_at=prepared_at,
            safe_deadline=computed_deadline,
            storage_requirement=storage_requirement,
            pickup_lat=pickup_lat,
            pickup_lng=pickup_lng,
            pickup_window_start=pickup_window_start,
            pickup_window_end=pickup_window_end,
            delivery_mode_offered=delivery_mode_offered,
            delivery_contribution_type=delivery_contribution_type,
            contribution_amount=contribution_amount,
            status="active",
            is_archived=False,
        )

        assert listing.check_invariant(), "New listing failed quantity invariant check"

        db.add(listing)
        db.commit()
        db.refresh(listing)

        # Audit trail tracking
        InventoryLog.log(
            db=db,
            listing_id=listing.id,
            action="created",
            new_status="active",
            available_lots=listing.available_lots,
            reserved_lots=0,
            note=f"Created listing '{listing.name}' ({listing.total_lots} lots, {listing.lot_size} {listing.unit}/lot)",
        )
        db.commit()

        return listing
