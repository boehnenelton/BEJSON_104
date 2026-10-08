"""
Library:         lib_bejson_Diagrams_cli_tools.py
Family:          Diagrams
Module Purpose:  CLI tooling layer for XML tag parsing, context extraction, and layout scaffolding in AI diagram generation.
Architecture:    Provides pre-placement spatial math, XML tag parsing (<scaffold>, <zone>), and grid-alignment scaffolding for BEJSON Diagrammer AI build plans.
Version:         1.0.0
Release_Version: 300
Date:            2026-09-21
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   64b9314e-f6bf-4807-84c7-a2852eae1771
"""

import re
import math
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

VERSION = "1.0.0"

# ---------------------------------------------------------------------------
# XML Tag Parsing & Context Extraction
# ---------------------------------------------------------------------------

XML_SCAFFOLD_PATTERN = re.compile(
    r"<scaffold\s+type=[\"'](?P<type>\w+)[\"'](?P<attrs>[^>]*)>(?P<content>.*?)</scaffold>",
    re.DOTALL | re.IGNORECASE,
)
XML_ZONE_PATTERN = re.compile(
    r"<zone\s+name=[\"'](?P<name>[^\"']+)[\"'](?P<attrs>[^>]*)>(?P<content>.*?)</zone>",
    re.DOTALL | re.IGNORECASE,
)
XML_ATTR_PATTERN = re.compile(r"(?P<key>\w+)=[\"'](?P<val>[^\"']+)[\"']")


def parse_xml_attributes(attr_str: str) -> Dict[str, str]:
    """Extracts key-value attributes from an XML attribute string."""
    return {m.group("key"): m.group("val") for m in XML_ATTR_PATTERN.finditer(attr_str or "")}


def parse_xml_tags(response_text: str) -> Dict[str, Any]:
    """
    Parses optional <scaffold> and <zone> tags embedded in AI response text.
    Returns a dictionary containing extracted scaffolds, zones, and cleaned JSON text.
    """
    scaffolds = []
    for match in XML_SCAFFOLD_PATTERN.finditer(response_text or ""):
        scaff_type = match.group("type").lower()
        attrs = parse_xml_attributes(match.group("attrs"))
        content = match.group("content").strip()
        scaffolds.append({"type": scaff_type, "attributes": attrs, "content": content})

    zones = []
    for match in XML_ZONE_PATTERN.finditer(response_text or ""):
        name = match.group("name")
        attrs = parse_xml_attributes(match.group("attrs"))
        content = match.group("content").strip()
        zones.append({"name": name, "attributes": attrs, "content": content})

    # Strip XML tags to leave plain JSON content
    cleaned_text = XML_SCAFFOLD_PATTERN.sub("", response_text or "")
    cleaned_text = XML_ZONE_PATTERN.sub("", cleaned_text).strip()

    return {
        "scaffolds": scaffolds,
        "zones": zones,
        "cleaned_text": cleaned_text,
    }


# ---------------------------------------------------------------------------
# Layout Math & Spatial Scaffolding Algorithms
# ---------------------------------------------------------------------------

def snap_to_grid(value: float, grid_size: int = 50) -> int:
    """Snaps a pixel coordinate to the nearest grid step (default 50px)."""
    return int(round(value / grid_size) * grid_size)


def scaffold_flowchart(
    shapes: List[Dict[str, Any]],
    start_cx: int = 200,
    start_cy: int = 200,
    direction: str = "lr",
    spacing: int = 250,
) -> List[Dict[str, Any]]:
    """
    Arranges shapes in a linear or branching flowchart layout.
    direction: 'lr' (left-to-right) or 'tb' (top-to-bottom).
    """
    curr_x, curr_y = start_cx, start_cy
    for i, s in enumerate(shapes):
        if "cx" not in s or s["cx"] == 200:
            s["cx"] = snap_to_grid(curr_x)
        if "cy" not in s or s["cy"] == 200:
            s["cy"] = snap_to_grid(curr_y)

        if direction.lower() == "tb":
            curr_y += spacing
        else:
            curr_x += spacing

    return shapes


def scaffold_grid(
    shapes: List[Dict[str, Any]],
    columns: int = 3,
    start_cx: int = 200,
    start_cy: int = 200,
    cell_width: int = 250,
    cell_height: int = 150,
) -> List[Dict[str, Any]]:
    """Arranges shapes in an N-column matrix grid."""
    cols = max(1, columns)
    for i, s in enumerate(shapes):
        row = i // cols
        col = i % cols
        s["cx"] = snap_to_grid(start_cx + (col * cell_width))
        s["cy"] = snap_to_grid(start_cy + (row * cell_height))
    return shapes


def scaffold_tree(
    shapes: List[Dict[str, Any]],
    start_cx: int = 400,
    start_cy: int = 150,
    level_dy: int = 180,
    sibling_dx: int = 220,
) -> List[Dict[str, Any]]:
    """
    Arranges shapes in a hierarchical tree layout based on parentTempId relationships.
    """
    shape_map = {s.get("tempId"): s for s in shapes if s.get("tempId")}
    children_map: Dict[Optional[str], List[Dict[str, Any]]] = {}

    for s in shapes:
        pid = s.get("parentTempId")
        children_map.setdefault(pid, []).append(s)

    roots = children_map.get(None, [])
    if not roots and shapes:
        roots = [shapes[0]]

    def _position_subtree(node: Dict[str, Any], cx: int, cy: int) -> int:
        node["cx"] = snap_to_grid(cx)
        node["cy"] = snap_to_grid(cy)

        children = children_map.get(node.get("tempId"), [])
        if not children:
            return sibling_dx

        total_width = 0
        child_x = cx - ((len(children) - 1) * sibling_dx // 2)
        for child in children:
            w = _position_subtree(child, child_x, cy + level_dy)
            child_x += max(sibling_dx, w)
            total_width += w

        return max(sibling_dx, total_width)

    root_x = start_cx
    for root in roots:
        w = _position_subtree(root, root_x, start_cy)
        root_x += max(sibling_dx, w)

    return shapes


def scaffold_zones(
    zones: List[Dict[str, Any]],
    shapes: List[Dict[str, Any]],
    default_color: str = "#000000",
) -> List[Dict[str, Any]]:
    """
    Computes bounding territories for groups of shapes assigned to named zones.
    Returns a list of generated territory objects.
    """
    territories = []
    shape_map = {s.get("tempId"): s for s in shapes if s.get("tempId")}

    for i, z in enumerate(zones):
        zone_name = z.get("name", f"Zone {i+1}")
        member_ids = z.get("memberTempIds", [])

        # Find member shapes
        zone_shapes = [shape_map[tid] for tid in member_ids if tid in shape_map]
        if not zone_shapes:
            continue

        min_x = min(s.get("cx", 200) for s in zone_shapes) - 120
        max_x = max(s.get("cx", 200) for s in zone_shapes) + 120
        min_y = min(s.get("cy", 200) for s in zone_shapes) - 80
        max_y = max(s.get("cy", 200) for s in zone_shapes) + 80

        center_x = snap_to_grid((min_x + max_x) / 2)
        center_y = snap_to_grid((min_y + max_y) / 2)
        size = max(snap_to_grid(max_x - min_x), snap_to_grid(max_y - min_y))

        color = z.get("color") or default_color
        territories.append({
            "label": zone_name,
            "kind": z.get("kind", "rect"),
            "cx": center_x,
            "cy": center_y,
            "size": max(200, size),
            "color": color,
        })

    return territories


# ---------------------------------------------------------------------------
# Post-Processing Plan Enhancer
# ---------------------------------------------------------------------------

def apply_layout_scaffolding(plan: Dict[str, Any]) -> Dict[str, Any]:
    """
    Post-processes an AI build plan to enforce clean grid positioning and non-overlapping layouts.
    Auto-detects structure type (tree vs. flowchart vs. grid) if not explicitly set.
    """
    shapes = plan.get("shapes", [])
    if not shapes:
        return plan

    has_parents = any(s.get("parentTempId") for s in shapes)

    if has_parents:
        scaffold_tree(shapes)
    elif len(shapes) > 4:
        scaffold_grid(shapes, columns=math.ceil(math.sqrt(len(shapes))))
    else:
        scaffold_flowchart(shapes)

    # Ensure all coordinates are snapped to 50px grid
    for s in shapes:
        if "cx" in s:
            s["cx"] = snap_to_grid(s["cx"])
        if "cy" in s:
            s["cy"] = snap_to_grid(s["cy"])

    return plan


# ---------------------------------------------------------------------------
# XML System Prompt Enhancer
# ---------------------------------------------------------------------------

def enhance_system_prompt_with_xml_tools(base_instructions: str) -> str:
    """
    Extends base AI system instructions with XML scaffolding guidance.
    """
    xml_guidance = """

## Optional XML Scaffolding Tags

You may optionally wrap layout preferences in XML tags preceding the JSON response:

1. Flowchart Scaffolding:
   <scaffold type="flowchart" direction="lr" spacing="250"/>

2. Grid Scaffolding:
   <scaffold type="grid" columns="3"/>

3. Zone Grouping:
   <zone name="Backend Services" color="#000000">
     s1, s2, s3
   </zone>

Respond with clean JSON following any XML hints.
"""
    return base_instructions + xml_guidance
