"""
Spatix Contributions & Points API
Track every valuable action. Reward contributors.

GET /api/leaderboard - Points leaderboard
GET /api/points/{entity_type}/{entity_id} - Get points for a specific entity
GET /api/contributions/stats - Platform-wide contribution stats
"""
from fastapi import APIRouter, HTTPException
from typing import Optional
import logging

from fastapi import Header
from database import (
    get_leaderboard as db_get_leaderboard,
    get_points as db_get_points,
    get_dataset_count,
    get_user_contributions as db_get_user_contributions,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["contributions"])


# ==================== POINTS CONFIG ====================
# Centralized points schedule — importable by other modules

POINTS_SCHEDULE = {
    "dataset_upload": 50,       # Upload a public dataset
    "map_create": 5,            # Create a map (any method)
    "map_create_with_layers": 10,  # Create a map that uses public datasets
    "dataset_query": 1,         # Someone queries your dataset
    "dataset_used_in_map": 5,   # Your dataset is used in a map
    "map_views_milestone_100": 10,   # Map hits 100 views
    "map_views_milestone_1000": 50,  # Map hits 1000 views
}

# Contribution-tier multipliers — the more you contribute, the faster you earn.
# This rewards active contributors, not paying customers.
CONTRIBUTION_TIERS = [
    (500, 3),    # 500+ points → 3x multiplier
    (100, 2),    # 100-499 points → 2x multiplier
    (0,   1),    # 0-99 points → 1x (base rate)
]


def get_points_multiplier(entity_type: str = None, entity_id: str = None) -> int:
    """Get the points multiplier based on contributor's total points.

    The more you contribute, the faster you earn — earn-to-earn, not pay-to-earn.
    Tiers: 0-99 pts = 1x, 100-499 = 2x, 500+ = 3x.
    """
    if not entity_type or not entity_id:
        return 1
    points = db_get_points(entity_type, entity_id)
    total = points.get("total_points", 0) if points else 0
    for threshold, multiplier in CONTRIBUTION_TIERS:
        if total >= threshold:
            return multiplier
    return 1


# ==================== ENDPOINTS ====================

@router.get("/leaderboard")
async def get_leaderboard(
    limit: int = 50,
    entity_type: Optional[str] = None,
):
    """Get the contribution points leaderboard.

    Shows top contributors (users and agents) ranked by total points.
    Filter by entity_type ('user' or 'agent') to see separate rankings.
    """
    if entity_type and entity_type not in ("user", "agent"):
        raise HTTPException(status_code=400, detail="entity_type must be 'user' or 'agent'")

    entries = db_get_leaderboard(limit=min(limit, 100), entity_type=entity_type)

    return {
        "leaderboard": [
            {
                "rank": i + 1,
                "entity_type": e.get("entity_type"),
                "entity_id": e.get("entity_id"),
                "display_name": e.get("entity_email") or e.get("entity_id", "anonymous"),
                "total_points": e.get("total_points", 0),
                "datasets_uploaded": e.get("datasets_uploaded", 0),
                "maps_created": e.get("maps_created", 0),
                "data_queries_served": e.get("data_queries_served", 0),
                "total_map_views": e.get("total_map_views", 0),
                "member_since": str(e.get("created_at", "")),
            }
            for i, e in enumerate(entries)
        ],
        "total_entries": len(entries),
    }


@router.get("/points/{entity_type}/{entity_id}")
async def get_points(entity_type: str, entity_id: str):
    """Get points and stats for a specific user or agent.

    entity_type: 'user' or 'agent'
    entity_id: user ID or agent ID
    """
    if entity_type not in ("user", "agent"):
        raise HTTPException(status_code=400, detail="entity_type must be 'user' or 'agent'")

    points = db_get_points(entity_type, entity_id)

    if not points:
        return {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "total_points": 0,
            "datasets_uploaded": 0,
            "maps_created": 0,
            "data_queries_served": 0,
            "total_map_views": 0,
        }

    return {
        "entity_type": points.get("entity_type"),
        "entity_id": points.get("entity_id"),
        "display_name": points.get("entity_email") or entity_id,
        "total_points": points.get("total_points", 0),
        "datasets_uploaded": points.get("datasets_uploaded", 0),
        "maps_created": points.get("maps_created", 0),
        "data_queries_served": points.get("data_queries_served", 0),
        "total_map_views": points.get("total_map_views", 0),
        "member_since": str(points.get("created_at", "")),
    }


@router.get("/contributions/me")
async def get_my_contributions(
    authorization: Optional[str] = Header(None),
    limit: int = 50,
    offset: int = 0,
):
    """Get contribution activity for the authenticated user."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        from routers.auth import verify_jwt
        token = authorization.split(" ")[1]
        payload = verify_jwt(token)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    user_email = payload.get("email")
    contributions = db_get_user_contributions(user_id=user_id, email=user_email, limit=limit, offset=offset)

    # Also get points summary
    points = db_get_points("user", str(user_id)) if user_id else None

    return {
        "contributions": [
            {
                "action": c["action"],
                "resource_type": c.get("resource_type"),
                "resource_id": c.get("resource_id"),
                "points_awarded": c.get("points_awarded", 0),
                "created_at": str(c.get("created_at", "")),
            }
            for c in contributions
        ],
        "points": {
            "total_points": points.get("total_points", 0) if points else 0,
            "datasets_uploaded": points.get("datasets_uploaded", 0) if points else 0,
            "maps_created": points.get("maps_created", 0) if points else 0,
            "data_queries_served": points.get("data_queries_served", 0) if points else 0,
            "total_map_views": points.get("total_map_views", 0) if points else 0,
        },
        "total": len(contributions),
    }


@router.get("/contributions/stats")
async def platform_stats():
    """Platform-wide contribution statistics."""
    total_datasets = get_dataset_count()

    # Get top contributors
    top = db_get_leaderboard(limit=5)
    total_points = sum(e.get("total_points", 0) for e in top)

    return {
        "total_datasets": total_datasets,
        "total_contributors": len(top),
        "total_points_distributed": total_points,
        "points_schedule": POINTS_SCHEDULE,
        "contribution_tiers": {str(t): f"{m}x" for t, m in CONTRIBUTION_TIERS},
    }
