from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.chat import ChatMessage
from app.models.request import DonationRequest
from app.models.listing import FoodListing
from app.models.user import User
from app.schemas.chat import ChatMessageCreate, ChatMessageResponse

router = APIRouter(prefix="/chat", tags=["Chat & Feedback"])


@router.post("/messages", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
def send_message(
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatMessageResponse:
    """
    Sends a chat message or photo proof feedback between donor and receiver.
    """
    recipient_id = payload.recipient_id

    # If request_id provided but no recipient_id, find recipient automatically
    if payload.request_id and not recipient_id:
        req = db.query(DonationRequest).filter(DonationRequest.id == payload.request_id).first()
        if req:
            if current_user.role in ("ngo", "volunteer"):
                # Recipient is the food provider / donor
                if req.listing and req.listing.provider_id:
                    recipient_id = req.listing.provider_id
            else:
                # Recipient is the receiver NGO
                recipient_id = req.receiver_id

    msg = ChatMessage(
        request_id=payload.request_id,
        sender_id=current_user.id,
        sender_name=current_user.name or ("Donor" if current_user.role == "provider" else "NGO"),
        sender_role=current_user.role,
        recipient_id=recipient_id,
        message=payload.message,
        photo_url=payload.photo_url,
        people_served=payload.people_served,
        message_type=payload.message_type or ("feedback_photo" if payload.photo_url else "text"),
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return ChatMessageResponse.model_validate(msg)


@router.get("/messages", response_model=List[ChatMessageResponse])
def get_messages(
    request_id: Optional[int] = Query(None),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ChatMessageResponse]:
    """
    Retrieves chat history for a specific order or for the current user.
    """
    query = db.query(ChatMessage)
    if request_id:
        query = query.filter(ChatMessage.request_id == request_id)
    else:
        # Get messages where current user is sender or recipient or broadcast
        query = query.filter(
            (ChatMessage.sender_id == current_user.id)
            | (ChatMessage.recipient_id == current_user.id)
            | (ChatMessage.recipient_id.is_(None))
        )

    messages = query.order_by(ChatMessage.created_at.asc()).limit(limit).all()
    return [ChatMessageResponse.model_validate(m) for m in messages]


@router.get("/feedback/donor", response_model=List[ChatMessageResponse])
def get_donor_feedback(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ChatMessageResponse]:
    """
    Retrieves all photo proofs and distribution feedback sent to the authenticated donor.
    """
    # Find all listing IDs owned by this provider
    listing_ids = [l.id for l in db.query(FoodListing).filter(FoodListing.provider_id == current_user.id).all()]
    request_ids = [
        r.id for r in db.query(DonationRequest).filter(DonationRequest.listing_id.in_(listing_ids)).all()
    ]

    messages = (
        db.query(ChatMessage)
        .filter(
            (ChatMessage.recipient_id == current_user.id)
            | (ChatMessage.request_id.in_(request_ids))
            | (ChatMessage.message_type == "feedback_photo")
        )
        .order_by(ChatMessage.created_at.desc())
        .all()
    )
    return [ChatMessageResponse.model_validate(m) for m in messages]

