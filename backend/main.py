"""
Spatix API
Maps in seconds. No GIS skills needed.

FastAPI backend for file processing and map storage.
"""
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, BackgroundTasks, Request
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
import os
import shutil
import tempfile
import geopandas as gpd
from shapely.validation import make_valid
from zipfile import ZipFile
import uuid
import json
import numpy as np
import re
import logging

logger = logging.getLogger(__name__)

# Import map routes
from api.maps import router as maps_router
from api.geocode import router as geocode_router
from api.nlp_maps import router as nlp_maps_router

# Environment configuration
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

# CORS configuration - restrict to specific origins in production
ALLOWED_ORIGINS = [
    FRONTEND_URL,
    "https://spatix.io",
    "https://www.spatix.io",
]
if ENVIRONMENT == "development":
    ALLOWED_ORIGINS.extend([
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
    ])

# Supported formats
INPUT_FORMATS = {
    '.shp': 'ESRI Shapefile',
    '.geojson': 'GeoJSON',
    '.json': 'GeoJSON',
    '.kml': 'KML',
    '.kmz': 'KML',
    '.gpx': 'GPX',
    '.gml': 'GML',
    '.gpkg': 'GPKG',
    '.dxf': 'DXF',
    '.csv': 'CSV',
    '.sqlite': 'SQLite',
    '.fgb': 'FlatGeobuf',
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # HSTS - only in production
        if ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Content Security Policy
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self'; "
            "connect-src 'self' https://api.maptiler.com https://*.tiles.mapbox.com; "
            "frame-ancestors 'none';"
        )

        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database on startup
    try:
        from database import init_db
        init_db()
        logger.info("Database initialized on startup")
    except Exception as e:
        logger.error(f"Failed to initialize database on startup: {e}")
    yield

app = FastAPI(
    title="Spatix API",
    version="1.0.0",
    description="Maps in seconds. No GIS skills needed.",
    lifespan=lifespan
)

# Add security headers middleware first
app.add_middleware(SecurityHeadersMiddleware)

# CORS - restricted to allowed origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Delete-Token"],
)

# Include map routes
app.include_router(maps_router)
app.include_router(geocode_router)
app.include_router(nlp_maps_router)


def sanitize_for_json(gdf):
    """Replace NaN, Inf, -Inf values with None for JSON compatibility."""
    for col in gdf.columns:
        if col == "geometry":
            continue
        if gdf[col].dtype in ["float64", "float32"]:
            gdf[col] = gdf[col].replace([np.inf, -np.inf], np.nan)
            gdf[col] = gdf[col].where(gdf[col].notna(), None)
    return gdf


def cleanup_later(background_tasks: BackgroundTasks, path: str):
    """Schedule cleanup after response is sent."""
    def cleanup():
        try:
            if os.path.isdir(path):
                shutil.rmtree(path)
            elif os.path.exists(path):
                os.remove(path)
        except Exception as e:
            logger.warning(f"Failed to cleanup temp path {path}: {e}")
    background_tasks.add_task(cleanup)


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal attacks."""
    # Remove any path components
    filename = os.path.basename(filename)
    # Remove null bytes and other dangerous characters
    filename = filename.replace('\x00', '')
    # Only allow alphanumeric, dots, underscores, and hyphens
    filename = re.sub(r'[^\w\.\-]', '_', filename)
    # Prevent hidden files
    if filename.startswith('.'):
        filename = '_' + filename[1:]
    # Ensure we have a filename
    if not filename:
        filename = "uploaded_file"
    return filename


def safe_extract_zip(zip_file: ZipFile, extract_dir: str) -> None:
    """Safely extract zip file, preventing zip slip attacks."""
    extract_dir = os.path.realpath(extract_dir)

    for member in zip_file.namelist():
        # Get the target path
        member_path = os.path.realpath(os.path.join(extract_dir, member))

        # Check for path traversal (zip slip attack)
        if not member_path.startswith(extract_dir + os.sep) and member_path != extract_dir:
            raise HTTPException(
                status_code=400,
                detail="Invalid zip file: contains files with unsafe paths"
            )

        # Check for dangerous filenames
        basename = os.path.basename(member)
        if basename.startswith('.') or '\x00' in member:
            continue  # Skip hidden and null-byte files

    # Safe to extract
    zip_file.extractall(extract_dir)


def save_upload(upload_file: UploadFile, temp_dir: str) -> str:
    """Save uploaded file and extract if zip/kmz."""
    # Sanitize filename to prevent path traversal
    safe_filename = sanitize_filename(upload_file.filename or "upload")
    file_path = os.path.join(temp_dir, safe_filename)

    # Verify the path is within temp_dir
    if not os.path.realpath(file_path).startswith(os.path.realpath(temp_dir)):
        raise HTTPException(status_code=400, detail="Invalid filename")

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)

    filename_lower = safe_filename.lower()

    # Handle zip files
    if filename_lower.endswith('.zip'):
        extract_dir = os.path.join(temp_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        with ZipFile(file_path, 'r') as z:
            safe_extract_zip(z, extract_dir)

        for root, dirs, files in os.walk(extract_dir):
            for f in files:
                fl = f.lower()
                if fl.endswith('.shp'):
                    return os.path.join(root, f)
                if fl.endswith('.gpkg'):
                    return os.path.join(root, f)
                if fl.endswith('.geojson') or fl.endswith('.json'):
                    return os.path.join(root, f)

        raise HTTPException(status_code=400, detail="No supported data file found in zip")

    # Handle KMZ
    if filename_lower.endswith('.kmz'):
        extract_dir = os.path.join(temp_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        with ZipFile(file_path, 'r') as z:
            safe_extract_zip(z, extract_dir)

        for root, dirs, files in os.walk(extract_dir):
            for f in files:
                if f.lower().endswith('.kml'):
                    return os.path.join(root, f)
        raise HTTPException(status_code=400, detail="No KML file found in KMZ")

    return file_path


@app.get("/")
def health():
    return {
        "status": "ok",
        "service": "spatix-api",
        "version": "1.0.0",
        "tagline": "Maps in seconds. No GIS skills needed.",
        "formats": list(INPUT_FORMATS.keys())
    }


@app.get("/formats")
def list_formats():
    """List all supported input formats."""
    return {
        "input_formats": [
            {"ext": ".shp (zip)", "name": "ESRI Shapefile"},
            {"ext": ".geojson", "name": "GeoJSON"},
            {"ext": ".kml/.kmz", "name": "Google KML"},
            {"ext": ".gpx", "name": "GPS Exchange"},
            {"ext": ".gml", "name": "Geography Markup Language"},
            {"ext": ".gpkg", "name": "GeoPackage"},
            {"ext": ".dxf", "name": "AutoCAD DXF"},
            {"ext": ".csv", "name": "CSV with coordinates"},
            {"ext": ".sqlite", "name": "SQLite/SpatiaLite"},
            {"ext": ".fgb", "name": "FlatGeobuf"},
        ]
    }


@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    include_preview: bool = Query(False, description="Include GeoJSON preview")
):
    """Analyze a GIS file and return metadata + optional GeoJSON preview."""
    temp_dir = tempfile.mkdtemp()
    try:
        file_path = save_upload(file, temp_dir)
        # Handle CSV files specially
        if file_path.lower().endswith(".csv"):
            import pandas as pd
            df = pd.read_csv(file_path, low_memory=False)
            lat_cols = ["LATITUDE", "latitude", "lat", "Latitude", "LAT", "y", "Y"]
            lng_cols = ["LONGITUDE", "longitude", "lng", "lon", "long", "Longitude", "LNG", "LON", "LONG", "x", "X"]
            lat_col = next((c for c in lat_cols if c in df.columns), None)
            lng_col = next((c for c in lng_cols if c in df.columns), None)
            if lat_col and lng_col:
                df = df.dropna(subset=[lat_col, lng_col])
                df = df[pd.to_numeric(df[lat_col], errors="coerce").notna()]
                df = df[pd.to_numeric(df[lng_col], errors="coerce").notna()]
                df[lat_col] = pd.to_numeric(df[lat_col])
                df[lng_col] = pd.to_numeric(df[lng_col])
                df = df[(df[lat_col] >= -90) & (df[lat_col] <= 90)]
                df = df[(df[lng_col] >= -180) & (df[lng_col] <= 180)]
                # Drop columns that might have Inf/NaN issues
                for col in df.columns:
                    if df[col].dtype in ['float64', 'float32']:
                        df[col] = df[col].replace([float('inf'), float('-inf')], None)
                        df[col] = df[col].where(df[col].notna(), None)
                if len(df) == 0:
                    raise HTTPException(status_code=400, detail="No valid coordinates found in CSV")
                gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df[lng_col], df[lat_col]), crs="EPSG:4326")
            else:
                raise HTTPException(status_code=400, detail=f"CSV needs lat/lng columns. Found: {list(df.columns)[:10]}")
        else:
            gdf = gpd.read_file(file_path)
        
        file_size = os.path.getsize(file_path)
        
        result = {
            "feature_count": len(gdf),
            "geometry_type": list(gdf.geom_type.unique()),
            "crs": str(gdf.crs) if gdf.crs else None,
            "bounds": list(gdf.total_bounds),
            "attributes": [c for c in gdf.columns if c != 'geometry'],
            "file_size_bytes": file_size
        }
        
        # Add GeoJSON preview if requested
        if include_preview and not gdf.empty:
            try:
                preview_gdf = gdf.copy()
                if preview_gdf.crs and preview_gdf.crs != 'EPSG:4326':
                    preview_gdf = preview_gdf.to_crs('EPSG:4326')
                
                # Limit features for large datasets
                if len(preview_gdf) > 1000:
                    preview_gdf = preview_gdf.head(1000)
                
                # Simplify geometries
                preview_gdf['geometry'] = preview_gdf['geometry'].simplify(0.0001)
                
                preview_gdf = sanitize_for_json(preview_gdf)
                result["preview_geojson"] = json.loads(preview_gdf.to_json())
            except Exception as e:
                logger.warning(f"Preview generation failed: {e}")
                result["preview_geojson"] = None
        
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        # Log the full error for debugging, but return a generic message to users
        logger.error(f"File analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail="Could not read file. Please check the file format is supported.")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


# Add auth router
try:
    from routers.auth import router as auth_router
    app.include_router(auth_router)
    logger.info("Auth router loaded successfully")
except Exception as e:
    logger.error(f"Auth router failed to load: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
