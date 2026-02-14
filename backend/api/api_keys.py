"""
Spatix API Key Management
Developer platform foundation — generate, manage, and authenticate with API keys.

POST /api/keys              - Create a new API key (authenticated)
GET  /api/keys              - List your API keys (authenticated)
DELETE /api/keys/{key_id}   - Revoke an API key (authenticated)
GET  /api/keys/{key_id}/usage - View usage stats for a key
"""
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import secrets
import hashlib
import logging

from database import get_db, USE_POSTGRES, ensure_db_initialized

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["api-keys"])

# Key prefix for easy identification
API_KEY_PREFIX = "spx_"
API_KEY_BYTE_LENGTH = 32  # 256-bit keys


# ==================== MODELS ====================

class CreateKeyRequest(BaseModel):
    """Request to create a new API key."""
    name: str = Field(..., min_length=1, max_length=100, description="Human-readable name for this key")
    scopes: List[str] = Field(
        default=["maps:create", "geocode", "normalize", "datasets:read"],
        description="Permissions for this key"
    )
    rate_limit: Optional[int] = Field(
        default=None,
        description="Custom rate limit (requests/hour). Defaults to plan limit."
    )


class ApiKeyResponse(BaseModel):
    """Response after creating a key (only time full key is shown)."""
    id: str
    key: str  # Full key — only returned on creation
    name: str
    prefix: str  # First 8 chars for identification
    scopes: List[str]
    rate_limit: Optional[int]
    created_at: str


class ApiKeyListItem(BaseModel):
    """Summary of a key (no full key shown)."""
    id: str
    name: str
    prefix: str
    scopes: List[str]
    rate_limit: Optional[int]
    last_used_at: Optional[str]
    request_count: int
    created_at: str
    active: bool


class ApiKeyUsageResponse(BaseModel):
    """Usage statistics for an API key."""
    key_id: str
    name: str
    total_requests: int
    last_used_at: Optional[str]
    created_at: str
    requests_today: int
    requests_this_hour: int


# ==================== VALID SCOPES ====================

VALID_SCOPES = {
    "maps:create",      # Create maps
    "maps:read",        # Read maps
    "maps:delete",      # Delete maps
    "geocode",          # Forward/reverse/batch geocoding
    "normalize",        # Data normalization
    "datasets:read",    # Read/search datasets
    "datasets:write",   # Upload datasets
    "spatial:query",    # Spatial queries (PostGIS)
}


# ==================== DATABASE OPERATIONS ====================

def _generate_api_key() -> tuple:
    """Generate a new API key. Returns (full_key, key_hash, prefix)."""
    raw = secrets.token_urlsafe(API_KEY_BYTE_LENGTH)
    full_key = f"{API_KEY_PREFIX}{raw}"
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    prefix = full_key[:12]  # "spx_" + first 8 chars
    return full_key, key_hash, prefix


def create_api_key(user_id: int, name: str, scopes: list,
                   rate_limit: int = None) -> dict:
    """Create a new API key for a user."""
    ensure_db_initialized()
    import json

    full_key, key_hash, prefix = _generate_api_key()
    key_id = secrets.token_urlsafe(12)
    scopes_str = json.dumps(scopes)

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name, scopes, rate_limit)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (key_id, user_id, key_hash, prefix, name, scopes_str, rate_limit))
        else:
            conn.execute("""
                INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name, scopes, rate_limit)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (key_id, user_id, key_hash, prefix, name, scopes_str, rate_limit))

    return {
        "id": key_id,
        "key": full_key,
        "name": name,
        "prefix": prefix,
        "scopes": scopes,
        "rate_limit": rate_limit,
    }


def get_user_api_keys(user_id: int) -> list:
    """Get all API keys for a user (without revealing the full key)."""
    ensure_db_initialized()
    import json

    with get_db() as conn:
        if USE_POSTGRES:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, name, key_prefix, scopes, rate_limit,
                           last_used_at, request_count, created_at, active
                    FROM api_keys WHERE user_id = %s AND active = TRUE
                    ORDER BY created_at DESC
                """, (user_id,))
                rows = cur.fetchall()
        else:
            cur = conn.execute("""
                SELECT id, name, key_prefix, scopes, rate_limit,
                       last_used_at, request_count, created_at, active
                FROM api_keys WHERE user_id = ? AND active = 1
                ORDER BY created_at DESC
            """, (user_id,))
            rows = cur.fetchall()

    result = []
    for row in rows:
        r = dict(row)
        if isinstance(r.get("scopes"), str):
            r["scopes"] = json.loads(r["scopes"])
        r["active"] = bool(r.get("active", True))
        result.append(r)
    return result


def verify_api_key(key: str) -> dict:
    """
    Verify an API key and return its metadata.
    Returns None if key is invalid or revoked.
    """
    ensure_db_initialized()
    import json

    key_hash = hashlib.sha256(key.encode()).hexdigest()

    with get_db() as conn:
        if USE_POSTGRES:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT ak.id, ak.user_id, ak.name, ak.scopes, ak.rate_limit, ak.active,
                           u.email, u.plan
                    FROM api_keys ak
                    JOIN users u ON ak.user_id = u.id
                    WHERE ak.key_hash = %s AND ak.active = TRUE
                """, (key_hash,))
                row = cur.fetchone()
        else:
            cur = conn.execute("""
                SELECT ak.id, ak.user_id, ak.name, ak.scopes, ak.rate_limit, ak.active,
                       u.email, u.plan
                FROM api_keys ak
                JOIN users u ON ak.user_id = u.id
                WHERE ak.key_hash = ? AND ak.active = 1
            """, (key_hash,))
            row = cur.fetchone()

    if not row:
        return None

    result = dict(row)
    if isinstance(result.get("scopes"), str):
        result["scopes"] = json.loads(result["scopes"])

    # Update last_used_at and request_count
    _record_key_usage(result["id"], conn if not USE_POSTGRES else None)

    return result


def _record_key_usage(key_id: str, conn=None):
    """Record that an API key was used."""
    def _do_update():
        with get_db() as c:
            if USE_POSTGRES:
                with c.cursor() as cur:
                    cur.execute("""
                        UPDATE api_keys
                        SET last_used_at = CURRENT_TIMESTAMP, request_count = request_count + 1
                        WHERE id = %s
                    """, (key_id,))
            else:
                c.execute("""
                    UPDATE api_keys
                    SET last_used_at = CURRENT_TIMESTAMP, request_count = request_count + 1
                    WHERE id = ?
                """, (key_id,))

    try:
        _do_update()
    except Exception as e:
        logger.warning(f"Failed to record API key usage for {key_id}: {e}")


def revoke_api_key(key_id: str, user_id: int) -> bool:
    """Revoke an API key. Returns True if revoked."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE api_keys SET active = FALSE
                    WHERE id = %s AND user_id = %s AND active = TRUE
                """, (key_id, user_id))
                return cur.rowcount > 0
        else:
            cur = conn.execute("""
                UPDATE api_keys SET active = 0
                WHERE id = ? AND user_id = ? AND active = 1
            """, (key_id, user_id))
            return cur.rowcount > 0


def get_key_usage_stats(key_id: str, user_id: int) -> dict:
    """Get usage stats for an API key."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, name, request_count, last_used_at, created_at
                    FROM api_keys WHERE id = %s AND user_id = %s
                """, (key_id, user_id))
                row = cur.fetchone()

                if not row:
                    return None

                # Count requests in last hour and today
                cur.execute("""
                    SELECT
                        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as requests_this_hour,
                        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as requests_today
                    FROM api_key_usage WHERE key_id = %s
                """, (key_id,))
                usage = cur.fetchone()
        else:
            cur = conn.execute("""
                SELECT id, name, request_count, last_used_at, created_at
                FROM api_keys WHERE id = ? AND user_id = ?
            """, (key_id, user_id))
            row = cur.fetchone()

            if not row:
                return None

            # SQLite time-based counts
            cur = conn.execute("""
                SELECT
                    SUM(CASE WHEN created_at > datetime('now', '-1 hour') THEN 1 ELSE 0 END) as requests_this_hour,
                    SUM(CASE WHEN created_at > datetime('now', '-1 day') THEN 1 ELSE 0 END) as requests_today
                FROM api_key_usage WHERE key_id = ?
            """, (key_id,))
            usage = cur.fetchone()

    row = dict(row)
    usage = dict(usage) if usage else {}

    return {
        "key_id": row["id"],
        "name": row["name"],
        "total_requests": row.get("request_count", 0),
        "last_used_at": str(row.get("last_used_at", "")) if row.get("last_used_at") else None,
        "created_at": str(row.get("created_at", "")),
        "requests_today": usage.get("requests_today", 0) or 0,
        "requests_this_hour": usage.get("requests_this_hour", 0) or 0,
    }


# ==================== AUTH HELPER ====================

def authenticate_request(authorization: str = None, x_api_key: str = None) -> dict:
    """
    Authenticate a request via JWT Bearer token OR API key.
    Returns a dict with user_id, email, plan, and optionally scopes.

    Usage in endpoints:
        auth = authenticate_request(authorization, x_api_key)
    """
    # Try API key first (X-API-Key header)
    if x_api_key and x_api_key.startswith(API_KEY_PREFIX):
        key_data = verify_api_key(x_api_key)
        if not key_data:
            raise HTTPException(status_code=401, detail="Invalid or revoked API key")
        return {
            "user_id": key_data["user_id"],
            "email": key_data.get("email"),
            "plan": key_data.get("plan", "free"),
            "scopes": key_data.get("scopes", []),
            "auth_method": "api_key",
            "key_id": key_data["id"],
        }

    # Try JWT Bearer token
    if authorization and authorization.startswith("Bearer "):
        try:
            from routers.auth import verify_jwt
            token = authorization.split(" ")[1]
            payload = verify_jwt(token)
            if not payload:
                raise HTTPException(status_code=401, detail="Invalid or expired token")
            return {
                "user_id": payload.get("sub"),
                "email": payload.get("email"),
                "plan": payload.get("plan", "free"),
                "scopes": list(VALID_SCOPES),  # JWT users get all scopes
                "auth_method": "jwt",
            }
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")

    raise HTTPException(status_code=401, detail="Authentication required. Provide Bearer token or X-API-Key header.")


def require_scope(auth: dict, scope: str):
    """Check that the authenticated user has the required scope."""
    if scope not in auth.get("scopes", []):
        raise HTTPException(
            status_code=403,
            detail=f"API key does not have the '{scope}' scope. Required for this endpoint."
        )


# ==================== ENDPOINTS ====================

def _require_jwt_auth(authorization: str) -> dict:
    """Require JWT auth (API keys are managed via JWT, not other API keys)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        from routers.auth import verify_jwt
        token = authorization.split(" ")[1]
        payload = verify_jwt(token)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return payload
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/keys", response_model=ApiKeyResponse)
async def create_key(body: CreateKeyRequest, authorization: str = Header(...)):
    """
    Create a new API key.

    The full API key is only shown once in the response — store it securely.
    Keys are prefixed with 'spx_' for easy identification.

    Available scopes:
    - maps:create, maps:read, maps:delete
    - geocode (forward, reverse, batch)
    - normalize (data normalization)
    - datasets:read, datasets:write
    - spatial:query (PostGIS spatial queries)
    """
    payload = _require_jwt_auth(authorization)
    user_id = payload.get("sub")

    # Validate scopes
    invalid = set(body.scopes) - VALID_SCOPES
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scopes: {invalid}. Valid scopes: {sorted(VALID_SCOPES)}"
        )

    # Limit keys per user
    existing = get_user_api_keys(user_id)
    if len(existing) >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 active API keys per account")

    result = create_api_key(user_id, body.name, body.scopes, body.rate_limit)

    return ApiKeyResponse(
        id=result["id"],
        key=result["key"],
        name=result["name"],
        prefix=result["prefix"],
        scopes=result["scopes"],
        rate_limit=result["rate_limit"],
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/keys")
async def list_keys(authorization: str = Header(...)):
    """List all active API keys for the authenticated user."""
    payload = _require_jwt_auth(authorization)
    user_id = payload.get("sub")

    keys = get_user_api_keys(user_id)

    return {
        "keys": [
            {
                "id": k["id"],
                "name": k["name"],
                "prefix": k.get("key_prefix", k.get("prefix", "")),
                "scopes": k.get("scopes", []),
                "rate_limit": k.get("rate_limit"),
                "last_used_at": str(k["last_used_at"]) if k.get("last_used_at") else None,
                "request_count": k.get("request_count", 0),
                "created_at": str(k.get("created_at", "")),
                "active": k.get("active", True),
            }
            for k in keys
        ],
        "total": len(keys),
    }


@router.delete("/keys/{key_id}")
async def revoke_key(key_id: str, authorization: str = Header(...)):
    """Revoke an API key. This is irreversible."""
    payload = _require_jwt_auth(authorization)
    user_id = payload.get("sub")

    if not revoke_api_key(key_id, user_id):
        raise HTTPException(status_code=404, detail="API key not found or already revoked")

    return {"success": True, "message": "API key revoked"}


@router.get("/keys/{key_id}/usage", response_model=ApiKeyUsageResponse)
async def key_usage(key_id: str, authorization: str = Header(...)):
    """View usage statistics for an API key."""
    payload = _require_jwt_auth(authorization)
    user_id = payload.get("sub")

    stats = get_key_usage_stats(key_id, user_id)
    if not stats:
        raise HTTPException(status_code=404, detail="API key not found")

    return stats
