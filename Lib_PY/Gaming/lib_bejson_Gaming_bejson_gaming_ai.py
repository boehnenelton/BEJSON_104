"""
Library:         lib_bejson_Gaming_bejson_gaming_ai.py
Family:          Gaming
Module Purpose:  Implements runtime functionality and logic for lib_bejson_Gaming_bejson_gaming_ai.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         1.0.0
Release_Version: 300
Date:            2026-06-29
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   d3e4f5a6-b7c8-9012-cdef-123456789012
"""

import math
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _bejson_gaming_ai_tile_key(tile_x: int, tile_y: int) -> str:
    """Returns the canonical string key for a tile grid coordinate."""
    return f"{tile_x}_{tile_y}"


def _bejson_gaming_ai_is_solid(
    tile_x: int,
    tile_y: int,
    tile_grid: Dict[str, dict],
    assets: Dict[str, dict]
) -> bool:
    """
    Returns True if the tile at (tile_x, tile_y) has is_solid set in its asset rules.
    Mirrors the TS isSolid closure in findPath exactly.
    """
    tile = tile_grid.get(_bejson_gaming_ai_tile_key(tile_x, tile_y))
    if not tile:
        return False
    asset_key = tile.get("terrain_type") or tile.get("object_type")
    rules = assets.get(asset_key) if asset_key else None
    return bool(rules and rules.get("is_solid"))


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------

def bejson_gaming_ai_update_enemy(
    actor: dict,
    player: dict,
    delta_time: float
) -> None:
    """
    Updates enemy velocity fields (pendingVx, pendingVy) based on the current
    AI state machine.  Mutates actor in place — mirrors updateEnemyAI in TS.

    States: idle → alert → windup → charge → cooldown → idle
    """
    dx = player["x"] - actor["x"]
    dy = player["y"] - actor["y"]
    dist = math.sqrt(dx * dx + dy * dy)

    # Initial state setup
    if "aiState" not in actor:
        actor["aiState"] = "idle"
        actor["stateTimer"] = 0.0

    ai_state = actor["aiState"]

    if ai_state == "idle":
        actor["pendingVx"] = 0.0
        actor["pendingVy"] = 0.0
        # Enter alert when player is within perceptual radius
        if dist > 0 and dist < 200:
            actor["aiState"] = "alert"
            actor["stateTimer"] = 0.5

    elif ai_state == "alert":
        actor["pendingVx"] = 0.0
        actor["pendingVy"] = 0.0
        actor["stateTimer"] -= delta_time
        if actor["stateTimer"] <= 0:
            actor["aiState"] = "windup"
            actor["stateTimer"] = 0.6

    elif ai_state == "windup":
        actor["pendingVx"] = 0.0
        actor["pendingVy"] = 0.0
        actor["stateTimer"] -= delta_time
        if actor["stateTimer"] <= 0:
            actor["aiState"] = "charge"
            actor["stateTimer"] = 0.8
            # Lock direction at the start of the charge
            magnitude = actor.get("speed", 1.0) * 1.5
            if dist > 0:
                actor["lockedVx"] = (dx / dist) * magnitude
                actor["lockedVy"] = (dy / dist) * magnitude
            else:
                actor["lockedVx"] = 0.0
                actor["lockedVy"] = 0.0

    elif ai_state == "charge":
        actor["pendingVx"] = actor.get("lockedVx", 0.0)
        actor["pendingVy"] = actor.get("lockedVy", 0.0)
        actor["stateTimer"] -= delta_time
        if actor["stateTimer"] <= 0:
            actor["aiState"] = "cooldown"
            actor["stateTimer"] = 0.5

    elif ai_state == "cooldown":
        actor["pendingVx"] = 0.0
        actor["pendingVy"] = 0.0
        actor["stateTimer"] -= delta_time
        if actor["stateTimer"] <= 0:
            actor["aiState"] = "idle"


# ---------------------------------------------------------------------------
# A* pathfinding
# ---------------------------------------------------------------------------

def bejson_gaming_ai_find_path(
    start_x: int,
    start_y: int,
    target_x: int,
    target_y: int,
    tile_grid: Dict[str, dict],
    assets: Dict[str, dict],
    max_steps: int = 1000
) -> Optional[List[Dict[str, int]]]:
    """
    Calculates a solid-safe path using A* pathfinding on the tile grid.
    Returns a list of {x, y} waypoints (not including start), or None if no
    path is found.  Mirrors findPath in TS exactly, including the isSolid
    delegate, open-list sort, and Manhattan heuristic.
    """
    # Target itself is solid — no valid path
    if _bejson_gaming_ai_is_solid(target_x, target_y, tile_grid, assets):
        return None

    # Each node: (x, y, f, g, parent_index)
    # Storing nodes as dicts in a list to mirror TS object references.
    open_list: List[dict] = []
    closed_set: set = set()

    open_list.append({
        "x": start_x,
        "y": start_y,
        "f": 0,
        "g": 0,
        "parent": None
    })

    steps = 0
    while open_list and steps < max_steps:
        steps += 1

        # Sort ascending by f — mirrors openList.sort((a, b) => a.f - b.f)
        open_list.sort(key=lambda node: node["f"])
        current = open_list.pop(0)

        # Goal reached — reconstruct path
        if current["x"] == target_x and current["y"] == target_y:
            path: List[Dict[str, int]] = []
            cursor = current
            while cursor["parent"] is not None:
                path.append({"x": cursor["x"], "y": cursor["y"]})
                cursor = cursor["parent"]
            path.reverse()
            return path

        node_key = _bejson_gaming_ai_tile_key(current["x"], current["y"])
        closed_set.add(node_key)

        neighbors = [
            {"x": current["x"] + 1, "y": current["y"]},
            {"x": current["x"] - 1, "y": current["y"]},
            {"x": current["x"],     "y": current["y"] + 1},
            {"x": current["x"],     "y": current["y"] - 1},
        ]

        for neighbor in neighbors:
            neighbor_key = _bejson_gaming_ai_tile_key(neighbor["x"], neighbor["y"])
            if neighbor_key in closed_set:
                continue
            if _bejson_gaming_ai_is_solid(neighbor["x"], neighbor["y"], tile_grid, assets):
                continue

            g_cost = current["g"] + 1
            h_cost = abs(neighbor["x"] - target_x) + abs(neighbor["y"] - target_y)
            f_cost = g_cost + h_cost

            # Check for existing open node at this position
            existing_node = next(
                (node for node in open_list
                 if node["x"] == neighbor["x"] and node["y"] == neighbor["y"]),
                None
            )

            if existing_node is not None:
                if g_cost < existing_node["g"]:
                    existing_node["g"] = g_cost
                    existing_node["f"] = f_cost
                    existing_node["parent"] = current
            else:
                open_list.append({
                    "x": neighbor["x"],
                    "y": neighbor["y"],
                    "f": f_cost,
                    "g": g_cost,
                    "parent": current
                })

    return None