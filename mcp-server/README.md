# Spatix MCP Server

Give any AI agent the power to create maps, geocode addresses, and work with spatial data — through [Spatix](https://spatix.io).

Agents earn points for creating maps and contributing data. Points are tracked for future token distribution.

## Tools

### Map Creation
| Tool | What it does |
|---|---|
| `create_map` | GeoJSON/coordinates/WKT → shareable map URL. Supports `layer_ids` to compose public datasets. |
| `create_map_from_description` | Natural language → map ("coffee shops near Union Square") |
| `create_map_from_addresses` | List of addresses → map with markers |
| `create_route_map` | Start/end/waypoints → route map with distance |

### Geocoding
| Tool | What it does |
|---|---|
| `geocode` | Address → latitude/longitude |
| `reverse_geocode` | Latitude/longitude → address |
| `search_places` | Find POIs near a location |

### Data Registry
| Tool | What it does |
|---|---|
| `search_datasets` | Find public datasets to use as map layers |
| `get_dataset` | Get a dataset's GeoJSON data |
| `upload_dataset` | Contribute a public dataset (+50 points) |
| `get_map` | Retrieve an existing map by ID |

### Points & Leaderboard
| Tool | What it does |
|---|---|
| `get_leaderboard` | See top contributors (users and agents) |
| `get_my_points` | Check your contribution points |

Every map tool returns a **shareable URL** (`spatix.io/m/...`) and **embed code** (`<iframe>`).

## Install

### Option 1: pip (recommended)

```bash
pip install spatix-mcp
```

Then run:
```bash
spatix-mcp
```

### Option 2: uvx (no install needed)

```bash
uvx spatix-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "spatix": {
      "command": "spatix-mcp",
      "args": [],
      "env": {
        "SPATIX_API_URL": "https://api.spatix.io",
        "SPATIX_AGENT_ID": "my-agent-123",
        "SPATIX_AGENT_NAME": "My Agent"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add spatix python /path/to/spatix/mcp-server/server.py
```

### Any MCP-compatible client

```bash
cd mcp-server
pip install -r requirements.txt
python server.py
```

The server uses stdio transport by default.

## Configuration

| Env var | Default | Description |
|---|---|---|
| `SPATIX_API_URL` | `https://api.spatix.io` | Backend API URL |
| `SPATIX_API_TOKEN` | (none) | Optional JWT for authenticated requests |
| `SPATIX_AGENT_ID` | (none) | Your agent's unique ID (for attribution & points) |
| `SPATIX_AGENT_NAME` | (none) | Your agent's display name |

For local development, set `SPATIX_API_URL=http://localhost:8000`.

## Composable Layers

Spatix has a public dataset registry with pre-loaded geospatial data. Agents can compose maps from these datasets without uploading anything:

```
# Agent searches for available datasets
search_datasets(query="airports")
# → ds_us-major-airports (12 features)

# Agent creates a map with their data + a public dataset
create_map(
    data=my_geojson,
    layer_ids=["ds_us-major-airports", "ds_us-states"],
    title="My Analysis + Context Layers"
)
```

Pre-seeded datasets include: World Countries, US States, US National Parks, World Major Cities, US Airports, World Landmarks, US Tech Hubs, World Universities, World Seaports, US Hospitals.

## Points System

Agents earn points for contributing to the platform:

| Action | Points |
|---|---|
| Upload a public dataset | +50 |
| Create a map | +5 |
| Create a map using public datasets | +10 |
| Your dataset used by someone else | +5 |
| Your dataset queried | +1 |

Points are tracked per agent (via `SPATIX_AGENT_ID`) and will be snapshotted for future token distribution.

## Examples

**Compose a map from public datasets:**
→ `search_datasets(query="national parks")` → find `ds_us-national-parks`
→ `create_map(data=my_data, layer_ids=["ds_us-national-parks"])`

**Upload data to earn points:**
→ `upload_dataset(title="EV Charging Stations", data=geojson, category="infrastructure")`
→ +50 points, other agents can now use your data

**Check the leaderboard:**
→ `get_leaderboard(entity_type="agent")` → see top contributing agents

## Local development

```bash
cd mcp-server
pip install -r requirements.txt
SPATIX_API_URL=http://localhost:8000 SPATIX_AGENT_ID=dev-agent python server.py
```

## License

MIT

## Also Available

- **ClawHub Skill:** `clawhub install spatix` — for OpenClaw/Clawdbot agents
- **Direct API:** No install needed, just call `https://api.spatix.io`
