from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import create_access_token, get_current_user, get_db
from app.models.user import ReceiverProfile, User
from app.schemas.auth import LoginRequest, TokenResponse, UpdateProfileRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """
    Auth-lite login endpoint:
    Returns a cryptographically signed role token.
    If the user does not exist, registers them automatically with the specified role.
    Supports provider, ngo, volunteer, admin, and dual 'both' roles.
    """
    user = db.query(User).filter(User.email == request.email).first()

    if not user:
        user_name = request.name or request.email.split("@")[0].capitalize()
        user = User(
            email=request.email,
            name=user_name,
            role=request.role or "ngo",
            city=request.city or "Ahmedabad",
            address=request.address,
            lat=request.lat or 23.0225,
            lng=request.lng or 72.5714,
            verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # If user is an NGO / receiver or both, auto-create receiver profile if none
        if user.role in ("ngo", "volunteer", "both"):
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
    else:
        # If user provided updated address or coordinates, persist them
        if request.address:
            user.address = request.address
        if request.lat is not None:
            user.lat = request.lat
        if request.lng is not None:
            user.lng = request.lng

        # If user requested 'both' role and was previously single role, allow upgrading
        if request.role == "both" and user.role != "admin":
            user.role = "both"
            # Ensure receiver profile exists
            existing_prof = db.query(ReceiverProfile).filter(ReceiverProfile.user_id == user.id).first()
            if not existing_prof:
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
            db.refresh(user)

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


@router.patch("/profile", response_model=UserResponse)
@router.put("/profile", response_model=UserResponse)
def update_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    """Updates user profile information including address, location coordinates, and name."""
    if request.name is not None:
        current_user.name = request.name
    if request.address is not None:
        current_user.address = request.address
    if request.lat is not None:
        current_user.lat = request.lat
    if request.lng is not None:
        current_user.lng = request.lng
    if request.city is not None:
        current_user.city = request.city

    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)
