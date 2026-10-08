"""
Library:         lib_bejson_BEHTML_collision.py
Family:          BEHTML
Module Purpose:  Implements runtime functionality and logic for lib_bejson_BEHTML_collision.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         0.1.0
Release_Version: 300
Date:            2026-07-30
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   d94a1d2b-8ab2-4656-816b-e00a7f307b4a
"""

from typing import Any, Dict, List, Optional

import lib_bejson_BEHTML_bootstrap  # noqa: F401  -- adds canonical Core to sys.path

try:
    from lib_bejson_Core_bejson_core import bejson_core_get_field_index
except ImportError as e:
    import logging
    logging.critical(f"[BEHTML_COLLISION] FATAL: Core library unreachable: {e}")
    raise SystemExit(1)

try:
    from lib_bejson_BEHTML_bejson_errors import E_BEHTML_OVERLAP_DETECTED
    from lib_bejson_BEHTML_core import BEHTMLError
except ImportError as e:
    import logging
    logging.critical(f"[BEHTML_COLLISION] FATAL: BEHTML sibling module unreachable: {e}")
    raise SystemExit(1)


def _rects_overlap(x1: int, xs1: int, y1: int, ys1: int,
                    x2: int, xs2: int, y2: int, ys2: int) -> bool:
    """Standard axis-aligned rectangle overlap test on two (x,y,span) boxes."""
    x_overlap = x1 < (x2 + xs2) and x2 < (x1 + xs1)
    y_overlap = y1 < (y2 + ys2) and y2 < (y1 + ys1)
    return x_overlap and y_overlap


def behtml_collision_find_overlaps(doc: Dict[str, Any], x_start: int, x_span: int,
                                    y_start: int, y_span: int,
                                    exclude_element_id: Optional[str] = None,
                                    parent_id_fk: Optional[str] = None) -> List[str]:
    """
    Return the element_ids of any existing elements that overlap the given
    rectangle. Only compares elements sharing the same parent_id_fk (a
    nested container's children don't collide with the root grid's
    children). exclude_element_id lets an in-place move/resize check
    against everything except itself.
    """
    id_idx = bejson_core_get_field_index(doc, "element_id")
    x_idx = bejson_core_get_field_index(doc, "x_start")
    xs_idx = bejson_core_get_field_index(doc, "x_span")
    y_idx = bejson_core_get_field_index(doc, "y_start")
    ys_idx = bejson_core_get_field_index(doc, "y_span")
    parent_idx = bejson_core_get_field_index(doc, "parent_id_fk")

    colliding = []
    for row in doc.get("Values", []):
        other_id = row[id_idx]
        if other_id == exclude_element_id:
            continue
        if parent_idx != -1 and row[parent_idx] != parent_id_fk:
            continue
        if _rects_overlap(
            x_start, x_span, y_start, y_span,
            row[x_idx], row[xs_idx], row[y_idx], row[ys_idx],
        ):
            colliding.append(other_id)
    return colliding


def behtml_collision_assert_free(doc: Dict[str, Any], x_start: int, x_span: int,
                                  y_start: int, y_span: int,
                                  exclude_element_id: Optional[str] = None,
                                  parent_id_fk: Optional[str] = None) -> bool:
    """Raise E_BEHTML_OVERLAP_DETECTED if the rectangle collides with anything; else True."""
    hits = behtml_collision_find_overlaps(doc, x_start, x_span, y_start, y_span, exclude_element_id, parent_id_fk)
    if hits:
        raise BEHTMLError(
            E_BEHTML_OVERLAP_DETECTED,
            f"placement at x={x_start}..{x_start+x_span}, y={y_start}..{y_start+y_span} "
            f"collides with existing element(s): {hits}"
        )
    return True