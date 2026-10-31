from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import create_access_token, get_current_user, get_db
from app.models.user import ReceiverProfile, User
from app.schemas.auth import LoginRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """
    Auth-lite login endpoint:
    Returns a cryptographically signed role token.
    If the user does not exist, registers them automatically with the specified role.
    """
    user = db.query(User).filter(User.email == request.email).first()

    if not user:
        user_name = request.name or request.email.split("@")[0].capitalize()
        # Admin is verified automatically for convenience; others start with verified=True for easy testing/MVP or default
        is_verified = True if request.role in ("admin", "provider") else False
        user = User(
            email=request.email,
            name=user_name,
            role=request.role or "ngo",
            city=request.city or "Ahmedabad",
            lat=request.lat or 23.0225,
            lng=request.lng or 72.5714,
            verified=is_verified,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # If user is an NGO / receiver, auto-create receiver profile if none
        if user.role in ("ngo", "volunteer"):
            profile = ReceiverProfile(
                user_id=user.id,
                accepted_categories=["cooked_hot", "cooked_chilled", "raw_refrigerated", "sealed_packaged"],
                daily_intake_capacity=50,
                remaining_capacity=50,
                operating_hours_start="09:00",
                operating_hours_end="21:00",
                has_vehicle=False,
                priority_class="standard",
            )
            db.add(profile)
            db.commit()

    token_payload = {
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "verified": user.verified,
    }
    access_token = create_access_token(token_payload)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    """Returns the authenticated user profile."""
    return UserResponse.model_validate(current_user)

