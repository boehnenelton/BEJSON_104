"""
Library:         lib_bejson_BEHTML_validator.py
Family:          BEHTML
Module Purpose:  Implements runtime functionality and logic for lib_bejson_BEHTML_validator.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         0.1.0
Release_Version: 300
Date:            2026-07-30
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   ca6c1198-e7d3-4119-9593-0254e10529a5
"""

from typing import Any, Dict, List

import lib_bejson_BEHTML_bootstrap  # noqa: F401  -- adds canonical Core to sys.path

try:
    from lib_bejson_Core_bejson_core import bejson_core_get_field_index
except ImportError as e:
    import logging
    logging.critical(f"[BEHTML_VALIDATOR] FATAL: Core library unreachable: {e}")
    raise SystemExit(1)

try:
    from lib_bejson_BEHTML_bejson_errors import (
        E_BEHTML_NOT_BEJSON,
        E_BEHTML_SCHEMA_MISMATCH,
        E_BEHTML_MISSING_ELEMENT_ID,
        E_BEHTML_DUPLICATE_ELEMENT_ID,
        E_BEHTML_INVALID_ELEMENT_TYPE,
        E_BEHTML_PARENT_NOT_FOUND,
    )
    from lib_bejson_BEHTML_core import (
        BEHTMLError,
        behtml_core_validate_x_address,
        behtml_core_validate_quantization,
        behtml_core_y_span_to_px,
    )
    from lib_bejson_BEHTML_bejson_schema import (
        BEHTML_ROOT_RECORDS_TYPE,
        KNOWN_ELEMENT_TYPES,
    )
except ImportError as e:
    import logging
    logging.critical(f"[BEHTML_VALIDATOR] FATAL: BEHTML sibling module unreachable: {e}")
    raise SystemExit(1)


def behtml_validator_validate_document(doc: Dict[str, Any], strict_types: bool = False) -> List[str]:
    """
    Validate a full BEHTML document. Raises BEHTMLError on hard structural
    faults (not-a-dict, wrong Records_Type, missing/duplicate IDs, dangling
    parent refs, spatial-law violations). Returns a list of soft warning
    strings (e.g. unrecognized element_type) that did not raise, unless
    strict_types=True in which case those also raise.
    """
    warnings: List[str] = []

    if not isinstance(doc, dict):
        raise BEHTMLError(E_BEHTML_NOT_BEJSON, "doc must be a dict")

    records_type = doc.get("Records_Type")
    if records_type != [BEHTML_ROOT_RECORDS_TYPE]:
        raise BEHTMLError(
            E_BEHTML_SCHEMA_MISMATCH,
            f"Records_Type must be ['{BEHTML_ROOT_RECORDS_TYPE}'], got {records_type}"
        )

    id_idx = bejson_core_get_field_index(doc, "element_id")
    type_idx = bejson_core_get_field_index(doc, "element_type")
    y_start_idx = bejson_core_get_field_index(doc, "y_start")
    y_span_idx = bejson_core_get_field_index(doc, "y_span")
    x_start_idx = bejson_core_get_field_index(doc, "x_start")
    x_span_idx = bejson_core_get_field_index(doc, "x_span")
    parent_idx = bejson_core_get_field_index(doc, "parent_id_fk")

    seen_ids = set()
    values = doc.get("Values", [])

    # First pass: collect ids, run per-record spatial checks
    for row in values:
        element_id = row[id_idx] if id_idx != -1 else None
        if not element_id:
            raise BEHTMLError(E_BEHTML_MISSING_ELEMENT_ID, f"record missing element_id: {row}")
        if element_id in seen_ids:
            raise BEHTMLError(E_BEHTML_DUPLICATE_ELEMENT_ID, f"duplicate element_id: {element_id}")
        seen_ids.add(element_id)

        element_type = row[type_idx] if type_idx != -1 else None
        if element_type not in KNOWN_ELEMENT_TYPES:
            msg = f"element_id={element_id}: unrecognized element_type '{element_type}'"
            if strict_types:
                raise BEHTMLError(E_BEHTML_INVALID_ELEMENT_TYPE, msg)
            warnings.append(msg)

        x_start = row[x_start_idx] if x_start_idx != -1 else 0
        x_span = row[x_span_idx] if x_span_idx != -1 else 1
        behtml_core_validate_x_address(x_start, x_span)

        y_span = row[y_span_idx] if y_span_idx != -1 else 1
        expected_px = behtml_core_y_span_to_px(y_span)
        behtml_core_validate_quantization(expected_px, y_span)

    # Second pass: resolve parent_id_fk references
    if parent_idx != -1:
        for row in values:
            parent_id = row[parent_idx]
            if parent_id is not None and parent_id not in seen_ids:
                raise BEHTMLError(E_BEHTML_PARENT_NOT_FOUND, f"parent_id_fk '{parent_id}' not found in document")

    return warnings