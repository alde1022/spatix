# Spatix Data Platform Roadmap

**Goal:** Build a marketplace of useful geospatial datasets that agents and humans can discover, use, and pay for at scale.

**Vision:** Spatix becomes the place where AI agents go to get spatial data — and where data contributors earn money when their data gets used.

---

## Table of Contents

1. [Current State](#current-state)
2. [Point System v2](#point-system-v2)
3. [Data Discovery](#data-discovery)
4. [Dataset Metadata Standard](#dataset-metadata-standard)
5. [API Specification](#api-specification)
6. [Categories & Taxonomy](#categories--taxonomy)
7. [Quality & Trust Signals](#quality--trust-signals)
8. [Upload Flow](#upload-flow)
9. [Monetization](#monetization)
10. [Roadmap Phases](#roadmap-phases)

---

## Current State

What we have:
- ✅ Create maps from GeoJSON/CSV
- ✅ Geocoding (Nominatim + Photon)
- ✅ NLP map creation (from-text, from-addresses, route)
- ✅ Points system (basic)
- ✅ Leaderboard
- ✅ Pre-loaded datasets (ds_us-states, etc.)
- ✅ MCP server for Claude

What's missing:
- ❌ Dataset discovery/search
- ❌ Dataset catalog API
- ❌ Rich metadata
- ❌ Usage-based points
- ❌ Browse UI for datasets
- ❌ Quality signals
- ❌ Monetization

---

## Point System v2

### Problem with v1
Current system rewards **creation** (maps made, datasets uploaded). This incentivizes quantity over quality. Someone could spam junk datasets to farm points.

### New System: Reward Usefulness

| Action | Points | Rationale |
|--------|--------|-----------|
| Create a map | +5 | Base engagement |
| Upload a dataset | +10 | Contribution |
| **Your dataset used by someone else** | +50 | Proven utility |
| **Your dataset used 10+ times** | +100 bonus | High-value data |
| Map views (your maps) | +1 per 100 views | Engagement |
| Map embeds | +5 each | Distribution |
| Dataset downloads | +10 each | Direct value |
| API queries against your dataset | +1 per 100 | Machine usage |

### Anti-Spam Measures
- Cap points per dataset per day (max 500/day)
- Datasets with 0 usage after 30 days: no further points
- Duplicate detection: no points for near-identical uploads
- Quality gate: minimum metadata required

### Database Changes

```sql
-- Track dataset usage
CREATE TABLE dataset_usage (
    id SERIAL PRIMARY KEY,
    dataset_id VARCHAR(50) NOT NULL,
    used_in_map_id VARCHAR(50),
    used_by_user_id INTEGER,
    used_by_agent_id VARCHAR(100),
    usage_type VARCHAR(20), -- 'map_layer', 'download', 'api_query'
    created_at TIMESTAMP DEFAULT NOW()
);

-- Points ledger (detailed)
CREATE TABLE points_ledger (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(20), -- 'user' or 'agent'
    entity_id VARCHAR(100),
    action VARCHAR(50),
    points INTEGER,
    reference_type VARCHAR(50), -- 'map', 'dataset', 'usage'
    reference_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Data Discovery

### For Agents (API)

```bash
# Semantic search - find datasets by natural language
POST /api/datasets/search
{
  "query": "US county boundaries with population data",
  "limit": 10
}

# Response
{
  "datasets": [
    {
      "id": "ds_us-counties-demographics",
      "title": "US Counties with Demographics",
      "description": "County boundaries with 2020 census data",
      "usage_count": 1234,
      "rating": 4.8,
      "relevance_score": 0.94
    }
  ]
}

# Filtered search
GET /api/datasets?category=demographics&region=usa&format=geojson&min_rating=4

# Get dataset details
GET /api/datasets/{id}

# Get the actual data
GET /api/datasets/{id}/data?format=geojson

# Preview (first N features)
GET /api/datasets/{id}/preview?limit=5
```

### For Humans (UI)

New page: `spatix.io/datasets`

Features:
- Search bar with autocomplete
- Category sidebar (tree navigation)
- Filters: region, type, license, freshness, rating
- Map preview on hover/click
- Sort by: usage, rating, freshness, title
- "Use in Map" button → opens map editor with dataset loaded

---

## Dataset Metadata Standard

Every dataset must have:

```json
{
  "id": "ds_us-counties-demographics",
  "title": "US Counties with Demographics",
  "description": "County-level boundaries with 2020 Census population, median income, and age distribution data. Updated annually.",
  "category": "demographics/population",
  "tags": ["census", "demographics", "usa", "counties", "population"],
  
  "source": {
    "name": "US Census Bureau",
    "url": "https://census.gov",
    "retrieved_at": "2024-01-15"
  },
  
  "license": {
    "type": "public-domain",
    "attribution_required": false,
    "commercial_use": true
  },
  
  "coverage": {
    "bbox": [-125.0, 24.0, -66.0, 50.0],
    "region": "United States",
    "resolution": "county"
  },
  
  "freshness": {
    "data_date": "2024-01",
    "update_frequency": "yearly",
    "last_updated": "2024-01-15T00:00:00Z"
  },
  
  "schema": [
    {"name": "name", "type": "string", "description": "County name"},
    {"name": "state", "type": "string", "description": "State name"},
    {"name": "fips", "type": "string", "description": "FIPS code"},
    {"name": "population", "type": "integer", "description": "2020 Census population"},
    {"name": "median_income", "type": "number", "description": "Median household income USD"},
    {"name": "median_age", "type": "number", "description": "Median age in years"}
  ],
  
  "stats": {
    "feature_count": 3143,
    "file_size_bytes": 15234567,
    "geometry_types": ["Polygon", "MultiPolygon"]
  },
  
  "quality": {
    "completeness": 0.98,
    "verified": true,
    "verified_by": "spatix-team"
  },
  
  "creator": {
    "type": "user",
    "id": "alde1022",
    "name": "Alex"
  },
  
  "usage": {
    "maps_using": 1234,
    "downloads": 567,
    "api_queries": 89012
  },
  
  "created_at": "2024-01-15T00:00:00Z",
  "updated_at": "2024-01-15T00:00:00Z"
}
```

---

## API Specification

### Dataset Catalog

```
GET    /api/datasets                    List all datasets (paginated)
GET    /api/datasets/{id}               Get dataset metadata
GET    /api/datasets/{id}/data          Get full dataset GeoJSON
GET    /api/datasets/{id}/preview       Get sample (5 features)
GET    /api/datasets/{id}/schema        Get schema only
POST   /api/datasets/search             Semantic search
POST   /api/datasets                    Upload new dataset
PUT    /api/datasets/{id}               Update dataset metadata
DELETE /api/datasets/{id}               Delete dataset (owner only)
```

### Query Parameters

```
GET /api/datasets?
  category=demographics         # Filter by category
  region=usa                    # Filter by region
  tags=census,population        # Filter by tags (comma-separated)
  license=public-domain         # Filter by license type
  min_rating=4                  # Minimum rating
  min_usage=100                 # Minimum usage count
  format=geojson                # Data format
  sort=usage|rating|freshness   # Sort order
  order=desc|asc                # Sort direction
  page=1                        # Pagination
  limit=20                      # Results per page
```

### Response Format

```json
{
  "success": true,
  "datasets": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "pages": 8
  }
}
```

---

## Categories & Taxonomy

```
datasets/
├── boundaries/
│   ├── countries          # Country borders
│   ├── states-provinces   # State/province borders
│   ├── counties           # County/district borders
│   ├── cities             # City boundaries
│   ├── neighborhoods      # Neighborhood boundaries
│   ├── postal-codes       # ZIP/postal code areas
│   └── custom             # Custom boundaries
│
├── demographics/
│   ├── population         # Population counts, density
│   ├── income             # Income, poverty, wealth
│   ├── age                # Age distribution
│   ├── education          # Education levels
│   ├── employment         # Employment, occupations
│   └── housing            # Housing, home values
│
├── infrastructure/
│   ├── roads              # Roads, highways
│   ├── transit            # Public transit routes/stops
│   ├── airports           # Airports, helipads
│   ├── ports              # Seaports, harbors
│   ├── utilities          # Power, water, telecom
│   └── buildings          # Building footprints
│
├── environment/
│   ├── climate            # Weather, climate data
│   ├── terrain            # Elevation, topology
│   ├── water              # Rivers, lakes, watersheds
│   ├── land-use           # Land cover, zoning
│   ├── protected-areas    # Parks, reserves
│   └── hazards            # Flood zones, fire risk
│
├── business/
│   ├── poi                # Points of interest
│   ├── retail             # Stores, restaurants
│   ├── real-estate        # Properties, parcels
│   ├── economic           # GDP, trade, markets
│   └── companies          # Business locations
│
├── health/
│   ├── facilities         # Hospitals, clinics
│   ├── outcomes           # Disease rates, mortality
│   └── access             # Healthcare access
│
├── education/
│   ├── schools            # K-12 schools
│   ├── universities       # Higher education
│   └── districts          # School districts
│
├── public-safety/
│   ├── crime              # Crime statistics
│   ├── police             # Police stations
│   ├── fire               # Fire stations
│   └── emergency          # Emergency services
│
└── custom/
    └── user-uploaded      # User-contributed datasets
```

---

## Quality & Trust Signals

### Badges

| Badge | Criteria |
|-------|----------|
| ✓ Verified Source | Official government/institutional data |
| ⭐ High Quality | Completeness > 95%, schema documented |
| 🔥 Popular | Used in 1000+ maps |
| 🆕 Fresh | Updated within last 30 days |
| 👑 Top Contributor | Creator in top 10 leaderboard |

### Quality Score (0-100)

```
quality_score = (
    completeness * 30 +      # % of features with all fields
    schema_documented * 20 + # Has full schema
    source_verified * 20 +   # Source URL valid, authoritative
    freshness * 15 +         # How recent
    usage_signal * 15        # Usage / downloads
)
```

### User Ratings

- 1-5 stars
- Optional review text
- Only users who used the dataset can rate
- Show average + count

---

## Upload Flow

### API

```bash
POST /api/datasets
{
  "title": "SF Coffee Shops",
  "description": "Coffee shops in San Francisco with ratings and hours",
  "category": "business/poi",
  "tags": ["coffee", "san-francisco", "poi", "restaurants"],
  
  "source": {
    "name": "Yelp API + Manual Verification",
    "url": "https://yelp.com"
  },
  
  "license": {
    "type": "cc-by",
    "attribution_required": true,
    "commercial_use": true
  },
  
  "data": {
    "type": "FeatureCollection",
    "features": [...]
  },
  
  "schema": [
    {"name": "name", "type": "string", "description": "Shop name"},
    {"name": "rating", "type": "number", "description": "Yelp rating 1-5"},
    {"name": "address", "type": "string", "description": "Street address"}
  ],
  
  "agent_id": "my-agent",
  "agent_name": "My Agent"
}
```

### Validation

On upload, validate:
- [ ] Title required (3-100 chars)
- [ ] Description required (10-1000 chars)
- [ ] Valid category
- [ ] Valid GeoJSON
- [ ] At least 1 feature
- [ ] Max 50MB
- [ ] Schema matches data
- [ ] No duplicate of existing dataset (similarity check)

### Processing

After upload:
1. Generate ID (`ds_xxxxx`)
2. Calculate stats (feature count, bbox, geometry types)
3. Calculate completeness score
4. Store in database
5. Index for search
6. Award upload points

---

## Monetization

### Phase 1: Free + Attribution

All datasets free. Attribution required for some.

### Phase 2: Premium Datasets

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Public datasets, attribution required |
| Pro | $29/mo | Higher rate limits, no attribution, priority support |
| Enterprise | Custom | SLA, dedicated support, custom datasets |

### Phase 3: Data Marketplace

- Dataset creators set pricing (free, one-time, subscription)
- Spatix takes 20% platform fee
- Creators get 80% revenue share
- Stripe Connect for payouts

### Revenue Share Tracking

```sql
CREATE TABLE dataset_revenue (
    id SERIAL PRIMARY KEY,
    dataset_id VARCHAR(50),
    creator_id VARCHAR(100),
    transaction_type VARCHAR(20), -- 'subscription', 'one_time', 'api_usage'
    gross_amount DECIMAL(10,2),
    platform_fee DECIMAL(10,2),
    creator_payout DECIMAL(10,2),
    status VARCHAR(20), -- 'pending', 'paid'
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Roadmap Phases

### Phase 1: Foundation (2-3 weeks)

**Goal:** Dataset catalog API + basic search

- [ ] Dataset metadata table in database
- [ ] `POST /api/datasets` - upload with metadata
- [ ] `GET /api/datasets` - list with filters
- [ ] `GET /api/datasets/{id}` - get metadata
- [ ] `GET /api/datasets/{id}/data` - get GeoJSON
- [ ] `POST /api/datasets/search` - keyword search (title, description, tags)
- [ ] Update existing datasets (ds_us-states, etc.) with full metadata
- [ ] Points v2: track usage, award points for dataset usage

### Phase 2: Discovery UI (2-3 weeks)

**Goal:** Humans can browse and discover datasets

- [ ] `/datasets` page with search + filters
- [ ] Category sidebar navigation
- [ ] Map preview on hover
- [ ] "Use in Map" button
- [ ] Dataset detail page with full metadata
- [ ] Rating system (1-5 stars)
- [ ] Usage stats display

### Phase 3: Quality & Growth (2-3 weeks)

**Goal:** Quality signals + contributor incentives

- [ ] Semantic search (embeddings)
- [ ] Quality score calculation
- [ ] Verified source badges
- [ ] Duplicate detection
- [ ] Dataset versioning
- [ ] Contributor profiles
- [ ] Leaderboard v2 (usage-weighted)

### Phase 4: Monetization (4-6 weeks)

**Goal:** Revenue from premium data

- [ ] Pro tier (Stripe subscription)
- [ ] Dataset pricing (free/paid)
- [ ] Creator revenue share
- [ ] Payout system (Stripe Connect)
- [ ] Usage-based billing for API
- [ ] Enterprise tier

---

## Success Metrics

| Metric | Target (6 months) |
|--------|-------------------|
| Datasets in catalog | 500+ |
| Monthly dataset queries | 100K+ |
| Unique agents using data | 1000+ |
| Dataset creators | 100+ |
| Revenue (if Phase 4) | $10K MRR |

---

## Open Questions

1. **Duplicate handling:** How strict? Same data from different sources?
2. **Versioning:** How to handle dataset updates? Keep history?
3. **Private datasets:** Allow users to upload private datasets?
4. **API quotas:** Rate limits per tier?
5. **Data validation:** How deep? Schema enforcement?

---

*Last updated: 2026-02-14*
*Author: Ted Aiso*
