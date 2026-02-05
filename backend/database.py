"""
Spatix Database Module
PostgreSQL for auth and user management, map storage
"""
import os
import json
import logging
from contextlib import contextmanager
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "")

if DATABASE_URL and DATABASE_URL.startswith("postgresql"):
    import psycopg2
    from psycopg2.extras import RealDictCursor
    USE_POSTGRES = True
    logger.info("Using PostgreSQL")
else:
    import sqlite3
    USE_POSTGRES = False
    DB_PATH = os.environ.get("DB_PATH", "/tmp/spatix.db")
    logger.info(f"Using SQLite at {DB_PATH}")

# Track if database has been initialized
_db_initialized = False


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
    """Initialize database tables. Safe to call multiple times."""
    global _db_initialized

    if _db_initialized:
        return

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
                    CREATE INDEX IF NOT EXISTS idx_users_oauth_id ON users(oauth_id);
                    CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);
                    CREATE INDEX IF NOT EXISTS idx_email_verification_token ON email_verification_tokens(token);

                    -- Workspaces for organizing maps
                    CREATE TABLE IF NOT EXISTS workspaces (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        name VARCHAR(255) NOT NULL,
                        description TEXT,
                        is_default BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    -- Maps table for persistent storage
                    CREATE TABLE IF NOT EXISTS maps (
                        id VARCHAR(32) PRIMARY KEY,
                        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
                        title VARCHAR(255) NOT NULL DEFAULT 'Untitled Map',
                        description TEXT,
                        config JSONB NOT NULL,
                        delete_token_hash VARCHAR(64) NOT NULL,
                        views INTEGER DEFAULT 0,
                        public BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id);
                    CREATE INDEX IF NOT EXISTS idx_maps_user ON maps(user_id);
                    CREATE INDEX IF NOT EXISTS idx_maps_workspace ON maps(workspace_id);
                    CREATE INDEX IF NOT EXISTS idx_maps_public ON maps(public);
                    CREATE INDEX IF NOT EXISTS idx_maps_created ON maps(created_at DESC);
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
                CREATE INDEX IF NOT EXISTS idx_users_oauth_id ON users(oauth_id);
                CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);
                CREATE INDEX IF NOT EXISTS idx_email_verification_token ON email_verification_tokens(token);

                -- Workspaces for organizing maps
                CREATE TABLE IF NOT EXISTS workspaces (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    description TEXT,
                    is_default INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                -- Maps table for persistent storage
                CREATE TABLE IF NOT EXISTS maps (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
                    title TEXT NOT NULL DEFAULT 'Untitled Map',
                    description TEXT,
                    config TEXT NOT NULL,
                    delete_token_hash TEXT NOT NULL,
                    views INTEGER DEFAULT 0,
                    public INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id);
                CREATE INDEX IF NOT EXISTS idx_maps_user ON maps(user_id);
                CREATE INDEX IF NOT EXISTS idx_maps_workspace ON maps(workspace_id);
                CREATE INDEX IF NOT EXISTS idx_maps_public ON maps(public);
                CREATE INDEX IF NOT EXISTS idx_maps_created ON maps(created_at);
            """)

    _db_initialized = True
    logger.info("Database initialized successfully")


def ensure_db_initialized():
    """Ensure database is initialized. Call this before using the database."""
    global _db_initialized
    if not _db_initialized:
        try:
            init_db()
        except Exception as e:
            logger.error(f"Database initialization failed: {e}")
            raise


# Lazy initialization - don't initialize on import
# Call ensure_db_initialized() or init_db() explicitly when ready


# ==================== MAP CRUD OPERATIONS ====================

def create_map(map_id: str, title: str, description: str, config: dict,
               delete_token_hash: str, user_id: int = None, workspace_id: int = None,
               public: bool = True) -> bool:
    """Create a new map in the database."""
    ensure_db_initialized()

    config_str = json.dumps(config) if isinstance(config, dict) else config

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO maps (id, user_id, workspace_id, title, description,
                                     config, delete_token_hash, public)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (map_id, user_id, workspace_id, title, description,
                      config_str, delete_token_hash, public))
        else:
            conn.execute("""
                INSERT INTO maps (id, user_id, workspace_id, title, description,
                                 config, delete_token_hash, public)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (map_id, user_id, workspace_id, title, description,
                  config_str, delete_token_hash, 1 if public else 0))
    return True


def get_map(map_id: str) -> dict:
    """Get a map by ID."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM maps WHERE id = %s", (map_id,))
                row = cur.fetchone()
        else:
            cur = conn.execute("SELECT * FROM maps WHERE id = ?", (map_id,))
            row = cur.fetchone()

    if not row:
        return None

    result = dict(row)
    # Parse JSON config
    if isinstance(result.get('config'), str):
        result['config'] = json.loads(result['config'])
    return result


def map_exists(map_id: str) -> bool:
    """Check if a map ID already exists."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM maps WHERE id = %s", (map_id,))
                return cur.fetchone() is not None
        else:
            cur = conn.execute("SELECT 1 FROM maps WHERE id = ?", (map_id,))
            return cur.fetchone() is not None


def increment_map_views(map_id: str) -> None:
    """Increment the view count for a map."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("UPDATE maps SET views = views + 1 WHERE id = %s", (map_id,))
        else:
            conn.execute("UPDATE maps SET views = views + 1 WHERE id = ?", (map_id,))


def delete_map(map_id: str) -> bool:
    """Delete a map by ID."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM maps WHERE id = %s", (map_id,))
                return cur.rowcount > 0
        else:
            cur = conn.execute("DELETE FROM maps WHERE id = ?", (map_id,))
            return cur.rowcount > 0


def update_map(map_id: str, title: str = None, description: str = None,
               config: dict = None, public: bool = None) -> bool:
    """Update map fields."""
    ensure_db_initialized()

    updates = []
    params = []

    if title is not None:
        updates.append("title = %s" if USE_POSTGRES else "title = ?")
        params.append(title)
    if description is not None:
        updates.append("description = %s" if USE_POSTGRES else "description = ?")
        params.append(description)
    if config is not None:
        updates.append("config = %s" if USE_POSTGRES else "config = ?")
        params.append(json.dumps(config) if isinstance(config, dict) else config)
    if public is not None:
        updates.append("public = %s" if USE_POSTGRES else "public = ?")
        params.append(public if USE_POSTGRES else (1 if public else 0))

    if not updates:
        return False

    updates.append("updated_at = %s" if USE_POSTGRES else "updated_at = ?")
    params.append(datetime.now(timezone.utc).isoformat() if not USE_POSTGRES else None)

    params.append(map_id)

    with get_db() as conn:
        if USE_POSTGRES:
            # Use CURRENT_TIMESTAMP for PostgreSQL
            updates[-1] = "updated_at = CURRENT_TIMESTAMP"
            params.pop(-2)  # Remove the timestamp param
            with conn.cursor() as cur:
                cur.execute(f"UPDATE maps SET {', '.join(updates)} WHERE id = %s", params)
                return cur.rowcount > 0
        else:
            cur = conn.execute(f"UPDATE maps SET {', '.join(updates)} WHERE id = ?", params)
            return cur.rowcount > 0


def get_user_maps(user_id: int, limit: int = 50, offset: int = 0) -> list:
    """Get all maps for a user."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, title, description, views, public, created_at, updated_at
                    FROM maps WHERE user_id = %s
                    ORDER BY updated_at DESC
                    LIMIT %s OFFSET %s
                """, (user_id, limit, offset))
                rows = cur.fetchall()
        else:
            cur = conn.execute("""
                SELECT id, title, description, views, public, created_at, updated_at
                FROM maps WHERE user_id = ?
                ORDER BY updated_at DESC
                LIMIT ? OFFSET ?
            """, (user_id, limit, offset))
            rows = cur.fetchall()

    return [dict(row) for row in rows]


def get_user_map_count(user_id: int) -> int:
    """Get total map count for a user."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM maps WHERE user_id = %s", (user_id,))
                return cur.fetchone()[0]
        else:
            cur = conn.execute("SELECT COUNT(*) FROM maps WHERE user_id = ?", (user_id,))
            return cur.fetchone()[0]


# ==================== WORKSPACE OPERATIONS ====================

def create_workspace(user_id: int, name: str, description: str = None,
                     is_default: bool = False) -> int:
    """Create a new workspace."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO workspaces (user_id, name, description, is_default)
                    VALUES (%s, %s, %s, %s) RETURNING id
                """, (user_id, name, description, is_default))
                return cur.fetchone()[0]
        else:
            cur = conn.execute("""
                INSERT INTO workspaces (user_id, name, description, is_default)
                VALUES (?, ?, ?, ?)
            """, (user_id, name, description, 1 if is_default else 0))
            return cur.lastrowid


def get_user_workspaces(user_id: int) -> list:
    """Get all workspaces for a user."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT * FROM workspaces WHERE user_id = %s
                    ORDER BY is_default DESC, name ASC
                """, (user_id,))
                rows = cur.fetchall()
        else:
            cur = conn.execute("""
                SELECT * FROM workspaces WHERE user_id = ?
                ORDER BY is_default DESC, name ASC
            """, (user_id,))
            rows = cur.fetchall()

    return [dict(row) for row in rows]


def create_default_workspace(user_id: int) -> int:
    """Create a default workspace for a new user."""
    return create_workspace(user_id, "My Maps", "Default workspace", is_default=True)
