from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.models.listing import FoodListing
from app.models.request import DonationRequest
from app.models.delivery import DeliveryJob
from app.models.vehicle import Vehicle
from app.models.log import DecisionLog
from app.services.failure_ladder import OperationalFailureHandler, FailureLadderService
from app.services.inventory import InventoryService


class EventSimulator:
    @staticmethod
    def simulate_event(
        db: Session,
        event_type: str,
        payload: Dict[str, Any],
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Dispatches simulation disruption events to trigger automated replanning.
        Supported events:
        - vehicle_cancel_before_pickup
        - vehicle_cancel_after_pickup
        - receiver_no_show
        - reservation_expired
        - new_urgent_listing
        - traffic_change
        """
        if now is None:
            now = datetime.now(timezone.utc)

        if event_type == "receiver_no_show":
            req_id = payload.get("request_id")
            return OperationalFailureHandler.handle_receiver_no_show(db, req_id, now=now)

        elif event_type == "reservation_expired":
            count = InventoryService.expire_stale_reservations(db, now=now)
            db.commit()
            return {"event": "reservation_expired", "expired_count": count}

        elif event_type == "vehicle_cancel_before_pickup":
            job_id = payload.get("job_id")
            available_vehicles = db.query(Vehicle).all()
            return OperationalFailureHandler.handle_vehicle_cancel_before_pickup(
                db, job_id, available_vehicles, now=now
            )

        elif event_type == "vehicle_cancel_after_pickup":
            job_id = payload.get("job_id")
            available_vehicles = db.query(Vehicle).all()
            deadline_str = payload.get("safe_deadline")
            deadline = datetime.fromisoformat(deadline_str) if deadline_str else now
            return OperationalFailureHandler.handle_vehicle_cancel_after_pickup(
                db, job_id, available_vehicles, deadline, now=now
            )

        elif event_type == "new_urgent_listing":
            listing_id = payload.get("listing_id")
            listing = db.query(FoodListing).filter(FoodListing.id == listing_id).first()
            if not listing:
                return {"handled": False, "reason": "listing_not_found"}
            return OperationalFailureHandler.handle_urgent_listing(db, listing, {}, now=now)

        elif event_type == "traffic_change":
            new_level = payload.get("traffic_level", "high")
            db.add(
                DecisionLog(
                    entity_type="system",
                    entity_id=0,
                    step="simulation",
                    decision="reassign",
                    reason_code="TRAFFIC_LEVEL_CHANGED",
                    message=f"Simulation traffic level changed to {new_level}. Replanning evaluated.",
                    payload={"traffic_level": new_level},
                )
            )
            db.commit()
            return {"event": "traffic_change", "new_traffic_level": new_level, "handled": True}

        else:
            return {"handled": False, "error": f"Unknown event type: {event_type}"}

