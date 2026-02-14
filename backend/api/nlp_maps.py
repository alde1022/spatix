"""
Spatix Natural Language Maps API
Create maps from plain English descriptions.
Designed for AI agents - describe what you want, get a map.

POST /api/map/from-text - Create map from natural language description
POST /api/map/from-addresses - Create map from a list of addresses
POST /api/map/route - Create a map showing a route between points
"""
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
import re
import logging

from api.geocode import geocode_search, haversine_distance
from api.maps import (
    generate_map_id,
    generate_delete_token,
    auto_style,
    MapCreateResponse,
    check_rate_limit,
    _update_map_agent_fields,
    RATE_LIMIT_MAX_ANONYMOUS,
    RATE_LIMIT_MAX_FREE,
    RATE_LIMIT_MAX_PRO,
    POINTS_MAP_CREATE,
)
from api.contributions import get_points_multiplier
from database import create_map as db_create_map, collect_email, record_contribution, award_points
import hashlib

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["nlp-maps"])


# ==================== MODELS ====================

class TextMapRequest(BaseModel):
    """Create a map from a text description."""
    text: str = Field(..., description="Natural language description of the map to create")
    title: Optional[str] = None
    style: Literal["auto", "light", "dark", "satellite"] = "auto"
    email: Optional[str] = Field(default=None, description="Creator email for map history")
    agent_id: Optional[str] = Field(default=None, description="Agent ID for attribution & points")
    agent_name: Optional[str] = Field(default=None, description="Agent display name")


class AddressMapRequest(BaseModel):
    """Create a map from a list of addresses."""
    addresses: List[str] = Field(..., description="List of addresses/locations to plot")
    title: Optional[str] = None
    description: Optional[str] = None
    style: Literal["auto", "light", "dark", "satellite"] = "auto"
    connect_points: bool = Field(default=False, description="Draw lines connecting points in order")
    labels: Optional[List[str]] = Field(default=None, description="Labels for each point (same order as addresses)")
    email: Optional[str] = Field(default=None, description="Creator email for map history")
    agent_id: Optional[str] = Field(default=None, description="Agent ID for attribution & points")
    agent_name: Optional[str] = Field(default=None, description="Agent display name")


class RouteMapRequest(BaseModel):
    """Create a map showing a route."""
    start: str = Field(..., description="Starting location (address or place)")
    end: str = Field(..., description="Ending location (address or place)")
    waypoints: Optional[List[str]] = Field(default=None, description="Intermediate stops")
    title: Optional[str] = None
    style: Literal["auto", "light", "dark", "satellite"] = "auto"
    email: Optional[str] = Field(default=None, description="Creator email for map history")
    agent_id: Optional[str] = Field(default=None, description="Agent ID for attribution & points")
    agent_name: Optional[str] = Field(default=None, description="Agent display name")


class TextMapResponse(BaseModel):
    """Response from text-based map creation."""
    success: bool
    id: str
    url: str
    embed: str
    delete_token: str
    locations_found: int
    locations: List[Dict[str, Any]]


# ==================== LOCATION EXTRACTION ====================

# Common location patterns
LOCATION_PATTERNS = [
    # "at [location]" or "in [location]"
    r'(?:at|in|near|from|to)\s+([A-Z][A-Za-z\s,]+(?:,\s*[A-Z]{2})?)',
    # Addresses with numbers
    r'(\d+\s+[A-Z][A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)(?:,\s*[A-Za-z\s]+)?)',
    # Cities with state/country
    r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:[A-Z]{2}|[A-Z][a-z]+))',
    # Famous landmarks (capitalized proper nouns)
    r'((?:the\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+(?:\s+(?:Tower|Bridge|Palace|Castle|Museum|Park|Square|Station|Airport|Center|Centre))?)',
]

# Known landmarks for better extraction
LANDMARKS = [
    "Eiffel Tower", "Statue of Liberty", "Big Ben", "Colosseum", "Great Wall",
    "Taj Mahal", "Sydney Opera House", "Golden Gate Bridge", "Times Square",
    "Central Park", "Empire State Building", "Buckingham Palace", "Louvre",
    "Brandenburg Gate", "Sagrada Familia", "Machu Picchu", "Christ the Redeemer",
    "Burj Khalifa", "Tokyo Tower", "Mount Fuji", "Grand Canyon", "Niagara Falls",
]


def extract_locations_from_text(text: str) -> List[str]:
    """Extract potential location names from natural language text."""
    locations = []
    text_lower = text.lower()

    # Check for known landmarks first
    for landmark in LANDMARKS:
        if landmark.lower() in text_lower:
            locations.append(landmark)

    # Apply regex patterns
    for pattern in LOCATION_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            cleaned = match.strip().strip(',.')
            if cleaned and len(cleaned) > 2:
                # Avoid duplicates
                if cleaned not in locations and cleaned.lower() not in [l.lower() for l in locations]:
                    locations.append(cleaned)

    # Look for quoted locations
    quoted = re.findall(r'"([^"]+)"', text)
    for q in quoted:
        if q not in locations:
            locations.append(q)

    # Look for locations after specific keywords
    keywords = ['show', 'map', 'plot', 'mark', 'display', 'highlight', 'between', 'and']
    for keyword in keywords:
        pattern = rf'{keyword}\s+([A-Z][A-Za-z\s,]+)'
        matches = re.findall(pattern, text)
        for match in matches:
            cleaned = match.strip().strip(',.')
            if cleaned and len(cleaned) > 2 and cleaned not in locations:
                locations.append(cleaned)

    return locations[:20]  # Limit to 20 locations


async def geocode_locations(locations: List[str]) -> List[Dict[str, Any]]:
    """Geocode a list of location strings concurrently."""
    import asyncio

    async def _geocode_one(loc: str) -> Dict[str, Any]:
        try:
            search_results = await geocode_search(loc, limit=1)
            if search_results:
                r = search_results[0]
                return {
                    "query": loc,
                    "lat": float(r["lat"]),
                    "lng": float(r["lon"]),
                    "name": r.get("display_name", loc),
                    "success": True
                }
            else:
                return {
                    "query": loc,
                    "success": False,
                    "error": "Not found"
                }
        except Exception as e:
            logger.error(f"Failed to geocode '{loc}': {e}")
            return {
                "query": loc,
                "success": False,
                "error": str(e)
            }

    results = await asyncio.gather(*[_geocode_one(loc) for loc in locations])
    return list(results)


def create_geojson_from_points(points: List[Dict[str, Any]], connect: bool = False) -> Dict[str, Any]:
    """Create GeoJSON from geocoded points."""
    features = []

    # Add point features
    for i, p in enumerate(points):
        if not p.get("success"):
            continue

        features.append({
            "type": "Feature",
            "properties": {
                "name": p.get("name", p.get("query", f"Point {i+1}")),
                "query": p.get("query"),
                "index": i
            },
            "geometry": {
                "type": "Point",
                "coordinates": [p["lng"], p["lat"]]
            }
        })

    # Add connecting line if requested
    if connect and len([p for p in points if p.get("success")]) >= 2:
        line_coords = [[p["lng"], p["lat"]] for p in points if p.get("success")]
        features.append({
            "type": "Feature",
            "properties": {
                "type": "route",
                "name": "Route"
            },
            "geometry": {
                "type": "LineString",
                "coordinates": line_coords
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features
    }


def calculate_bounds_from_points(points: List[Dict[str, Any]]) -> List[List[float]]:
    """Calculate bounding box from points."""
    valid_points = [p for p in points if p.get("success")]

    if not valid_points:
        return [[-180, -85], [180, 85]]

    lngs = [p["lng"] for p in valid_points]
    lats = [p["lat"] for p in valid_points]

    # Add padding
    lng_padding = max(0.01, (max(lngs) - min(lngs)) * 0.1)
    lat_padding = max(0.01, (max(lats) - min(lats)) * 0.1)

    return [
        [min(lngs) - lng_padding, min(lats) - lat_padding],
        [max(lngs) + lng_padding, max(lats) + lat_padding]
    ]


def _clean_email(email: Optional[str]) -> Optional[str]:
    """Validate and clean an email address, return None if invalid."""
    if not email:
        return None
    import re as _re
    cleaned = email.strip().lower()
    if _re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', cleaned):
        return cleaned
    return None


# ==================== ENDPOINTS ====================

@router.post("/map/from-text", response_model=TextMapResponse)
async def create_map_from_text(
    body: TextMapRequest,
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """
    Create a map from a natural language description.

    Examples:
    - "Show me the Eiffel Tower and the Louvre in Paris"
    - "Map of coffee shops near Times Square, New York"
    - "Create a map with Tokyo Tower, Mount Fuji, and Kyoto"

    The AI will extract locations, geocode them, and create a map.
    """
    # Extract locations from text
    locations = extract_locations_from_text(body.text)

    if not locations:
        raise HTTPException(
            status_code=400,
            detail="Could not identify any locations in the text. Try including specific place names, addresses, or landmarks."
        )

    # Geocode all locations
    geocoded = await geocode_locations(locations)

    successful = [g for g in geocoded if g.get("success")]
    if not successful:
        raise HTTPException(
            status_code=400,
            detail=f"Could not geocode any of the identified locations: {locations}"
        )

    # Create GeoJSON
    geojson = create_geojson_from_points(geocoded)
    bounds = calculate_bounds_from_points(geocoded)

    # Get user ID if authenticated
    user_id = None
    user_plan = None
    if authorization and authorization.startswith("Bearer "):
        try:
            from routers.auth import verify_jwt
            token = authorization.split(" ")[1]
            payload = verify_jwt(token)
            user_id = payload.get("sub")
            user_plan = payload.get("plan", "free")
        except Exception:
            pass

    # Rate limit check
    client_ip = request.client.host if request.client else "unknown"
    rate_limit = RATE_LIMIT_MAX_PRO if user_plan == "pro" else (RATE_LIMIT_MAX_FREE if user_id else RATE_LIMIT_MAX_ANONYMOUS)
    if not check_rate_limit(client_ip, user_id, user_plan):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {rate_limit} maps per hour. Try again later."
        )

    # Create map
    map_id = generate_map_id()
    delete_token = generate_delete_token()

    map_config = {
        "geojson": geojson,
        "style": auto_style(geojson),
        "mapStyle": body.style if body.style != "auto" else "light",
        "bounds": bounds,
        "markers": [
            {"lat": p["lat"], "lng": p["lng"], "label": p.get("query", "")}
            for p in successful
        ],
    }

    delete_token_hash = hashlib.sha256(delete_token.encode()).hexdigest()

    # Collect creator email if provided
    creator_email = _clean_email(body.email)
    if creator_email:
        collect_email(creator_email, source="nlp_from_text")

    db_create_map(
        map_id=map_id,
        title=body.title or f"Map: {body.text[:50]}...",
        description=f"Created from: {body.text}",
        config=map_config,
        delete_token_hash=delete_token_hash,
        user_id=user_id,
        public=True,
        creator_email=creator_email,
    )

    # Agent attribution
    if body.agent_id or body.agent_name:
        _update_map_agent_fields(map_id, body.agent_id, body.agent_name)

    # Record contribution + award points
    entity_type = "agent" if body.agent_id else "user"
    entity_id = body.agent_id or (str(user_id) if user_id else (creator_email or "anonymous"))
    pts = POINTS_MAP_CREATE * get_points_multiplier(entity_type, entity_id)

    record_contribution(
        action="map_create",
        resource_type="map",
        resource_id=map_id,
        points_awarded=pts,
        user_id=user_id,
        user_email=creator_email,
        agent_id=body.agent_id,
        agent_name=body.agent_name,
        metadata={"source": "from_text", "locations_found": len(successful)},
        ip_address=client_ip,
    )
    award_points(entity_type, entity_id, pts,
                 field="maps_created", entity_email=creator_email)

    base_url = "https://spatix.io"

    return TextMapResponse(
        success=True,
        id=map_id,
        url=f"{base_url}/m/{map_id}",
        embed=f'<iframe src="{base_url}/m/{map_id}?embed=1" width="600" height="400" frameborder="0"></iframe>',
        delete_token=delete_token,
        locations_found=len(successful),
        locations=successful
    )


@router.post("/map/from-addresses", response_model=MapCreateResponse)
async def create_map_from_addresses(
    body: AddressMapRequest,
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """
    Create a map from a list of addresses.

    Perfect for:
    - Plotting multiple business locations
    - Showing delivery stops
    - Visualizing customer locations
    - Creating store locator maps

    Optionally connect points with lines (for routes/journeys).
    """
    if not body.addresses:
        raise HTTPException(status_code=400, detail="At least one address is required")

    if len(body.addresses) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 addresses per request")

    # Geocode all addresses
    geocoded = await geocode_locations(body.addresses)

    successful = [g for g in geocoded if g.get("success")]
    if not successful:
        raise HTTPException(
            status_code=400,
            detail="Could not geocode any of the provided addresses"
        )

    # Apply labels if provided
    if body.labels:
        for i, g in enumerate(successful):
            if i < len(body.labels):
                g["label"] = body.labels[i]

    # Create GeoJSON
    geojson = create_geojson_from_points(geocoded, connect=body.connect_points)
    bounds = calculate_bounds_from_points(geocoded)

    # Get user ID if authenticated
    user_id = None
    user_plan = None
    if authorization and authorization.startswith("Bearer "):
        try:
            from routers.auth import verify_jwt
            token = authorization.split(" ")[1]
            payload = verify_jwt(token)
            user_id = payload.get("sub")
            user_plan = payload.get("plan", "free")
        except Exception:
            pass

    # Rate limit check
    client_ip = request.client.host if request.client else "unknown"
    rate_limit = RATE_LIMIT_MAX_PRO if user_plan == "pro" else (RATE_LIMIT_MAX_FREE if user_id else RATE_LIMIT_MAX_ANONYMOUS)
    if not check_rate_limit(client_ip, user_id, user_plan):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {rate_limit} maps per hour. Try again later."
        )

    # Create map
    map_id = generate_map_id()
    delete_token = generate_delete_token()

    markers = []
    for i, p in enumerate(successful):
        label = p.get("label", body.labels[i] if body.labels and i < len(body.labels) else p.get("query", ""))
        markers.append({
            "lat": p["lat"],
            "lng": p["lng"],
            "label": label
        })

    map_config = {
        "geojson": geojson,
        "style": auto_style(geojson),
        "mapStyle": body.style if body.style != "auto" else "light",
        "bounds": bounds,
        "markers": markers,
    }

    delete_token_hash = hashlib.sha256(delete_token.encode()).hexdigest()

    # Collect creator email if provided
    creator_email = _clean_email(body.email)
    if creator_email:
        collect_email(creator_email, source="nlp_from_addresses")

    db_create_map(
        map_id=map_id,
        title=body.title or f"Map with {len(successful)} locations",
        description=body.description or f"Addresses: {', '.join(body.addresses[:3])}...",
        config=map_config,
        delete_token_hash=delete_token_hash,
        user_id=user_id,
        public=True,
        creator_email=creator_email,
    )

    # Agent attribution
    if body.agent_id or body.agent_name:
        _update_map_agent_fields(map_id, body.agent_id, body.agent_name)

    # Record contribution + award points
    entity_type = "agent" if body.agent_id else "user"
    entity_id = body.agent_id or (str(user_id) if user_id else (creator_email or "anonymous"))
    pts = POINTS_MAP_CREATE * get_points_multiplier(entity_type, entity_id)

    record_contribution(
        action="map_create",
        resource_type="map",
        resource_id=map_id,
        points_awarded=pts,
        user_id=user_id,
        user_email=creator_email,
        agent_id=body.agent_id,
        agent_name=body.agent_name,
        metadata={"source": "from_addresses", "address_count": len(body.addresses)},
        ip_address=client_ip,
    )
    award_points(entity_type, entity_id, pts,
                 field="maps_created", entity_email=creator_email)

    base_url = "https://spatix.io"

    return MapCreateResponse(
        success=True,
        id=map_id,
        url=f"{base_url}/m/{map_id}",
        embed=f'<iframe src="{base_url}/m/{map_id}?embed=1" width="600" height="400" frameborder="0"></iframe>',
        preview_url=f"{base_url}/m/{map_id}",
        delete_token=delete_token
    )


@router.post("/map/route", response_model=TextMapResponse)
async def create_route_map(
    body: RouteMapRequest,
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """
    Create a map showing a route between locations.

    Shows start, end, and any waypoints with a connecting line.
    Calculates approximate distance.

    Example:
    {
        "start": "San Francisco, CA",
        "end": "Los Angeles, CA",
        "waypoints": ["Monterey, CA", "Santa Barbara, CA"]
    }
    """
    # Build list of all points
    all_points = [body.start]
    if body.waypoints:
        all_points.extend(body.waypoints)
    all_points.append(body.end)

    # Geocode all points
    geocoded = await geocode_locations(all_points)

    successful = [g for g in geocoded if g.get("success")]
    if len(successful) < 2:
        failed = [g["query"] for g in geocoded if not g.get("success")]
        raise HTTPException(
            status_code=400,
            detail=f"Need at least start and end locations. Failed to geocode: {failed}"
        )

    # Calculate total distance
    total_distance = 0
    for i in range(len(successful) - 1):
        total_distance += haversine_distance(
            successful[i]["lat"], successful[i]["lng"],
            successful[i+1]["lat"], successful[i+1]["lng"]
        )

    # Label points
    successful[0]["label"] = "Start"
    successful[-1]["label"] = "End"
    for i, p in enumerate(successful[1:-1], 1):
        p["label"] = f"Stop {i}"

    # Create GeoJSON with connected line
    geojson = create_geojson_from_points(successful, connect=True)
    bounds = calculate_bounds_from_points(successful)

    # Get user ID if authenticated
    user_id = None
    user_plan = None
    if authorization and authorization.startswith("Bearer "):
        try:
            from routers.auth import verify_jwt
            token = authorization.split(" ")[1]
            payload = verify_jwt(token)
            user_id = payload.get("sub")
            user_plan = payload.get("plan", "free")
        except Exception:
            pass

    # Rate limit check
    client_ip = request.client.host if request.client else "unknown"
    rate_limit = RATE_LIMIT_MAX_PRO if user_plan == "pro" else (RATE_LIMIT_MAX_FREE if user_id else RATE_LIMIT_MAX_ANONYMOUS)
    if not check_rate_limit(client_ip, user_id, user_plan):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {rate_limit} maps per hour. Try again later."
        )

    # Create map
    map_id = generate_map_id()
    delete_token = generate_delete_token()

    map_config = {
        "geojson": geojson,
        "style": auto_style(geojson),
        "mapStyle": body.style if body.style != "auto" else "light",
        "bounds": bounds,
        "markers": [
            {"lat": p["lat"], "lng": p["lng"], "label": p.get("label", "")}
            for p in successful
        ],
        "route_info": {
            "total_distance_km": round(total_distance / 1000, 2),
            "total_distance_miles": round(total_distance / 1609.34, 2),
            "stops": len(successful)
        }
    }

    delete_token_hash = hashlib.sha256(delete_token.encode()).hexdigest()

    title = body.title or f"Route: {body.start} to {body.end}"
    if body.waypoints:
        title += f" (via {len(body.waypoints)} stops)"

    # Collect creator email if provided
    creator_email = _clean_email(body.email)
    if creator_email:
        collect_email(creator_email, source="nlp_route")

    db_create_map(
        map_id=map_id,
        title=title,
        description=f"Distance: {round(total_distance/1000, 1)} km ({round(total_distance/1609.34, 1)} miles)",
        config=map_config,
        delete_token_hash=delete_token_hash,
        user_id=user_id,
        public=True,
        creator_email=creator_email,
    )

    # Agent attribution
    if body.agent_id or body.agent_name:
        _update_map_agent_fields(map_id, body.agent_id, body.agent_name)

    # Record contribution + award points
    entity_type = "agent" if body.agent_id else "user"
    entity_id = body.agent_id or (str(user_id) if user_id else (creator_email or "anonymous"))
    pts = POINTS_MAP_CREATE * get_points_multiplier(entity_type, entity_id)

    record_contribution(
        action="map_create",
        resource_type="map",
        resource_id=map_id,
        points_awarded=pts,
        user_id=user_id,
        user_email=creator_email,
        agent_id=body.agent_id,
        agent_name=body.agent_name,
        metadata={"source": "route", "stops": len(successful),
                  "distance_km": round(total_distance / 1000, 2)},
        ip_address=client_ip,
    )
    award_points(entity_type, entity_id, pts,
                 field="maps_created", entity_email=creator_email)

    base_url = "https://spatix.io"

    return TextMapResponse(
        success=True,
        id=map_id,
        url=f"{base_url}/m/{map_id}",
        embed=f'<iframe src="{base_url}/m/{map_id}?embed=1" width="600" height="400" frameborder="0"></iframe>',
        delete_token=delete_token,
        locations_found=len(successful),
        locations=successful
    )
