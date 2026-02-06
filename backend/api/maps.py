"""
Spatix AI-Native Map API
The simplest way for AI agents to create maps.

POST /api/map - Dead simple map creation from data
GET /api/map/{id} - Retrieve map data
DELETE /api/map/{id} - Delete a map
"""
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel, model_validator, Field
from typing import Optional, List, Union, Dict, Any, Literal
from datetime import datetime, timezone
import secrets
import json
import re
import hashlib
import logging

# Database imports for persistent storage
from database import (
    create_map as db_create_map,
    get_map as db_get_map,
    map_exists as db_map_exists,
    increment_map_views,
    delete_map as db_delete_map,
    update_map as db_update_map,
    get_user_maps,
    get_user_map_count,
    collect_email,
    get_maps_by_email,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["maps"])

# Rate limiting (in-memory - acceptable for rate limits)
_ip_requests: Dict[str, List[datetime]] = {}
RATE_LIMIT_WINDOW = 3600  # 1 hour
RATE_LIMIT_MAX = 100  # 100 maps per hour for all users

# Maximum retries for ID collision
MAX_ID_COLLISION_RETRIES = 5


# ==================== MODELS ====================

class Marker(BaseModel):
    lat: float
    lng: float
    label: Optional[str] = None
    color: Optional[str] = None


class MapRequest(BaseModel):
    """Request body for map creation - flexible for LLM compatibility."""
    # Primary field
    data: Optional[Union[Dict[str, Any], List, str]] = None
    # Alternative field names LLMs might use
    geojson: Optional[Union[Dict[str, Any], List]] = None
    features: Optional[List[Dict[str, Any]]] = None
    coordinates: Optional[List] = None
    geometry: Optional[Dict[str, Any]] = None
    # Metadata
    title: Optional[str] = None
    description: Optional[str] = None
    style: Literal["auto", "light", "dark", "satellite"] = "auto"
    markers: Optional[List[Marker]] = None
    bounds: Optional[Union[Literal["auto"], List[List[float]]]] = "auto"
    center: Optional[List[float]] = None
    zoom: Optional[int] = None
    # Email for save-gated flow (anonymous users)
    email: Optional[str] = None
    
    model_config = {"extra": "allow"}
    
    @model_validator(mode='before')
    @classmethod
    def normalize_data_field(cls, values):
        """Convert alternate field names to 'data'."""
        if isinstance(values, dict):
            if not values.get('data'):
                if values.get('geojson'):
                    values['data'] = values['geojson']
                elif values.get('features'):
                    values['data'] = {"type": "FeatureCollection", "features": values['features']}
                elif values.get('coordinates'):
                    values['data'] = values['coordinates']
                elif values.get('geometry'):
                    values['data'] = {"type": "Feature", "geometry": values['geometry'], "properties": {}}
        return values
    
    def get_data(self) -> Union[Dict[str, Any], List, str, None]:
        return self.data


class MapResponse(BaseModel):
    """Response from map creation."""
    success: bool
    id: str
    url: str
    embed: str
    preview_url: Optional[str] = None


# ==================== UTILITIES ====================

def check_rate_limit(ip: str, user_id: int = None) -> bool:
    """Rate limiting - same generous limit for everyone."""
    now = datetime.now(timezone.utc)
    
    # Use user_id if authenticated, otherwise IP
    key = f"user_{user_id}" if user_id else ip
    requests_dict = _ip_requests
    
    if key in requests_dict:
        requests_dict[key] = [
            t for t in requests_dict[key]
            if (now - t).total_seconds() < RATE_LIMIT_WINDOW
        ]
    else:
        requests_dict[key] = []

    if len(requests_dict[key]) >= RATE_LIMIT_MAX:
        return False

    requests_dict[key].append(now)
    return True




def detect_and_normalize_data(data: Union[Dict, List, str]) -> Dict[str, Any]:
    """Auto-detect input format and convert to GeoJSON FeatureCollection."""
    
    if isinstance(data, dict):
        return normalize_geojson(data)
    
    if isinstance(data, str):
        return parse_wkt(data)
    
    if isinstance(data, list):
        return parse_coordinates(data)
    
    raise HTTPException(status_code=400, detail="Could not parse data format")


def normalize_geojson(data: Dict) -> Dict[str, Any]:
    """Normalize any GeoJSON to FeatureCollection."""
    
    if data.get("type") == "FeatureCollection":
        return data
    
    if data.get("type") == "Feature":
        return {"type": "FeatureCollection", "features": [data]}
    
    if data.get("type") in ["Point", "LineString", "Polygon", "MultiPoint", 
                            "MultiLineString", "MultiPolygon", "GeometryCollection"]:
        return {
            "type": "FeatureCollection",
            "features": [{"type": "Feature", "properties": {}, "geometry": data}]
        }
    
    raise HTTPException(status_code=400, detail="Invalid GeoJSON structure")


def parse_wkt(wkt: str) -> Dict[str, Any]:
    """Parse WKT string to GeoJSON."""
    wkt = wkt.strip().upper()
    
    point_match = re.match(r'POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)', wkt)
    if point_match:
        lng, lat = float(point_match.group(1)), float(point_match.group(2))
        return {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {},
                "geometry": {"type": "Point", "coordinates": [lng, lat]}
            }]
        }
    
    line_match = re.match(r'LINESTRING\s*\((.*)\)', wkt, re.DOTALL)
    if line_match:
        coords_str = line_match.group(1)
        coords = []
        for pair in coords_str.split(','):
            parts = pair.strip().split()
            if len(parts) >= 2:
                coords.append([float(parts[0]), float(parts[1])])
        return {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {},
                "geometry": {"type": "LineString", "coordinates": coords}
            }]
        }
    
    poly_match = re.match(r'POLYGON\s*\(\((.*)\)\)', wkt, re.DOTALL)
    if poly_match:
        coords_str = poly_match.group(1)
        coords = []
        for pair in coords_str.split(','):
            parts = pair.strip().split()
            if len(parts) >= 2:
                coords.append([float(parts[0]), float(parts[1])])
        return {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {},
                "geometry": {"type": "Polygon", "coordinates": [coords]}
            }]
        }
    
    raise HTTPException(status_code=400, detail=f"Could not parse WKT: {wkt[:100]}")


def parse_coordinates(coords: List) -> Dict[str, Any]:
    """Parse coordinate array(s) to GeoJSON."""
    
    if not coords:
        raise HTTPException(status_code=400, detail="Empty coordinates array")
    
    # Single point: [lng, lat]
    if len(coords) == 2 and isinstance(coords[0], (int, float)):
        return {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {},
                "geometry": {"type": "Point", "coordinates": coords}
            }]
        }
    
    # Array of points: [[lng, lat], ...]
    if isinstance(coords[0], list) and len(coords[0]) == 2 and isinstance(coords[0][0], (int, float)):
        if len(coords) > 2 and coords[0] == coords[-1]:
            return {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "properties": {},
                    "geometry": {"type": "Polygon", "coordinates": [coords]}
                }]
            }
        else:
            return {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "properties": {},
                    "geometry": {"type": "LineString", "coordinates": coords}
                }]
            }
    
    raise HTTPException(status_code=400, detail="Could not interpret coordinate array")


def calculate_bounds(geojson: Dict, markers: Optional[List[Marker]] = None) -> List[List[float]]:
    """Calculate bounds from GeoJSON and markers."""
    coords = []
    
    def extract_coords(geom):
        if not geom:
            return
        geom_type = geom.get("type")
        geom_coords = geom.get("coordinates", [])
        
        if geom_type == "Point":
            coords.append(geom_coords)
        elif geom_type in ["LineString", "MultiPoint"]:
            coords.extend(geom_coords)
        elif geom_type in ["Polygon", "MultiLineString"]:
            for ring in geom_coords:
                coords.extend(ring)
        elif geom_type == "MultiPolygon":
            for polygon in geom_coords:
                for ring in polygon:
                    coords.extend(ring)
    
    for feature in geojson.get("features", []):
        extract_coords(feature.get("geometry"))
    
    if markers:
        for m in markers:
            coords.append([m.lng, m.lat])
    
    if not coords:
        return [[-180, -85], [180, 85]]
    
    lngs = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    
    return [[min(lngs), min(lats)], [max(lngs), max(lats)]]


def auto_style(geojson: Dict) -> Dict[str, Any]:
    """Generate sensible default styles."""
    
    geom_types = set()
    for feature in geojson.get("features", []):
        geom = feature.get("geometry", {})
        if geom:
            geom_types.add(geom.get("type"))
    
    style = {
        "fillColor": "#3b82f6",
        "fillOpacity": 0.3,
        "strokeColor": "#1d4ed8",
        "strokeWidth": 2,
        "strokeOpacity": 0.8,
    }
    
    if geom_types == {"Point"} or geom_types == {"MultiPoint"}:
        style["pointRadius"] = 8
        style["fillOpacity"] = 0.8
    elif "Polygon" in geom_types or "MultiPolygon" in geom_types:
        style["fillOpacity"] = 0.4
    elif "LineString" in geom_types or "MultiLineString" in geom_types:
        style["strokeWidth"] = 3
        style["fillOpacity"] = 0
    
    return style


def generate_map_id() -> str:
    """Generate a short unique map ID with collision checking."""
    for _ in range(MAX_ID_COLLISION_RETRIES):
        # Use 9 bytes (12 chars) for more entropy to reduce collision risk
        map_id = secrets.token_urlsafe(9)
        if not db_map_exists(map_id):
            return map_id
    # If we hit max retries, use a longer ID
    return secrets.token_urlsafe(16)


def generate_delete_token() -> str:
    """Generate a secure delete token for map ownership."""
    return secrets.token_urlsafe(32)


# ==================== ENDPOINTS ====================

class MapCreateResponse(BaseModel):
    """Response from map creation including delete token."""
    success: bool
    id: str
    url: str
    embed: str
    preview_url: Optional[str] = None
    delete_token: str  # Token required for deleting the map


@router.post("/map", response_model=MapCreateResponse)
async def create_map(
    request: Request,
    body: MapRequest,
    authorization: Optional[str] = Header(None)
):
    """
    Create a map from data - the simplest way for AI to make maps.

    Accepts:
    - GeoJSON (FeatureCollection, Feature, or raw Geometry)
    - Coordinate arrays: [[lng, lat], ...] or [lng, lat]
    - WKT strings: "POINT(-122 37)", "POLYGON(...)"

    Returns instant shareable URL and a delete_token for managing the map.
    Authenticated users get their maps saved to their account.
    """
    client_ip = request.client.host if request.client else "unknown"

    # Try to get user from auth token (optional - maps can be created anonymously)
    user_id = None
    if authorization and authorization.startswith("Bearer "):
        try:
            from routers.auth import verify_jwt
            token = authorization.split(" ")[1]
            payload = verify_jwt(token)
            user_id = payload.get("sub")
        except Exception:
            pass  # Anonymous creation is fine

    # Rate limit check
    if not check_rate_limit(client_ip, user_id):
        raise HTTPException(
            status_code=429,
            detail={
                "error": "RATE_LIMIT_EXCEEDED",
                "message": f"Rate limit exceeded. Max {RATE_LIMIT_MAX} maps per hour.",
                "retry_after": 3600
            }
        )

    try:
        geojson = detect_and_normalize_data(body.get_data())

        bounds = body.bounds
        if bounds == "auto" or bounds is None:
            bounds = calculate_bounds(geojson, body.markers)

        map_id = generate_map_id()
        delete_token = generate_delete_token()

        map_config = {
            "geojson": geojson,
            "style": auto_style(geojson),
            "mapStyle": body.style if body.style != "auto" else "light",
            "bounds": bounds,
            "center": body.center,
            "zoom": body.zoom,
            "markers": [m.model_dump() for m in body.markers] if body.markers else [],
        }

        # Hash the delete token for storage (don't store the raw token)
        delete_token_hash = hashlib.sha256(delete_token.encode()).hexdigest()

        # Collect email if provided (for anonymous save-gated flow)
        creator_email = None
        if body.email:
            cleaned = body.email.strip().lower()
            if re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', cleaned):
                creator_email = cleaned
                collect_email(creator_email, source="map_save")

        # Save to database (persistent storage)
        db_create_map(
            map_id=map_id,
            title=body.title or "Untitled Map",
            description=body.description or "",
            config=map_config,
            delete_token_hash=delete_token_hash,
            user_id=user_id,  # Links to user account if authenticated
            public=True,
            creator_email=creator_email,
        )

        base_url = "https://spatix.io"
        map_url = f"{base_url}/m/{map_id}"

        return MapCreateResponse(
            success=True,
            id=map_id,
            url=map_url,
            embed=f'<iframe src="{map_url}?embed=1" width="600" height="400" frameborder="0"></iframe>',
            preview_url=f"{base_url}/api/map/{map_id}/preview.png",
            delete_token=delete_token  # Return token to client for deletion
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create map: {e}")
        raise HTTPException(status_code=400, detail="Failed to create map. Please check your data format.")


@router.get("/map/{map_id}")
async def get_map(map_id: str):
    """Get map data by ID."""
    map_data = db_get_map(map_id)
    if not map_data:
        raise HTTPException(status_code=404, detail="Map not found")

    # Increment views asynchronously
    increment_map_views(map_id)

    return {
        "id": map_data["id"],
        "title": map_data["title"],
        "description": map_data["description"],
        "config": map_data["config"],
        "created_at": map_data["created_at"],
        "views": map_data["views"] + 1  # Include current view
    }


@router.delete("/map/{map_id}")
async def delete_map(
    map_id: str,
    x_delete_token: Optional[str] = Header(None, alias="X-Delete-Token"),
    delete_token: Optional[str] = None,  # Also accept as query param for convenience
    authorization: Optional[str] = Header(None)
):
    """Delete a map using the delete token provided at creation.

    Pass the delete_token either as:
    - X-Delete-Token header (recommended)
    - delete_token query parameter

    Authenticated users can also delete their own maps without a token.
    """
    map_data = db_get_map(map_id)
    if not map_data:
        raise HTTPException(status_code=404, detail="Map not found")

    # Check if user owns the map (authenticated deletion)
    user_id = None
    if authorization and authorization.startswith("Bearer "):
        try:
            from routers.auth import verify_jwt
            token = authorization.split(" ")[1]
            payload = verify_jwt(token)
            user_id = payload.get("sub")
        except Exception:
            pass

    # Allow deletion if user owns the map
    if user_id and map_data.get("user_id") == user_id:
        db_delete_map(map_id)
        return {"success": True, "message": "Map deleted"}

    # Otherwise require delete token
    token = x_delete_token or delete_token
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Delete token required. Provide X-Delete-Token header or delete_token query parameter."
        )

    # Verify the token
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    stored_hash = map_data.get("delete_token_hash")

    if not stored_hash or token_hash != stored_hash:
        raise HTTPException(status_code=403, detail="Invalid delete token")

    db_delete_map(map_id)
    return {"success": True, "message": "Map deleted"}


@router.get("/map/schema")
async def get_schema():
    """OpenAPI-compatible schema for AI function calling."""
    return {
        "name": "create_map",
        "description": "Create an interactive map from geographic data. Returns a shareable URL.",
        "parameters": {
            "type": "object",
            "properties": {
                "data": {
                    "description": "Geographic data: GeoJSON object, coordinate array [[lng,lat],...], or WKT string",
                    "oneOf": [
                        {"type": "object", "description": "GeoJSON"},
                        {"type": "array", "description": "Coordinates"},
                        {"type": "string", "description": "WKT"}
                    ]
                },
                "title": {"type": "string", "description": "Map title"},
                "description": {"type": "string", "description": "Map description"},
                "style": {
                    "type": "string",
                    "enum": ["auto", "light", "dark", "satellite"],
                    "description": "Base map style"
                },
                "markers": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "lat": {"type": "number"},
                            "lng": {"type": "number"},
                            "label": {"type": "string"}
                        },
                        "required": ["lat", "lng"]
                    },
                    "description": "Array of markers to add"
                }
            },
            "required": ["data"]
        }
    }


# ==================== USER MAP MANAGEMENT ====================

class MapUpdateRequest(BaseModel):
    """Request body for updating a map."""
    title: Optional[str] = None
    description: Optional[str] = None
    public: Optional[bool] = None


class UserMapListItem(BaseModel):
    """Summary of a map for list views."""
    id: str
    title: str
    description: Optional[str]
    views: int
    public: bool
    created_at: str
    updated_at: str
    url: str


class UserMapsResponse(BaseModel):
    """Response for user's maps list."""
    maps: List[UserMapListItem]
    total: int
    limit: int
    offset: int


def require_auth(authorization: Optional[str]) -> dict:
    """Require authentication and return user payload."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    from routers.auth import verify_jwt
    token = authorization.split(" ")[1]
    payload = verify_jwt(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return payload


@router.get("/maps/me", response_model=UserMapsResponse)
async def list_my_maps(
    authorization: str = Header(...),
    limit: int = 50,
    offset: int = 0
):
    """List all maps owned by the authenticated user."""
    payload = require_auth(authorization)
    user_id = payload.get("sub")

    maps = get_user_maps(user_id, limit=limit, offset=offset)
    total = get_user_map_count(user_id)

    base_url = "https://spatix.io"
    map_items = [
        UserMapListItem(
            id=m["id"],
            title=m["title"],
            description=m.get("description"),
            views=m["views"],
            public=bool(m["public"]),
            created_at=str(m["created_at"]),
            updated_at=str(m["updated_at"]),
            url=f"{base_url}/m/{m['id']}"
        )
        for m in maps
    ]

    return UserMapsResponse(
        maps=map_items,
        total=total,
        limit=limit,
        offset=offset
    )


@router.put("/map/{map_id}")
async def update_map(
    map_id: str,
    body: MapUpdateRequest,
    authorization: str = Header(...)
):
    """Update a map's metadata. Only the owner can update."""
    payload = require_auth(authorization)
    user_id = payload.get("sub")

    map_data = db_get_map(map_id)
    if not map_data:
        raise HTTPException(status_code=404, detail="Map not found")

    # Only owner can update
    if map_data.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this map")

    # Update the map
    db_update_map(
        map_id=map_id,
        title=body.title,
        description=body.description,
        public=body.public
    )

    return {"success": True, "message": "Map updated"}


@router.get("/maps/stats")
async def get_map_stats(authorization: str = Header(...)):
    """Get statistics about user's maps."""
    payload = require_auth(authorization)
    user_id = payload.get("sub")

    total_maps = get_user_map_count(user_id)
    maps = get_user_maps(user_id, limit=1000)  # Get all for stats

    total_views = sum(m.get("views", 0) for m in maps)
    public_maps = sum(1 for m in maps if m.get("public"))

    return {
        "total_maps": total_maps,
        "total_views": total_views,
        "public_maps": public_maps,
        "private_maps": total_maps - public_maps
    }


@router.get("/maps/by-email")
async def list_maps_by_email(request: Request, email: str, limit: int = 100, offset: int = 0):
    """List maps created by a given email address.

    Used by the frontend to show "My Maps" for anonymous users
    who saved with their email. Rate-limited per IP.
    """
    if not email or not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
        raise HTTPException(status_code=400, detail="Valid email required")

    # Rate limit to prevent email enumeration
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")

    email = email.strip().lower()
    maps = get_maps_by_email(email, limit=limit, offset=offset)

    base_url = "https://spatix.io"
    map_items = [
        {
            "id": m["id"],
            "title": m["title"],
            "description": m.get("description"),
            "views": m["views"],
            "public": bool(m["public"]),
            "created_at": str(m["created_at"]),
            "updated_at": str(m["updated_at"]),
            "url": f"{base_url}/m/{m['id']}"
        }
        for m in maps
    ]

    return {"maps": map_items, "total": len(map_items)}
