"""
Spatix Database Module
PostgreSQL for auth and user management
"""
import os
from contextlib import contextmanager

DATABASE_URL = os.environ.get("DATABASE_URL", "")

if DATABASE_URL and DATABASE_URL.startswith("postgresql"):
    import psycopg2
    from psycopg2.extras import RealDictCursor
    USE_POSTGRES = True
    print(f"✅ Using PostgreSQL")
else:
    import sqlite3
    USE_POSTGRES = False
    DB_PATH = os.environ.get("DB_PATH", "/tmp/spatix.db")
    print(f"⚠️ Using SQLite at {DB_PATH}")


@contextmanager
def get_db():
    """Get database connection."""
    if USE_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


def init_db():
    """Initialize database tables."""
    if USE_POSTGRES:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        email TEXT UNIQUE NOT NULL,
                        password_hash TEXT,
                        email_verified BOOLEAN DEFAULT FALSE,
                        auth_provider VARCHAR(20),
                        oauth_id VARCHAR(255),
                        plan TEXT DEFAULT 'free',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    
                    CREATE TABLE IF NOT EXISTS password_reset_tokens (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        token VARCHAR(64) UNIQUE NOT NULL,
                        expires_at TIMESTAMP NOT NULL,
                        used BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT NOW()
                    );
                    
                    CREATE TABLE IF NOT EXISTS email_verification_tokens (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        token VARCHAR(64) UNIQUE NOT NULL,
                        expires_at TIMESTAMP NOT NULL,
                        created_at TIMESTAMP DEFAULT NOW()
                    );
                    
                    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                    CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);
                    CREATE INDEX IF NOT EXISTS idx_email_verification_token ON email_verification_tokens(token);
                """)
            conn.commit()
    else:
        with get_db() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT,
                    email_verified INTEGER DEFAULT 0,
                    auth_provider TEXT,
                    oauth_id TEXT,
                    plan TEXT DEFAULT 'free',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token TEXT UNIQUE NOT NULL,
                    expires_at TEXT NOT NULL,
                    used INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                
                CREATE TABLE IF NOT EXISTS email_verification_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token TEXT UNIQUE NOT NULL,
                    expires_at TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                
                CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);
                CREATE INDEX IF NOT EXISTS idx_email_verification_token ON email_verification_tokens(token);
            """)


# Initialize on import
try:
    init_db()
    print("✅ Database initialized")
except Exception as e:
    print(f"⚠️ Database init failed (will retry on first use): {e}")
