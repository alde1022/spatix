"""
Spatix Dataset Registry API
Public, queryable, composable geospatial datasets.

Agents and users upload datasets. Other agents compose maps from them.
Every query and usage is tracked for the contribution/points system.

POST /api/dataset - Upload a public dataset
GET /api/dataset/{id} - Get dataset metadata
GET /api/dataset/{id}/geojson - Get raw GeoJSON data
GET /api/datasets - Search/list public datasets
GET /api/datasets/categories - List available categories
"""
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
import secrets
import json
import logging

from database import (
    create_dataset as db_create_dataset,
    get_dataset as db_get_dataset,
    dataset_exists as db_dataset_exists,
    search_datasets as db_search_datasets,
    get_dataset_count,
    increment_dataset_query_count,
    update_dataset as db_update_dataset,
    delete_dataset as db_delete_dataset,
    record_contribution,
    award_points,
    get_dataset_uploader_info,
    get_user_datasets as db_get_user_datasets,
)
from api.contributions import get_points_multiplier

from datetime import datetime, timezone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["datasets"])

# Per-IP rate limiting for dataset creation
_dataset_ip_requests: dict = {}
DATASET_RATE_LIMIT_WINDOW = 3600  # 1 hour
DATASET_RATE_LIMIT_MAX = 20  # 20 datasets per hour per IP

def check_dataset_rate_limit(ip: str) -> bool:
    now = datetime.now(timezone.utc)
    if ip in _dataset_ip_requests:
        _dataset_ip_requests[ip] = [
            t for t in _dataset_ip_requests[ip]
            if (now - t).total_seconds() < DATASET_RATE_LIMIT_WINDOW
        ]
    else:
        _dataset_ip_requests[ip] = []
    if len(_dataset_ip_requests[ip]) >= DATASET_RATE_LIMIT_MAX:
        return False
    _dataset_ip_requests[ip].append(now)
    return True

DATASET_CATEGORIES = [
    "boundaries",       # Countries, states, counties, zip codes, districts
    "infrastructure",   # Roads, buildings, utilities, transit
    "environment",      # Parks, water, land use, elevation, climate
    "demographics",     # Census, population, income, education
    "business",         # POIs, stores, offices, commercial
    "transportation",   # Airports, stations, routes, ports
    "health",           # Hospitals, clinics, health metrics
    "education",        # Schools, universities, districts
    "culture",          # Museums, landmarks, historic sites
    "other",
]

# Points awarded for dataset actions
POINTS_DATASET_UPLOAD = 50
POINTS_DATASET_QUERY = 1
POINTS_DATASET_USED_IN_MAP = 5


# ==================== MODELS ====================

class DatasetCreateRequest(BaseModel):
    """Request to create/upload a dataset."""
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=2000)
    license: str = Field(default="public-domain", max_length=100)
    category: str = Field(default="other")
    tags: Optional[str] = Field(default=None, description="Comma-separated tags")
    data: Dict[str, Any] = Field(..., description="GeoJSON FeatureCollection")
    # Agent attribution
    agent_id: Optional[str] = Field(default=None, description="ID of the agent uploading")
    agent_name: Optional[str] = Field(default=None, description="Name of the agent")
    email: Optional[str] = Field(default=None, description="Uploader email")


class DatasetSummary(BaseModel):
    """Dataset summary for list views."""
    id: str
    title: str
    description: str
    license: str
    category: str
    tags: Optional[str]
    feature_count: int
    geometry_types: str
    bbox: List[float]  # [west, south, east, north]
    query_count: int
    used_in_maps: int
    verified: bool
    uploader_email: Optional[str]
    agent_name: Optional[str]
    created_at: str


class DatasetCreateResponse(BaseModel):
    """Response from dataset creation."""
    success: bool
    id: str
    title: str
    feature_count: int
    points_awarded: int


# ==================== UTILITIES ====================

def generate_dataset_id() -> str:
    """Generate a unique dataset ID."""
    for _ in range(5):
        did = "ds_" + secrets.token_urlsafe(9)
        if not db_dataset_exists(did):
            return did
    return "ds_" + secrets.token_urlsafe(16)


def validate_geojson(data: dict) -> dict:
    """Validate and normalize GeoJSON, return metadata."""
    if data.get("type") != "FeatureCollection":
        raise HTTPException(status_code=400, detail="Data must be a GeoJSON FeatureCollection")

    features = data.get("features", [])
    if not features:
        raise HTTPException(status_code=400, detail="FeatureCollection has no features")
    if len(features) > 100_000:
        raise HTTPException(status_code=400, detail="Maximum 100,000 features per dataset")

    geom_types = set()
    lngs, lats = [], []

    for f in features:
        geom = f.get("geometry")
        if not geom or not geom.get("type"):
            continue
        geom_types.add(geom["type"])
        _extract_coords(geom, lngs, lats)

    if not lngs:
        raise HTTPException(status_code=400, detail="No valid coordinates found in features")

    return {
        "feature_count": len(features),
        "geometry_types": ",".join(sorted(geom_types)),
        "bbox_west": min(lngs),
        "bbox_south": min(lats),
        "bbox_east": max(lngs),
        "bbox_north": max(lats),
        "file_size_bytes": len(json.dumps(data)),
    }


def _extract_coords(geom: dict, lngs: list, lats: list):
    """Recursively extract coordinates from a GeoJSON geometry."""
    gt = geom.get("type")
    coords = geom.get("coordinates", [])

    if gt == "Point" and len(coords) >= 2:
        lngs.append(coords[0])
        lats.append(coords[1])
    elif gt in ("LineString", "MultiPoint"):
        for c in coords:
            if len(c) >= 2:
                lngs.append(c[0])
                lats.append(c[1])
    elif gt in ("Polygon", "MultiLineString"):
        for ring in coords:
            for c in ring:
                if len(c) >= 2:
                    lngs.append(c[0])
                    lats.append(c[1])
    elif gt == "MultiPolygon":
        for polygon in coords:
            for ring in polygon:
                for c in ring:
                    if len(c) >= 2:
                        lngs.append(c[0])
                        lats.append(c[1])


# ==================== ENDPOINTS ====================

@router.post("/dataset", response_model=DatasetCreateResponse)
async def create_dataset(
    body: DatasetCreateRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Upload a public geospatial dataset to the registry.

    Datasets become available for other agents and users to compose into maps.
    Uploaders earn points based on how often their data is used.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_dataset_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 20 datasets per hour.")

    # Validate category
    if body.category not in DATASET_CATEGORIES:
        body.category = "other"

    # Validate GeoJSON
    meta = validate_geojson(body.data)

    # Get user if authenticated
    user_id = None
    user_email = body.email
    if authorization and authorization.startswith("Bearer "):
        try:
            from routers.auth import verify_jwt
            token = authorization.split(" ")[1]
            payload = verify_jwt(token)
            user_id = payload.get("sub")
            if not user_email:
                user_email = payload.get("email")
        except Exception:
            pass

    dataset_id = generate_dataset_id()

    db_create_dataset(
        dataset_id=dataset_id,
        title=body.title,
        description=body.description,
        license=body.license,
        category=body.category,
        tags=body.tags or "",
        data=body.data,
        feature_count=meta["feature_count"],
        geometry_types=meta["geometry_types"],
        bbox_west=meta["bbox_west"],
        bbox_south=meta["bbox_south"],
        bbox_east=meta["bbox_east"],
        bbox_north=meta["bbox_north"],
        file_size_bytes=meta["file_size_bytes"],
        uploader_id=user_id,
        uploader_email=user_email,
        agent_id=body.agent_id,
        agent_name=body.agent_name,
    )

    # Always define entity identifiers for logging (safe even when unauth)
    entity_type = "agent" if body.agent_id else "user"
    entity_id = body.agent_id or (str(user_id) if user_id else (user_email or "anonymous"))

    # Only award points to authenticated uploaders (user_id from JWT or verified agent)
    pts = 0
    if user_id or body.agent_id:
        pts = POINTS_DATASET_UPLOAD * get_points_multiplier(entity_type, entity_id)

        record_contribution(
            action="dataset_upload",
            resource_type="dataset",
            resource_id=dataset_id,
            points_awarded=pts,
            user_id=user_id,
            user_email=user_email,
            agent_id=body.agent_id,
            agent_name=body.agent_name,
            metadata={"feature_count": meta["feature_count"], "category": body.category},
            ip_address=request.client.host if request.client else None,
        )

        award_points(entity_type, entity_id, pts,
                     field="datasets_uploaded", entity_email=user_email)

    logger.info(f"Dataset created: {dataset_id} ({meta['feature_count']} features) by {entity_type}:{entity_id}")

    return DatasetCreateResponse(
        success=True,
        id=dataset_id,
        title=body.title,
        feature_count=meta["feature_count"],
        points_awarded=pts,
    )


@router.get("/dataset/{dataset_id}")
async def get_dataset(dataset_id: str):
    """Get dataset metadata (without full data payload)."""
    ds = db_get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Don't return the full data in metadata endpoint
    ds.pop("data", None)
    return ds


class DatasetUpdateRequest(BaseModel):
    """Request to update a dataset's metadata."""
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[str] = None
    tags: Optional[str] = None


@router.put("/dataset/{dataset_id}")
async def update_dataset(
    dataset_id: str,
    body: DatasetUpdateRequest,
    authorization: Optional[str] = Header(None),
):
    """Update a dataset's metadata. Only the uploader can update.

    Requires authentication via Bearer token. The authenticated user must
    be the original uploader of the dataset.
    """
    ds = db_get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Require authentication
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        from routers.auth import verify_jwt
        token = authorization.split(" ")[1]
        payload = verify_jwt(token)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        user_id = payload.get("sub")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Check ownership: uploader_id must match, or uploader_email must match
    user_email = payload.get("email")
    if ds.get("uploader_id") != user_id and ds.get("uploader_email") != user_email:
        raise HTTPException(status_code=403, detail="Not authorized to update this dataset")

    # Validate category if provided
    if body.category and body.category not in DATASET_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {', '.join(DATASET_CATEGORIES)}")

    updated = db_update_dataset(
        dataset_id=dataset_id,
        title=body.title,
        description=body.description,
        category=body.category,
        tags=body.tags,
    )

    if not updated:
        raise HTTPException(status_code=400, detail="No fields to update")

    return {"success": True, "message": "Dataset updated", "id": dataset_id}


@router.delete("/dataset/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    authorization: Optional[str] = Header(None),
):
    """Delete a dataset from the registry. Only the uploader can delete.

    Requires authentication via Bearer token. The authenticated user must
    be the original uploader of the dataset.
    """
    ds = db_get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Require authentication
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        from routers.auth import verify_jwt
        token = authorization.split(" ")[1]
        payload = verify_jwt(token)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        user_id = payload.get("sub")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Check ownership
    user_email = payload.get("email")
    if ds.get("uploader_id") != user_id and ds.get("uploader_email") != user_email:
        raise HTTPException(status_code=403, detail="Not authorized to delete this dataset")

    db_delete_dataset(dataset_id)
    logger.info(f"Dataset deleted: {dataset_id} by user {user_id}")

    return {"success": True, "message": "Dataset deleted", "id": dataset_id}


@router.get("/dataset/{dataset_id}/geojson")
async def get_dataset_geojson(
    dataset_id: str,
    request: Request,
    bbox: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    """Get the GeoJSON data for a dataset. Optionally filter by bounding box.

    bbox format: west,south,east,north (e.g., -122.5,37.7,-122.4,37.8)
    """
    ds = db_get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    increment_dataset_query_count(dataset_id)

    # Only reward dataset uploader when requester is authenticated
    requester_authenticated = False
    if authorization and authorization.startswith("Bearer "):
        try:
            from routers.auth import verify_jwt
            token = authorization.split(" ")[1]
            verify_jwt(token)
            requester_authenticated = True
        except Exception:
            pass

    if requester_authenticated:
        try:
            uploader = get_dataset_uploader_info(dataset_id)
            if uploader:
                query_pts = POINTS_DATASET_QUERY * get_points_multiplier(uploader["entity_type"], uploader["entity_id"])
                record_contribution(
                    action="dataset_query",
                    resource_type="dataset",
                    resource_id=dataset_id,
                    points_awarded=query_pts,
                    agent_id=uploader["entity_id"] if uploader["entity_type"] == "agent" else None,
                    user_email=uploader.get("entity_email"),
                    ip_address=request.client.host if request.client else None,
                )
                award_points(
                    uploader["entity_type"], uploader["entity_id"], query_pts,
                    field="data_queries_served", entity_email=uploader.get("entity_email"),
                )
        except Exception as e:
            logger.warning(f"Failed to reward dataset uploader for query on {dataset_id}: {e}")

    geojson = ds.get("data", {})

    # Filter by bounding box if provided
    if bbox:
        try:
            parts = [float(x) for x in bbox.split(",")]
            if len(parts) == 4:
                w, s, e, n = parts
                filtered_features = []
                for f in geojson.get("features", []):
                    geom = f.get("geometry", {})
                    if _feature_in_bbox(geom, w, s, e, n):
                        filtered_features.append(f)
                geojson = {"type": "FeatureCollection", "features": filtered_features}
        except (ValueError, TypeError):
            pass  # Invalid bbox, return full dataset

    return geojson


@router.get("/datasets")
async def list_datasets(
    q: Optional[str] = None,
    category: Optional[str] = None,
    bbox: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """Search and list public datasets.

    Filterable by text query, category, and bounding box.
    Results sorted by reputation score and query count.
    """
    bbox_parts = None
    if bbox:
        try:
            bbox_parts = [float(x) for x in bbox.split(",")]
            if len(bbox_parts) != 4:
                bbox_parts = None
        except (ValueError, TypeError):
            bbox_parts = None

    datasets = db_search_datasets(
        query=q,
        category=category,
        bbox_west=bbox_parts[0] if bbox_parts else None,
        bbox_south=bbox_parts[1] if bbox_parts else None,
        bbox_east=bbox_parts[2] if bbox_parts else None,
        bbox_north=bbox_parts[3] if bbox_parts else None,
        limit=limit,
        offset=offset,
    )

    total = get_dataset_count(category=category)

    items = []
    for ds in datasets:
        items.append({
            "id": ds["id"],
            "title": ds["title"],
            "description": ds.get("description", ""),
            "license": ds.get("license", "public-domain"),
            "category": ds.get("category", "other"),
            "tags": ds.get("tags", ""),
            "feature_count": ds.get("feature_count", 0),
            "geometry_types": ds.get("geometry_types", ""),
            "bbox": [ds.get("bbox_west", 0), ds.get("bbox_south", 0),
                     ds.get("bbox_east", 0), ds.get("bbox_north", 0)],
            "query_count": ds.get("query_count", 0),
            "used_in_maps": ds.get("used_in_maps", 0),
            "verified": bool(ds.get("verified", False)),
            "agent_name": ds.get("agent_name"),
            "created_at": str(ds.get("created_at", "")),
        })

    return {"datasets": items, "total": total, "limit": limit, "offset": offset}


@router.get("/datasets/me")
async def list_my_datasets(
    authorization: Optional[str] = Header(None),
    limit: int = 50,
    offset: int = 0,
):
    """List datasets uploaded by the authenticated user."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        from routers.auth import verify_jwt
        token = authorization.split(" ")[1]
        payload = verify_jwt(token)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    user_email = payload.get("email")
    datasets = db_get_user_datasets(user_id=user_id, email=user_email, limit=limit, offset=offset)

    items = []
    for ds in datasets:
        items.append({
            "id": ds["id"],
            "title": ds["title"],
            "description": ds.get("description", ""),
            "category": ds.get("category", "other"),
            "tags": ds.get("tags", ""),
            "feature_count": ds.get("feature_count", 0),
            "geometry_types": ds.get("geometry_types", ""),
            "query_count": ds.get("query_count", 0),
            "used_in_maps": ds.get("used_in_maps", 0),
            "verified": bool(ds.get("verified", False)),
            "created_at": str(ds.get("created_at", "")),
        })

    return {"datasets": items, "total": len(items)}


@router.get("/datasets/categories")
async def list_categories():
    """List available dataset categories."""
    return {"categories": DATASET_CATEGORIES}


# ==================== HELPERS ====================

def _feature_in_bbox(geom: dict, w: float, s: float, e: float, n: float) -> bool:
    """Check if any coordinate of a geometry falls within a bounding box."""
    coords = _flat_coords(geom)
    for lng, lat in coords:
        if w <= lng <= e and s <= lat <= n:
            return True
    return False


def _flat_coords(geom: dict) -> list:
    """Extract all [lng, lat] pairs from a geometry."""
    gt = geom.get("type", "")
    coords = geom.get("coordinates", [])
    result = []

    if gt == "Point":
        result.append(coords[:2])
    elif gt in ("LineString", "MultiPoint"):
        result.extend(c[:2] for c in coords)
    elif gt in ("Polygon", "MultiLineString"):
        for ring in coords:
            result.extend(c[:2] for c in ring)
    elif gt == "MultiPolygon":
        for poly in coords:
            for ring in poly:
                result.extend(c[:2] for c in ring)
    return result
