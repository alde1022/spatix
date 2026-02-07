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

                    -- Collected emails from save-gated flow
                    CREATE TABLE IF NOT EXISTS collected_emails (
                        id SERIAL PRIMARY KEY,
                        email TEXT NOT NULL,
                        source VARCHAR(50) DEFAULT 'map_save',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE INDEX IF NOT EXISTS idx_collected_emails_email ON collected_emails(email);

                    -- Link maps to emails for anonymous users
                    ALTER TABLE maps ADD COLUMN IF NOT EXISTS creator_email TEXT;
                    CREATE INDEX IF NOT EXISTS idx_maps_creator_email ON maps(creator_email);

                    -- Agent attribution on maps
                    ALTER TABLE maps ADD COLUMN IF NOT EXISTS agent_id TEXT;
                    ALTER TABLE maps ADD COLUMN IF NOT EXISTS agent_name TEXT;
                    ALTER TABLE maps ADD COLUMN IF NOT EXISTS source_dataset_ids TEXT;

                    -- Dataset registry
                    CREATE TABLE IF NOT EXISTS datasets (
                        id VARCHAR(32) PRIMARY KEY,
                        uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        uploader_email TEXT,
                        agent_id TEXT,
                        agent_name TEXT,
                        title VARCHAR(255) NOT NULL,
                        description TEXT,
                        license VARCHAR(100) DEFAULT 'public-domain',
                        category VARCHAR(100),
                        tags TEXT,
                        data JSONB NOT NULL,
                        feature_count INTEGER DEFAULT 0,
                        geometry_types TEXT,
                        bbox_west REAL,
                        bbox_south REAL,
                        bbox_east REAL,
                        bbox_north REAL,
                        file_size_bytes INTEGER DEFAULT 0,
                        query_count INTEGER DEFAULT 0,
                        used_in_maps INTEGER DEFAULT 0,
                        public BOOLEAN DEFAULT TRUE,
                        verified BOOLEAN DEFAULT FALSE,
                        reputation_score REAL DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE INDEX IF NOT EXISTS idx_datasets_category ON datasets(category);
                    CREATE INDEX IF NOT EXISTS idx_datasets_public ON datasets(public);
                    CREATE INDEX IF NOT EXISTS idx_datasets_bbox ON datasets(bbox_west, bbox_south, bbox_east, bbox_north);
                    CREATE INDEX IF NOT EXISTS idx_datasets_reputation ON datasets(reputation_score DESC);

                    -- Contribution tracking
                    CREATE TABLE IF NOT EXISTS contributions (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        user_email TEXT,
                        agent_id TEXT,
                        agent_name TEXT,
                        action VARCHAR(50) NOT NULL,
                        resource_type VARCHAR(50),
                        resource_id VARCHAR(32),
                        points_awarded INTEGER DEFAULT 0,
                        metadata JSONB,
                        ip_address TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE INDEX IF NOT EXISTS idx_contributions_agent ON contributions(agent_id);
                    CREATE INDEX IF NOT EXISTS idx_contributions_action ON contributions(action);
                    CREATE INDEX IF NOT EXISTS idx_contributions_created ON contributions(created_at DESC);

                    -- Points ledger (aggregated scores per entity)
                    CREATE TABLE IF NOT EXISTS points_ledger (
                        id SERIAL PRIMARY KEY,
                        entity_type VARCHAR(20) NOT NULL,
                        entity_id TEXT NOT NULL,
                        entity_email TEXT,
                        total_points INTEGER DEFAULT 0,
                        datasets_uploaded INTEGER DEFAULT 0,
                        maps_created INTEGER DEFAULT 0,
                        data_queries_served INTEGER DEFAULT 0,
                        total_map_views INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(entity_type, entity_id)
                    );

                    CREATE INDEX IF NOT EXISTS idx_points_entity ON points_ledger(entity_type, entity_id);
                    CREATE INDEX IF NOT EXISTS idx_points_total ON points_ledger(total_points DESC);
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

                -- Collected emails from save-gated flow
                CREATE TABLE IF NOT EXISTS collected_emails (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL,
                    source TEXT DEFAULT 'map_save',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_collected_emails_email ON collected_emails(email);
            """)
            # SQLite doesn't support ADD COLUMN IF NOT EXISTS, so try/ignore
            for col in ["creator_email TEXT", "agent_id TEXT", "agent_name TEXT", "source_dataset_ids TEXT"]:
                try:
                    conn.execute(f"ALTER TABLE maps ADD COLUMN {col}")
                except Exception:
                    pass
            try:
                conn.execute("CREATE INDEX IF NOT EXISTS idx_maps_creator_email ON maps(creator_email)")
            except Exception:
                pass

            # Dataset registry
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS datasets (
                    id TEXT PRIMARY KEY,
                    uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    uploader_email TEXT,
                    agent_id TEXT,
                    agent_name TEXT,
                    title TEXT NOT NULL,
                    description TEXT,
                    license TEXT DEFAULT 'public-domain',
                    category TEXT,
                    tags TEXT,
                    data TEXT NOT NULL,
                    feature_count INTEGER DEFAULT 0,
                    geometry_types TEXT,
                    bbox_west REAL,
                    bbox_south REAL,
                    bbox_east REAL,
                    bbox_north REAL,
                    file_size_bytes INTEGER DEFAULT 0,
                    query_count INTEGER DEFAULT 0,
                    used_in_maps INTEGER DEFAULT 0,
                    public INTEGER DEFAULT 1,
                    verified INTEGER DEFAULT 0,
                    reputation_score REAL DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_datasets_category ON datasets(category);
                CREATE INDEX IF NOT EXISTS idx_datasets_public ON datasets(public);
                CREATE INDEX IF NOT EXISTS idx_datasets_reputation ON datasets(reputation_score DESC);

                -- Contribution tracking
                CREATE TABLE IF NOT EXISTS contributions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    user_email TEXT,
                    agent_id TEXT,
                    agent_name TEXT,
                    action TEXT NOT NULL,
                    resource_type TEXT,
                    resource_id TEXT,
                    points_awarded INTEGER DEFAULT 0,
                    metadata TEXT,
                    ip_address TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_contributions_agent ON contributions(agent_id);
                CREATE INDEX IF NOT EXISTS idx_contributions_action ON contributions(action);
                CREATE INDEX IF NOT EXISTS idx_contributions_created ON contributions(created_at DESC);

                -- Points ledger
                CREATE TABLE IF NOT EXISTS points_ledger (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    entity_email TEXT,
                    total_points INTEGER DEFAULT 0,
                    datasets_uploaded INTEGER DEFAULT 0,
                    maps_created INTEGER DEFAULT 0,
                    data_queries_served INTEGER DEFAULT 0,
                    total_map_views INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(entity_type, entity_id)
                );

                CREATE INDEX IF NOT EXISTS idx_points_entity ON points_ledger(entity_type, entity_id);
                CREATE INDEX IF NOT EXISTS idx_points_total ON points_ledger(total_points DESC);
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
               public: bool = True, creator_email: str = None) -> bool:
    """Create a new map in the database."""
    ensure_db_initialized()

    config_str = json.dumps(config) if isinstance(config, dict) else config

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO maps (id, user_id, workspace_id, title, description,
                                     config, delete_token_hash, public, creator_email)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (map_id, user_id, workspace_id, title, description,
                      config_str, delete_token_hash, public, creator_email))
        else:
            conn.execute("""
                INSERT INTO maps (id, user_id, workspace_id, title, description,
                                 config, delete_token_hash, public, creator_email)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (map_id, user_id, workspace_id, title, description,
                  config_str, delete_token_hash, 1 if public else 0, creator_email))
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
            # Use CURRENT_TIMESTAMP for PostgreSQL - remove the placeholder timestamp param
            updates[-1] = "updated_at = CURRENT_TIMESTAMP"
            params.pop(-2)  # Remove the None timestamp, keep map_id at end
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


# ==================== EMAIL COLLECTION ====================

def collect_email(email: str, source: str = "map_save") -> bool:
    """Save a collected email (idempotent - stores each unique email once per source)."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM collected_emails WHERE email = %s AND source = %s",
                    (email, source)
                )
                if not cur.fetchone():
                    cur.execute(
                        "INSERT INTO collected_emails (email, source) VALUES (%s, %s)",
                        (email, source)
                    )
        else:
            cur = conn.execute(
                "SELECT 1 FROM collected_emails WHERE email = ? AND source = ?",
                (email, source)
            )
            if not cur.fetchone():
                conn.execute(
                    "INSERT INTO collected_emails (email, source) VALUES (?, ?)",
                    (email, source)
                )
    return True


def get_maps_by_email(email: str, limit: int = 100, offset: int = 0) -> list:
    """Get all maps created by a given email address."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, title, description, views, public, created_at, updated_at
                    FROM maps WHERE creator_email = %s
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                """, (email, limit, offset))
                rows = cur.fetchall()
        else:
            cur = conn.execute("""
                SELECT id, title, description, views, public, created_at, updated_at
                FROM maps WHERE creator_email = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """, (email, limit, offset))
            rows = cur.fetchall()

    return [dict(row) for row in rows]


# ==================== DATASET REGISTRY ====================

def create_dataset(dataset_id: str, title: str, description: str, license: str,
                   category: str, tags: str, data: dict, feature_count: int,
                   geometry_types: str, bbox_west: float, bbox_south: float,
                   bbox_east: float, bbox_north: float, file_size_bytes: int = 0,
                   uploader_id: int = None, uploader_email: str = None,
                   agent_id: str = None, agent_name: str = None) -> bool:
    """Create a new dataset in the registry."""
    ensure_db_initialized()
    data_str = json.dumps(data) if isinstance(data, dict) else data

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO datasets (id, uploader_id, uploader_email, agent_id, agent_name,
                        title, description, license, category, tags, data,
                        feature_count, geometry_types, bbox_west, bbox_south, bbox_east, bbox_north,
                        file_size_bytes)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (dataset_id, uploader_id, uploader_email, agent_id, agent_name,
                      title, description, license, category, tags, data_str,
                      feature_count, geometry_types, bbox_west, bbox_south, bbox_east, bbox_north,
                      file_size_bytes))
        else:
            conn.execute("""
                INSERT INTO datasets (id, uploader_id, uploader_email, agent_id, agent_name,
                    title, description, license, category, tags, data,
                    feature_count, geometry_types, bbox_west, bbox_south, bbox_east, bbox_north,
                    file_size_bytes)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (dataset_id, uploader_id, uploader_email, agent_id, agent_name,
                  title, description, license, category, tags, data_str,
                  feature_count, geometry_types, bbox_west, bbox_south, bbox_east, bbox_north,
                  file_size_bytes))
    return True


def get_dataset(dataset_id: str) -> dict:
    """Get a dataset by ID."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM datasets WHERE id = %s", (dataset_id,))
                row = cur.fetchone()
        else:
            cur = conn.execute("SELECT * FROM datasets WHERE id = ?", (dataset_id,))
            row = cur.fetchone()

    if not row:
        return None
    result = dict(row)
    if isinstance(result.get('data'), str):
        result['data'] = json.loads(result['data'])
    return result


def dataset_exists(dataset_id: str) -> bool:
    """Check if a dataset ID already exists."""
    ensure_db_initialized()
    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM datasets WHERE id = %s", (dataset_id,))
                return cur.fetchone() is not None
        else:
            cur = conn.execute("SELECT 1 FROM datasets WHERE id = ?", (dataset_id,))
            return cur.fetchone() is not None


def search_datasets(query: str = None, category: str = None,
                    bbox_west: float = None, bbox_south: float = None,
                    bbox_east: float = None, bbox_north: float = None,
                    limit: int = 50, offset: int = 0) -> list:
    """Search public datasets with optional filters."""
    ensure_db_initialized()

    conditions = ["public = " + ("TRUE" if USE_POSTGRES else "1")]
    params = []
    ph = "%s" if USE_POSTGRES else "?"

    if query:
        if USE_POSTGRES:
            conditions.append("(title ILIKE %s OR description ILIKE %s OR tags ILIKE %s)")
        else:
            conditions.append("(title LIKE ? OR description LIKE ? OR tags LIKE ?)")
        like_q = f"%{query}%"
        params.extend([like_q, like_q, like_q])

    if category:
        conditions.append(f"category = {ph}")
        params.append(category)

    # Bounding box intersection: dataset bbox overlaps search bbox
    if all(v is not None for v in [bbox_west, bbox_south, bbox_east, bbox_north]):
        conditions.append(f"bbox_east >= {ph} AND bbox_west <= {ph} AND bbox_north >= {ph} AND bbox_south <= {ph}")
        params.extend([bbox_west, bbox_east, bbox_south, bbox_north])

    where = " AND ".join(conditions)
    params.extend([limit, offset])

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"""
                    SELECT id, title, description, license, category, tags,
                           feature_count, geometry_types, bbox_west, bbox_south, bbox_east, bbox_north,
                           query_count, used_in_maps, verified, reputation_score,
                           uploader_email, agent_name, created_at
                    FROM datasets WHERE {where}
                    ORDER BY reputation_score DESC, query_count DESC
                    LIMIT %s OFFSET %s
                """, params)
                rows = cur.fetchall()
        else:
            cur = conn.execute(f"""
                SELECT id, title, description, license, category, tags,
                       feature_count, geometry_types, bbox_west, bbox_south, bbox_east, bbox_north,
                       query_count, used_in_maps, verified, reputation_score,
                       uploader_email, agent_name, created_at
                FROM datasets WHERE {where}
                ORDER BY reputation_score DESC, query_count DESC
                LIMIT ? OFFSET ?
            """, params)
            rows = cur.fetchall()

    return [dict(row) for row in rows]


def get_dataset_count(category: str = None) -> int:
    """Get total count of public datasets."""
    ensure_db_initialized()
    ph = "%s" if USE_POSTGRES else "?"

    with get_db() as conn:
        if category:
            q = f"SELECT COUNT(*) FROM datasets WHERE public = {'TRUE' if USE_POSTGRES else '1'} AND category = {ph}"
            p = (category,)
        else:
            q = f"SELECT COUNT(*) FROM datasets WHERE public = {'TRUE' if USE_POSTGRES else '1'}"
            p = ()

        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute(q, p)
                return cur.fetchone()[0]
        else:
            cur = conn.execute(q, p)
            return cur.fetchone()[0]


def increment_dataset_query_count(dataset_id: str) -> None:
    """Increment query count for a dataset."""
    ensure_db_initialized()
    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("UPDATE datasets SET query_count = query_count + 1 WHERE id = %s", (dataset_id,))
        else:
            conn.execute("UPDATE datasets SET query_count = query_count + 1 WHERE id = ?", (dataset_id,))


def increment_dataset_used_in_maps(dataset_id: str) -> None:
    """Increment the used_in_maps count for a dataset."""
    ensure_db_initialized()
    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("UPDATE datasets SET used_in_maps = used_in_maps + 1 WHERE id = %s", (dataset_id,))
        else:
            conn.execute("UPDATE datasets SET used_in_maps = used_in_maps + 1 WHERE id = ?", (dataset_id,))


# ==================== CONTRIBUTIONS & POINTS ====================

def record_contribution(action: str, resource_type: str = None, resource_id: str = None,
                        points_awarded: int = 0, user_id: int = None, user_email: str = None,
                        agent_id: str = None, agent_name: str = None,
                        metadata: dict = None, ip_address: str = None) -> int:
    """Record a contribution event and return its ID."""
    ensure_db_initialized()
    meta_str = json.dumps(metadata) if metadata else None

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO contributions (user_id, user_email, agent_id, agent_name,
                        action, resource_type, resource_id, points_awarded, metadata, ip_address)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
                """, (user_id, user_email, agent_id, agent_name,
                      action, resource_type, resource_id, points_awarded, meta_str, ip_address))
                return cur.fetchone()[0]
        else:
            cur = conn.execute("""
                INSERT INTO contributions (user_id, user_email, agent_id, agent_name,
                    action, resource_type, resource_id, points_awarded, metadata, ip_address)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (user_id, user_email, agent_id, agent_name,
                  action, resource_type, resource_id, points_awarded, meta_str, ip_address))
            return cur.lastrowid


def award_points(entity_type: str, entity_id: str, points: int,
                 field: str = None, entity_email: str = None) -> int:
    """Award points to an entity (user or agent). Returns new total.

    entity_type: 'user' or 'agent'
    entity_id: user_id (str) or agent_id
    field: optional counter to increment ('datasets_uploaded', 'maps_created',
           'data_queries_served', 'total_map_views')
    """
    ensure_db_initialized()
    ph = "%s" if USE_POSTGRES else "?"

    with get_db() as conn:
        # Check if entry exists
        if USE_POSTGRES:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"SELECT * FROM points_ledger WHERE entity_type = %s AND entity_id = %s",
                            (entity_type, entity_id))
                row = cur.fetchone()
        else:
            cur = conn.execute("SELECT * FROM points_ledger WHERE entity_type = ? AND entity_id = ?",
                               (entity_type, entity_id))
            row = cur.fetchone()

        if not row:
            # Create entry
            if USE_POSTGRES:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO points_ledger (entity_type, entity_id, entity_email, total_points)
                        VALUES (%s, %s, %s, %s)
                    """, (entity_type, entity_id, entity_email, points))
            else:
                conn.execute("""
                    INSERT INTO points_ledger (entity_type, entity_id, entity_email, total_points)
                    VALUES (?, ?, ?, ?)
                """, (entity_type, entity_id, entity_email, points))
            new_total = points
        else:
            # Update points
            extra_set = ""
            extra_params = []
            if field and field in ('datasets_uploaded', 'maps_created', 'data_queries_served', 'total_map_views'):
                extra_set = f", {field} = {field} + 1"

            if USE_POSTGRES:
                with conn.cursor() as cur:
                    cur.execute(f"""
                        UPDATE points_ledger
                        SET total_points = total_points + %s{extra_set},
                            updated_at = CURRENT_TIMESTAMP
                        WHERE entity_type = %s AND entity_id = %s
                    """, (points, entity_type, entity_id))
            else:
                conn.execute(f"""
                    UPDATE points_ledger
                    SET total_points = total_points + ?{extra_set},
                        updated_at = CURRENT_TIMESTAMP
                    WHERE entity_type = ? AND entity_id = ?
                """, (points, entity_type, entity_id))

            existing = dict(row) if not isinstance(row, dict) else row
            new_total = existing.get('total_points', 0) + points

    return new_total


def get_leaderboard(limit: int = 50, entity_type: str = None) -> list:
    """Get the points leaderboard."""
    ensure_db_initialized()

    condition = ""
    params = []
    if entity_type:
        condition = "WHERE entity_type = " + ("%s" if USE_POSTGRES else "?")
        params.append(entity_type)
    params.extend([limit])

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"""
                    SELECT entity_type, entity_id, entity_email, total_points,
                           datasets_uploaded, maps_created, data_queries_served,
                           total_map_views, created_at
                    FROM points_ledger {condition}
                    ORDER BY total_points DESC
                    LIMIT %s
                """, params)
                rows = cur.fetchall()
        else:
            cur = conn.execute(f"""
                SELECT entity_type, entity_id, entity_email, total_points,
                       datasets_uploaded, maps_created, data_queries_served,
                       total_map_views, created_at
                FROM points_ledger {condition}
                ORDER BY total_points DESC
                LIMIT ?
            """, params)
            rows = cur.fetchall()

    return [dict(row) for row in rows]


def get_points(entity_type: str, entity_id: str) -> dict:
    """Get points for a specific entity."""
    ensure_db_initialized()

    with get_db() as conn:
        if USE_POSTGRES:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM points_ledger WHERE entity_type = %s AND entity_id = %s",
                            (entity_type, entity_id))
                row = cur.fetchone()
        else:
            cur = conn.execute("SELECT * FROM points_ledger WHERE entity_type = ? AND entity_id = ?",
                               (entity_type, entity_id))
            row = cur.fetchone()

    return dict(row) if row else None
