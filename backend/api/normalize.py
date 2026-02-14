"""
Spatix Spatial Normalization API
Accept messy spatial data, return clean GeoJSON. No map creation required.

This is a foundational infrastructure endpoint — the normalization layer
that underpins geocoding, ETL, and developer platform capabilities.

POST /api/normalize          - Normalize raw data (GeoJSON, WKT, coords, CSV text)
POST /api/normalize/file     - Normalize an uploaded file
POST /api/normalize/addresses - Geocode + normalize address list to GeoJSON
"""
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Query, Header
from pydantic import BaseModel, Field
from typing import Optional, List, Union, Dict, Any
from datetime import datetime, timezone
import json
import re
import os
import tempfile
import shutil
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["normalize"])

# Rate limiting
_normalize_ip_requests: Dict[str, List[datetime]] = {}
NORMALIZE_RATE_LIMIT_WINDOW = 60
NORMALIZE_RATE_LIMIT_MAX = 60  # 60 requests/min per IP


def check_normalize_rate_limit(ip: str) -> bool:
    now = datetime.now(timezone.utc)
    if ip in _normalize_ip_requests:
        _normalize_ip_requests[ip] = [
            t for t in _normalize_ip_requests[ip]
            if (now - t).total_seconds() < NORMALIZE_RATE_LIMIT_WINDOW
        ]
    else:
        _normalize_ip_requests[ip] = []
    if len(_normalize_ip_requests[ip]) >= NORMALIZE_RATE_LIMIT_MAX:
        return False
    _normalize_ip_requests[ip].append(now)
    return True


# ==================== MODELS ====================

class NormalizeRequest(BaseModel):
    """Accept any spatial data format and return clean GeoJSON."""
    data: Union[Dict[str, Any], List, str] = Field(
        ..., description="Spatial data: GeoJSON, coordinate array, WKT string, or CSV text"
    )
    # Input hints
    input_format: Optional[str] = Field(
        default=None,
        description="Hint: 'geojson', 'wkt', 'coordinates', 'csv'. Auto-detected if omitted."
    )
    # CRS handling
    source_crs: Optional[str] = Field(
        default=None,
        description="Source CRS (e.g. 'EPSG:3857'). Assumes EPSG:4326 if omitted."
    )
    # CSV-specific options
    lat_column: Optional[str] = Field(default=None, description="Latitude column name for CSV input")
    lng_column: Optional[str] = Field(default=None, description="Longitude column name for CSV input")
    geometry_column: Optional[str] = Field(default=None, description="WKT geometry column name for CSV")
    delimiter: Optional[str] = Field(default=",", description="CSV delimiter")


class NormalizeAddressesRequest(BaseModel):
    """Geocode and normalize a list of addresses to GeoJSON."""
    addresses: List[str] = Field(
        ..., max_length=100, description="List of addresses to geocode and normalize (max 100)"
    )
    country: Optional[str] = Field(default=None, description="ISO country code to bias results")
    include_metadata: bool = Field(default=True, description="Include geocoding metadata in properties")


class SpatialMetadata(BaseModel):
    """Metadata about the normalized spatial data."""
    feature_count: int
    geometry_types: List[str]
    bounds: List[List[float]]  # [[min_lng, min_lat], [max_lng, max_lat]]
    crs: str = "EPSG:4326"
    properties: List[str] = []
    input_format_detected: str


class NormalizeResponse(BaseModel):
    """Clean, normalized GeoJSON with metadata."""
    success: bool
    geojson: Dict[str, Any]
    metadata: SpatialMetadata


# ==================== CORE NORMALIZATION ====================

def extract_bounds(geojson: Dict) -> List[List[float]]:
    """Extract bounding box from GeoJSON."""
    coords = []

    def _extract(geom):
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
        elif geom_type == "GeometryCollection":
            for g in geom.get("geometries", []):
                _extract(g)

    for feature in geojson.get("features", []):
        _extract(feature.get("geometry"))

    if not coords:
        return [[-180, -85], [180, 85]]

    lngs = [c[0] for c in coords if len(c) >= 2]
    lats = [c[1] for c in coords if len(c) >= 2]

    if not lngs or not lats:
        return [[-180, -85], [180, 85]]

    return [[min(lngs), min(lats)], [max(lngs), max(lats)]]


def normalize_to_geojson(data: Union[Dict, List, str], input_format: str = None) -> tuple:
    """
    Normalize any spatial data to a GeoJSON FeatureCollection.
    Returns (geojson_dict, detected_format).
    """
    # Import parsers from maps module (reuse existing logic)
    from api.maps import detect_and_normalize_data, parse_wkt, parse_coordinates, normalize_geojson

    # If it's a string, determine what kind
    if isinstance(data, str):
        data_stripped = data.strip()

        # Check if it's JSON
        if data_stripped.startswith("{") or data_stripped.startswith("["):
            try:
                parsed = json.loads(data_stripped)
                geojson = detect_and_normalize_data(parsed)
                fmt = "geojson"
                if isinstance(parsed, list):
                    fmt = "coordinates"
                return geojson, fmt
            except json.JSONDecodeError:
                pass

        # Check if it's WKT
        wkt_prefixes = ("POINT", "LINESTRING", "POLYGON", "MULTI", "GEOMETRYCOLLECTION")
        if data_stripped.upper().startswith(wkt_prefixes):
            geojson = parse_wkt(data_stripped)
            return geojson, "wkt"

        # Check if it looks like CSV (has newlines and delimiters)
        if "\n" in data_stripped and ("," in data_stripped or "\t" in data_stripped):
            geojson = _normalize_csv_text(data_stripped)
            return geojson, "csv"

        # Fall through — try WKT anyway
        try:
            geojson = parse_wkt(data_stripped)
            return geojson, "wkt"
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Could not parse string data. Supported formats: GeoJSON, WKT, CSV text, coordinate arrays."
            )

    if isinstance(data, list):
        geojson = parse_coordinates(data)
        return geojson, "coordinates"

    if isinstance(data, dict):
        geojson = detect_and_normalize_data(data)
        return geojson, "geojson"

    raise HTTPException(status_code=400, detail="Unsupported data type")


def _normalize_csv_text(csv_text: str, lat_col: str = None, lng_col: str = None,
                        geom_col: str = None, delimiter: str = ",") -> Dict[str, Any]:
    """Parse CSV text with lat/lng or geometry columns into GeoJSON."""
    import io
    try:
        import pandas as pd
    except ImportError:
        raise HTTPException(status_code=500, detail="CSV processing requires pandas")

    df = pd.read_csv(io.StringIO(csv_text), delimiter=delimiter, low_memory=False)

    if df.empty:
        raise HTTPException(status_code=400, detail="CSV is empty")

    # Try WKT/geometry column first
    if geom_col and geom_col in df.columns:
        return _csv_geom_to_geojson(df, geom_col)

    # Auto-detect geometry column
    geom_candidates = [c for c in df.columns
                       if any(g in c.lower() for g in ["wkt", "geom", "geometry", "shape"])]
    if geom_candidates:
        for candidate in geom_candidates:
            if df[candidate].notna().any():
                sample = str(df[candidate].dropna().iloc[0]).strip()
                if any(sample.upper().startswith(t) for t in ["POINT", "LINESTRING", "POLYGON", "MULTI"]):
                    return _csv_geom_to_geojson(df, candidate)
                if sample.startswith("{") and '"type"' in sample:
                    return _csv_geom_to_geojson(df, candidate)

    # Fall back to lat/lng columns
    lat_names = ["LATITUDE", "latitude", "lat", "Latitude", "LAT", "y", "Y", "Lat"]
    lng_names = ["LONGITUDE", "longitude", "lng", "lon", "long", "Longitude",
                 "LNG", "LON", "LONG", "x", "X", "Lng", "Lon"]

    resolved_lat = lat_col or next((c for c in lat_names if c in df.columns), None)
    resolved_lng = lng_col or next((c for c in lng_names if c in df.columns), None)

    if not resolved_lat or not resolved_lng:
        raise HTTPException(
            status_code=400,
            detail=f"CSV needs lat/lng or geometry columns. Found: {list(df.columns)[:15]}"
        )

    df = df.dropna(subset=[resolved_lat, resolved_lng])
    df[resolved_lat] = pd.to_numeric(df[resolved_lat], errors="coerce")
    df[resolved_lng] = pd.to_numeric(df[resolved_lng], errors="coerce")
    df = df.dropna(subset=[resolved_lat, resolved_lng])
    df = df[(df[resolved_lat] >= -90) & (df[resolved_lat] <= 90)]
    df = df[(df[resolved_lng] >= -180) & (df[resolved_lng] <= 180)]

    if df.empty:
        raise HTTPException(status_code=400, detail="No valid coordinates found in CSV")

    features = []
    for _, row in df.iterrows():
        props = {}
        for col in df.columns:
            if col in (resolved_lat, resolved_lng):
                continue
            val = row[col]
            if pd.isna(val):
                props[col] = None
            else:
                props[col] = val if not isinstance(val, float) or not (val != val) else None

        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": {
                "type": "Point",
                "coordinates": [float(row[resolved_lng]), float(row[resolved_lat])]
            }
        })

    return {"type": "FeatureCollection", "features": features}


def _csv_geom_to_geojson(df, geom_col: str) -> Dict[str, Any]:
    """Convert a DataFrame with a WKT/GeoJSON geometry column to GeoJSON FeatureCollection."""
    import pandas as pd
    features = []

    for _, row in df.iterrows():
        raw = row[geom_col]
        if pd.isna(raw):
            continue
        raw = str(raw).strip()

        geometry = None
        # Try WKT
        if any(raw.upper().startswith(t) for t in ["POINT", "LINESTRING", "POLYGON", "MULTI", "GEOMETRYCOLLECTION"]):
            try:
                from shapely import wkt as shapely_wkt
                from shapely.geometry import mapping
                geom = shapely_wkt.loads(raw)
                geometry = mapping(geom)
            except Exception:
                continue
        # Try GeoJSON
        elif raw.startswith("{"):
            try:
                geometry = json.loads(raw)
            except Exception:
                continue

        if not geometry:
            continue

        props = {}
        for col in df.columns:
            if col == geom_col:
                continue
            val = row[col]
            if pd.isna(val):
                props[col] = None
            else:
                props[col] = val if not isinstance(val, float) or not (val != val) else None

        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": geometry
        })

    if not features:
        raise HTTPException(status_code=400, detail="No valid geometries found in geometry column")

    return {"type": "FeatureCollection", "features": features}


def _reproject_geojson(geojson: Dict, source_crs: str) -> Dict:
    """Reproject GeoJSON from source CRS to EPSG:4326."""
    try:
        import geopandas as gpd
        from shapely.geometry import shape, mapping
        import numpy as np

        gdf = gpd.GeoDataFrame.from_features(geojson["features"], crs=source_crs)
        gdf = gdf.to_crs("EPSG:4326")

        # Clean NaN/Inf values
        for col in gdf.columns:
            if col != "geometry" and gdf[col].dtype in ['float64', 'float32']:
                gdf[col] = gdf[col].replace([np.inf, -np.inf], None)
                gdf[col] = gdf[col].where(gdf[col].notna(), None)

        return json.loads(gdf.to_json())
    except Exception as e:
        logger.warning(f"CRS reprojection failed from {source_crs}: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to reproject from {source_crs} to EPSG:4326: {str(e)}"
        )


def _validate_and_repair_geometries(geojson: Dict) -> Dict:
    """Validate geometries and repair invalid ones using Shapely."""
    try:
        from shapely.geometry import shape, mapping
        from shapely.validation import make_valid
    except ImportError:
        return geojson  # Skip validation if shapely not available

    repaired = 0
    for feature in geojson.get("features", []):
        geom = feature.get("geometry")
        if not geom:
            continue
        try:
            shp = shape(geom)
            if not shp.is_valid:
                shp = make_valid(shp)
                feature["geometry"] = mapping(shp)
                repaired += 1
        except Exception:
            pass  # Keep original geometry if repair fails

    if repaired > 0:
        logger.info(f"Repaired {repaired} invalid geometries")

    return geojson


# ==================== ENDPOINTS ====================

@router.post("/normalize", response_model=NormalizeResponse)
async def normalize_data(body: NormalizeRequest, request: Request):
    """
    Normalize any spatial data to clean GeoJSON.

    Accepts:
    - GeoJSON (any valid type — FeatureCollection, Feature, Geometry)
    - Coordinate arrays: [lng, lat] or [[lng, lat], ...]
    - WKT strings: "POINT(-122.4 37.8)", "POLYGON(...)"
    - CSV text with lat/lng or WKT geometry columns

    Returns a validated, EPSG:4326 GeoJSON FeatureCollection with metadata.

    This endpoint does NOT create a map — it's pure data normalization.
    Use this to clean data before feeding it to other APIs.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_normalize_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 60 requests per minute.")

    try:
        # Handle CSV text with custom options
        if isinstance(body.data, str) and body.input_format == "csv":
            geojson = _normalize_csv_text(
                body.data,
                lat_col=body.lat_column,
                lng_col=body.lng_column,
                geom_col=body.geometry_column,
                delimiter=body.delimiter or ","
            )
            detected_format = "csv"
        else:
            geojson, detected_format = normalize_to_geojson(body.data, body.input_format)

        # Reproject if source CRS specified
        if body.source_crs and body.source_crs.upper() != "EPSG:4326":
            geojson = _reproject_geojson(geojson, body.source_crs)

        # Validate and repair geometries
        geojson = _validate_and_repair_geometries(geojson)

        # Extract metadata
        geom_types = set()
        all_props = set()
        for feature in geojson.get("features", []):
            geom = feature.get("geometry", {})
            if geom:
                geom_types.add(geom.get("type"))
            for key in feature.get("properties", {}).keys():
                all_props.add(key)

        bounds = extract_bounds(geojson)

        metadata = SpatialMetadata(
            feature_count=len(geojson.get("features", [])),
            geometry_types=sorted(geom_types),
            bounds=bounds,
            crs="EPSG:4326",
            properties=sorted(all_props),
            input_format_detected=detected_format,
        )

        return NormalizeResponse(
            success=True,
            geojson=geojson,
            metadata=metadata,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Normalization error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to normalize data: {str(e)}")


@router.post("/normalize/file", response_model=NormalizeResponse)
async def normalize_file(
    request: Request,
    file: UploadFile = File(...),
    source_crs: Optional[str] = Query(default=None, description="Source CRS if not EPSG:4326"),
):
    """
    Normalize an uploaded spatial file to clean GeoJSON.

    Supports: GeoJSON, Shapefile (zip), KML/KMZ, GPX, GML, GeoPackage,
    DXF, CSV, SQLite/SpatiaLite, FlatGeobuf.

    Returns validated EPSG:4326 GeoJSON FeatureCollection with metadata.
    No map is created — pure normalization.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_normalize_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 60 requests per minute.")

    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is 50MB, got {len(contents) / 1024 / 1024:.1f}MB."
        )
    await file.seek(0)

    temp_dir = tempfile.mkdtemp()
    try:
        # Reuse file saving logic from main.py
        from main import save_upload, sanitize_for_json

        file_path = save_upload(file, temp_dir)

        # Handle CSV files
        if file_path.lower().endswith(".csv"):
            import pandas as pd
            df = pd.read_csv(file_path, low_memory=False)
            csv_text = df.to_csv(index=False)
            geojson = _normalize_csv_text(csv_text)
            detected_format = "csv"
        else:
            import geopandas as gpd
            import numpy as np
            gdf = gpd.read_file(file_path)

            # Reproject to EPSG:4326 if needed
            if gdf.crs and str(gdf.crs) != "EPSG:4326":
                gdf = gdf.to_crs("EPSG:4326")
            elif source_crs:
                gdf = gdf.set_crs(source_crs)
                gdf = gdf.to_crs("EPSG:4326")

            gdf = sanitize_for_json(gdf)
            geojson = json.loads(gdf.to_json())
            detected_format = os.path.splitext(file_path)[1].lstrip(".").lower()

        # Validate and repair
        geojson = _validate_and_repair_geometries(geojson)

        # Ensure it's a FeatureCollection
        if geojson.get("type") != "FeatureCollection":
            from api.maps import normalize_geojson
            geojson = normalize_geojson(geojson)

        # Extract metadata
        geom_types = set()
        all_props = set()
        for feature in geojson.get("features", []):
            geom = feature.get("geometry", {})
            if geom:
                geom_types.add(geom.get("type"))
            for key in feature.get("properties", {}).keys():
                all_props.add(key)

        bounds = extract_bounds(geojson)

        metadata = SpatialMetadata(
            feature_count=len(geojson.get("features", [])),
            geometry_types=sorted(geom_types),
            bounds=bounds,
            crs="EPSG:4326",
            properties=sorted(all_props),
            input_format_detected=detected_format,
        )

        return NormalizeResponse(
            success=True,
            geojson=geojson,
            metadata=metadata,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File normalization error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to normalize file: {str(e)}")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/normalize/addresses", response_model=NormalizeResponse)
async def normalize_addresses(body: NormalizeAddressesRequest, request: Request):
    """
    Geocode a list of addresses and return normalized GeoJSON.

    Each address is geocoded and returned as a Point feature with
    the original address and geocoding metadata in properties.

    No map is created — this is pure geocoding + normalization.
    Use this to convert address lists to spatial data for your own pipelines.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_normalize_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 60 requests per minute.")

    if len(body.addresses) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 addresses per request")

    if not body.addresses:
        raise HTTPException(status_code=400, detail="At least one address is required")

    import asyncio
    from api.geocode import geocode_search, parse_nominatim_result

    features = []
    failed = []

    async def _geocode_one(address: str, index: int):
        try:
            results = await geocode_search(address, limit=1, country=body.country)
            if results:
                r = results[0]
                parsed = parse_nominatim_result(r)
                props = {"address_input": address, "index": index}
                if body.include_metadata:
                    props["display_name"] = parsed.display_name
                    props["type"] = parsed.type
                    props["importance"] = parsed.importance
                    if parsed.address:
                        props["address_components"] = parsed.address
                return {
                    "type": "Feature",
                    "properties": props,
                    "geometry": {
                        "type": "Point",
                        "coordinates": [parsed.lng, parsed.lat]
                    }
                }
            else:
                return None
        except Exception as e:
            logger.warning(f"Geocoding failed for '{address}': {e}")
            return None

    tasks = [_geocode_one(addr, i) for i, addr in enumerate(body.addresses)]
    results = await asyncio.gather(*tasks)

    for i, result in enumerate(results):
        if result:
            features.append(result)
        else:
            failed.append(body.addresses[i])

    geojson = {"type": "FeatureCollection", "features": features}
    bounds = extract_bounds(geojson)

    metadata = SpatialMetadata(
        feature_count=len(features),
        geometry_types=["Point"] if features else [],
        bounds=bounds,
        crs="EPSG:4326",
        properties=sorted(set(
            k for f in features for k in f.get("properties", {}).keys()
        )),
        input_format_detected="addresses",
    )

    return NormalizeResponse(
        success=True,
        geojson=geojson,
        metadata=metadata,
    )
