"""JWT authentication for Supabase Auth."""

from __future__ import annotations

import os

import jwt
from fastapi import HTTPException, Request


def verify_token(request: Request) -> dict:
    """Extract and verify the Supabase JWT from the Authorization header.

    Returns the decoded token payload (contains 'sub' = user_id).
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header[7:]  # Strip "Bearer "
    secret = os.environ.get("SUPABASE_JWT_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET not configured")

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


def get_user_id(request: Request) -> str:
    """Extract and return the user_id (sub) from the JWT."""
    payload = verify_token(request)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user ID")
    return user_id
