# Spatix MCP Server

Give any AI agent the power to create maps, geocode addresses, and work with spatial data — through [Spatix](https://spatix.io).

## Tools

| Tool | What it does |
|---|---|
| `create_map` | GeoJSON, coordinates, or WKT → shareable map URL |
| `create_map_from_description` | Natural language → map ("coffee shops near Union Square") |
| `create_map_from_addresses` | List of addresses → map with markers |
| `create_route_map` | Start/end/waypoints → route map with distance |
| `geocode` | Address → latitude/longitude |
| `reverse_geocode` | Latitude/longitude → address |
| `search_places` | Find POIs near a location |
| `get_map` | Retrieve an existing map by ID |

Every map tool returns a **shareable URL** (`spatix.io/m/...`) and **embed code** (`<iframe>`).

## Install

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "spatix": {
      "command": "python",
      "args": ["/path/to/spatix/mcp-server/server.py"],
      "env": {
        "SPATIX_API_URL": "https://api.spatix.io"
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

For local development, set `SPATIX_API_URL=http://localhost:8000`.

## Examples

Once connected, your agent can:

**"Show me the 5 largest cities in Japan on a map"**
→ Agent calls `create_map_from_description` → returns `spatix.io/m/abc123`

**"Map these warehouse addresses and connect them in order"**
→ Agent calls `create_map_from_addresses` with `connect_points=true`

**"What's the best route from Denver to Las Vegas through Moab?"**
→ Agent calls `create_route_map` with waypoints

**"Plot this GeoJSON data on a dark map"**
→ Agent calls `create_map` with GeoJSON + `style="dark"`

**"Where exactly is this coordinate: 48.8584, 2.2945?"**
→ Agent calls `reverse_geocode` → "Eiffel Tower, Paris"

## Local development

```bash
cd mcp-server
pip install -r requirements.txt
SPATIX_API_URL=http://localhost:8000 python server.py
```

## License

MIT
