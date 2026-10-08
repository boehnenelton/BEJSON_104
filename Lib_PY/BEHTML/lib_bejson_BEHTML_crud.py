"""
Library:         lib_bejson_BEHTML_crud.py
Family:          BEHTML
Module Purpose:  Implements runtime functionality and logic for lib_bejson_BEHTML_crud.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         0.1.0
Release_Version: 300
Date:            2026-07-30
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   1d2b999f-87d0-4a26-a122-ae9d8998077c
"""

import re
from typing import Any, Dict, List, Optional

import lib_bejson_BEHTML_bootstrap  # noqa: F401  -- adds canonical Core to sys.path

try:
    from lib_bejson_Core_bejson_core import bejson_core_get_field_index
except ImportError as e:
    import logging
    logging.critical(f"[BEHTML_CRUD] FATAL: Core library unreachable: {e}")
    raise SystemExit(1)

try:
    from lib_bejson_BEHTML_bejson_errors import (
        E_BEHTML_ELEMENT_NOT_FOUND,
        E_BEHTML_DUPLICATE_ELEMENT_ID,
        E_BEHTML_INVALID_CONTENT_KIND,
        E_BEHTML_INVALID_URL,
        E_BEHTML_MISSING_FIELD_BINDING,
    )
    from lib_bejson_BEHTML_core import BEHTMLError
    from lib_bejson_BEHTML_bejson_schema import (
        behtml_schema_field_names,
        KNOWN_CONTENT_KINDS,
        DEFAULT_CONTENT_KIND,
    )
except ImportError as e:
    import logging
    logging.critical(f"[BEHTML_CRUD] FATAL: BEHTML sibling module unreachable: {e}")
    raise SystemExit(1)


# ---------------------------------------------------------------------------
# content_kind validation — link / binding / asset injection
# ---------------------------------------------------------------------------
_URL_RE = re.compile(r"^(https?://|/)[^\s]+$")


def behtml_crud_validate_content(content_kind: str, content_ref: Optional[str]) -> bool:
    """
    Validate content_ref against its declared content_kind. Raises
    BEHTMLError on failure. content_kind="text" always passes (any string,
    including None/empty, is valid label text).
    """
    if content_kind not in KNOWN_CONTENT_KINDS:
        raise BEHTMLError(E_BEHTML_INVALID_CONTENT_KIND, f"content_kind '{content_kind}' not recognized")
    if content_kind == "url":
        if not content_ref or not _URL_RE.match(content_ref):
            raise BEHTMLError(E_BEHTML_INVALID_URL, f"content_ref '{content_ref}' is not a valid URL/path")
    if content_kind == "field_binding":
        if not content_ref or not content_ref.strip():
            raise BEHTMLError(E_BEHTML_MISSING_FIELD_BINDING, "content_kind='field_binding' requires a non-empty content_ref")
    return True


def _field_index_map(doc: Dict[str, Any]) -> Dict[str, int]:
    return {name: bejson_core_get_field_index(doc, name) for name in behtml_schema_field_names()}


def behtml_crud_row_from_dict(doc: Dict[str, Any], element: Dict[str, Any]) -> List[Any]:
    """Build a positionally-correct row from a {field_name: value} dict, using this doc's field order."""
    idx = _field_index_map(doc)
    row = [None] * len(idx)
    for name, i in idx.items():
        if i != -1:
            row[i] = element.get(name)
    return row


def behtml_crud_row_to_dict(doc: Dict[str, Any], row: List[Any]) -> Dict[str, Any]:
    """Inverse of behtml_crud_row_from_dict — turn a raw row back into a named dict."""
    idx = _field_index_map(doc)
    return {name: (row[i] if i != -1 else None) for name, i in idx.items()}


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------
def behtml_crud_get_element(doc: Dict[str, Any], element_id: str) -> Optional[Dict[str, Any]]:
    """Return an element as a dict, or None if element_id isn't present."""
    id_idx = bejson_core_get_field_index(doc, "element_id")
    for row in doc.get("Values", []):
        if row[id_idx] == element_id:
            return behtml_crud_row_to_dict(doc, row)
    return None


def behtml_crud_add_element(doc: Dict[str, Any], element: Dict[str, Any]) -> Dict[str, Any]:
    """
    Append a new element. element is a {field_name: value} dict; missing
    optional fields default (content_kind -> "text", is_active -> False).
    Raises on duplicate element_id or invalid content_kind/content_ref.
    """
    element = dict(element)
    element.setdefault("content_kind", DEFAULT_CONTENT_KIND)
    element.setdefault("is_active", False)
    element.setdefault("z_index", 0)
    element.setdefault("bem_modifiers", "")
    element.setdefault("parent_id_fk", None)

    element_id = element.get("element_id")
    if not element_id:
        raise BEHTMLError(E_BEHTML_DUPLICATE_ELEMENT_ID, "element_id is required to add an element")
    if behtml_crud_get_element(doc, element_id) is not None:
        raise BEHTMLError(E_BEHTML_DUPLICATE_ELEMENT_ID, f"element_id '{element_id}' already exists")

    behtml_crud_validate_content(element["content_kind"], element.get("content_ref"))

    doc.setdefault("Values", []).append(behtml_crud_row_from_dict(doc, element))
    return element


def behtml_crud_update_element(doc: Dict[str, Any], element_id: str, changes: Dict[str, Any]) -> Dict[str, Any]:
    """Merge `changes` into the existing element identified by element_id. Raises if not found."""
    id_idx = bejson_core_get_field_index(doc, "element_id")
    values = doc.get("Values", [])
    for i, row in enumerate(values):
        if row[id_idx] == element_id:
            current = behtml_crud_row_to_dict(doc, row)
            current.update(changes)
            if "content_kind" in changes or "content_ref" in changes:
                behtml_crud_validate_content(
                    current.get("content_kind", DEFAULT_CONTENT_KIND),
                    current.get("content_ref"),
                )
            values[i] = behtml_crud_row_from_dict(doc, current)
            return current
    raise BEHTMLError(E_BEHTML_ELEMENT_NOT_FOUND, f"element_id '{element_id}' not found")


def behtml_crud_remove_element(doc: Dict[str, Any], element_id: str) -> bool:
    """Remove an element by id. Raises E_BEHTML_ELEMENT_NOT_FOUND if it isn't present."""
    id_idx = bejson_core_get_field_index(doc, "element_id")
    values = doc.get("Values", [])
    for i, row in enumerate(values):
        if row[id_idx] == element_id:
            del values[i]
            return True
    raise BEHTMLError(E_BEHTML_ELEMENT_NOT_FOUND, f"element_id '{element_id}' not found")


def behtml_crud_list_by_parent(doc: Dict[str, Any], parent_id: Optional[str]) -> List[Dict[str, Any]]:
    """List all elements whose parent_id_fk matches parent_id (None = root-level elements)."""
    parent_idx = bejson_core_get_field_index(doc, "parent_id_fk")
    return [
        behtml_crud_row_to_dict(doc, row)
        for row in doc.get("Values", [])
        if row[parent_idx] == parent_id
    ]