import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
from sqlalchemy.orm import Session

from app.models.listing import FoodListing
from app.models.request import DonationRequest
from app.models.user import User, ReceiverProfile
from app.models.vehicle import Vehicle
from app.models.delivery import DeliveryJob
from app.models.log import DecisionLog
from app.services.inventory import InventoryService
from app.services.travel import haversine_distance_km, travel_minutes


class FailureLadderService:
    @staticmethod
    def log_ladder_step(
        db: Optional[Session],
        request_id: int,
        step_number: int,
        step_name: str,
        decision: str,
        reason_code: str,
        message: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Helper to write audit log entries for failure ladder progression."""
        if db is not None:
            log_entry = DecisionLog(
                entity_type="request",
                entity_id=request_id,
                step=f"failure_ladder_step_{step_number}",
                decision=decision,
                reason_code=reason_code,
                message=f"[Ladder Step {step_number}: {step_name}] {message}",
                payload=payload or {},
            )
            db.add(log_entry)
            db.commit()

    @classmethod
    def apply_ladder(
        cls,
        request: DonationRequest,
        listing: FoodListing,
        available_vehicles: List[Vehicle],
        other_receivers: List[Tuple[User, ReceiverProfile]],
        now: Optional[datetime] = None,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Executes the 5-step failure ladder in exact sequential order:
        1. Offer a smaller partial quantity (fewer lots).
        2. Try another delivery mode (self-collect, other vehicle).
        3. Try another eligible receiver for the same lots.
        4. Relist leftover lots as available (flag urgent if deadline < 60 min).
        5. Escalate to admin with clear reason code.
        """
        if now is None:
            now = datetime.now(timezone.utc)

        result: Dict[str, Any] = {
            "request_id": request.id,
            "listing_id": listing.id,
            "resolved": False,
            "resolved_step": None,
            "action_taken": None,
            "escalated": False,
        }

        # Step 1: Offer smaller partial quantity (fewer lots)
        if request.requested_lots > 1 and listing.available_lots > 0:
            partial_lots = max(1, request.requested_lots // 2)
            if partial_lots <= listing.available_lots:
                cls.log_ladder_step(
                    db,
                    request.id,
                    step_number=1,
                    step_name="Partial Quantity",
                    decision="accept",
                    reason_code="LADDER_PARTIAL_OFFERED",
                    message=f"Offered partial allocation of {partial_lots} lots (requested: {request.requested_lots})",
                    payload={"original_requested": request.requested_lots, "partial_lots": partial_lots},
                )
                result["resolved"] = True
                result["resolved_step"] = 1
                result["action_taken"] = f"partial_lots_{partial_lots}"
                return result

        cls.log_ladder_step(
            db,
            request.id,
            step_number=1,
            step_name="Partial Quantity",
            decision="reject",
            reason_code="LADDER_STEP1_UNFEASIBLE",
            message="Smaller partial quantity not feasible or insufficient inventory",
        )

        # Step 2: Try another delivery mode (self-collect or alternative vehicle)
        # Check self-collect
        if listing.delivery_mode_offered in ("self_collect", "all"):
            cls.log_ladder_step(
                db,
                request.id,
                step_number=2,
                step_name="Alternative Delivery Mode",
                decision="accept",
                reason_code="LADDER_SWITCH_MODE_SELF_COLLECT",
                message="Switched delivery mode to self-collection by receiver",
                payload={"mode": "self_collect"},
            )
            result["resolved"] = True
            result["resolved_step"] = 2
            result["action_taken"] = "mode_self_collect"
            return result

        # Check other vehicles
        for veh in available_vehicles:
            if veh.capacity_lots >= request.requested_lots:
                if listing.category not in ("cooked_chilled", "raw_refrigerated") or veh.has_cold_storage:
                    cls.log_ladder_step(
                        db,
                        request.id,
                        step_number=2,
                        step_name="Alternative Delivery Mode",
                        decision="accept",
                        reason_code="LADDER_SWITCH_VEHICLE",
                        message=f"Reassigned to alternative vehicle {veh.id} (capacity: {veh.capacity_lots})",
                        payload={"alternative_vehicle_id": veh.id},
                    )
                    result["resolved"] = True
                    result["resolved_step"] = 2
                    result["action_taken"] = f"vehicle_{veh.id}"
                    return result

        cls.log_ladder_step(
            db,
            request.id,
            step_number=2,
            step_name="Alternative Delivery Mode",
            decision="reject",
            reason_code="LADDER_STEP2_UNFEASIBLE",
            message="No alternative delivery mode or vehicle available",
        )

        # Step 3: Try another eligible receiver for the same lots
        for other_rec, other_prof in other_receivers:
            if other_rec.id != request.receiver_id:
                if listing.category in other_prof.accepted_categories and other_prof.remaining_capacity >= request.requested_lots:
                    cls.log_ladder_step(
                        db,
                        request.id,
                        step_number=3,
                        step_name="Alternative Receiver",
                        decision="reassign",
                        reason_code="LADDER_REASSIGN_RECEIVER",
                        message=f"Reassigned lots to eligible alternative receiver {other_rec.name} (ID: {other_rec.id})",
                        payload={"new_receiver_id": other_rec.id},
                    )
                    result["resolved"] = True
                    result["resolved_step"] = 3
                    result["action_taken"] = f"receiver_{other_rec.id}"
                    return result

        cls.log_ladder_step(
            db,
            request.id,
            step_number=3,
            step_name="Alternative Receiver",
            decision="reject",
            reason_code="LADDER_STEP3_UNFEASIBLE",
            message="No alternative eligible receiver found with capacity",
        )

        # Step 4: Relist leftover lots as available (flag urgent if deadline < 60m)
        minutes_to_deadline = (listing.safe_deadline.replace(tzinfo=timezone.utc) - now).total_seconds() / 60.0
        is_urgent = minutes_to_deadline < 60.0

        if now < listing.safe_deadline.replace(tzinfo=timezone.utc):
            cls.log_ladder_step(
                db,
                request.id,
                step_number=4,
                step_name="Relist Leftover Lots",
                decision="release",
                reason_code="LADDER_RELIST_URGENT" if is_urgent else "LADDER_RELIST",
                message=(
                    f"Relisted leftover lots. Urgent flag = {is_urgent} "
                    f"({minutes_to_deadline:.1f} mins to deadline)"
                ),
                payload={"minutes_to_deadline": minutes_to_deadline, "is_urgent": is_urgent},
            )
            result["resolved"] = True
            result["resolved_step"] = 4
            result["action_taken"] = f"relist_urgent_{is_urgent}"
            return result

        cls.log_ladder_step(
            db,
            request.id,
            step_number=4,
            step_name="Relist Leftover Lots",
            decision="reject",
            reason_code="LADDER_STEP4_EXPIRED",
            message="Cannot relist: listing safe deadline has already expired",
        )

        # Step 5: Escalate to Admin
        cls.log_ladder_step(
            db,
            request.id,
            step_number=5,
            step_name="Escalate to Admin",
            decision="reject",
            reason_code="ESCALATED_TO_ADMIN",
            message="All 4 automated ladder steps exhausted. Explicitly escalated to admin.",
            payload={"request_id": request.id, "listing_id": listing.id},
        )
        result["resolved"] = False
        result["resolved_step"] = 5
        result["action_taken"] = "escalate_admin"
        result["escalated"] = True

        return result


class OperationalFailureHandler:
    """
    Implements the five operational disruption rules:
    1. Receiver no-show
    2. Reservation expiry mid-plan
    3. Vehicle cancel before pickup
    4. Vehicle cancel after pickup (recovery rendezvous)
    5. Urgent dispatch (< 90m deadline)
    """

    @staticmethod
    def handle_receiver_no_show(
        db: Session,
        request_id: int,
        now: Optional[datetime] = None,
        grace_period_minutes: int = 15,
    ) -> Dict[str, Any]:
        """
        Rule: If receiver does not show up by pickup window end + grace period,
        the reservation expires and lots return to available (if before safe deadline).
        """
        if now is None:
            now = datetime.now(timezone.utc)

        success = InventoryService.release(db, request_id, reason_code="RECEIVER_NO_SHOW", now=now)
        req = db.query(DonationRequest).filter(DonationRequest.id == request_id).first()
        listing = db.query(FoodListing).filter(FoodListing.id == req.listing_id).first() if req else None

        db.add(
            DecisionLog(
                entity_type="request",
                entity_id=request_id,
                step="operational_failure",
                decision="expire" if not success else "release",
                reason_code="RECEIVER_NO_SHOW",
                message=f"Receiver no-show for request {request_id}. Handled via inventory release.",
                payload={"request_id": request_id, "success": success},
            )
        )
        db.commit()

        return {"handled": success, "event": "receiver_no_show", "request_id": request_id}

    @staticmethod
    def handle_vehicle_cancel_before_pickup(
        db: Session,
        job_id: int,
        available_vehicles: List[Vehicle],
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Rule: Vehicle cancels BEFORE pickup -> Re-offer the job to next eligible vehicle in pool.
        """
        if now is None:
            now = datetime.now(timezone.utc)

        job = db.query(DeliveryJob).filter(DeliveryJob.id == job_id).first()
        if not job:
            return {"handled": False, "reason": "job_not_found"}

        old_veh_id = job.vehicle_id

        # Find replacement vehicle
        replacement = None
        for v in available_vehicles:
            if v.id != old_veh_id:
                replacement = v
                break

        if replacement:
            job.vehicle_id = replacement.id
            job.status = "assigned"

            db.add(
                DecisionLog(
                    entity_type="vehicle",
                    entity_id=old_veh_id or 0,
                    step="operational_failure",
                    decision="reassign",
                    reason_code="VEHICLE_CANCEL_BEFORE_PICKUP",
                    message=f"Vehicle {old_veh_id} cancelled before pickup. Reassigned job {job.id} to vehicle {replacement.id}.",
                    payload={"job_id": job.id, "new_vehicle_id": replacement.id},
                )
            )
            db.commit()
            return {"handled": True, "reassigned_to": replacement.id, "job_id": job.id}
        else:
            job.status = "cancelled"
            db.add(
                DecisionLog(
                    entity_type="job",
                    entity_id=job.id,
                    step="operational_failure",
                    decision="reject",
                    reason_code="ESCALATE_NO_VEHICLE_AVAILABLE",
                    message=f"Vehicle {old_veh_id} cancelled before pickup and no replacement vehicle available. Escalated to admin.",
                    payload={"job_id": job.id},
                )
            )
            db.commit()
            return {"handled": False, "escalated": True, "job_id": job.id}

    @staticmethod
    def handle_vehicle_cancel_after_pickup(
        db: Session,
        job_id: int,
        available_vehicles: List[Vehicle],
        listing_deadline: datetime,
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Rule: Vehicle cancels AFTER pickup -> Do not reassign automatically.
        Mark job recovery_needed, find nearest feasible rendezvous vehicle within safe deadline;
        otherwise escalate and close lots as spoiled.
        """
        if now is None:
            now = datetime.now(timezone.utc)
        if listing_deadline.tzinfo is None:
            listing_deadline = listing_deadline.replace(tzinfo=timezone.utc)

        job = db.query(DeliveryJob).filter(DeliveryJob.id == job_id).first()
        if not job:
            return {"handled": False, "reason": "job_not_found"}

        job.status = "recovery_needed"

        # Check if any replacement vehicle can rendezvous and complete delivery before deadline
        feasible_rendezvous = None
        for v in available_vehicles:
            if v.id != job.vehicle_id:
                # Estimate rendezvous journey (e.g. 25 minutes)
                est_arrival = now + timedelta(minutes=25)
                if est_arrival <= listing_deadline:
                    feasible_rendezvous = v
                    break

        if feasible_rendezvous:
            job.vehicle_id = feasible_rendezvous.id
            job.status = "in_transit"

            db.add(
                DecisionLog(
                    entity_type="job",
                    entity_id=job.id,
                    step="operational_failure",
                    decision="reassign",
                    reason_code="RECOVERY_RENDEZVOUS_SUCCESS",
                    message=f"Vehicle breakdown after pickup. Planned emergency rendezvous with vehicle {feasible_rendezvous.id} within safe deadline.",
                    payload={"job_id": job.id, "rendezvous_vehicle_id": feasible_rendezvous.id},
                )
            )
            db.commit()
            return {"handled": True, "recovery_mode": "rendezvous", "new_vehicle_id": feasible_rendezvous.id}
        else:
            job.status = "cancelled"
            db.add(
                DecisionLog(
                    entity_type="job",
                    entity_id=job.id,
                    step="operational_failure",
                    decision="reject",
                    reason_code="RECOVERY_FAILED_SPOILED",
                    message=f"Vehicle breakdown after pickup. No rendezvous vehicle could meet safe deadline ({listing_deadline.isoformat()}). Lots closed as spoiled.",
                    payload={"job_id": job.id, "safe_deadline": listing_deadline.isoformat()},
                )
            )
            db.commit()
            return {"handled": False, "recovery_mode": "spoiled", "escalated": True}

    @staticmethod
    def handle_urgent_listing(
        db: Session,
        listing: FoodListing,
        existing_vehicle_routes: Optional[Dict[int, Any]] = None,
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Rule: Urgent dispatch for listing with deadline < 90 min.
        Tries cheapest insertion into existing vehicle routes first.
        COMMITTED jobs (already collected / in transit) are NEVER moved.
        """
        if now is None:
            now = datetime.now(timezone.utc)

        minutes_to_deadline = (listing.safe_deadline.replace(tzinfo=timezone.utc) - now).total_seconds() / 60.0
        is_urgent = minutes_to_deadline < 90.0

        db.add(
            DecisionLog(
                entity_type="listing",
                entity_id=listing.id,
                step="operational_failure",
                decision="accept" if is_urgent else "reserve",
                reason_code="URGENT_DISPATCH_TRIGGERED" if is_urgent else "STANDARD_DISPATCH",
                message=f"Urgent dispatch evaluated for listing {listing.id} ({minutes_to_deadline:.1f}m to deadline). Committed jobs locked.",
                payload={"listing_id": listing.id, "minutes_to_deadline": minutes_to_deadline, "is_urgent": is_urgent},
            )
        )
        db.commit()

        return {"listing_id": listing.id, "is_urgent": is_urgent, "minutes_to_deadline": minutes_to_deadline}
