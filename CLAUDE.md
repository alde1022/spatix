# Spatix — Developer Handoff

## What is Spatix?
An AI-native mapping platform. Users upload spatial data (GeoJSON, Shapefile, KML, CSV, GPX) or describe locations in natural language, and get an interactive, shareable map in seconds. The fastest way to go from data to shareable map.

## Architecture

```
/frontend        Next.js 14, React 18, TypeScript, TailwindCSS
                 MapLibre GL + Deck.gl for rendering
                 Firebase for OAuth (Google, GitHub)
                 Deployed on Vercel

/backend         FastAPI, Python 3
                 GeoPandas for GIS file processing
                 PostgreSQL (prod) / SQLite (dev)
                 Custom JWT auth (verify_jwt in routers/auth.py)
                 Deployed on Railway
```

**Domain:** spatix.io (frontend), api.spatix.io (backend)

## Key Routes

### Frontend
| Route | Purpose |
|---|---|
| `/` | Homepage with hero map and upload |
| `/maps` | Main map studio — layers, styling, save & share, my maps |
| `/m/[id]` | Shared map viewer (SSR with OG meta tags) |
| `/m/[id]?embed=1` | Embeddable iframe version |
| `/embed/preview?geojson=URL&style=dark` | Embeddable preview for external data |
| `/developers` | API documentation |
| `/login`, `/signup` | Auth pages |
| `/account` | User dashboard |
| `/pricing` | Redirects to /maps (pricing removed) |

### Backend API
| Method | Route | Purpose |
|---|---|---|
| `POST` | `/analyze` | Upload & parse GIS file |
| `POST` | `/api/map` | Create map (accepts `email` field for save-gate) |
| `GET` | `/api/map/{id}` | Get map data |
| `DELETE` | `/api/map/{id}` | Delete map (needs X-Delete-Token header) |
| `POST` | `/api/map/from-text` | Natural language map creation |
| `POST` | `/api/map/from-addresses` | Geocode address list |
| `POST` | `/api/map/route` | Create route map |
| `GET` | `/api/maps/by-email?email=` | List maps by creator email |
| `GET` | `/api/maps` | List maps for authenticated user |
| `GET` | `/api/geocode?q=` | Geocoding via Nominatim |

## Database Schema (key tables)

- **users** — id, email, password_hash, auth_provider, plan, created_at
- **maps** — id (12-char token), user_id, creator_email, title, config (JSONB), delete_token_hash, views, public, created_at
- **collected_emails** — email, source, created_at (for email list building)
- **workspaces** — user_id, name, is_default (not yet exposed in UI)

## Important Conventions

- JWT payload field for user ID is `"sub"` (not `"user_id"`)
- Auth verify function is `verify_jwt()` in `routers/auth.py`
- Map delete tokens are SHA256 hashed before storage
- Anonymous users' maps are linked via `creator_email` column
- Frontend stores save email in `localStorage("spatix_save_email")`
- `database.py` abstracts PostgreSQL/SQLite — check `USE_POSTGRES` flag
- SQLite doesn't support `ALTER TABLE ... IF NOT EXISTS` — use try/except

## Known Issues & Tech Debt

1. **NLP endpoints lack rate limiting** — `from-text`, `from-addresses`, `route` have none
2. **NLP endpoints don't set `creator_email`** — maps created via NLP won't appear in My Maps
3. **JWT missing `plan` field** — pro-tier rate limits won't work (auth.py `create_jwt` needs update)
4. **Nominatim rate limiter race condition** — needs `asyncio.Lock()` in `geocode.py`
5. **Account page still shows plan usage bars** — cosmetic, works but vestigial since pricing removed
6. **Workspaces UI not built** — schema exists, no frontend for it yet
7. **No payment integration** — Stripe/Paddle not connected
8. **No database migrations** — schema changes are in `init_db()`, manual ALTER TABLE for new columns

## Running Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev    # starts on :3000
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in frontend `.env.local`.

## Environment Variables

### Frontend
- `NEXT_PUBLIC_API_URL` — Backend URL
- `NEXT_PUBLIC_SITE_URL` — Frontend URL
- Firebase config is in `lib/firebase.ts`

### Backend
- `DATABASE_URL` — PostgreSQL connection string (omit for SQLite)
- `JWT_SECRET` — Required in production
- `FRONTEND_URL` — For CORS
- `RESEND_API_KEY` or `SENDGRID_API_KEY` — For transactional email
- `FROM_EMAIL` — Sender address (default: noreply@spatix.io)
