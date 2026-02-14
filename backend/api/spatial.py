"""
Spatix Spatial Query API
Foundational spatial indexing and query infrastructure.

POST /api/spatial/intersects  - Find datasets intersecting a bounding box
POST /api/spatial/nearby      - Find datasets near a point
POST /api/spatial/contains    - Find datasets containing a point
GET  /api/spatial/stats       - Spatial index statistics
"""
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/spatial", tags=["spatial"])

# Rate limiting
_spatial_ip_requests: Dict[str, List[datetime]] = {}
SPATIAL_RATE_LIMIT_WINDOW = 60
SPATIAL_RATE_LIMIT_MAX = 60


def check_spatial_rate_limit(ip: str) -> bool:
    now = datetime.now(timezone.utc)
    if ip in _spatial_ip_requests:
        _spatial_ip_requests[ip] = [
            t for t in _spatial_ip_requests[ip]
            if (now - t).total_seconds() < SPATIAL_RATE_LIMIT_WINDOW
        ]
    else:
        _spatial_ip_requests[ip] = []
    if len(_spatial_ip_requests[ip]) >= SPATIAL_RATE_LIMIT_MAX:
        return False
    _spatial_ip_requests[ip].append(now)
    return True


# ==================== MODELS ====================

class BBoxQuery(BaseModel):
    """Bounding box query."""
    west: float = Field(..., ge=-180, le=180, description="Western longitude")
    south: float = Field(..., ge=-90, le=90, description="Southern latitude")
    east: float = Field(..., ge=-180, le=180, description="Eastern longitude")
    north: float = Field(..., ge=-90, le=90, description="Northern latitude")
    category: Optional[str] = Field(default=None, description="Filter by dataset category")
    limit: int = Field(default=50, ge=1, le=200)


class NearbyQuery(BaseModel):
    """Proximity query."""
    lat: float = Field(..., ge=-90, le=90, description="Center latitude")
    lng: float = Field(..., ge=-180, le=180, description="Center longitude")
    radius_km: float = Field(default=50, ge=0.1, le=500, description="Search radius in kilometers")
    category: Optional[str] = Field(default=None, description="Filter by dataset category")
    limit: int = Field(default=50, ge=1, le=200)


class PointQuery(BaseModel):
    """Point containment query."""
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    category: Optional[str] = Field(default=None)
    limit: int = Field(default=50, ge=1, le=200)


class SpatialResult(BaseModel):
    """A dataset matching a spatial query."""
    id: str
    title: str
    description: Optional[str]
    category: Optional[str]
    tags: Optional[str]
    feature_count: int
    geometry_types: Optional[str]
    bbox: Dict[str, float]  # {west, south, east, north}
    distance_km: Optional[float] = None
    reputation_score: float


class SpatialQueryResponse(BaseModel):
    """Response from a spatial query."""
    success: bool
    results: List[SpatialResult]
    total: int
    query_type: str
    query_params: Dict[str, Any]


# ==================== ENDPOINTS ====================

@router.post("/intersects", response_model=SpatialQueryResponse)
async def query_intersects(body: BBoxQuery, request: Request):
    """
    Find datasets whose bounding box intersects the given area.

    This is the core spatial query — find all data that overlaps
    a region of interest. Used for:
    - Map viewport queries ("what data is visible here?")
    - Regional analysis ("what datasets cover this area?")
    - Spatial joins across datasets

    PostGIS upgrade path: will use ST_Intersects on geometry column.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_spatial_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    if body.west > body.east:
        raise HTTPException(status_code=400, detail="west must be <= east")
    if body.south > body.north:
        raise HTTPException(status_code=400, detail="south must be <= north")

    from database import spatial_query_intersects

    raw_results = spatial_query_intersects(
        body.west, body.south, body.east, body.north,
        category=body.category, limit=body.limit
    )

    results = [
        SpatialResult(
            id=r["id"],
            title=r["title"],
            description=r.get("description"),
            category=r.get("category"),
            tags=r.get("tags"),
            feature_count=r.get("feature_count", 0),
            geometry_types=r.get("geometry_types"),
            bbox={
                "west": r.get("bbox_west", 0),
                "south": r.get("bbox_south", 0),
                "east": r.get("bbox_east", 0),
                "north": r.get("bbox_north", 0),
            },
            reputation_score=r.get("reputation_score", 0),
        )
        for r in raw_results
    ]

    return SpatialQueryResponse(
        success=True,
        results=results,
        total=len(results),
        query_type="intersects",
        query_params={
            "bbox": [body.west, body.south, body.east, body.north],
            "category": body.category,
        },
    )


@router.post("/nearby", response_model=SpatialQueryResponse)
async def query_nearby(body: NearbyQuery, request: Request):
    """
    Find datasets near a geographic point.

    Results are sorted by distance from the query point.
    Uses bounding box approximation for speed — PostGIS upgrade
    will use ST_DWithin for precise distance calculations.

    Use cases:
    - "What data is near this location?"
    - Proximity-based recommendations
    - Spatial autocomplete for data discovery
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_spatial_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    from database import spatial_query_nearby

    raw_results = spatial_query_nearby(
        body.lat, body.lng, body.radius_km,
        category=body.category, limit=body.limit
    )

    results = [
        SpatialResult(
            id=r["id"],
            title=r["title"],
            description=r.get("description"),
            category=r.get("category"),
            tags=r.get("tags"),
            feature_count=r.get("feature_count", 0),
            geometry_types=r.get("geometry_types"),
            bbox={
                "west": r.get("bbox_west", 0),
                "south": r.get("bbox_south", 0),
                "east": r.get("bbox_east", 0),
                "north": r.get("bbox_north", 0),
            },
            distance_km=r.get("distance_km"),
            reputation_score=r.get("reputation_score", 0),
        )
        for r in raw_results
    ]

    return SpatialQueryResponse(
        success=True,
        results=results,
        total=len(results),
        query_type="nearby",
        query_params={
            "center": [body.lng, body.lat],
            "radius_km": body.radius_km,
            "category": body.category,
        },
    )


@router.post("/contains", response_model=SpatialQueryResponse)
async def query_contains(body: PointQuery, request: Request):
    """
    Find datasets whose bounding box contains a specific point.

    Simpler than intersects — answers "what datasets cover this exact point?"

    PostGIS upgrade path: will use ST_Contains on geometry column
    for true polygon containment instead of bbox approximation.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_spatial_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    from database import spatial_query_intersects

    # A point is contained if the bbox intersects a zero-area bbox at that point
    raw_results = spatial_query_intersects(
        body.lng, body.lat, body.lng, body.lat,
        category=body.category, limit=body.limit
    )

    results = [
        SpatialResult(
            id=r["id"],
            title=r["title"],
            description=r.get("description"),
            category=r.get("category"),
            tags=r.get("tags"),
            feature_count=r.get("feature_count", 0),
            geometry_types=r.get("geometry_types"),
            bbox={
                "west": r.get("bbox_west", 0),
                "south": r.get("bbox_south", 0),
                "east": r.get("bbox_east", 0),
                "north": r.get("bbox_north", 0),
            },
            reputation_score=r.get("reputation_score", 0),
        )
        for r in raw_results
    ]

    return SpatialQueryResponse(
        success=True,
        results=results,
        total=len(results),
        query_type="contains",
        query_params={
            "point": [body.lng, body.lat],
            "category": body.category,
        },
    )


@router.get("/stats")
async def spatial_stats():
    """
    Spatial index statistics.

    Shows the current state of spatial indexing across the platform.
    Includes dataset coverage, index types, and query capabilities.
    """
    from database import get_dataset_count, get_db, USE_POSTGRES

    total_datasets = get_dataset_count()

    # Count datasets with bbox data
    with get_db() as conn:
        if USE_POSTGRES:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT
                        COUNT(*) as total_indexed,
                        COUNT(DISTINCT category) as categories,
                        COUNT(DISTINCT geometry_types) as geometry_type_variants
                    FROM datasets
                    WHERE public = TRUE
                      AND bbox_west IS NOT NULL
                      AND bbox_south IS NOT NULL
                """)
                stats = dict(cur.fetchone())
        else:
            cur = conn.execute("""
                SELECT
                    COUNT(*) as total_indexed,
                    COUNT(DISTINCT category) as categories,
                    COUNT(DISTINCT geometry_types) as geometry_type_variants
                FROM datasets
                WHERE public = 1
                  AND bbox_west IS NOT NULL
                  AND bbox_south IS NOT NULL
            """)
            stats = dict(cur.fetchone())

    return {
        "total_datasets": total_datasets,
        "spatially_indexed": stats.get("total_indexed", 0),
        "categories": stats.get("categories", 0),
        "geometry_type_variants": stats.get("geometry_type_variants", 0),
        "index_type": "bbox",
        "supported_queries": ["intersects", "nearby", "contains"],
        "postgis_enabled": False,  # Will flip to True when PostGIS is activated
        "upgrade_path": {
            "current": "Bounding box intersection (R-tree via B-tree index)",
            "next": "PostGIS ST_Intersects / ST_DWithin with GiST index",
            "benefit": "True geometry intersection, polygon containment, distance queries",
        },
    }
