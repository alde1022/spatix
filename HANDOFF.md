# Agent Handoff: Dataset Registry, Points System & MCP Server

This document tells you what was built, where the code lives, how it connects, and what to do next.

## Architecture Overview

```
/backend
  database.py          ← 3 new tables + CRUD functions (bottom of file)
  api/datasets.py      ← NEW — dataset registry endpoints
  api/contributions.py ← NEW — points, leaderboard endpoints
  api/maps.py          ← MODIFIED — agent attribution, composable layers, contribution tracking
  main.py              ← MODIFIED — two new routers wired in
  seed_datasets.py     ← NEW — run once to populate 10 seed datasets

/mcp-server
  server.py            ← MODIFIED — 14 tools (was 8), dataset + points tools added
  README.md            ← MODIFIED — updated docs
  requirements.txt     ← unchanged
  pyproject.toml       ← unchanged
```

## Database Changes

Three new tables were added to `database.py` `init_db()` (both PostgreSQL and SQLite blocks):

### `datasets`
Public geospatial dataset registry. Stores GeoJSON in `data` column (JSONB on PG, TEXT on SQLite).

Key columns: `id` (ds_xxx format), `title`, `description`, `category`, `tags`, `data` (GeoJSON), `feature_count`, `geometry_types`, `bbox_west/south/east/north`, `query_count`, `used_in_maps`, `verified`, `reputation_score`, `uploader_id`, `uploader_email`, `agent_id`, `agent_name`.

### `contributions`
Immutable event log of every valuable action.

Key columns: `action` (dataset_upload, map_create, etc.), `resource_type`, `resource_id`, `points_awarded`, `user_id`, `user_email`, `agent_id`, `agent_name`, `metadata` (JSONB), `ip_address`.

### `points_ledger`
Aggregated scores per entity. UNIQUE constraint on `(entity_type, entity_id)`.

Key columns: `entity_type` (user/agent), `entity_id`, `total_points`, `datasets_uploaded`, `maps_created`, `data_queries_served`, `total_map_views`.

### Modified: `maps`
Three new columns added via ALTER TABLE:
- `agent_id TEXT` — which agent created this map
- `agent_name TEXT` — display name of the agent
- `source_dataset_ids TEXT` — JSON array of dataset IDs composed into this map

## New API Endpoints

### Dataset Registry (`api/datasets.py`)
| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/dataset` | Upload a public dataset (earns +50 points) |
| `GET` | `/api/dataset/{id}` | Get dataset metadata (no data payload) |
| `GET` | `/api/dataset/{id}/geojson` | Get GeoJSON data. Optional `?bbox=w,s,e,n` filter |
| `GET` | `/api/datasets` | Search datasets. Params: `q`, `category`, `bbox`, `limit`, `offset` |
| `GET` | `/api/datasets/categories` | List the 10 valid categories |

### Contributions & Points (`api/contributions.py`)
| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/leaderboard` | Points leaderboard. Params: `limit`, `entity_type` |
| `GET` | `/api/points/{entity_type}/{entity_id}` | Points for a specific user or agent |
| `GET` | `/api/contributions/stats` | Platform-wide stats |

## How The Systems Connect

### Map creation flow (with new features)
```
Agent calls POST /api/map with:
  data: { GeoJSON },
  layer_ids: ["ds_us-states"],     ← composable layers (optional)
  agent_id: "claude-xyz",          ← attribution (optional)
  agent_name: "My Agent"

Backend:
  1. normalize GeoJSON (existing logic)
  2. If layer_ids provided:
     - Look up each dataset from DB
     - Merge features into the GeoJSON (tagged with _source_dataset property)
     - Call increment_dataset_used_in_maps() for each
  3. Save map to DB (existing logic)
  4. If agent_id/agent_name/source_dataset_ids:
     - Call _update_map_agent_fields() to set them on the maps row
  5. Record contribution to contributions table
  6. Award points to points_ledger (5 for normal map, 10 if layer_ids used)
  7. Return URL + embed code
```

### Dataset upload flow
```
Agent calls POST /api/dataset with:
  title, data (GeoJSON FeatureCollection), category, tags, agent_id, agent_name

Backend:
  1. Validate GeoJSON (must be FeatureCollection, max 100k features)
  2. Extract metadata (bbox, feature_count, geometry_types, file_size)
  3. Generate ds_xxx ID
  4. Insert into datasets table
  5. Record contribution (+50 points)
  6. Award points to points_ledger
```

### MCP Server flow
```
MCP Client (Claude Desktop, etc.) connects to server.py via stdio

Environment vars:
  SPATIX_API_URL    → backend URL (default: https://api.spatix.io)
  SPATIX_API_TOKEN  → optional JWT
  SPATIX_AGENT_ID   → agent's unique ID (for attribution + points)
  SPATIX_AGENT_NAME → agent's display name

All map creation tools auto-attach agent_id/agent_name from env vars.
_agent_fields() helper returns {"agent_id": ..., "agent_name": ...} dict.
```

## Points Schedule

| Action | Points | Where tracked |
|---|---|---|
| `dataset_upload` | +50 | `api/datasets.py` create_dataset endpoint |
| `map_create` | +5 | `api/maps.py` create_map endpoint |
| `map_create_with_layers` | +10 | `api/maps.py` create_map endpoint (when layer_ids used) |
| `dataset_used_in_map` | +5 | Not yet auto-awarded to dataset uploader (see TODO) |
| `dataset_query` | +1 | Not yet auto-awarded to dataset uploader (see TODO) |

## Seed Data

`seed_datasets.py` contains 10 datasets with stable IDs:
- `ds_world-countries` — 15 country centroids
- `ds_us-states` — 16 US state centroids
- `ds_us-national-parks` — 15 parks
- `ds_world-major-cities` — 25 cities
- `ds_us-major-airports` — 12 airports
- `ds_world-landmarks` — 16 landmarks
- `ds_us-tech-hubs` — 12 tech hubs
- `ds_world-universities-top` — 12 universities
- `ds_world-major-ports` — 12 seaports
- `ds_us-hospitals-major` — 10 hospitals

Run: `cd backend && python seed_datasets.py`

These are centroid/point data with properties. They're representative samples — a real deployment should pull full polygon datasets from Natural Earth, Census TIGER, etc.

## What Modified Files Changed

### `database.py`
- `init_db()`: Added CREATE TABLE for datasets, contributions, points_ledger (both PG + SQLite blocks). Added ALTER TABLE for maps.agent_id, agent_name, source_dataset_ids.
- New functions at bottom: `create_dataset`, `get_dataset`, `dataset_exists`, `search_datasets`, `get_dataset_count`, `increment_dataset_query_count`, `increment_dataset_used_in_maps`, `record_contribution`, `award_points`, `get_leaderboard`, `get_points`.

### `api/maps.py`
- Added imports: `get_dataset as db_get_dataset`, `increment_dataset_used_in_maps`, `record_contribution`, `award_points`
- Added tiered rate limit constants: `RATE_LIMIT_MAX_ANONYMOUS` (100), `RATE_LIMIT_MAX_FREE` (200), `RATE_LIMIT_MAX_PRO` (500)
- Added `POINTS_MAP_CREATE` (5), `POINTS_MAP_WITH_LAYERS` (10)
- `check_rate_limit()` now accepts optional `user_plan` parameter for tiered limiting
- `MapRequest` model: added `layer_ids`, `agent_id`, `agent_name` fields
- `create_map` endpoint: added composable layer merging, agent attribution, contribution tracking
- New helper: `_update_map_agent_fields()` — sets agent_id/name/source_dataset_ids on maps row

### `main.py`
- Imported and registered `datasets_router` and `contributions_router`

### `mcp-server/server.py`
- Added `AGENT_ID`, `AGENT_NAME` env vars
- Added `_agent_fields()` helper
- `create_map` tool: added `layer_ids` parameter
- All map creation tools: auto-attach agent fields
- New tools: `search_datasets`, `get_dataset`, `upload_dataset`, `get_leaderboard`, `get_my_points`
- New resource: `spatix://points-schedule`

## Known TODOs

1. **Dataset uploader rewards not yet automatic** — When dataset X is used in a map or queried, points are awarded to the map creator but NOT yet propagated back to dataset X's uploader. Need to look up the uploader's entity_type/id from the datasets table and call `award_points()` for them too. Do this in `api/maps.py` inside the layer_ids loop, and in `api/datasets.py` in the geojson endpoint.

2. **NLP endpoints don't pass agent attribution** — `api/nlp_maps.py` endpoints (from-text, from-addresses, route) accept `email` but not `agent_id`/`agent_name`. Add these fields to `TextMapRequest`, `AddressMapRequest`, `RouteMapRequest` and thread them through to `db_create_map` + contribution recording.

3. **Seed data is simplified** — Current seed datasets use point centroids. For real boundaries (polygon outlines of countries/states), download full GeoJSON from Natural Earth or Census TIGER and import them. The schema supports up to 100k features per dataset.

4. **No dataset update/delete endpoints** — Only create and read exist. Add `PUT /api/dataset/{id}` and `DELETE /api/dataset/{id}` following the same auth pattern as maps.

5. **No dataset versioning** — The `updated_at` column exists but there's no version history. For v2, consider a `dataset_versions` table.

6. **Reputation score not computed** — `datasets.reputation_score` is always 0. Compute it from a formula like: `(query_count * 1) + (used_in_maps * 10) + (verified * 100)`. Run this as a periodic job or compute on write.

7. **View milestones don't trigger points** — The points schedule includes +10 at 100 views and +50 at 1000 views, but `increment_map_views()` in `database.py` doesn't check thresholds. Add a check after incrementing.

8. **Publish MCP server to registries** — Get listed on Smithery, MCP Hub, and any other tool discovery platforms.
