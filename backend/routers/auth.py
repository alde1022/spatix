"""
Spatix Authentication Router
Handles email/password auth, OAuth, password reset, email verification
Compatible with existing database.py pattern (psycopg2/sqlite sync)
"""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta
import secrets
import bcrypt
import jwt
import os
import httpx

# Import existing database module
from database import get_db, USE_POSTGRES

router = APIRouter(prefix="/auth", tags=["auth"])

# Config
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://spatix.io")
API_URL = os.environ.get("API_URL", "https://spatix-production.up.railway.app")

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

def create_jwt(user_id: int, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ============ Database Helpers ============

def db_execute(query: str, params: tuple = (), fetch_one: bool = False, fetch_all: bool = False):
    """Execute database query with proper driver handling."""
    with get_db() as conn:
        if USE_POSTGRES:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Convert %s to $1, $2 for asyncpg compatibility... wait no, psycopg2 uses %s
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
                except:
                    return None
        else:
            cur = conn.execute(query.replace('%s', '?'), params)
            if fetch_one:
                result = cur.fetchone()
                return dict(result) if result else None
            if fetch_all:
                return [dict(row) for row in cur.fetchall()]
            return None


# ============ Endpoints ============

@router.post("/signup", status_code=201)
async def signup(req: SignupRequest):
    """Create new account with email/password"""
    
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    
    email = req.email.lower()
    
    # Check if email exists
    existing = db_execute(
        "SELECT id FROM users WHERE email = %s", 
        (email,), 
        fetch_one=True
    )
    if existing:
        raise HTTPException(409, "Email already registered")
    
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
        print(f"Failed to send verification email: {e}")
    
    return {"message": "Account created. Please check your email to verify.", "user_id": user["id"]}


@router.post("/login")
async def login(req: LoginRequest):
    """Authenticate with email/password"""
    
    email = req.email.lower()
    
    user = db_execute(
        "SELECT id, email, password_hash, email_verified, auth_provider FROM users WHERE email = %s",
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
    
    token = create_jwt(user["id"], user["email"])
    
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "email_verified": user.get("email_verified", False)
        }
    }


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    """Request password reset email"""
    
    email = req.email.lower()
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
            print(f"Failed to send reset email: {e}")
    
    return {"message": "If an account exists with that email, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    """Reset password using token"""
    
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    
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
                
                if token_row["expires_at"] < datetime.utcnow():
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
            
            expires_at = datetime.fromisoformat(token_row["expires_at"])
            if expires_at < datetime.utcnow():
                raise HTTPException(400, "This reset link has expired")
            
            password_hash = hash_password(req.password)
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, token_row["user_id"]))
            conn.execute("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", (token_row["id"],))
    
    return {"message": "Password updated successfully"}


@router.get("/verify-email")
async def verify_email(token: str):
    """Verify email address via link"""
    
    with get_db() as conn:
        if USE_POSTGRES:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT id, user_id, expires_at FROM email_verification_tokens WHERE token = %s",
                    (token,)
                )
                token_row = cur.fetchone()
                
                if not token_row or token_row["expires_at"] < datetime.utcnow():
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
            expires_at = datetime.fromisoformat(token_row["expires_at"])
            if expires_at < datetime.utcnow():
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
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + "&".join(f"{k}={v}" for k, v in params.items())
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
    
    email = userinfo.get("email", "").lower()
    google_id = userinfo.get("id")
    
    if not email:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=no_email")
    
    # Find or create user
    user = db_execute("SELECT id, email FROM users WHERE email = %s", (email,), fetch_one=True)
    
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
                    cur.execute(
                        "UPDATE users SET oauth_id = %s, email_verified = TRUE WHERE id = %s AND oauth_id IS NULL",
                        (google_id, user["id"])
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
                conn.execute(
                    "UPDATE users SET oauth_id = ?, email_verified = 1 WHERE id = ? AND oauth_id IS NULL",
                    (google_id, user["id"])
                )
    
    token = create_jwt(user["id"], user["email"])
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={token}")


# ============ Apple OAuth ============

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
    url = "https://appleid.apple.com/auth/authorize?" + "&".join(f"{k}={v}" for k, v in params.items())
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
                return RedirectResponse(f"{FRONTEND_URL}/login?error=oauth_failed")
            
            tokens = token_resp.json()
        
        id_token = tokens.get("id_token")
        payload = jwt.decode(id_token, options={"verify_signature": False})
        
        email = payload.get("email", "").lower()
        apple_id = payload.get("sub")
        
        if not email:
            return RedirectResponse(f"{FRONTEND_URL}/login?error=no_email")
        
        user = db_execute("SELECT id, email FROM users WHERE email = %s", (email,), fetch_one=True)
        
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
                if not user:
                    conn.execute(
                        """INSERT INTO users (email, email_verified, auth_provider, oauth_id, created_at)
                           VALUES (?, 1, 'apple', ?, datetime('now'))""",
                        (email, apple_id)
                    )
                    user = dict(conn.execute("SELECT id, email FROM users WHERE email = ?", (email,)).fetchone())
        
        token = create_jwt(user["id"], user["email"])
        return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={token}")
        
    except Exception as e:
        print(f"Apple auth error: {e}")
        return RedirectResponse(f"{FRONTEND_URL}/login?error=oauth_failed")


def generate_apple_client_secret() -> str:
    """Generate client secret JWT for Apple Sign In"""
    if not APPLE_PRIVATE_KEY:
        raise ValueError("Apple private key not configured")
    
    headers = {"kid": APPLE_KEY_ID, "alg": "ES256"}
    payload = {
        "iss": APPLE_TEAM_ID,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(days=180),
        "aud": "https://appleid.apple.com",
        "sub": APPLE_CLIENT_ID
    }
    
    return jwt.encode(payload, APPLE_PRIVATE_KEY, algorithm="ES256", headers=headers)


# ============ Current User Helper ============

def get_current_user_from_token(request: Request) -> Optional[dict]:
    """Get current user from Authorization header"""
    auth_header = request.headers.get("Authorization")
    
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    
    token = auth_header.split(" ")[1]
    payload = verify_jwt(token)
    
    if not payload:
        return None
    
    return db_execute(
        "SELECT id, email, email_verified, plan FROM users WHERE id = %s",
        (payload["sub"],),
        fetch_one=True
    )
