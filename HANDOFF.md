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
  server.py            ← MODIFIED — 16 tools (was 8), dataset CRUD + points tools added
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
| `PUT` | `/api/dataset/{id}` | Update dataset metadata (owner only, auth required) |
| `DELETE` | `/api/dataset/{id}` | Delete a dataset (owner only, auth required) |
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

All base points are multiplied by the contributor's tier (earn more = earn faster): **0-99 pts = 1x**, **100-499 pts = 2x**, **500+ pts = 3x**. Defined in `api/contributions.py` `CONTRIBUTION_TIERS`. This replaces the old plan-based multiplier — growth first, monetization later.

| Action | Base Points | Where tracked |
|---|---|---|
| `dataset_upload` | +50 | `api/datasets.py` create_dataset endpoint |
| `map_create` | +5 | `api/maps.py` create_map + `api/nlp_maps.py` all 3 endpoints |
| `map_create_with_layers` | +10 | `api/maps.py` create_map endpoint (when layer_ids used) |
| `dataset_used_in_map` | +5 | `api/maps.py` layer_ids loop → rewards dataset uploader |
| `dataset_query` | +1 | `api/datasets.py` geojson endpoint → rewards dataset uploader |
| `map_views_100` | +10 | `api/maps.py` get_map → `_check_view_milestones()` |
| `map_views_1000` | +50 | `api/maps.py` get_map → `_check_view_milestones()` |

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
- New functions at bottom: `create_dataset`, `get_dataset`, `dataset_exists`, `search_datasets`, `get_dataset_count`, `update_dataset`, `delete_dataset`, `increment_dataset_query_count`, `increment_dataset_used_in_maps`, `record_contribution`, `award_points`, `get_leaderboard`, `get_points`, `get_user_plan`, `get_dataset_uploader_info`.
- `increment_dataset_query_count` / `increment_dataset_used_in_maps`: now also recompute `reputation_score` inline.
- `increment_map_views`: now returns new view count (for milestone checking).

### `api/maps.py`
- Added imports: `get_dataset as db_get_dataset`, `increment_dataset_used_in_maps`, `record_contribution`, `award_points`, `get_dataset_uploader_info`, `get_user_plan`, `get_points_multiplier`
- Added tiered rate limit constants: `RATE_LIMIT_MAX_ANONYMOUS` (100), `RATE_LIMIT_MAX_FREE` (200), `RATE_LIMIT_MAX_PRO` (500)
- Added `POINTS_MAP_CREATE` (5), `POINTS_MAP_WITH_LAYERS` (10), `POINTS_DATASET_USED_IN_MAP` (5)
- `check_rate_limit()` now accepts optional `user_plan` parameter for tiered limiting
- `MapRequest` model: added `layer_ids`, `agent_id`, `agent_name` fields
- `create_map` endpoint: added composable layer merging, agent attribution, contribution tracking, plan multiplier, dataset uploader rewards
- New helper: `_update_map_agent_fields()` — sets agent_id/name/source_dataset_ids on maps row
- New helper: `_check_view_milestones()` — awards +10 at 100 views, +50 at 1000 views
- `get_map` endpoint: now calls `_check_view_milestones()` after incrementing views

### `api/nlp_maps.py`
- Added `agent_id`, `agent_name` fields to `TextMapRequest`, `AddressMapRequest`, `RouteMapRequest`
- All 3 endpoints now: record contributions, award points (with plan multiplier), set agent attribution
- Imported `_update_map_agent_fields`, `POINTS_MAP_CREATE`, `get_points_multiplier`, `record_contribution`, `award_points`

### `api/datasets.py`
- `create_dataset` endpoint: now applies contribution-tier multiplier to upload points
- `get_dataset_geojson` endpoint: now rewards dataset uploader with +1 point per query (multiplied by uploader's tier)
- NEW: `PUT /api/dataset/{id}` — update dataset metadata (owner only, auth required)
- NEW: `DELETE /api/dataset/{id}` — delete dataset (owner only, auth required)
- Added `DatasetUpdateRequest` model

### `api/contributions.py`
- Replaced `PLAN_MULTIPLIERS` with `CONTRIBUTION_TIERS` — earn more = earn faster (not pay-to-earn)
- `get_points_multiplier()` now takes `(entity_type, entity_id)` and looks up total_points from ledger
- Tiers: 0-99 pts = 1x, 100-499 = 2x, 500+ = 3x
- Platform stats endpoint now returns `contribution_tiers` in response

### `main.py`
- Imported and registered `datasets_router` and `contributions_router`

### `mcp-server/server.py`
- Added `AGENT_ID`, `AGENT_NAME` env vars
- Added `_agent_fields()` helper
- `create_map` tool: added `layer_ids` parameter
- All map creation tools: auto-attach agent fields
- New tools: `search_datasets`, `get_dataset`, `upload_dataset`, `update_dataset`, `delete_dataset`, `get_leaderboard`, `get_my_points`
- New resource: `spatix://points-schedule` (updated with contribution tiers)
- Updated `get_my_points` text: replaced "pro users earn 3x" with contribution-tier language

## Known TODOs

1. ~~**Dataset uploader rewards not yet automatic**~~ — **DONE.** Uploaders are now rewarded when their data is used in maps (api/maps.py layer_ids loop) or queried (api/datasets.py geojson endpoint).

2. ~~**NLP endpoints don't pass agent attribution**~~ — **DONE.** All 3 NLP endpoints now accept agent_id/agent_name and record contributions + award points.

3. ~~**Seed data is simplified**~~ — **DONE.** `seed_datasets.py` now downloads real polygon boundaries from Natural Earth 110m at runtime for `ds_world-countries` and `ds_us-states`. Falls back to centroid points if download fails. Other datasets (airports, cities, landmarks, etc.) remain as points — correctly represented.

4. ~~**No dataset update/delete endpoints**~~ — **DONE.** `PUT /api/dataset/{id}` and `DELETE /api/dataset/{id}` added with owner-only auth. DB functions `update_dataset()` and `delete_dataset()` added. MCP tools `update_dataset` and `delete_dataset` added.

5. **No dataset versioning** — The `updated_at` column exists but there's no version history. For v2, consider a `dataset_versions` table.

6. ~~**Reputation score not computed**~~ — **DONE.** Reputation is now recomputed inline in `increment_dataset_query_count()` and `increment_dataset_used_in_maps()` using formula: `(query_count * 1) + (used_in_maps * 10) + (verified * 100)`.

7. ~~**View milestones don't trigger points**~~ — **DONE.** `_check_view_milestones()` in api/maps.py awards +10 at 100 views, +50 at 1000 views (with contribution-tier multiplier).

8. **Publish MCP server to registries** — Get listed on Smithery, MCP Hub, and any other tool discovery platforms.

9. ~~**JWT missing `plan` field**~~ — **DONE.** `create_jwt` now accepts and includes `plan` in the JWT payload. All auth flows (login, Google OAuth, Apple OAuth) now pass user's plan to `create_jwt`.
