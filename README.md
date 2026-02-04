# MapCanvas

**Maps in seconds. No GIS skills needed.**

MapCanvas is the easiest way to turn your data into beautiful, shareable maps. Drop any file → instant map → style → share.

## 🚀 Features

- **Drop any file** - GeoJSON, Shapefile, KML, GPX, CSV, and 15+ formats
- **Instant visualization** - See your data on a map immediately
- **Style with one click** - Beautiful presets, custom colors, multiple basemaps
- **Share anywhere** - Unique URLs, embeddable iframes, social previews
- **AI-native API** - Perfect for AI agents to create maps programmatically

## 📦 Project Structure

```
mapcanvas/
├── frontend/           # Next.js 14 app
│   ├── app/
│   │   ├── page.tsx           # Hero + upload → canvas
│   │   ├── m/[id]/            # Map viewer/embed
│   │   ├── pricing/           # Pricing page
│   │   ├── developers/        # AI API documentation
│   │   └── layout.tsx
│   ├── components/
│   │   ├── MapCanvas.tsx      # Main canvas editor
│   │   ├── UploadZone.tsx     # Drag-drop upload
│   │   └── MapViewer.tsx      # Read-only map display
│   └── package.json
├── backend/            # FastAPI
│   ├── main.py
│   ├── api/
│   │   └── maps.py            # Map CRUD + AI API
│   ├── requirements.txt
│   └── Dockerfile
└── README.md
```

## 🛠️ Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

API at [http://localhost:8000](http://localhost:8000)

## 🔌 AI API

MapCanvas provides a dead-simple API for AI agents to create maps:

```bash
POST https://api.mapcanvas.io/map
{
  "data": {"type": "Point", "coordinates": [-122.4194, 37.7749]},
  "title": "San Francisco",
  "style": "dark"
}
```

Response:
```json
{
  "success": true,
  "id": "abc123",
  "url": "https://mapcanvas.io/m/abc123",
  "embed": "<iframe src='...'></iframe>"
}
```

See [/developers](https://mapcanvas.io/developers) for full documentation.

## 📋 Supported Formats

| Input | Extensions |
|-------|------------|
| GeoJSON | .geojson, .json |
| Shapefile | .zip (containing .shp) |
| KML/KMZ | .kml, .kmz |
| GPX | .gpx |
| GeoPackage | .gpkg |
| CSV | .csv (with lat/lng columns) |
| DXF | .dxf |
| GML | .gml |

## 🎨 Style Options

- **Basemaps**: Light, Dark, Satellite, Streets
- **Colors**: Presets + custom hex colors
- **Opacity**: Adjustable fill opacity
- **Markers**: Custom pins with labels

## 📄 License

MIT

---

Built with ❤️ for the geo community.
