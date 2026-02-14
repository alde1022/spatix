"""
Spatix Dataset Catalog API
Rich metadata, discovery, and usage tracking for geospatial datasets.

POST   /api/datasets                    Upload new dataset
GET    /api/datasets                    List/filter datasets
GET    /api/datasets/{id}               Get dataset metadata
GET    /api/datasets/{id}/data          Get full GeoJSON data
GET    /api/datasets/{id}/preview       Preview first N features
POST   /api/datasets/search             Keyword search
DELETE /api/datasets/{id}               Delete dataset (creator only)

Backward-compatible aliases:
POST   /api/dataset                     -> POST /api/datasets
GET    /api/dataset/{id}                -> GET /api/datasets/{id}
GET    /api/dataset/{id}/geojson        -> GET /api/datasets/{id}/data
DELETE /api/dataset/{id}                -> DELETE /api/datasets/{id}
"""
from fastapi import APIRouter, HTTPException, Header, Request, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import secrets
import json
import math
import hashlib
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
    record_dataset_usage,
    check_dataset_first_map_usage,
    increment_download_count,
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
    "public-safety",    # Crime, police, fire, emergency
    "custom",
    "other",
]

# Points awarded for dataset actions (v2)
POINTS_DATASET_UPLOAD = 10
POINTS_DATASET_FIRST_USE = 50
POINTS_DATASET_SUBSEQUENT_USE = 1
POINTS_DATASET_DOWNLOAD = 10

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50MB


# ==================== MODELS ====================

class SourceInfo(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None

class LicenseInfo(BaseModel):
    type: str = "public-domain"
    attribution_required: bool = False
    commercial_use: bool = True

class SchemaField(BaseModel):
    name: str
    type: str = "string"
    description: Optional[str] = None

class DatasetCreateRequest(BaseModel):
    """Request to create/upload a dataset."""
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=2000)
    category: Optional[str] = Field(default="other")
    tags: Optional[List[str]] = Field(default=None)
    data: Dict[str, Any] = Field(..., description="GeoJSON FeatureCollection")

    # Source info
    source: Optional[SourceInfo] = None

    # License
    license: Optional[LicenseInfo] = None

    # Coverage
    region: Optional[str] = None

    # Freshness
    data_date: Optional[str] = None
    update_frequency: Optional[str] = None

    # Schema definition
    schema_fields: Optional[List[SchemaField]] = Field(default=None, alias="schema")

    # Agent attribution (for agent uploads)
    agent_id: Optional[str] = Field(default=None)
    agent_name: Optional[str] = Field(default=None)
    # User attribution (for anonymous uploads)
    email: Optional[str] = Field(default=None)

    class Config:
        populate_by_name = True


class DatasetSearchRequest(BaseModel):
    """Request for keyword search."""
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=10, ge=1, le=100)


# ==================== UTILITIES ====================

def generate_dataset_id() -> str:
    """Generate a unique dataset ID."""
    for _ in range(5):
        did = "ds_" + secrets.token_urlsafe(9)
        if not db_dataset_exists(did):
            return did
    return "ds_" + secrets.token_urlsafe(16)


def validate_geojson(data: dict) -> dict:
    """Validate and normalize GeoJSON, return computed metadata."""
    if data.get("type") != "FeatureCollection":
        raise HTTPException(status_code=400, detail="Data must be a GeoJSON FeatureCollection")

    features = data.get("features", [])
    if not features:
        raise HTTPException(status_code=400, detail="FeatureCollection must have at least 1 feature")
    if len(features) > 100_000:
        raise HTTPException(status_code=400, detail="Maximum 100,000 features per dataset")

    # Check file size
    data_size = len(json.dumps(data))
    if data_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Dataset too large ({data_size // (1024*1024)}MB). Maximum is 50MB."
        )

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

    # Calculate completeness: fraction of features with all non-null properties
    total_props = set()
    for f in features:
        for k in (f.get("properties") or {}).keys():
            total_props.add(k)

    if total_props:
        complete_count = 0
        for f in features:
            props = f.get("properties") or {}
            if all(props.get(k) is not None for k in total_props):
                complete_count += 1
        completeness = round(complete_count / len(features), 3)
    else:
        completeness = 1.0

    return {
        "feature_count": len(features),
        "geometry_types": ",".join(sorted(geom_types)),
        "bbox_west": min(lngs),
        "bbox_south": min(lats),
        "bbox_east": max(lngs),
        "bbox_north": max(lats),
        "file_size_bytes": data_size,
        "completeness": completeness,
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


def _infer_schema(data: dict) -> list:
    """Infer schema from GeoJSON feature properties."""
    features = data.get("features", [])
    if not features:
        return []

    # Collect property info from first few features
    prop_info = {}
    sample_size = min(len(features), 20)
    for f in features[:sample_size]:
        for k, v in (f.get("properties") or {}).items():
            if k not in prop_info and v is not None:
                if isinstance(v, bool):
                    prop_info[k] = "boolean"
                elif isinstance(v, int):
                    prop_info[k] = "integer"
                elif isinstance(v, float):
                    prop_info[k] = "number"
                else:
                    prop_info[k] = "string"

    return [{"name": k, "type": t, "description": ""} for k, t in prop_info.items()]


def _format_dataset_metadata(ds: dict) -> dict:
    """Format a dataset row into the rich metadata response format."""
    # Parse tags from comma-separated string to array
    tags_raw = ds.get("tags", "")
    if isinstance(tags_raw, str) and tags_raw:
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
    elif isinstance(tags_raw, list):
        tags = tags_raw
    else:
        tags = []

    # Parse schema_def from JSON string
    schema_def = ds.get("schema_def")
    if isinstance(schema_def, str):
        try:
            schema_def = json.loads(schema_def)
        except (json.JSONDecodeError, TypeError):
            schema_def = None

    bbox = [
        ds.get("bbox_west", 0) or 0,
        ds.get("bbox_south", 0) or 0,
        ds.get("bbox_east", 0) or 0,
        ds.get("bbox_north", 0) or 0,
    ]

    geometry_types_raw = ds.get("geometry_types", "")
    if isinstance(geometry_types_raw, str) and geometry_types_raw:
        geometry_types = [t.strip() for t in geometry_types_raw.split(",")]
    else:
        geometry_types = []

    # Compute usage_count from query_count + used_in_maps
    usage_count = (ds.get("query_count", 0) or 0) + (ds.get("used_in_maps", 0) or 0)

    # Determine creator info (prefer new fields, fall back to legacy)
    # PRIVACY: never expose email addresses in public responses
    creator_type = ds.get("creator_type")
    creator_id = ds.get("creator_id")
    creator_name = ds.get("creator_name")
    if not creator_type:
        if ds.get("agent_id"):
            creator_type = "agent"
            creator_id = ds.get("agent_id")
            creator_name = ds.get("agent_name")
        elif ds.get("uploader_id"):
            creator_type = "user"
            creator_id = str(ds.get("uploader_id"))
        elif ds.get("uploader_email"):
            creator_type = "user"
            # Anonymize email — never expose raw email in public API
            anon_hash = hashlib.md5(ds["uploader_email"].encode()).hexdigest()[:8]
            creator_id = f"user_{anon_hash}"
            if not creator_name:
                creator_name = f"Contributor_{anon_hash[:4].upper()}"
    # Sanitize: if creator_id still looks like an email, anonymize it
    if creator_id and "@" in str(creator_id):
        anon_hash = hashlib.md5(str(creator_id).encode()).hexdigest()[:8]
        creator_id = f"user_{anon_hash}"
        if not creator_name:
            creator_name = f"Contributor_{anon_hash[:4].upper()}"

    return {
        "id": ds["id"],
        "title": ds["title"],
        "description": ds.get("description", ""),
        "category": ds.get("category", "other"),
        "tags": tags,

        "source": {
            "name": ds.get("source_name") or "",
            "url": ds.get("source_url") or "",
        },

        "license": {
            "type": ds.get("license_type") or ds.get("license", "public-domain"),
            "attribution_required": bool(ds.get("attribution_required", False)),
            "commercial_use": bool(ds.get("commercial_use", True)),
        },

        "coverage": {
            "bbox": bbox,
            "region": ds.get("region") or "",
        },

        "freshness": {
            "data_date": ds.get("data_date") or "",
            "update_frequency": ds.get("update_frequency") or "",
        },

        "schema": schema_def or [],

        "stats": {
            "feature_count": ds.get("feature_count", 0),
            "file_size_bytes": ds.get("file_size_bytes", 0),
            "geometry_types": geometry_types,
            "completeness": ds.get("completeness") or 0,
        },

        "creator": {
            "type": creator_type or "",
            "id": creator_id or "",
            "name": creator_name or "",
        },

        "usage": {
            "usage_count": usage_count,
            "download_count": ds.get("download_count", 0) or 0,
            "maps_using": ds.get("used_in_maps", 0) or 0,
        },

        "created_at": str(ds.get("created_at", "")),
        "updated_at": str(ds.get("updated_at", "")),
    }


# ==================== ENDPOINTS ====================

@router.post("/datasets")
async def create_dataset(
    body: DatasetCreateRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Upload a new geospatial dataset with rich metadata.

    Datasets become available for other agents and users to compose into maps.
    Uploaders earn points based on how often their data is used.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_dataset_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 20 datasets per hour.")

    # Validate category
    if body.category and body.category not in DATASET_CATEGORIES:
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

    # Process tags
    tags_str = ""
    if body.tags:
        tags_str = ",".join(body.tags)

    # Process source info
    source_name = body.source.name if body.source else None
    source_url = body.source.url if body.source else None

    # Process license info
    license_info = body.license or LicenseInfo()
    license_type = license_info.type
    attribution_required = license_info.attribution_required
    commercial_use = license_info.commercial_use

    # Process schema — use provided or infer from data
    schema_def = None
    if body.schema_fields:
        schema_def = [sf.model_dump() for sf in body.schema_fields]
    else:
        schema_def = _infer_schema(body.data)

    # Determine creator info
    # TRUST BOUNDARY: agent_id is self-reported and unverified in Phase 1.
    # We store it for attribution but only award points to authenticated users.
    # Full agent verification (API keys / OAuth) is deferred to Phase 3.
    creator_type = "agent" if body.agent_id else "user"
    creator_id = body.agent_id or (str(user_id) if user_id else (user_email or "anonymous"))
    creator_name = body.agent_name or ""

    dataset_id = generate_dataset_id()

    db_create_dataset(
        dataset_id=dataset_id,
        title=body.title,
        description=body.description,
        license=license_type,
        category=body.category,
        tags=tags_str,
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
        source_name=source_name,
        source_url=source_url,
        license_type=license_type,
        attribution_required=attribution_required,
        commercial_use=commercial_use,
        region=body.region,
        data_date=body.data_date,
        update_frequency=body.update_frequency,
        schema_def=schema_def,
        completeness=meta["completeness"],
        creator_type=creator_type,
        creator_id=creator_id,
        creator_name=creator_name,
    )

    # Award points only to verified identities:
    # - Authenticated users (have valid JWT with user_id)
    # - Unverified agent_id claims do NOT earn points (prevents impersonation/farming)
    # Full agent auth (API keys) deferred to Phase 3
    pts = 0
    if user_id:
        # Authenticated user — award points
        entity_type = "user"
        entity_id = str(user_id)
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
    else:
        # Unauthenticated upload — record contribution for tracking but no points
        record_contribution(
            action="dataset_upload",
            resource_type="dataset",
            resource_id=dataset_id,
            points_awarded=0,
            agent_id=body.agent_id,
            agent_name=body.agent_name,
            user_email=user_email,
            metadata={"feature_count": meta["feature_count"], "category": body.category,
                       "no_points_reason": "unauthenticated"},
            ip_address=request.client.host if request.client else None,
        )

    logger.info(f"Dataset created: {dataset_id} ({meta['feature_count']} features) by {creator_type}:{creator_id}")

    return {
        "id": dataset_id,
        "title": body.title,
        "url": f"/api/datasets/{dataset_id}",
    }


# Backward-compat alias
@router.post("/dataset")
async def create_dataset_compat(
    body: DatasetCreateRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Backward-compatible alias for POST /api/datasets."""
    return await create_dataset(body, request, authorization)


@router.get("/datasets")
async def list_datasets(
    category: Optional[str] = None,
    tags: Optional[str] = None,
    region: Optional[str] = None,
    license: Optional[str] = None,
    min_usage: Optional[int] = None,
    sort: Optional[str] = Query(default="usage", pattern="^(usage|freshness|title)$"),
    order: Optional[str] = Query(default="desc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    # Legacy compat
    q: Optional[str] = None,
    bbox: Optional[str] = None,
    offset: Optional[int] = None,
):
    """List datasets with filters, sorting, and pagination.

    Filterable by category, tags, region, license, and minimum usage.
    """
    # Handle legacy offset param
    actual_offset = offset if offset is not None else (page - 1) * limit

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
        offset=actual_offset,
    )

    total = get_dataset_count(category=category)
    pages = max(1, math.ceil(total / limit)) if total > 0 else 1

    items = []
    for ds in datasets:
        items.append(_format_dataset_metadata(ds))

    return {
        "datasets": items,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": pages,
        },
    }


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
        items.append(_format_dataset_metadata(ds))

    return {"datasets": items, "total": len(items)}


@router.get("/datasets/categories")
async def list_categories():
    """List available dataset categories."""
    return {"categories": DATASET_CATEGORIES}


@router.post("/datasets/search")
async def search_datasets(body: DatasetSearchRequest):
    """Search datasets by keyword.

    Searches in title, description, and tags.
    """
    datasets = db_search_datasets(
        query=body.query,
        limit=body.limit,
        offset=0,
    )

    items = []
    for ds in datasets:
        items.append(_format_dataset_metadata(ds))

    return {"datasets": items}


@router.get("/datasets/{dataset_id}")
async def get_dataset(dataset_id: str):
    """Get dataset metadata (without full GeoJSON data)."""
    ds = db_get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Remove full data from metadata response
    ds.pop("data", None)
    return _format_dataset_metadata(ds)


# Backward-compat alias
@router.get("/dataset/{dataset_id}")
async def get_dataset_compat(dataset_id: str):
    """Backward-compatible alias for GET /api/datasets/{id}."""
    return await get_dataset(dataset_id)


@router.get("/datasets/{dataset_id}/data")
async def get_dataset_data(
    dataset_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Get the full GeoJSON data for a dataset.

    Download access is public. Points are only awarded to the dataset creator
    when the requester is authenticated (to prevent anonymous point farming).
    """
    ds = db_get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Always track download stats (counters only, no points)
    increment_download_count(dataset_id)
    increment_dataset_query_count(dataset_id)

    try:
        record_dataset_usage(
            dataset_id=dataset_id,
            usage_type="download",
        )
    except Exception as e:
        logger.warning(f"Failed to record dataset usage for {dataset_id}: {e}")

    # Only award points to creator when requester is authenticated
    # This prevents anonymous point farming via repeated downloads
    requester_authenticated = False
    if authorization and authorization.startswith("Bearer "):
        try:
            from routers.auth import verify_jwt
            token = authorization.split(" ")[1]
            payload = verify_jwt(token)
            if payload:
                requester_authenticated = True
        except Exception:
            pass

    if requester_authenticated:
        try:
            uploader = get_dataset_uploader_info(dataset_id)
            if uploader:
                pts = POINTS_DATASET_DOWNLOAD * get_points_multiplier(uploader["entity_type"], uploader["entity_id"])
                record_contribution(
                    action="dataset_download",
                    resource_type="dataset",
                    resource_id=dataset_id,
                    points_awarded=pts,
                    agent_id=uploader["entity_id"] if uploader["entity_type"] == "agent" else None,
                    user_email=uploader.get("entity_email"),
                    ip_address=request.client.host if request.client else None,
                )
                award_points(
                    uploader["entity_type"], uploader["entity_id"], pts,
                    field="data_queries_served", entity_email=uploader.get("entity_email"),
                )
        except Exception as e:
            logger.warning(f"Failed to reward dataset creator for download of {dataset_id}: {e}")

    geojson = ds.get("data", {})
    if isinstance(geojson, str):
        geojson = json.loads(geojson)

    return geojson


# Backward-compat alias
@router.get("/dataset/{dataset_id}/geojson")
async def get_dataset_geojson_compat(
    dataset_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
    bbox: Optional[str] = None,
):
    """Backward-compatible alias for GET /api/datasets/{id}/data with bbox filter."""
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
            payload = verify_jwt(token)
            if payload:
                requester_authenticated = True
        except Exception:
            pass


    try:
        uploader = get_dataset_uploader_info(dataset_id)
        if uploader and requester_authenticated:
            query_pts = 1 * get_points_multiplier(uploader["entity_type"], uploader["entity_id"])
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
    if isinstance(geojson, str):
        geojson = json.loads(geojson)

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
            pass

    return geojson


@router.get("/datasets/{dataset_id}/preview")
async def get_dataset_preview(
    dataset_id: str,
    limit: int = Query(default=5, ge=1, le=100),
):
    """Get a preview of the dataset (first N features).

    Returns a GeoJSON FeatureCollection with a limited number of features.
    """
    ds = db_get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    geojson = ds.get("data", {})
    if isinstance(geojson, str):
        geojson = json.loads(geojson)

    features = geojson.get("features", [])[:limit]

    return {
        "type": "FeatureCollection",
        "features": features,
        "_meta": {
            "total_features": ds.get("feature_count", len(geojson.get("features", []))),
            "preview_count": len(features),
            "dataset_id": dataset_id,
        },
    }


class DatasetUpdateRequest(BaseModel):
    """Request to update a dataset's metadata."""
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[str] = None
    tags: Optional[str] = None


@router.put("/datasets/{dataset_id}")
async def update_dataset(
    dataset_id: str,
    body: DatasetUpdateRequest,
    authorization: Optional[str] = Header(None),
):
    """Update a dataset's metadata. Only the creator can update."""
    ds = db_get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

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

    user_email = payload.get("email")
    if ds.get("uploader_id") != user_id and ds.get("uploader_email") != user_email:
        raise HTTPException(status_code=403, detail="Not authorized to update this dataset")

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


# Backward-compat alias
@router.put("/dataset/{dataset_id}")
async def update_dataset_compat(
    dataset_id: str,
    body: DatasetUpdateRequest,
    authorization: Optional[str] = Header(None),
):
    """Backward-compatible alias for PUT /api/datasets/{id}."""
    return await update_dataset(dataset_id, body, authorization)


@router.delete("/datasets/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    authorization: Optional[str] = Header(None),
):
    """Delete a dataset from the catalog. Only the creator can delete."""
    ds = db_get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

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

    user_email = payload.get("email")
    if ds.get("uploader_id") != user_id and ds.get("uploader_email") != user_email:
        raise HTTPException(status_code=403, detail="Not authorized to delete this dataset")

    db_delete_dataset(dataset_id)
    logger.info(f"Dataset deleted: {dataset_id} by user {user_id}")

    return {"success": True, "message": "Dataset deleted", "id": dataset_id}


# Backward-compat alias
@router.delete("/dataset/{dataset_id}")
async def delete_dataset_compat(
    dataset_id: str,
    authorization: Optional[str] = Header(None),
):
    """Backward-compatible alias for DELETE /api/datasets/{id}."""
    return await delete_dataset(dataset_id, authorization)


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
