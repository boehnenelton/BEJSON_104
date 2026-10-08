"""
Library:         lib_bejson_BEHTML_bejson_schema.py
Family:          BEHTML
Module Purpose:  Implements runtime functionality and logic for lib_bejson_BEHTML_bejson_schema.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         0.2.0
Release_Version: 300
Date:            2026-08-07
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   1073e928-3358-4d9b-9787-a4fb13b28a1f
"""

from typing import Any, Dict, List, Optional

# ===========================================================================
# SCHEMA_BEHTML_ELEMENT_v1 (11 Fields)
# One record = one placed control on the BEHTML grid.
# ===========================================================================
SCHEMA_BEHTML_ELEMENT_v1 = [
    {"name": "element_id",     "type": "string"},   # 0  unique per document
    {"name": "element_type",  "type": "string"},   # 1  e.g. "input", "button", "combobox"
    {"name": "y_start",       "type": "integer"},  # 2  row index (k), 0-based
    {"name": "y_span",        "type": "integer"},  # 3  rows occupied (default 1; multiline default 4-5)
    {"name": "x_start",       "type": "integer"},  # 4  lane index, 0-7
    {"name": "x_span",        "type": "integer"},  # 5  lanes occupied, 1-8
    {"name": "z_index",       "type": "integer"},  # 6  overlay stacking (mobile sidebar, etc.)
    {"name": "bem_modifiers", "type": "string"},   # 7  comma-separated modifier tokens
    {"name": "content_ref",   "type": "string"},   # 8  label text / bound field name / URL / null
    {"name": "parent_id_fk",  "type": "string"},   # 9  element_id of container, or null for root
    {"name": "is_active",     "type": "boolean"},  # 10 selection state (ethereal vs tangible)
    {"name": "content_kind",  "type": "string"},   # 11 how content_ref is interpreted (see KNOWN_CONTENT_KINDS)
]

# Known content_kind values, validated by behtml_crud_validate_content().
# "text": content_ref is literal display text, always valid.
# "url": content_ref must pass URL/path validation.
# "field_binding": content_ref must be a non-empty bound-field name.
# "asset": content_ref is an asset reference (image/media path).
KNOWN_CONTENT_KINDS = {"text", "url", "field_binding", "asset"}
DEFAULT_CONTENT_KIND = "text"

# Known element_type values (Spec section 4.2 Component Layer). Not exhaustive —
# the validator treats this as a soft warning set, not a hard-fail list, so new
# control types can be added without a schema migration.
KNOWN_ELEMENT_TYPES = {
    "input", "textarea", "button", "combobox", "checkbox", "radio",
    "label", "container", "hamburger_menu", "toolbar", "grid_cell",
}

BEHTML_ROOT_RECORDS_TYPE = "BEHTMLElement"


def behtml_schema_new_document(project_name: str, project_guid: str) -> Dict[str, Any]:
    """
    Build an empty, spec-compliant BEJSON 104 document skeleton for a fresh
    BEHTML layout. Values starts empty — the IDE appends rows as elements
    are dropped onto the grid.

    project_name/project_guid are accepted for caller bookkeeping (e.g.
    writing the sibling .bejson_project.json tracker, Section 4) but are
    deliberately NOT embedded in the returned document: BEJSON 104 forbids
    custom top-level keys other than Parent_Hierarchy, and this doc's
    single Records_Type is BEHTMLElement, not project metadata.
    """
    return {
        "Format": "BEJSON",
        "Format_Version": "104",
        "Format_Creator": "Elton Boehnen",
        "Records_Type": [BEHTML_ROOT_RECORDS_TYPE],
        "Fields": SCHEMA_BEHTML_ELEMENT_v1,
        "Values": [],
    }


def behtml_schema_field_names() -> List[str]:
    """Return field names in canonical order — for building Field Map Indexes."""
    return [f["name"] for f in SCHEMA_BEHTML_ELEMENT_v1]