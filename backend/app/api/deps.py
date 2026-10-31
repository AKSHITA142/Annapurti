import base64
import hashlib
import hmac
import json
import time
from typing import Generator, List, Optional
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models.user import User


def get_db() -> Generator[Session, None, None]:
    """Provides a transactional database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64_decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data.encode("utf-8"))


def create_access_token(data: dict, expires_in_seconds: Optional[int] = None) -> str:
    """Creates a cryptographically signed HMAC-SHA256 role token."""
    to_encode = data.copy()
    expire_time = int(time.time()) + (expires_in_seconds or settings.TOKEN_EXPIRE_HOURS * 3600)
    to_encode["exp"] = expire_time

    payload_json = json.dumps(to_encode, sort_keys=True).encode("utf-8")
    payload_b64 = _b64_encode(payload_json)

    signature = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    sig_b64 = _b64_encode(signature)

    return f"{payload_b64}.{sig_b64}"


def decode_access_token(token: str) -> dict:
    """Decodes and verifies a signed token."""
    parts = token.split(".")
    if len(parts) != 2:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload_b64, sig_b64 = parts
    expected_sig = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    if not hmac.compare_digest(_b64_encode(expected_sig), sig_b64):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload_json = _b64_decode(payload_b64)
        payload = json.loads(payload_json.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if "exp" in payload and int(time.time()) > payload["exp"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    """Dependency that returns authenticated User or raises 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[len("Bearer ") :].strip()
    payload = decode_access_token(token)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID missing from token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_optional_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Dependency that returns User if valid Bearer token provided, otherwise None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    try:
        token = authorization[len("Bearer ") :].strip()
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        return db.query(User).filter(User.id == user_id).first()
    except Exception:
        return None


def require_roles(allowed_roles: List[str]):
    """Role-based authorization dependency guard."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: requires one of {allowed_roles}, but user is '{current_user.role}'",
            )
        return current_user

    return role_checker
