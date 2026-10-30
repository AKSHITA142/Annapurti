from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from app.models.log import DecisionLog


class ExplainService:
    @staticmethod
    def explain_request(
        db: Session,
        request_id: int,
    ) -> Dict[str, Any]:
        """
        Retrieves the complete audit trail and decision explanation for a donation request.
        """
        logs = (
            db.query(DecisionLog)
            .filter(
                DecisionLog.entity_type == "request",
                DecisionLog.entity_id == request_id,
            )
            .order_by(DecisionLog.created_at.asc(), DecisionLog.id.asc())
            .all()
        )

        timeline: List[Dict[str, Any]] = []
        pruned_reasons: List[str] = []
        final_decision: Optional[str] = None

        for log in logs:
            entry = {
                "id": log.id,
                "step": log.step,
                "decision": log.decision,
                "reason_code": log.reason_code,
                "message": log.message,
                "payload": log.payload,
                "timestamp": log.created_at.isoformat(),
            }
            timeline.append(entry)
            if log.decision == "prune":
                pruned_reasons.append(log.reason_code)
            elif log.decision in ("reserve", "reject", "release", "expire"):
                final_decision = log.decision

        return {
            "request_id": request_id,
            "final_decision": final_decision or "pending",
            "pruned_reason_codes": list(set(pruned_reasons)),
            "timeline": timeline,
            "total_events": len(timeline),
        }

    @staticmethod
    def explain_listing(
        db: Session,
        listing_id: int,
    ) -> Dict[str, Any]:
        """
        Retrieves the audit trail and allocation events for a food listing.
        """
        logs = (
            db.query(DecisionLog)
            .filter(
                DecisionLog.entity_type == "listing",
                DecisionLog.entity_id == listing_id,
            )
            .order_by(DecisionLog.created_at.asc(), DecisionLog.id.asc())
            .all()
        )

        return {
            "listing_id": listing_id,
            "timeline": [
                {
                    "id": l.id,
                    "step": l.step,
                    "decision": l.decision,
                    "reason_code": l.reason_code,
                    "message": l.message,
                    "payload": l.payload,
                    "timestamp": l.created_at.isoformat(),
                }
                for l in logs
            ],
        }

