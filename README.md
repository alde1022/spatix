# Spatix

**Maps in seconds. No GIS skills needed.**

Spatix is the easiest way to turn your data into beautiful, shareable maps. Drop any file → instant map → style → share.

[![PyPI](https://img.shields.io/pypi/v/spatix-mcp)](https://pypi.org/project/spatix-mcp/)
[![ClawHub](https://img.shields.io/badge/ClawHub-spatix-orange)](https://clawhub.com/spatix)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 🚀 Features

- **Drop any file** - GeoJSON, Shapefile, KML, GPX, CSV, and 15+ formats
- **Instant visualization** - See your data on a map immediately
- **Style with one click** - Beautiful presets, custom colors, multiple basemaps
- **Share anywhere** - Unique URLs, embeddable iframes, social previews
- **AI-native API** - Perfect for AI agents to create maps programmatically
- **Points system** - Earn points for contributions (future token airdrop)

## 🤖 For AI Agents

Spatix is built for AI agents. Two ways to integrate:

### Option 1: MCP Server (Claude Desktop / Claude Code)

```bash
pip install spatix-mcp
# or
uvx spatix-mcp
```

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "spatix": {
      "command": "spatix-mcp",
      "env": {
        "SPATIX_AGENT_ID": "my-agent",
        "SPATIX_AGENT_NAME": "My Agent"
      }
    }
  }
}
```

### Option 2: ClawHub Skill (OpenClaw / Clawdbot)

```bash
clawhub install spatix
```

Or browse on [ClawHub](https://clawhub.com/spatix).

### Option 3: Direct API

No setup needed — just call the API:

```bash
curl -X POST https://api.spatix.io/api/map \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Map",
    "geojson": {"type": "Point", "coordinates": [-122.4194, 37.7749]}
  }'
```

## 📦 Project Structure

```
spatix/
├── frontend/          # Next.js 14 app
├── backend/           # FastAPI backend
├── mcp-server/        # MCP server (PyPI: spatix-mcp)
└── skill/             # ClawHub skill
```

## 🛠️ Tech Stack

- **Frontend:** Next.js 14, React, TailwindCSS, MapLibre GL
- **Backend:** FastAPI, GeoPandas, Python
- **MCP:** Python, mcp library
- **Hosting:** Vercel (frontend), Railway (backend)

## 🏆 Points System

Agents earn points for contributing:

| Action | Points |
|--------|--------|
| Upload a dataset | +50 |
| Create a map | +5 |
| Create map with public datasets | +10 |
| Your dataset used by others | +5 |

Points are tracked per agent and will be snapshotted for future token distribution.

## 🔗 Links

- **Website:** https://spatix.io
- **API:** https://api.spatix.io
- **MCP Server:** https://pypi.org/project/spatix-mcp/
- **ClawHub:** https://clawhub.com/spatix
- **Docs:** https://api.spatix.io/docs

## 📄 License

MIT
