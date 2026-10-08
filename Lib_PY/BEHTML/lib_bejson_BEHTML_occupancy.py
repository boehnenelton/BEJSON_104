"""
Library:         lib_bejson_BEHTML_occupancy.py
Family:          BEHTML
Module Purpose:  Implements runtime functionality and logic for lib_bejson_BEHTML_occupancy.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         0.1.0
Release_Version: 300
Date:            2026-07-30
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   646ebbb3-b601-45ed-a43e-60f79ce5f38f
"""

from typing import Any, Dict, List, Optional, Tuple

import lib_bejson_BEHTML_bootstrap  # noqa: F401  -- adds canonical Core to sys.path

try:
    from lib_bejson_Core_bejson_core import bejson_core_get_field_index
except ImportError as e:
    import logging
    logging.critical(f"[BEHTML_OCCUPANCY] FATAL: Core library unreachable: {e}")
    raise SystemExit(1)

# Four cardinal directions for keyboard-nav neighbor walks (dx, dy).
DIRECTION_OFFSETS = {
    "left": (-1, 0),
    "right": (1, 0),
    "up": (0, -1),
    "down": (0, 1),
}

# Type alias: layer key is the owning parent_id_fk (None = root grid).
LayerKey = Optional[str]
CellMap = Dict[Tuple[int, int], str]  # (x, y) -> element_id
OccupancyIndex = Dict[LayerKey, CellMap]


def _occupancy_cell_key(x: int, y: int) -> Tuple[int, int]:
    """Canonical sparse-grid key for one (x,y) cell. Adapted from Gaming's tile_key string form."""
    return (x, y)


def behtml_occupancy_build_index(doc: Dict[str, Any]) -> OccupancyIndex:
    """
    Build a fresh sparse occupancy index from a BEHTML document. One entry
    per (x,y) cell an element covers, per parent_id_fk layer. Rebuild after
    any add/update/remove -- there is no incremental update, by design:
    IDE-scale documents (dozens to low hundreds of elements) make a full
    rebuild cheap enough that incremental-update bugs aren't worth risking.
    """
    id_idx = bejson_core_get_field_index(doc, "element_id")
    x_idx = bejson_core_get_field_index(doc, "x_start")
    xs_idx = bejson_core_get_field_index(doc, "x_span")
    y_idx = bejson_core_get_field_index(doc, "y_start")
    ys_idx = bejson_core_get_field_index(doc, "y_span")
    parent_idx = bejson_core_get_field_index(doc, "parent_id_fk")

    index: OccupancyIndex = {}
    for row in doc.get("Values", []):
        element_id = row[id_idx]
        parent_id = row[parent_idx] if parent_idx != -1 else None
        layer = index.setdefault(parent_id, {})
        x0, xs, y0, ys = row[x_idx], row[xs_idx], row[y_idx], row[ys_idx]
        for dx in range(xs):
            for dy in range(ys):
                layer[_occupancy_cell_key(x0 + dx, y0 + dy)] = element_id
    return index


def behtml_occupancy_get_owner(index: OccupancyIndex, parent_id_fk: LayerKey,
                                x: int, y: int) -> Optional[str]:
    """O(1) lookup: which element_id (if any) owns cell (x,y) within this layer."""
    layer = index.get(parent_id_fk)
    if not layer:
        return None
    return layer.get(_occupancy_cell_key(x, y))


def behtml_occupancy_check_overlap_fast(index: OccupancyIndex, parent_id_fk: LayerKey,
                                         x_start: int, x_span: int, y_start: int, y_span: int,
                                         exclude_element_id: Optional[str] = None) -> List[str]:
    """
    O(cells) collision check using the prebuilt index, instead of
    lib_bejson_BEHTML_collision.py's O(n-elements) scan. Same result shape
    (list of colliding element_ids) so it's a drop-in fast path once an
    index exists; the scan version remains the source of truth / fallback
    when no index has been built yet.
    """
    layer = index.get(parent_id_fk, {})
    hits = []
    for dx in range(x_span):
        for dy in range(y_span):
            owner = layer.get(_occupancy_cell_key(x_start + dx, y_start + dy))
            if owner and owner != exclude_element_id and owner not in hits:
                hits.append(owner)
    return hits


def behtml_occupancy_get_neighbor(index: OccupancyIndex, parent_id_fk: LayerKey,
                                   x: int, y: int, direction: str,
                                   max_steps: int = 8) -> Optional[str]:
    """
    Keyboard-navigation walk: from cell (x,y), step in `direction`
    ("left"/"right"/"up"/"down") up to max_steps cells looking for the
    first occupied cell belonging to a *different* element than whatever
    is at the origin. Mirrors gaming_ai's neighbor-walk shape, repurposed
    for IDE arrow-key focus movement instead of pathfinding.
    """
    if direction not in DIRECTION_OFFSETS:
        return None
    dx, dy = DIRECTION_OFFSETS[direction]
    origin_owner = behtml_occupancy_get_owner(index, parent_id_fk, x, y)
    cx, cy = x, y
    for _ in range(max_steps):
        cx, cy = cx + dx, cy + dy
        if cx < 0 or cy < 0:
            return None
        owner = behtml_occupancy_get_owner(index, parent_id_fk, cx, cy)
        if owner and owner != origin_owner:
            return owner
    return None