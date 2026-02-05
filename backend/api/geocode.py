"""
Spatix Geocoding API
Convert addresses to coordinates and vice versa.
Optimized for AI agents - simple input, structured output.

POST /api/geocode - Convert address/place to coordinates
POST /api/geocode/reverse - Convert coordinates to address
POST /api/geocode/batch - Geocode multiple addresses at once
GET /api/places/search - Search for places/POIs
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import httpx
import asyncio
import os
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["geocoding"])

# Nominatim (OpenStreetMap) - free, no API key required
NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
USER_AGENT = "Spatix/1.0 (https://spatix.io)"

# Rate limiting for Nominatim (max 1 req/sec as per their policy)
_last_nominatim_request: datetime = None
NOMINATIM_RATE_LIMIT = 1.0  # seconds between requests


# ==================== MODELS ====================

class GeocodeRequest(BaseModel):
    """Request for geocoding an address or place name."""
    query: str = Field(..., description="Address, place name, or location to geocode")
    limit: int = Field(default=1, ge=1, le=10, description="Max results to return")
    country: Optional[str] = Field(default=None, description="ISO 3166-1 country code to bias results")


class GeocodeResult(BaseModel):
    """A single geocoding result."""
    lat: float
    lng: float
    display_name: str
    type: str  # e.g., "house", "street", "city", "country"
    importance: float
    bbox: Optional[List[float]] = None  # [min_lng, min_lat, max_lng, max_lat]
    address: Optional[Dict[str, str]] = None  # Structured address components


class GeocodeResponse(BaseModel):
    """Response from geocoding."""
    success: bool
    results: List[GeocodeResult]
    query: str


class ReverseGeocodeRequest(BaseModel):
    """Request for reverse geocoding coordinates."""
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    zoom: int = Field(default=18, ge=0, le=18, description="Detail level (18=building, 10=city, 3=country)")


class ReverseGeocodeResponse(BaseModel):
    """Response from reverse geocoding."""
    success: bool
    lat: float
    lng: float
    display_name: str
    address: Dict[str, str]
    type: str


class BatchGeocodeRequest(BaseModel):
    """Request for batch geocoding multiple addresses."""
    queries: List[str] = Field(..., max_length=50, description="List of addresses to geocode (max 50)")
    country: Optional[str] = Field(default=None, description="ISO country code to bias results")


class BatchGeocodeResult(BaseModel):
    """Result for a single address in batch geocoding."""
    query: str
    success: bool
    lat: Optional[float] = None
    lng: Optional[float] = None
    display_name: Optional[str] = None
    error: Optional[str] = None


class BatchGeocodeResponse(BaseModel):
    """Response from batch geocoding."""
    success: bool
    results: List[BatchGeocodeResult]
    successful: int
    failed: int


class PlaceSearchRequest(BaseModel):
    """Request for searching places/POIs."""
    query: str = Field(..., description="Search query (e.g., 'coffee shops', 'restaurants')")
    lat: Optional[float] = Field(default=None, description="Center latitude for proximity search")
    lng: Optional[float] = Field(default=None, description="Center longitude for proximity search")
    radius: int = Field(default=5000, ge=100, le=50000, description="Search radius in meters")
    limit: int = Field(default=10, ge=1, le=50)
    category: Optional[str] = Field(default=None, description="Filter by category (e.g., 'restaurant', 'hotel')")


class Place(BaseModel):
    """A place/POI result."""
    name: str
    lat: float
    lng: float
    type: str
    address: Optional[str] = None
    distance: Optional[float] = None  # Distance from search center in meters


class PlaceSearchResponse(BaseModel):
    """Response from place search."""
    success: bool
    places: List[Place]
    query: str
    total: int


# ==================== UTILITIES ====================

async def rate_limit_nominatim():
    """Ensure we don't exceed Nominatim's rate limit."""
    global _last_nominatim_request

    if _last_nominatim_request:
        elapsed = (datetime.now(timezone.utc) - _last_nominatim_request).total_seconds()
        if elapsed < NOMINATIM_RATE_LIMIT:
            await asyncio.sleep(NOMINATIM_RATE_LIMIT - elapsed)

    _last_nominatim_request = datetime.now(timezone.utc)


async def nominatim_search(query: str, limit: int = 1, country: str = None) -> List[dict]:
    """Search using Nominatim."""
    await rate_limit_nominatim()

    params = {
        "q": query,
        "format": "jsonv2",
        "addressdetails": 1,
        "limit": limit,
    }

    if country:
        params["countrycodes"] = country.lower()

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{NOMINATIM_BASE}/search",
            params=params,
            headers={"User-Agent": USER_AGENT},
            timeout=10.0
        )
        response.raise_for_status()
        return response.json()


async def nominatim_reverse(lat: float, lng: float, zoom: int = 18) -> dict:
    """Reverse geocode using Nominatim."""
    await rate_limit_nominatim()

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{NOMINATIM_BASE}/reverse",
            params={
                "lat": lat,
                "lon": lng,
                "format": "jsonv2",
                "addressdetails": 1,
                "zoom": zoom,
            },
            headers={"User-Agent": USER_AGENT},
            timeout=10.0
        )
        response.raise_for_status()
        return response.json()


def parse_nominatim_result(result: dict) -> GeocodeResult:
    """Parse a Nominatim result into our format."""
    bbox = None
    if "boundingbox" in result:
        bb = result["boundingbox"]
        bbox = [float(bb[2]), float(bb[0]), float(bb[3]), float(bb[1])]  # [min_lng, min_lat, max_lng, max_lat]

    return GeocodeResult(
        lat=float(result["lat"]),
        lng=float(result["lon"]),
        display_name=result.get("display_name", ""),
        type=result.get("type", result.get("category", "unknown")),
        importance=float(result.get("importance", 0)),
        bbox=bbox,
        address=result.get("address")
    )


# ==================== ENDPOINTS ====================

@router.post("/geocode", response_model=GeocodeResponse)
async def geocode(body: GeocodeRequest):
    """
    Convert an address or place name to coordinates.

    Examples:
    - "1600 Pennsylvania Avenue, Washington DC"
    - "Eiffel Tower, Paris"
    - "Tokyo, Japan"
    - "90210" (with country="us")

    Returns coordinates, formatted address, and bounding box.
    """
    try:
        results = await nominatim_search(body.query, body.limit, body.country)

        if not results:
            return GeocodeResponse(
                success=True,
                results=[],
                query=body.query
            )

        parsed_results = [parse_nominatim_result(r) for r in results]

        return GeocodeResponse(
            success=True,
            results=parsed_results,
            query=body.query
        )

    except httpx.HTTPError as e:
        logger.error(f"Geocoding HTTP error: {e}")
        raise HTTPException(status_code=502, detail="Geocoding service unavailable")
    except Exception as e:
        logger.error(f"Geocoding error: {e}")
        raise HTTPException(status_code=500, detail="Geocoding failed")


@router.post("/geocode/reverse", response_model=ReverseGeocodeResponse)
async def reverse_geocode(body: ReverseGeocodeRequest):
    """
    Convert coordinates to an address.

    The zoom parameter controls detail level:
    - 18: Building/address level
    - 14: Street level
    - 10: City level
    - 5: State/region level
    - 3: Country level
    """
    try:
        result = await nominatim_reverse(body.lat, body.lng, body.zoom)

        if "error" in result:
            raise HTTPException(status_code=404, detail="No address found at these coordinates")

        return ReverseGeocodeResponse(
            success=True,
            lat=body.lat,
            lng=body.lng,
            display_name=result.get("display_name", ""),
            address=result.get("address", {}),
            type=result.get("type", result.get("category", "unknown"))
        )

    except HTTPException:
        raise
    except httpx.HTTPError as e:
        logger.error(f"Reverse geocoding HTTP error: {e}")
        raise HTTPException(status_code=502, detail="Geocoding service unavailable")
    except Exception as e:
        logger.error(f"Reverse geocoding error: {e}")
        raise HTTPException(status_code=500, detail="Reverse geocoding failed")


@router.post("/geocode/batch", response_model=BatchGeocodeResponse)
async def batch_geocode(body: BatchGeocodeRequest):
    """
    Geocode multiple addresses at once.

    Useful for:
    - Converting a list of addresses to map points
    - Processing CSV data with address columns
    - Building route waypoints

    Max 50 addresses per request. Results maintain input order.
    """
    if len(body.queries) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 addresses per batch")

    results = []
    successful = 0
    failed = 0

    for query in body.queries:
        try:
            search_results = await nominatim_search(query, limit=1, country=body.country)

            if search_results:
                r = search_results[0]
                results.append(BatchGeocodeResult(
                    query=query,
                    success=True,
                    lat=float(r["lat"]),
                    lng=float(r["lon"]),
                    display_name=r.get("display_name")
                ))
                successful += 1
            else:
                results.append(BatchGeocodeResult(
                    query=query,
                    success=False,
                    error="No results found"
                ))
                failed += 1

        except Exception as e:
            logger.error(f"Batch geocode error for '{query}': {e}")
            results.append(BatchGeocodeResult(
                query=query,
                success=False,
                error="Geocoding failed"
            ))
            failed += 1

    return BatchGeocodeResponse(
        success=True,
        results=results,
        successful=successful,
        failed=failed
    )


@router.post("/places/search", response_model=PlaceSearchResponse)
async def search_places(body: PlaceSearchRequest):
    """
    Search for places and points of interest.

    Examples:
    - Search globally: {"query": "Starbucks"}
    - Search near a point: {"query": "restaurants", "lat": 40.7128, "lng": -74.0060}
    - Filter by category: {"query": "hotels", "category": "tourism"}

    Categories include: amenity, tourism, shop, leisure, building
    """
    try:
        # Build search query
        search_query = body.query

        # If location provided, add to query for proximity
        params = {
            "q": search_query,
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": body.limit,
        }

        if body.lat is not None and body.lng is not None:
            # Use viewbox for proximity search
            # Approximate degrees for radius (rough calculation)
            lat_delta = body.radius / 111000  # ~111km per degree latitude
            lng_delta = body.radius / (111000 * abs(cos_approx(body.lat)))

            params["viewbox"] = f"{body.lng - lng_delta},{body.lat + lat_delta},{body.lng + lng_delta},{body.lat - lat_delta}"
            params["bounded"] = 1

        await rate_limit_nominatim()

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{NOMINATIM_BASE}/search",
                params=params,
                headers={"User-Agent": USER_AGENT},
                timeout=10.0
            )
            response.raise_for_status()
            results = response.json()

        places = []
        for r in results:
            # Calculate distance if center provided
            distance = None
            if body.lat is not None and body.lng is not None:
                distance = haversine_distance(
                    body.lat, body.lng,
                    float(r["lat"]), float(r["lon"])
                )

            # Filter by category if specified
            if body.category:
                result_category = r.get("category", r.get("type", ""))
                if body.category.lower() not in result_category.lower():
                    continue

            places.append(Place(
                name=r.get("name", r.get("display_name", "Unknown")),
                lat=float(r["lat"]),
                lng=float(r["lon"]),
                type=r.get("type", r.get("category", "place")),
                address=r.get("display_name"),
                distance=distance
            ))

        # Sort by distance if available
        if body.lat is not None and body.lng is not None:
            places.sort(key=lambda p: p.distance or float('inf'))

        return PlaceSearchResponse(
            success=True,
            places=places,
            query=body.query,
            total=len(places)
        )

    except httpx.HTTPError as e:
        logger.error(f"Place search HTTP error: {e}")
        raise HTTPException(status_code=502, detail="Place search service unavailable")
    except Exception as e:
        logger.error(f"Place search error: {e}")
        raise HTTPException(status_code=500, detail="Place search failed")


def cos_approx(degrees: float) -> float:
    """Approximate cosine for latitude calculations."""
    import math
    return math.cos(math.radians(degrees))


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two points in meters."""
    import math

    R = 6371000  # Earth's radius in meters

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


# ==================== AI-FRIENDLY SHORTCUTS ====================

@router.get("/geocode/simple")
async def simple_geocode(
    q: str = Query(..., description="Address or place name"),
    country: Optional[str] = Query(default=None, description="ISO country code")
):
    """
    Simple GET endpoint for quick geocoding.

    Example: /api/geocode/simple?q=Eiffel Tower

    Returns just the first result's coordinates - perfect for AI agents.
    """
    try:
        results = await nominatim_search(q, limit=1, country=country)

        if not results:
            raise HTTPException(status_code=404, detail=f"Could not geocode: {q}")

        r = results[0]
        return {
            "lat": float(r["lat"]),
            "lng": float(r["lon"]),
            "name": r.get("display_name", q)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Simple geocode error: {e}")
        raise HTTPException(status_code=500, detail="Geocoding failed")
