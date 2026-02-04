\"\"\"
MapCanvas API
Maps in seconds. No GIS skills needed.

FastAPI backend for file processing and map storage.
\"\"\"
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
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

# Import map routes
from api.maps import router as maps_router

# Supported formats
INPUT_FORMATS = {
    ".shp": "ESRI Shapefile",
    ".geojson": "GeoJSON",
    ".json": "GeoJSON",
    ".kml": "KML",
    ".kmz": "KML",
    ".gpx": "GPX",
    ".gml": "GML",
    ".gpkg": "GPKG",
    ".dxf": "DXF",
    ".csv": "CSV",
    ".sqlite": "SQLite",
    ".fgb": "FlatGeobuf",
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title="MapCanvas API",
    version="1.0.0",
    description="Maps in seconds. No GIS skills needed.",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include map routes
app.include_router(maps_router)


def cleanup_later(background_tasks: BackgroundTasks, path: str):
    \"\"\"Schedule cleanup after response is sent.\"\"\"
    def cleanup():
        try:
            if os.path.isdir(path):
                shutil.rmtree(path)
            elif os.path.exists(path):
                os.remove(path)
        except:
            pass
    background_tasks.add_task(cleanup)


def sanitize_for_json(gdf):
    \"\"\"Replace NaN, Inf, -Inf values with None for JSON compatibility.\"\"\"
    for col in gdf.columns:
        if col == "geometry":
            continue
        if gdf[col].dtype in [np.float64, np.float32, "float64", "float32"]:
            gdf[col] = gdf[col].replace([np.inf, -np.inf], np.nan)
            gdf[col] = gdf[col].where(gdf[col].notna(), None)
        elif gdf[col].dtype == "object":
            # Handle potential float strings
            pass
    return gdf


def save_upload(upload_file: UploadFile, temp_dir: str) -> str:
    \"\"\"Save uploaded file and extract if zip/kmz.\"\"\"
    file_path = os.path.join(temp_dir, upload_file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
    
    filename_lower = upload_file.filename.lower()
    
    # Handle zip files
    if filename_lower.endswith(".zip"):
        extract_dir = os.path.join(temp_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        with ZipFile(file_path, "r") as z:
            z.extractall(extract_dir)
        
        for root, dirs, files in os.walk(extract_dir):
            for f in files:
                fl = f.lower()
                if fl.endswith(".shp"):
                    return os.path.join(root, f)
                if fl.endswith(".gpkg"):
                    return os.path.join(root, f)
                if fl.endswith(".geojson") or fl.endswith(".json"):
                    return os.path.join(root, f)
        
        raise HTTPException(status_code=400, detail="No supported data file found in zip")
    
    # Handle KMZ
    if filename_lower.endswith(".kmz"):
        extract_dir = os.path.join(temp_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        with ZipFile(file_path, "r") as z:
            z.extractall(extract_dir)
        
        for root, dirs, files in os.walk(extract_dir):
            for f in files:
                if f.lower().endswith(".kml"):
                    return os.path.join(root, f)
        raise HTTPException(status_code=400, detail="No KML file found in KMZ")
    
    return file_path


@app.get("/")
def health():
    return {
        "status": "ok",
        "service": "mapcanvas-api",
        "version": "1.0.0",
        "tagline": "Maps in seconds. No GIS skills needed.",
        "formats": list(INPUT_FORMATS.keys())
    }


@app.get("/formats")
def list_formats():
    \"\"\"List all supported input formats.\"\"\"
    return {
        "input_formats": [
            {"ext": ".shp (zip)", "name": "ESRI Shapefile"},
            {"ext": ".geojson", "name": "GeoJSON"},
            {"ext": ".kml/.kmz", "name": "Google KML"},
            {"ext": ".gpx", "name": "GPS Exchange"},
            {"ext": ".gml", "name": "Geography Markup Language"},
            {"ext": ".gpkg", "name": "GeoPackage"},
            {"ext": ".dxf", "name": "AutoCAD DXF"},
            {"ext": ".csv", "name": "CSV with lat/lng or geometry columns"},
            {"ext": ".sqlite", "name": "SQLite/SpatiaLite"},
            {"ext": ".fgb", "name": "FlatGeobuf"},
        ],
        "csv_requirements": "CSV files need columns named latitude/longitude, lat/lng, lat/lon, y/x, or a WKT geometry column."
    }


@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    include_preview: bool = Query(False, description="Include GeoJSON preview")
):
    \"\"\"Analyze a GIS file and return metadata + optional GeoJSON preview.\"\"\"
    temp_dir = tempfile.mkdtemp()
    try:
        file_path = save_upload(file, temp_dir)
        
        # Special handling for CSV - try to detect coordinate columns
        if file_path.lower().endswith(".csv"):
            import pandas as pd
            df = pd.read_csv(file_path, low_memory=False)
            
            # Common coordinate column names
            lat_cols = ["latitude", "lat", "y", "LATITUDE", "LAT", "Y"]
            lng_cols = ["longitude", "lng", "lon", "long", "x", "LONGITUDE", "LNG", "LON", "LONG", "X"]
            
            lat_col = None
            lng_col = None
            
            for c in lat_cols:
                if c in df.columns:
                    lat_col = c
                    break
            for c in lng_cols:
                if c in df.columns:
                    lng_col = c
                    break
            
            if lat_col and lng_col:
                # Filter out rows with invalid coordinates
                df = df.dropna(subset=[lat_col, lng_col])
                df = df[df[lat_col].apply(lambda x: isinstance(x, (int, float)) and -90 <= x <= 90)]
                df = df[df[lng_col].apply(lambda x: isinstance(x, (int, float)) and -180 <= x <= 180)]
                
                if len(df) == 0:
                    raise HTTPException(status_code=400, detail="No valid coordinate rows found in CSV")
                
                gdf = gpd.GeoDataFrame(
                    df, 
                    geometry=gpd.points_from_xy(df[lng_col], df[lat_col]),
                    crs="EPSG:4326"
                )
            else:
                raise HTTPException(
                    status_code=400, 
                    detail=f"CSV must have coordinate columns (lat/lng, latitude/longitude, y/x). Found columns: {list(df.columns)[:10]}"
                )
        else:
            gdf = gpd.read_file(file_path)
        
        file_size = os.path.getsize(file_path)
        
        result = {
            "feature_count": len(gdf),
            "geometry_type": list(gdf.geom_type.unique()),
            "crs": str(gdf.crs) if gdf.crs else None,
            "bounds": list(gdf.total_bounds),
            "attributes": [c for c in gdf.columns if c != "geometry"],
            "file_size_bytes": file_size
        }
        
        # Add GeoJSON preview if requested
        if include_preview and not gdf.empty:
            try:
                preview_gdf = gdf.copy()
                if preview_gdf.crs and preview_gdf.crs != "EPSG:4326":
                    preview_gdf = preview_gdf.to_crs("EPSG:4326")
                
                # Limit features for large datasets
                if len(preview_gdf) > 1000:
                    preview_gdf = preview_gdf.head(1000)
                
                # Simplify geometries
                preview_gdf["geometry"] = preview_gdf["geometry"].simplify(0.0001)
                
                # Sanitize NaN/Inf values for JSON
                preview_gdf = sanitize_for_json(preview_gdf)
                
                result["preview_geojson"] = json.loads(preview_gdf.to_json())
            except Exception as e:
                print(f"Preview generation failed: {e}")
                result["preview_error"] = str(e)
                result["preview_geojson"] = None
        
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {str(e)}")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
