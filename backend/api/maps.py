"""
MapCanvas AI-Native Map API
The simplest way for AI agents to create maps.

POST /api/map - Dead simple map creation from data
GET /api/map/{id} - Retrieve map data
DELETE /api/map/{id} - Delete a map
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, model_validator, Field
from typing import Optional, List, Union, Dict, Any, Literal
from datetime import datetime
import secrets
import json
import re
import hashlib

router = APIRouter(prefix="/api", tags=["maps"])

# In-memory storage (replace with database in production)
_maps_storage: Dict[str, dict] = {}

# Rate limiting
_ip_requests: Dict[str, List[datetime]] = {}
RATE_LIMIT_WINDOW = 3600  # 1 hour
RATE_LIMIT_MAX = 60  # 60 maps per hour for free tier


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

def check_rate_limit(ip: str) -> bool:
    """Simple IP-based rate limiting."""
    now = datetime.utcnow()
    
    if ip in _ip_requests:
        _ip_requests[ip] = [
            t for t in _ip_requests[ip]
            if (now - t).total_seconds() < RATE_LIMIT_WINDOW
        ]
    else:
        _ip_requests[ip] = []
    
    if len(_ip_requests[ip]) >= RATE_LIMIT_MAX:
        return False
    
    _ip_requests[ip].append(now)
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
    """Generate a short unique map ID."""
    return secrets.token_urlsafe(6)


# ==================== ENDPOINTS ====================

@router.post("/map", response_model=MapResponse)
async def create_map(request: Request, body: MapRequest):
    """
    Create a map from data - the simplest way for AI to make maps.
    
    Accepts:
    - GeoJSON (FeatureCollection, Feature, or raw Geometry)
    - Coordinate arrays: [[lng, lat], ...] or [lng, lat]
    - WKT strings: "POINT(-122 37)", "POLYGON(...)"
    
    Returns instant shareable URL.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
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
        now = datetime.utcnow().isoformat()
        
        map_config = {
            "geojson": geojson,
            "style": auto_style(geojson),
            "mapStyle": body.style if body.style != "auto" else "light",
            "bounds": bounds,
            "center": body.center,
            "zoom": body.zoom,
            "markers": [m.model_dump() for m in body.markers] if body.markers else [],
        }
        
        _maps_storage[map_id] = {
            "id": map_id,
            "title": body.title or "Untitled Map",
            "description": body.description or "",
            "config": map_config,
            "created_at": now,
            "created_by_ip": hashlib.sha256(client_ip.encode()).hexdigest()[:16],
            "views": 0,
            "public": True
        }
        
        base_url = "https://mapcanvas.io"
        map_url = f"{base_url}/m/{map_id}"
        
        return MapResponse(
            success=True,
            id=map_id,
            url=map_url,
            embed=f'<iframe src="{map_url}?embed=1" width="600" height="400" frameborder="0"></iframe>',
            preview_url=f"{base_url}/api/map/{map_id}/preview.png"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create map: {str(e)}")


@router.get("/map/{map_id}")
async def get_map(map_id: str):
    """Get map data by ID."""
    if map_id not in _maps_storage:
        raise HTTPException(status_code=404, detail="Map not found")
    
    map_data = _maps_storage[map_id]
    map_data["views"] += 1
    
    return {
        "id": map_data["id"],
        "title": map_data["title"],
        "description": map_data["description"],
        "config": map_data["config"],
        "created_at": map_data["created_at"],
        "views": map_data["views"]
    }


@router.delete("/map/{map_id}")
async def delete_map(map_id: str, request: Request):
    """Delete a map (only by original creator IP)."""
    if map_id not in _maps_storage:
        raise HTTPException(status_code=404, detail="Map not found")
    
    client_ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(client_ip.encode()).hexdigest()[:16]
    
    if _maps_storage[map_id]["created_by_ip"] != ip_hash:
        raise HTTPException(status_code=403, detail="Not authorized to delete this map")
    
    del _maps_storage[map_id]
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
