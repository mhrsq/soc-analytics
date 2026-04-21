"""Authentication & User management routes."""

import time
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    decode_token,
    hash_password,
    get_user_by_id,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Schemas ──

VALID_ROLES = {"superadmin", "admin", "viewer", "customer"}

# ── Simple in-memory rate limiter for login ──
_login_attempts: dict[str, list[float]] = defaultdict(list)
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 300  # 5 minutes


def _check_rate_limit(ip: str) -> None:
    """Raise 429 if too many login attempts from this IP."""
    now = time.monotonic()
    attempts = _login_attempts[ip]
    # Prune old entries
    _login_attempts[ip] = [t for t in attempts if now - t < LOGIN_WINDOW_SECONDS]
    if len(_login_attempts[ip]) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"Too many login attempts. Try again in {LOGIN_WINDOW_SECONDS // 60} minutes.",
        )
    _login_attempts[ip].append(now)


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=200)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: Optional[str]
    role: str
    customer: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(..., min_length=8, max_length=200)
    display_name: Optional[str] = Field(None, max_length=100)
    role: str = "viewer"
    customer: Optional[str] = Field(None, max_length=200)

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in VALID_ROLES:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}")
        return v


class UserUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=100)
    role: Optional[str] = None
    customer: Optional[str] = Field(None, max_length=200)
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8, max_length=200)

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_ROLES:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}")
        return v


TokenResponse.model_rebuild()


# ── Auth dependency ──

async def require_auth(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Dependency: require valid JWT in Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = auth_header.removeprefix("Bearer ").strip()
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    return user


async def require_admin(user: User = Depends(require_auth)) -> User:
    """Dependency: require superadmin or admin role."""
    if user.role not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── Routes ──

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate and return JWT."""
    client_ip = request.headers.get("X-Real-IP") or request.client.host or "unknown"
    _check_rate_limit(client_ip)

    user = await authenticate_user(db, body.username, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(user.id, user.username, user.role, user.customer)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(require_auth)):
    """Return current authenticated user info."""
    return UserResponse.model_validate(user)


@router.get("/users", response_model=list[UserResponse])
async def list_users(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """List all users (admin only)."""
    result = await db.execute(select(User).order_by(User.id))
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(body: UserCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Create a new user (admin only)."""
    # Check duplicate username
    existing = await db.execute(select(func.count()).where(User.username == body.username))
    if existing.scalar() > 0:
        raise HTTPException(status_code=409, detail="Username already exists")

    new_user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name or body.username,
        role=body.role,
        customer=body.customer,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return UserResponse.model_validate(new_user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    body: UserUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a user (admin only)."""
    target = await get_user_by_id(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if body.display_name is not None:
        target.display_name = body.display_name
    if body.role is not None:
        target.role = body.role
    if body.customer is not None:
        target.customer = body.customer
    if body.is_active is not None:
        target.is_active = body.is_active
    if body.password is not None:
        target.password_hash = hash_password(body.password)

    await db.commit()
    await db.refresh(target)
    return UserResponse.model_validate(target)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user (admin only). Cannot delete yourself."""
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    target = await get_user_by_id(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(target)
    await db.commit()
    return {"ok": True}
