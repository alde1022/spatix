# Spatix

**Maps in seconds. No GIS skills needed.**

Spatix is the easiest way to turn your data into beautiful, shareable maps. Drop any file → instant map → style → share.

## 🚀 Features

- **Drop any file** - GeoJSON, Shapefile, KML, GPX, CSV, and 15+ formats
- **Instant visualization** - See your data on a map immediately
- **Style with one click** - Beautiful presets, custom colors, multiple basemaps
- **Share anywhere** - Unique URLs, embeddable iframes, social previews
- **AI-native API** - Perfect for AI agents to create maps programmatically

## 📦 Project Structure

```
spatix/
├── frontend/           # Next.js 14 app
│   ├── app/           # Pages and routes
│   ├── components/    # React components
│   └── public/        # Static assets
├── backend/           # FastAPI backend
│   ├── api/           # API routes
│   └── main.py        # App entry point
```

## 🛠️ Tech Stack

- **Frontend:** Next.js 14, React, TailwindCSS, MapLibre GL
- **Backend:** FastAPI, GeoPandas, Python
- **Hosting:** Vercel (frontend), Railway (backend)
- **Domain:** spatix.io

## 🚀 Quick Start

### API Usage

```bash
curl -X POST https://api.spatix.io/api/map \
  -H "Content-Type: application/json" \
  -d '{
    "data": {"type": "Point", "coordinates": [-122.4194, 37.7749]},
    "title": "San Francisco"
  }'
```

### Response

```json
{
  "success": true,
  "id": "abc123",
  "url": "https://spatix.io/m/abc123"
}
```

## 📄 License

MIT
