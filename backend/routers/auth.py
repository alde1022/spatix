"""
Spatix Authentication Router
Handles email/password auth, OAuth, password reset, email verification
Compatible with existing database.py pattern (psycopg2/sqlite sync)
"""

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, quote, urlencode
import secrets
import bcrypt
import jwt
import os
import httpx
import re
import logging

# Import existing database module
from database import get_db, USE_POSTGRES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Config - JWT_SECRET is REQUIRED in production
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    if os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("ENVIRONMENT", "development") == "production":
        logger.critical("JWT_SECRET not set in production! Tokens will not persist across deploys.")
    import warnings
    warnings.warn("JWT_SECRET not set! Using insecure default for development only.", RuntimeWarning)
    # Use a FIXED fallback so tokens survive process restarts in dev/misconfigured envs.
    # In production, always set JWT_SECRET as an environment variable.
    JWT_SECRET = "spatix-dev-insecure-secret-set-JWT_SECRET-env-var"

JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
API_URL = os.environ.get("API_URL", "http://localhost:8000")

# Allowed redirect hosts for open redirect protection
ALLOWED_REDIRECT_HOSTS = {
    urlparse(FRONTEND_URL).netloc,
    "localhost",
    "localhost:3000",
    "127.0.0.1",
}

# Rate limiting for auth endpoints (in-memory, use Redis in production)
_auth_rate_limits: dict = {}
AUTH_RATE_LIMIT_WINDOW = 300  # 5 minutes
AUTH_RATE_LIMIT_MAX_LOGIN = 10  # 10 login attempts per 5 minutes
AUTH_RATE_LIMIT_MAX_SIGNUP = 5  # 5 signup attempts per 5 minutes

# Cookie settings
COOKIE_NAME = "spatix_auth"
COOKIE_MAX_AGE = JWT_EXPIRY_HOURS * 3600
COOKIE_SECURE = os.environ.get("ENVIRONMENT", "development") == "production"
COOKIE_SAMESITE = "lax"

# Google OAuth
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", f"{API_URL}/auth/google/callback")

# Apple OAuth
APPLE_CLIENT_ID = os.environ.get("APPLE_CLIENT_ID")
APPLE_TEAM_ID = os.environ.get("APPLE_TEAM_ID")
APPLE_KEY_ID = os.environ.get("APPLE_KEY_ID")
APPLE_PRIVATE_KEY = os.environ.get("APPLE_PRIVATE_KEY", "").replace("\\n", "\n")

# Email
from services.email import send_verification_email, send_password_reset_email


# ============ Models ============

class SignupRequest(BaseModel):
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    password: str


# ============ Utilities ============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False

def generate_token(length: int = 32) -> str:
    return secrets.token_hex(length)

def create_jwt(user_id: int, email: str, plan: str = "free") -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "plan": plan or "free",
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRY_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt(token: str) -> Optional[dict]:
    print(f"verify_jwt: SECRET={JWT_SECRET[:20]}... token={token[:50]}...")
    try:
        result = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        print(f"verify_jwt: SUCCESS sub={result.get('sub')}")
        return result
    except Exception as e:
        logger.warning(f"verify_jwt: FAILED {type(e).__name__}: {e}")
        return None

def validate_password_strength(password: str) -> tuple[bool, str]:
    """Validate password meets complexity requirements."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r'\d', password):
        return False, "Password must contain at least one number"
    return True, ""

def check_rate_limit(key: str, max_requests: int) -> bool:
    """Check if request is within rate limit. Returns True if allowed."""
    now = datetime.now(timezone.utc)

    if key not in _auth_rate_limits:
        _auth_rate_limits[key] = []

    # Clean old entries
    cutoff = now - timedelta(seconds=AUTH_RATE_LIMIT_WINDOW)
    _auth_rate_limits[key] = [t for t in _auth_rate_limits[key] if t > cutoff]

    if len(_auth_rate_limits[key]) >= max_requests:
        return False

    _auth_rate_limits[key].append(now)
    return True

def is_safe_redirect(url: str) -> bool:
    """Check if redirect URL is safe (same origin or allowed host)."""
    if not url:
        return False

    # Allow relative URLs starting with /
    if url.startswith('/') and not url.startswith('//'):
        return True

    try:
        parsed = urlparse(url)
        # Check if host is in allowed list
        return parsed.netloc in ALLOWED_REDIRECT_HOSTS or not parsed.netloc
    except Exception:
        return False

def get_safe_redirect(url: str, default: str = "/account") -> str:
    """Get safe redirect URL or return default."""
    if is_safe_redirect(url):
        return url
    return default

def set_auth_cookie(response: Response, token: str):
    """Set secure HttpOnly auth cookie."""
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )

def clear_auth_cookie(response: Response):
    """Clear auth cookie."""
    response.delete_cookie(key=COOKIE_NAME, path="/")


# ============ Database Helpers ============

def _convert_postgres_to_sqlite_query(query: str) -> str:
    """Convert PostgreSQL parameterized query to SQLite format.

    Uses regex to only replace %s that are not inside string literals.
    """
    # Simple approach: count placeholders and replace them
    # This is safe because we're only replacing the placeholder syntax
    result = []
    i = 0
    in_string = False
    string_char = None

    while i < len(query):
        char = query[i]

        # Track string literals
        if char in ("'", '"') and (i == 0 or query[i-1] != '\\'):
            if not in_string:
                in_string = True
                string_char = char
            elif char == string_char:
                in_string = False
                string_char = None

        # Replace %s only outside strings
        if not in_string and query[i:i+2] == '%s':
            result.append('?')
            i += 2
            continue

        result.append(char)
        i += 1

    return ''.join(result)

def db_execute(query: str, params: tuple = (), fetch_one: bool = False, fetch_all: bool = False):
    """Execute database query with proper driver handling."""
    with get_db() as conn:
        if USE_POSTGRES:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                if fetch_one:
                    result = cur.fetchone()
                    return dict(result) if result else None
                if fetch_all:
                    return [dict(row) for row in cur.fetchall()]
                # For INSERT RETURNING
                try:
                    result = cur.fetchone()
                    return dict(result) if result else None
                except Exception:
                    return None
        else:
            sqlite_query = _convert_postgres_to_sqlite_query(query)
            cur = conn.execute(sqlite_query, params)
            if fetch_one:
                result = cur.fetchone()
                return dict(result) if result else None
            if fetch_all:
                return [dict(row) for row in cur.fetchall()]
            return None


# ============ Endpoints ============

@router.post("/signup", status_code=201)
async def signup(req: SignupRequest, request: Request):
    """Create new account with email/password"""

    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"signup:{client_ip}", AUTH_RATE_LIMIT_MAX_SIGNUP):
        raise HTTPException(429, "Too many signup attempts. Please try again later.")

    # Validate password strength
    is_valid, error_msg = validate_password_strength(req.password)
    if not is_valid:
        raise HTTPException(400, error_msg)

    email = req.email.lower().strip()

    # Check if email exists
    existing = db_execute(
        "SELECT id FROM users WHERE email = %s",
        (email,),
        fetch_one=True
    )

    # Prevent email enumeration: always return success message
    # but only create account if email doesn't exist
    if existing:
        # Log for monitoring but don't reveal to user
        logger.info(f"Signup attempt for existing email: {email[:3]}***")
        # Return same response to prevent enumeration
        return {"message": "If this email is not registered, a verification link has been sent."}

    # Create user
    password_hash = hash_password(req.password)

    with get_db() as conn:
        if USE_POSTGRES:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """INSERT INTO users (email, password_hash, email_verified, auth_provider, created_at)
                       VALUES (%s, %s, FALSE, 'email', NOW()) RETURNING id, email""",
                    (email, password_hash)
                )
                user = dict(cur.fetchone())

                # Create verification token
                token = generate_token()
                cur.execute(
                    """INSERT INTO email_verification_tokens (user_id, token, expires_at)
                       VALUES (%s, %s, NOW() + INTERVAL '24 hours')""",
                    (user["id"], token)
                )
        else:
            conn.execute(
                """INSERT INTO users (email, password_hash, email_verified, auth_provider, created_at)
                   VALUES (?, ?, 0, 'email', datetime('now'))""",
                (email, password_hash)
            )
            user = dict(conn.execute("SELECT id, email FROM users WHERE email = ?", (email,)).fetchone())

            token = generate_token()
            conn.execute(
                """INSERT INTO email_verification_tokens (user_id, token, expires_at)
                   VALUES (?, ?, datetime('now', '+24 hours'))""",
                (user["id"], token)
            )

    # Send verification email
    try:
        await send_verification_email(email, token)
    except Exception as e:
        logger.error(f"Failed to send verification email: {e}")

    return {"message": "If this email is not registered, a verification link has been sent."}


@router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response):
    """Authenticate with email/password"""

    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"login:{client_ip}", AUTH_RATE_LIMIT_MAX_LOGIN):
        raise HTTPException(429, "Too many login attempts. Please try again later.")

    email = req.email.lower().strip()

    user = db_execute(
        "SELECT id, email, password_hash, email_verified, auth_provider, plan FROM users WHERE email = %s",
        (email,),
        fetch_one=True
    )

    if not user:
        raise HTTPException(401, "Invalid email or password")

    if not user.get("password_hash"):
        provider = user.get("auth_provider") or "OAuth"
        raise HTTPException(401, f"This account uses {provider} sign-in")

    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    if not user.get("email_verified"):
        raise HTTPException(403, detail="Please verify your email first")

    token = create_jwt(user["id"], user["email"], user.get("plan", "free"))

    # Set HttpOnly cookie for security
    set_auth_cookie(response, token)

    return {
        "token": token,  # Also return token for backwards compatibility
        "user": {
            "id": user["id"],
            "email": user["email"],
            "email_verified": user.get("email_verified", False)
        }
    }


@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    """Refresh an existing backend JWT. Accepts a valid (non-expired) token
    and returns a fresh one. This provides a non-Firebase refresh path."""
    token = None

    # Try Authorization header first
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

    # Fall back to cookie
    if not token:
        token = request.cookies.get(COOKIE_NAME)

    if not token:
        raise HTTPException(401, "No token provided")

    payload = verify_jwt(token)
    if not payload:
        # Log the specific reason for rejection to aid debugging
        try:
            jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.ExpiredSignatureError:
            logger.info("Token refresh failed: token expired")
            raise HTTPException(401, "Token expired")
        except jwt.InvalidSignatureError:
            logger.warning("Token refresh failed: invalid signature (JWT_SECRET may have changed)")
            raise HTTPException(401, "Invalid token signature")
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token refresh failed: {type(e).__name__}")
        raise HTTPException(401, "Invalid or expired token")

    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id or not email:
        raise HTTPException(401, "Invalid token payload")

    # Verify user still exists
    user = db_execute(
        "SELECT id, email, plan FROM users WHERE id = %s",
        (user_id,),
        fetch_one=True
    )
    if not user:
        raise HTTPException(401, "User not found")

    # Issue a fresh token
    new_token = create_jwt(user["id"], user["email"], user.get("plan", "free"))
    set_auth_cookie(response, new_token)

    return {
        "token": new_token,
        "user": {
            "id": user["id"],
            "email": user["email"],
        }
    }


@router.post("/logout")
async def logout(response: Response):
    """Log out and clear auth cookie"""
    clear_auth_cookie(response)
    return {"message": "Logged out successfully"}


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, request: Request):
    """Request password reset email"""

    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"forgot:{client_ip}", AUTH_RATE_LIMIT_MAX_LOGIN):
        raise HTTPException(429, "Too many requests. Please try again later.")

    email = req.email.lower().strip()
    user = db_execute("SELECT id, email FROM users WHERE email = %s", (email,), fetch_one=True)

    if user:
        token = generate_token()

        with get_db() as conn:
            if USE_POSTGRES:
                with conn.cursor() as cur:
                    cur.execute("UPDATE password_reset_tokens SET used = TRUE WHERE user_id = %s", (user["id"],))
                    cur.execute(
                        """INSERT INTO password_reset_tokens (user_id, token, expires_at)
                           VALUES (%s, %s, NOW() + INTERVAL '1 hour')""",
                        (user["id"], token)
                    )
            else:
                conn.execute("UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?", (user["id"],))
                conn.execute(
                    """INSERT INTO password_reset_tokens (user_id, token, expires_at)
                       VALUES (?, ?, datetime('now', '+1 hour'))""",
                    (user["id"], token)
                )

        try:
            await send_password_reset_email(email, token)
        except Exception as e:
            logger.error(f"Failed to send reset email: {e}")

    return {"message": "If an account exists with that email, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, request: Request):
    """Reset password using token"""

    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"reset:{client_ip}", AUTH_RATE_LIMIT_MAX_LOGIN):
        raise HTTPException(429, "Too many requests. Please try again later.")

    # Validate password strength
    is_valid, error_msg = validate_password_strength(req.password)
    if not is_valid:
        raise HTTPException(400, error_msg)

    now = datetime.now(timezone.utc)

    with get_db() as conn:
        if USE_POSTGRES:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """SELECT t.id, t.user_id, t.expires_at, t.used, u.email
                       FROM password_reset_tokens t
                       JOIN users u ON u.id = t.user_id
                       WHERE t.token = %s""",
                    (req.token,)
                )
                token_row = cur.fetchone()

                if not token_row:
                    raise HTTPException(400, "Invalid or expired reset link")

                token_row = dict(token_row)

                if token_row["used"]:
                    raise HTTPException(400, "This reset link has already been used")

                # Handle timezone-aware comparison
                expires_at = token_row["expires_at"]
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if expires_at < now:
                    raise HTTPException(400, "This reset link has expired")

                password_hash = hash_password(req.password)
                cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (password_hash, token_row["user_id"]))
                cur.execute("UPDATE password_reset_tokens SET used = TRUE WHERE id = %s", (token_row["id"],))
        else:
            token_row = conn.execute(
                """SELECT t.id, t.user_id, t.expires_at, t.used, u.email
                   FROM password_reset_tokens t
                   JOIN users u ON u.id = t.user_id
                   WHERE t.token = ?""",
                (req.token,)
            ).fetchone()

            if not token_row:
                raise HTTPException(400, "Invalid or expired reset link")

            token_row = dict(token_row)

            if token_row["used"]:
                raise HTTPException(400, "This reset link has already been used")

            expires_at = datetime.fromisoformat(token_row["expires_at"]).replace(tzinfo=timezone.utc)
            if expires_at < now:
                raise HTTPException(400, "This reset link has expired")

            password_hash = hash_password(req.password)
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, token_row["user_id"]))
            conn.execute("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", (token_row["id"],))

    return {"message": "Password updated successfully"}


@router.get("/verify-email")
async def verify_email(token: str):
    """Verify email address via link"""

    now = datetime.now(timezone.utc)

    with get_db() as conn:
        if USE_POSTGRES:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT id, user_id, expires_at FROM email_verification_tokens WHERE token = %s",
                    (token,)
                )
                token_row = cur.fetchone()

                if not token_row:
                    return RedirectResponse(f"{FRONTEND_URL}/login?error=invalid_token")

                expires_at = token_row["expires_at"]
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if expires_at < now:
                    return RedirectResponse(f"{FRONTEND_URL}/login?error=invalid_token")

                cur.execute("UPDATE users SET email_verified = TRUE WHERE id = %s", (token_row["user_id"],))
                cur.execute("DELETE FROM email_verification_tokens WHERE id = %s", (token_row["id"],))
        else:
            token_row = conn.execute(
                "SELECT id, user_id, expires_at FROM email_verification_tokens WHERE token = ?",
                (token,)
            ).fetchone()

            if not token_row:
                return RedirectResponse(f"{FRONTEND_URL}/login?error=invalid_token")

            token_row = dict(token_row)
            expires_at = datetime.fromisoformat(token_row["expires_at"]).replace(tzinfo=timezone.utc)
            if expires_at < now:
                return RedirectResponse(f"{FRONTEND_URL}/login?error=invalid_token")

            conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (token_row["user_id"],))
            conn.execute("DELETE FROM email_verification_tokens WHERE id = ?", (token_row["id"],))

    return RedirectResponse(f"{FRONTEND_URL}/login?verified=true")


# ============ Google OAuth ============

@router.get("/google")
async def google_login():
    """Redirect to Google OAuth"""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(500, "Google OAuth not configured")

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent"
    }
    # Properly URL-encode parameters
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return RedirectResponse(url)


@router.get("/google/callback")
async def google_callback(code: str):
    """Handle Google OAuth callback"""

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code"
            }
        )

        if token_resp.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}/login?error=oauth_failed")

        tokens = token_resp.json()

        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )

        if userinfo_resp.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}/login?error=oauth_failed")

        userinfo = userinfo_resp.json()

    email = userinfo.get("email", "").lower().strip()
    google_id = userinfo.get("id")

    if not email:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=no_email")

    # Find or create user
    user = db_execute("SELECT id, email, auth_provider, plan FROM users WHERE email = %s", (email,), fetch_one=True)

    with get_db() as conn:
        if USE_POSTGRES:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if not user:
                    cur.execute(
                        """INSERT INTO users (email, email_verified, auth_provider, oauth_id, created_at)
                           VALUES (%s, TRUE, 'google', %s, NOW()) RETURNING id, email""",
                        (email, google_id)
                    )
                    user = dict(cur.fetchone())
                else:
                    # Only link OAuth if user registered with Google or has no password
                    # Don't auto-link OAuth to password accounts (security risk)
                    if user.get("auth_provider") == "google" or user.get("auth_provider") is None:
                        cur.execute(
                            "UPDATE users SET oauth_id = %s, email_verified = TRUE WHERE id = %s AND (oauth_id IS NULL OR oauth_id = %s)",
                            (google_id, user["id"], google_id)
                        )
        else:
            if not user:
                conn.execute(
                    """INSERT INTO users (email, email_verified, auth_provider, oauth_id, created_at)
                       VALUES (?, 1, 'google', ?, datetime('now'))""",
                    (email, google_id)
                )
                user = dict(conn.execute("SELECT id, email FROM users WHERE email = ?", (email,)).fetchone())
            else:
                if user.get("auth_provider") == "google" or user.get("auth_provider") is None:
                    conn.execute(
                        "UPDATE users SET oauth_id = ?, email_verified = 1 WHERE id = ? AND (oauth_id IS NULL OR oauth_id = ?)",
                        (google_id, user["id"], google_id)
                    )

    token = create_jwt(user["id"], user["email"], user.get("plan", "free"))

    # Set auth cookie and redirect (cookie is more secure than URL param)
    response = RedirectResponse(f"{FRONTEND_URL}/auth/callback")
    set_auth_cookie(response, token)
    return response


# ============ Apple OAuth ============

# Cache for Apple's public keys
_apple_public_keys_cache: dict = {"keys": None, "fetched_at": None}
APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"


async def get_apple_public_keys() -> list:
    """Fetch and cache Apple's public keys for JWT verification."""
    now = datetime.now(timezone.utc)

    # Return cached keys if less than 1 hour old
    if (_apple_public_keys_cache["keys"] and
        _apple_public_keys_cache["fetched_at"] and
        (now - _apple_public_keys_cache["fetched_at"]).total_seconds() < 3600):
        return _apple_public_keys_cache["keys"]

    async with httpx.AsyncClient() as client:
        resp = await client.get(APPLE_KEYS_URL)
        if resp.status_code != 200:
            raise Exception(f"Failed to fetch Apple public keys: {resp.status_code}")

        keys_data = resp.json()
        _apple_public_keys_cache["keys"] = keys_data.get("keys", [])
        _apple_public_keys_cache["fetched_at"] = now
        return _apple_public_keys_cache["keys"]


def verify_apple_id_token(id_token: str, apple_keys: list) -> dict:
    """Verify Apple ID token signature and return payload."""
    # Get the key ID from token header
    unverified_header = jwt.get_unverified_header(id_token)
    kid = unverified_header.get("kid")

    if not kid:
        raise ValueError("No key ID in token header")

    # Find matching key
    matching_key = None
    for key in apple_keys:
        if key.get("kid") == kid:
            matching_key = key
            break

    if not matching_key:
        raise ValueError(f"No matching public key found for kid: {kid}")

    # Convert JWK to PEM format for PyJWT
    from jwt.algorithms import RSAAlgorithm
    public_key = RSAAlgorithm.from_jwk(matching_key)

    # Verify and decode the token
    payload = jwt.decode(
        id_token,
        public_key,
        algorithms=["RS256"],
        audience=APPLE_CLIENT_ID,
        issuer="https://appleid.apple.com"
    )

    return payload


@router.get("/apple")
async def apple_login():
    """Redirect to Apple Sign In"""
    if not APPLE_CLIENT_ID:
        raise HTTPException(500, "Apple Sign In not configured")

    params = {
        "client_id": APPLE_CLIENT_ID,
        "redirect_uri": f"{API_URL}/auth/apple/callback",
        "response_type": "code",
        "scope": "name email",
        "response_mode": "form_post"
    }
    # Properly URL-encode parameters
    url = "https://appleid.apple.com/auth/authorize?" + urlencode(params)
    return RedirectResponse(url)


@router.post("/apple/callback")
async def apple_callback(request: Request):
    """Handle Apple Sign In callback"""

    form = await request.form()
    code = form.get("code")

    if not code:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=oauth_failed")

    try:
        client_secret = generate_apple_client_secret()

        async with httpx.AsyncClient() as client:
            token_resp = await client.post(
                "https://appleid.apple.com/auth/token",
                data={
                    "code": code,
                    "client_id": APPLE_CLIENT_ID,
                    "client_secret": client_secret,
                    "grant_type": "authorization_code",
                    "redirect_uri": f"{API_URL}/auth/apple/callback"
                }
            )

            if token_resp.status_code != 200:
                logger.error(f"Apple token exchange failed: {token_resp.status_code}")
                return RedirectResponse(f"{FRONTEND_URL}/login?error=oauth_failed")

            tokens = token_resp.json()

        id_token = tokens.get("id_token")
        if not id_token:
            logger.error("No id_token in Apple response")
            return RedirectResponse(f"{FRONTEND_URL}/login?error=oauth_failed")

        # Verify token signature using Apple's public keys
        apple_keys = await get_apple_public_keys()
        payload = verify_apple_id_token(id_token, apple_keys)

        email = payload.get("email", "").lower().strip()
        apple_id = payload.get("sub")

        if not email:
            return RedirectResponse(f"{FRONTEND_URL}/login?error=no_email")

        user = db_execute("SELECT id, email, auth_provider, plan FROM users WHERE email = %s", (email,), fetch_one=True)

        with get_db() as conn:
            if USE_POSTGRES:
                from psycopg2.extras import RealDictCursor
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    if not user:
                        cur.execute(
                            """INSERT INTO users (email, email_verified, auth_provider, oauth_id, created_at)
                               VALUES (%s, TRUE, 'apple', %s, NOW()) RETURNING id, email""",
                            (email, apple_id)
                        )
                        user = dict(cur.fetchone())
                    else:
                        # Only link OAuth if user registered with Apple or has no password
                        if user.get("auth_provider") == "apple" or user.get("auth_provider") is None:
                            cur.execute(
                                "UPDATE users SET oauth_id = %s, email_verified = TRUE WHERE id = %s AND (oauth_id IS NULL OR oauth_id = %s)",
                                (apple_id, user["id"], apple_id)
                            )
            else:
                if not user:
                    conn.execute(
                        """INSERT INTO users (email, email_verified, auth_provider, oauth_id, created_at)
                           VALUES (?, 1, 'apple', ?, datetime('now'))""",
                        (email, apple_id)
                    )
                    user = dict(conn.execute("SELECT id, email FROM users WHERE email = ?", (email,)).fetchone())
                else:
                    if user.get("auth_provider") == "apple" or user.get("auth_provider") is None:
                        conn.execute(
                            "UPDATE users SET oauth_id = ?, email_verified = 1 WHERE id = ? AND (oauth_id IS NULL OR oauth_id = ?)",
                            (apple_id, user["id"], apple_id)
                        )

        token = create_jwt(user["id"], user["email"], user.get("plan", "free"))

        # Set auth cookie and redirect (cookie is more secure than URL param)
        response = RedirectResponse(f"{FRONTEND_URL}/auth/callback")
        set_auth_cookie(response, token)
        return response

    except jwt.InvalidTokenError as e:
        logger.error(f"Apple token verification failed: {e}")
        return RedirectResponse(f"{FRONTEND_URL}/login?error=oauth_failed")
    except Exception as e:
        logger.error(f"Apple auth error: {e}")
        return RedirectResponse(f"{FRONTEND_URL}/login?error=oauth_failed")


def generate_apple_client_secret() -> str:
    """Generate client secret JWT for Apple Sign In"""
    if not APPLE_PRIVATE_KEY:
        raise ValueError("Apple private key not configured")

    now = datetime.now(timezone.utc)
    headers = {"kid": APPLE_KEY_ID, "alg": "ES256"}
    payload = {
        "iss": APPLE_TEAM_ID,
        "iat": now,
        "exp": now + timedelta(days=180),
        "aud": "https://appleid.apple.com",
        "sub": APPLE_CLIENT_ID
    }

    return jwt.encode(payload, APPLE_PRIVATE_KEY, algorithm="ES256", headers=headers)


# ============ Current User Helper ============

def get_current_user_from_token(request: Request) -> Optional[dict]:
    """Get current user from Authorization header or auth cookie"""
    token = None

    # Try Authorization header first
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

    # Fall back to cookie
    if not token:
        token = request.cookies.get(COOKIE_NAME)

    if not token:
        return None

    payload = verify_jwt(token)

    if not payload:
        return None

    return db_execute(
        "SELECT id, email, email_verified, plan FROM users WHERE id = %s",
        (payload["sub"],),
        fetch_one=True
    )


# ============ Firebase Token Exchange ============

_firebase_app = None

def get_firebase_app():
    """Initialize Firebase Admin SDK (lazy)."""
    global _firebase_app
    if _firebase_app:
        return _firebase_app
    
    import base64
    import json
    import firebase_admin
    from firebase_admin import credentials
    
    # Get service account from env
    sa_base64 = os.environ.get("FIREBASE_SERVICE_ACCOUNT_BASE64")
    if not sa_base64:
        raise ValueError("FIREBASE_SERVICE_ACCOUNT_BASE64 not configured")
    
    sa_json = json.loads(base64.b64decode(sa_base64))
    cred = credentials.Certificate(sa_json)
    _firebase_app = firebase_admin.initialize_app(cred)
    return _firebase_app


class FirebaseTokenRequest(BaseModel):
    token: str


@router.post("/firebase/exchange")
async def exchange_firebase_token(req: FirebaseTokenRequest, response: Response):
    """Exchange a Firebase ID token for a backend JWT."""
    from firebase_admin import auth as firebase_auth
    
    try:
        get_firebase_app()
        
        # Verify the Firebase token
        decoded = firebase_auth.verify_id_token(req.token)
        email = decoded.get("email")
        firebase_uid = decoded.get("uid")
        
        if not email:
            raise HTTPException(400, "Firebase token missing email")
        
        email = email.lower().strip()
        
        # Find or create user
        user = db_execute(
            "SELECT id, email, plan FROM users WHERE email = %s",
            (email,),
            fetch_one=True
        )
        
        if not user:
            # Create user (auto-verified since Firebase verified them)
            with get_db() as conn:
                if USE_POSTGRES:
                    from psycopg2.extras import RealDictCursor
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        cur.execute(
                            """INSERT INTO users (email, email_verified, auth_provider, oauth_id, created_at)
                               VALUES (%s, TRUE, 'firebase', %s, NOW()) RETURNING id, email""",
                            (email, firebase_uid)
                        )
                        user = dict(cur.fetchone())
                        user["plan"] = "free"
                else:
                    conn.execute(
                        """INSERT INTO users (email, email_verified, auth_provider, oauth_id, created_at)
                           VALUES (?, 1, 'firebase', ?, datetime('now'))""",
                        (email, firebase_uid)
                    )
                    cur = conn.execute("SELECT id, email FROM users WHERE email = ?", (email,))
                    row = cur.fetchone()
                    user = {"id": row[0], "email": row[1], "plan": "free"}
        
        # Issue backend JWT
        token = create_jwt(user["id"], user["email"], user.get("plan", "free"))
        
        # Set auth cookie
        set_auth_cookie(response, token)
        
        return {
            "token": token,
            "user": {
                "id": user["id"],
                "email": user["email"],
            }
        }
    
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(401, "Invalid Firebase token")
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(401, "Firebase token expired")
    except Exception as e:
        logger.error(f"Firebase token exchange failed: {e}")
        raise HTTPException(500, f"Token exchange failed: {str(e)}")
