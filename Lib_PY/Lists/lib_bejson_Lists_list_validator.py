"""
Library:         lib_bejson_Lists_list_validator.py
Family:          Lists
Module Purpose:  Validates list/hierarchy-shaped documents (id/parent_id) on 104 or 104a, plus array-field homogeneity; the caller loads the document (often an MFDB entity file).
Architecture:    Format-level layer on Core's structural validator and field map. Reports every error with a Lists code (480-499, lib_bejson_Lists_bejson_errors.py). Does not orchestrate MFDB and is not specific to 104db.
Format_Scope:    104 | 104a (list-shaped documents)
Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
                 (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
                 (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
Version:         2.0.0
Release_Version: 300
Date:            2026-10-13
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   70e406a6-1f00-45d9-a0ec-adf7d7d865f8
Changelog:
  2.0.0 (2026-10-13) - Moved from Core to the new Lists family (was lib_bejson_Core_bejson_list_validator.py
          1.3.5). validate_list() renamed bejson_lists_validate(); the array-homogeneity check that existed only
          in JS is now bejson_lists_validate_field() here too (parity). Fixes: every error is reported (was
          first-only); null ids rejected; id 0 / False are valid ids and no longer treated as "no parent";
          unhashable ids reported instead of raising TypeError; short rows reported instead of IndexError;
          cycle walk is iterative and reports the loop path; print() in __main__ replaced with logging. Result
          now carries error_codes (Lists 480-490, replacing ad-hoc messages) and, when valid, stats
          {item_count, root_count, max_depth}.
  1.3.5 - Last Core version.
"""

import logging
from typing import Any, Dict, List

import lib_bejson_Core_bejson_validator as StandardValidator
import lib_bejson_Core_bejson_core as BEJSONCore
import lib_bejson_Lists_bejson_errors as Errors

logger = logging.getLogger(__name__)

SUPPORTED_VERSIONS = ("104", "104a")
FIELD_TYPES = ("string", "number", "integer", "boolean", "object")


def _is_root_ref(pid: Any) -> bool:
    """A parent reference of None or "" means root. 0 / False are real ids."""
    return pid is None or (isinstance(pid, str) and pid == "")


def _result(errors: List[str], codes: List[int]) -> Dict[str, Any]:
    return {"is_valid": not errors, "errors": errors, "error_codes": codes}


def bejson_lists_validate(doc_data: dict) -> Dict[str, Any]:
    """
    Validate a hierarchical list document (id / parent_id rows) that is already loaded.

    doc_data: a BEJSON document dict (e.g. from BEJSONCore.bejson_core_load_file() or
    MFDBCore.mfdb_core_get_entity_doc()). No file I/O happens here.

    Returns {"is_valid": bool, "errors": [str], "error_codes": [int], "stats": {...}}.
    "stats" is present only when the document is valid.
    """
    errors: List[str] = []
    codes: List[int] = []

    def fail(code: int, msg: str) -> None:
        codes.append(code)
        errors.append(msg)

    if not isinstance(doc_data, dict):
        fail(Errors.E_LISTS_STRUCTURE_INVALID, "Document must be a dict.")
        return _result(errors, codes)

    # 1. Structural validation (Core). validate_bejson() accepts a dict directly (is_file=False).
    res = StandardValidator.validate_bejson(doc_data, is_file=False)
    if not res.valid:
        for e in res.errors:
            fail(Errors.E_LISTS_STRUCTURE_INVALID, str(e))
        return _result(errors, codes)

    # 2. Format version (MFDB entity docs are 104 and carry Parent_Hierarchy; standalone lists are 104a)
    version = doc_data.get("Format_Version")
    if version not in SUPPORTED_VERSIONS:
        fail(Errors.E_LISTS_INVALID_VERSION,
             f"Lists require Format_Version 104 or 104a; got {version}.")
        return _result(errors, codes)

    # 3. Core list fields via the field-map cache
    f_map = BEJSONCore.bejson_core_get_field_map(doc_data)
    if "id" not in f_map or "parent_id" not in f_map:
        fail(Errors.E_LISTS_MISSING_FIELDS, "Missing core list fields: id, parent_id")
        return _result(errors, codes)
    id_idx, pid_idx = f_map["id"], f_map["parent_id"]
    need = max(id_idx, pid_idx) + 1

    # 4. Per-row checks: short rows, null ids, duplicates; collect parent refs
    ids = set()
    parent_refs: Dict[Any, Any] = {}
    for i, row in enumerate(doc_data.get("Values", [])):
        if len(row) < need:
            fail(Errors.E_LISTS_SHORT_ROW, f"Row {i} too short ({len(row)} cells, need {need}).")
            continue
        uid, pid = row[id_idx], row[pid_idx]
        if uid is None:
            fail(Errors.E_LISTS_NULL_ID, f"Row {i} has null id.")
            continue
        try:
            hash(uid)
            hash(pid)
        except TypeError:
            fail(Errors.E_LISTS_NULL_ID, f"Row {i} has a non-scalar id or parent_id.")
            continue
        if uid in ids:
            fail(Errors.E_LISTS_DUPLICATE_ID, f"Duplicate ID detected: {uid}")
            continue
        ids.add(uid)
        if not _is_root_ref(pid):
            parent_refs[uid] = pid

    # 5. Orphans
    for uid, pid in parent_refs.items():
        if pid not in ids:
            fail(Errors.E_LISTS_ORPHAN, f"Orphan detected: {uid} -> {pid}")

    # 6. Cycles (iterative; each cycle reported once, with its path)
    state: Dict[Any, int] = {}  # 1 = on current path, 2 = done
    for start in parent_refs:
        if start in state:
            continue
        path: List[Any] = []
        cur = start
        while cur in parent_refs and cur not in state:
            state[cur] = 1
            path.append(cur)
            cur = parent_refs[cur]
        if state.get(cur) == 1:
            loop = path[path.index(cur):] + [cur]
            fail(Errors.E_LISTS_CYCLE, "Circular dependency: " + " -> ".join(str(n) for n in loop))
        for n in path:
            state[n] = 2

    out = _result(errors, codes)
    if out["is_valid"]:
        depth: Dict[Any, int] = {}

        def _depth(n: Any) -> int:
            chain = []
            while n in parent_refs and n not in depth:
                chain.append(n)
                n = parent_refs[n]
            base = depth.get(n, 0)
            for k, node in enumerate(reversed(chain), start=1):
                depth[node] = base + k
            return depth.get(chain[0], base) if chain else base

        out["stats"] = {
            "item_count": len(ids),
            "root_count": len(ids) - len(parent_refs),
            "max_depth": max((_depth(n) for n in ids), default=0),
        }
    return out


def _type_ok(value: Any, allowed: str) -> bool:
    if allowed == "string":
        return isinstance(value, str)
    if allowed == "boolean":
        return isinstance(value, bool)
    if allowed == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if allowed == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if allowed == "object":
        return isinstance(value, dict)
    return False


def bejson_lists_validate_field(doc_data: dict, field_name: str, allowed_type: str) -> Dict[str, Any]:
    """
    Array-field homogeneity: every non-null cell of `field_name` must be an array whose
    elements all match `allowed_type` (one of: string, number, integer, boolean, object).
    Works on 104 / 104a documents. Returns the same result dict shape as bejson_lists_validate().
    """
    errors: List[str] = []
    codes: List[int] = []

    def fail(code: int, msg: str) -> None:
        codes.append(code)
        errors.append(msg)

    if not isinstance(doc_data, dict) or not isinstance(doc_data.get("Fields"), list):
        fail(Errors.E_LISTS_STRUCTURE_INVALID, "Document must be a dict with Fields.")
        return _result(errors, codes)
    if allowed_type not in FIELD_TYPES:
        fail(Errors.E_LISTS_STRUCTURE_INVALID,
             f"allowed_type must be one of {', '.join(FIELD_TYPES)}; got {allowed_type!r}.")
        return _result(errors, codes)
    idx = BEJSONCore.bejson_core_get_field_map(doc_data).get(field_name)
    if idx is None:
        fail(Errors.E_LISTS_FIELD_NOT_FOUND, f"Field '{field_name}' not found in document.")
        return _result(errors, codes)

    for r, row in enumerate(doc_data.get("Values", [])):
        if len(row) <= idx:
            fail(Errors.E_LISTS_SHORT_ROW, f"Row {r} too short for field '{field_name}'.")
            continue
        val = row[idx]
        if val is None:
            continue
        if not isinstance(val, list):
            fail(Errors.E_LISTS_FIELD_NOT_ARRAY, f"Row {r}: field '{field_name}' must be an array.")
            continue
        for k, item in enumerate(val):
            if not _type_ok(item, allowed_type):
                fail(Errors.E_LISTS_ITEM_TYPE_MISMATCH,
                     f"Row {r} list item {k} type mismatch: expected '{allowed_type}', got '{type(item).__name__}'.")
    return _result(errors, codes)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger.info("lib_bejson_Lists_list_validator 2.0.0 loaded.")
