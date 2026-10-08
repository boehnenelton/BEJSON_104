#!/usr/bin/env python3
"""
Name:           BEJSON_Template_PY_Full
Description:    Basic executable template with the BEJSON Core error
                 registry, the BEJSON Core low-level operations, and the
                 BEJSON Core validator all embedded inline. Nothing in
                 this file is called automatically -- every function/class
                 below is defined and ready to be imported or invoked by
                 other code that loads this file.
Version:        (see VERSION below)
Date Created:   2026-09-09
Author:         Elton Boehnen
Contact:        boehnenelton2024@gmail.com | boehnenelton2024.pages.dev | github.com/boehnenelton
Format_Creator: Elton Boehnen
RELATIONAL_ID:  b3b27ea9-c2c1-4bf4-8a1e-cb2852114be8
Release_Version: 300
"""

import json
import os
import tempfile
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

VERSION = 1
RELEASE_VERSION: int = 300  # Only the Core BEJSON file defines this as a variable.

# ---------------------------------------------------------------------------
# Error registry (BEJSON validation codes 1-16, Core ops 17-29)
# Embedded directly -- no external lib_bejson_Core_bejson_errors import.
# ---------------------------------------------------------------------------
E_INVALID_JSON               = 1
E_MISSING_MANDATORY_KEY      = 2
E_INVALID_FORMAT             = 3
E_INVALID_VERSION            = 4
E_INVALID_RECORDS_TYPE       = 5
E_INVALID_FIELDS             = 6
E_INVALID_VALUES             = 7
E_TYPE_MISMATCH              = 8
E_RECORD_LENGTH_MISMATCH     = 9
E_RESERVED_KEY_COLLISION     = 10
E_INVALID_RECORD_TYPE_PARENT = 11
E_NULL_VIOLATION             = 12
E_FILE_NOT_FOUND             = 13
E_PERMISSION_DENIED          = 14
E_ATOMIC_WRITE_FAILED        = 15
E_INVALID_FORMAT_CREATOR     = 16

E_CORE_PARSE_ERROR            = 17
E_CORE_SERIALIZATION_ERROR    = 18
E_CORE_NULL_DOCUMENT          = 19
E_CORE_INVALID_VERSION        = 20
E_CORE_INVALID_OPERATION      = 21
E_CORE_INDEX_OUT_OF_BOUNDS    = 22
E_CORE_FIELD_NOT_FOUND        = 23
E_CORE_TYPE_CONVERSION_FAILED = 24
E_CORE_BACKUP_FAILED          = 25
E_CORE_WRITE_FAILED           = 26
E_CORE_QUERY_FAILED           = 27
E_CORE_ENCRYPTION_FAILED      = 28
E_CORE_DECRYPTION_FAILED      = 29

VALID_VERSIONS = {"104", "104a", "104db"}
VALID_FIELD_TYPES = {"string", "integer", "number", "boolean", "array", "object"}
MANDATORY_KEYS = ("Format", "Format_Version", "Format_Creator", "Records_Type", "Fields", "Values")


# ---------------------------------------------------------------------------
# Core (embedded from lib_bejson_Core_bejson_core)
# NOTE: resolve_path() below is a minimal inline stand-in for the
# lib_bejson_Core_bejson_env dependency, so this template stays single-file.
# ---------------------------------------------------------------------------
class BEJSONCoreError(Exception):
    def __init__(self, message: str, code: int = None):
        super().__init__(message)
        self.code = code


def resolve_path(path: str) -> Optional[Path]:
    """Minimal path resolver stand-in (normally sourced from bejson_env)."""
    try:
        p = Path(path).expanduser()
        return p
    except Exception:
        return None


def bejson_core_load_file(path: str) -> Optional[dict]:
    path = resolve_path(path)
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            doc = json.load(f)
        if isinstance(doc, dict):
            doc.pop("_bejson_field_map", None)  # in-memory cache only; persisted copy is untrusted
        return doc
    except Exception as e:
        logging.error(f"[BEJSON_CORE] Failed to load {path}: {e}")
        return None


def bejson_core_atomic_write(path: str, data: dict) -> bool:
    target_dir = os.path.dirname(os.path.abspath(path))
    os.makedirs(target_dir, exist_ok=True)
    clean_data = {k: v for k, v in data.items() if not k.startswith("_")}
    fd, tmp_path = tempfile.mkstemp(dir=target_dir, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(clean_data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
        return True
    except Exception as e:
        logging.error(f"[BEJSON_CORE] Atomic write failed for {path}: {e}")
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return False


_FIELD_MAP_CACHE: Dict[tuple, Dict[str, int]] = {}


class _FieldMap(dict):
    """Provenance marker: only maps built by get_field_map are trusted; parsed plain dicts are rebuilt."""
    __slots__ = ()


def _field_map_is_fresh(cached_map, fields) -> bool:
    """O(1) guard: size match plus first/middle/last field resolve to their positions."""
    if type(cached_map) is not _FieldMap or not isinstance(fields, list):
        return False
    count = len(fields)
    if len(cached_map) != count:
        return False
    if count == 0:
        return True
    last, mid = count - 1, count // 2
    name = lambda f: f.get("name") if isinstance(f, dict) else str(f)
    return (cached_map.get(name(fields[0])) == 0
            and cached_map.get(name(fields[last])) == last
            and cached_map.get(name(fields[mid])) == mid)


def bejson_core_get_field_map(doc: dict) -> Dict[str, int]:
    fields = doc.get("Fields", [])
    cached_map = doc.get("_bejson_field_map")
    if cached_map is not None:
        if _field_map_is_fresh(cached_map, fields):
            return cached_map
        doc.pop("_bejson_field_map", None)  # stale or forged: rebuild
    if not fields or not isinstance(fields, list):
        return {}
    field_names = tuple(f.get("name") if isinstance(f, dict) else str(f) for f in fields)
    cache_key = (doc.get("Format_Version"), field_names)
    shared_map = _FIELD_MAP_CACHE.get(cache_key)
    if shared_map is None:
        shared_map = {n: i for i, n in enumerate(field_names)}
        _FIELD_MAP_CACHE[cache_key] = shared_map
    field_map = _FieldMap(shared_map)  # per-document copy; the shared cache is never exposed
    try:
        doc["_bejson_field_map"] = field_map
    except Exception:
        pass
    return field_map


def bejson_core_get_field_index(doc: dict, field_name: str) -> int:
    field_map = bejson_core_get_field_map(doc)
    return field_map.get(field_name, -1)


def bejson_core_create_104(record_type: str, fields: list, values: list) -> dict:
    return {
        "Format": "BEJSON",
        "Format_Version": "104",
        "Format_Creator": "Elton Boehnen",
        "Records_Type": [record_type],
        "Fields": fields,
        "Values": values,
    }


def bejson_core_create_104a(record_type: str, fields: list, values: list, **custom) -> dict:
    doc = {
        "Format": "BEJSON",
        "Format_Version": "104a",
        "Format_Creator": "Elton Boehnen",
        "Records_Type": [record_type],
        "Fields": fields,
        "Values": values,
    }
    doc.update(custom)
    return doc


def bejson_core_create_104db(record_types: list, fields: list, values: list) -> dict:
    return {
        "Format": "BEJSON",
        "Format_Version": "104db",
        "Format_Creator": "Elton Boehnen",
        "Records_Type": record_types,
        "Fields": fields,
        "Values": values,
    }


def bejson_core_load_string(content: str) -> Optional[dict]:
    try:
        doc = json.loads(content)
        if isinstance(doc, dict):
            doc.pop("_bejson_field_map", None)  # in-memory cache only; persisted copy is untrusted
        return doc
    except Exception as e:
        logging.error(f"[BEJSON_CORE] Failed to load JSON string: {e}")
        return None


def bejson_core_get_record_count(doc: dict) -> int:
    return len(doc.get("Values", []))


def bejson_core_add_record(doc: dict, record: list) -> bool:
    if len(record) != len(doc.get("Fields", [])):
        return False
    doc.setdefault("Values", []).append(record)
    return True


def bejson_core_remove_record(doc: dict, index: int) -> bool:
    values = doc.get("Values", [])
    if 0 <= index < len(values):
        values.pop(index)
        return True
    return False


def bejson_core_update_field(doc: dict, row_index: int, field_name: str, value: Any) -> bool:
    idx = bejson_core_get_field_index(doc, field_name)
    if idx == -1:
        return False
    values = doc.get("Values", [])
    if 0 <= row_index < len(values):
        values[row_index][idx] = value
        return True
    return False


def bejson_core_filter_rows(doc: dict, field_name: str, value: Any) -> list:
    idx = bejson_core_get_field_index(doc, field_name)
    if idx == -1:
        return []
    return [row for row in doc.get("Values", []) if row[idx] == value]


def bejson_core_sort_by_field(doc: dict, field_name: str, reverse: bool = False) -> None:
    idx = bejson_core_get_field_index(doc, field_name)
    if idx == -1:
        return
    doc["Values"].sort(key=lambda x: x[idx] if x[idx] is not None else "", reverse=reverse)


def bejson_core_is_valid(doc: dict) -> bool:
    required = ["Format", "Format_Version", "Format_Creator", "Records_Type", "Fields", "Values"]
    return all(k in doc for k in required)


def bejson_core_get_version(doc: dict) -> str:
    return doc.get("Format_Version", "unknown")


def bejson_core_get_stats(doc: dict) -> dict:
    return {
        "record_count": bejson_core_get_record_count(doc),
        "field_count": len(doc.get("Fields", [])),
        "version": bejson_core_get_version(doc),
    }


# ---------------------------------------------------------------------------
# Validator (embedded from lib_bejson_Core_bejson_validator)
# ---------------------------------------------------------------------------
@dataclass
class ValidationResult:
    valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    current_file: str = ""

    def add_error(self, message: str):
        self.valid = False
        self.errors.append(message)

    def add_warning(self, message: str):
        self.warnings.append(message)

    @property
    def is_valid(self) -> bool:
        return self.valid


class BEJSONValidationError(Exception):
    def __init__(self, message: str, code: int):
        super().__init__(message)
        self.code = code


def bejson_validator_check_json_syntax(input_, res: ValidationResult, is_file=False):
    if is_file:
        path = Path(input_)
        if not path.exists():
            raise BEJSONValidationError(f"File not found: {input_}", E_FILE_NOT_FOUND)
        text = path.read_text(encoding="utf-8")
        res.current_file = str(path)
    else:
        text = input_
    if isinstance(text, dict):
        return text
    try:
        return json.loads(text)
    except Exception as e:
        raise BEJSONValidationError(f"Invalid JSON: {e}", E_INVALID_JSON)


def bejson_validator_check_mandatory_keys(doc):
    for key in MANDATORY_KEYS:
        if key not in doc:
            raise BEJSONValidationError(f"Missing key: {key}", E_MISSING_MANDATORY_KEY)
    if doc["Format"] != "BEJSON":
        raise BEJSONValidationError("Invalid Format", E_INVALID_FORMAT)
    if doc["Format_Creator"] != "Elton Boehnen":
        raise BEJSONValidationError("Invalid Format_Creator: Must be 'Elton Boehnen'", E_INVALID_FORMAT_CREATOR)
    version = doc.get("Format_Version", "")
    if version not in VALID_VERSIONS:
        raise BEJSONValidationError(f"Invalid version: {version}", E_INVALID_VERSION)
    return version


def bejson_validator_check_records_type(doc, version):
    rt = doc["Records_Type"]
    if not isinstance(rt, list):
        raise BEJSONValidationError("Records_Type must be a list", E_INVALID_RECORDS_TYPE)
    count = len(rt)
    if version in ("104", "104a"):
        if count != 1:
            raise BEJSONValidationError(f"BEJSON {version} must have exactly 1 record type. Found {count}.", E_INVALID_RECORDS_TYPE)
    elif version == "104db":
        if count < 2:
            raise BEJSONValidationError("104db requires 2+ types", E_INVALID_RECORDS_TYPE)


def bejson_validator_check_record_type_parent(doc, version):
    if version != "104db":
        return True
    fields = doc["Fields"]
    if not fields or fields[0].get("name") != "Record_Type_Parent":
        raise BEJSONValidationError("104db first field must be 'Record_Type_Parent'", E_INVALID_RECORD_TYPE_PARENT)
    valid_types = set(doc["Records_Type"])
    for i, record in enumerate(doc["Values"]):
        if not record:
            continue
        rtp = record[0]
        if rtp not in valid_types:
            raise BEJSONValidationError(f"Invalid Record_Type_Parent '{rtp}' at row {i}", E_INVALID_RECORD_TYPE_PARENT)
    return True


def bejson_validator_check_fields_structure(doc, version):
    fields = doc["Fields"]
    for i, f in enumerate(fields):
        fname = f.get("name")
        ftype = f.get("type")
        if not fname or not ftype:
            raise BEJSONValidationError(f"Field {i} missing name or type", E_INVALID_FIELDS)
        if ftype not in VALID_FIELD_TYPES:
            raise BEJSONValidationError(
                f"Field '{fname}' (index {i}) has invalid type '{ftype}'. "
                f"Must be exactly one of {sorted(VALID_FIELD_TYPES)} (lowercase).",
                E_INVALID_FIELDS,
            )
        if version == "104a" and ftype in ("array", "object"):
            raise BEJSONValidationError(f"104a forbids complex type: {ftype}", E_INVALID_FIELDS)
        if version == "104db" and fname != "Record_Type_Parent" and "Record_Type_Parent" not in f:
            raise BEJSONValidationError(f"Field '{fname}' missing Record_Type_Parent in 104db", E_INVALID_RECORD_TYPE_PARENT)
    return len(fields)


def bejson_validator_check_values(doc, version, fields_count):
    fields = doc["Fields"]
    for i, record in enumerate(doc["Values"]):
        if len(record) != fields_count:
            raise BEJSONValidationError(f"Length mismatch at row {i}", E_RECORD_LENGTH_MISMATCH)
        for j, val in enumerate(record):
            ftype = fields[j].get("type")
            if val is None:
                continue
            if ftype == "string" and not isinstance(val, str):
                raise BEJSONValidationError(f"Type mismatch at row {i}, col {j} ({fields[j]['name']}): expected string", E_TYPE_MISMATCH)
            elif ftype == "integer" and (not isinstance(val, int) or isinstance(val, bool)):
                raise BEJSONValidationError(f"Type mismatch at row {i}, col {j} ({fields[j]['name']}): expected integer", E_TYPE_MISMATCH)
            elif ftype == "number" and (not isinstance(val, (int, float)) or isinstance(val, bool)):
                raise BEJSONValidationError(f"Type mismatch at row {i}, col {j} ({fields[j]['name']}): expected number, got bool", E_TYPE_MISMATCH)
            elif ftype == "boolean" and not isinstance(val, bool):
                raise BEJSONValidationError(f"Type mismatch at row {i}, col {j} ({fields[j]['name']}): expected boolean", E_TYPE_MISMATCH)
            elif ftype == "array" and not isinstance(val, list):
                raise BEJSONValidationError(f"Type mismatch at row {i}, col {j} ({fields[j]['name']}): expected array", E_TYPE_MISMATCH)
            elif ftype == "object" and not isinstance(val, dict):
                raise BEJSONValidationError(f"Type mismatch at row {i}, col {j} ({fields[j]['name']}): expected object", E_TYPE_MISMATCH)


def bejson_validator_check_custom_headers(doc, version):
    mandatory_set = set(MANDATORY_KEYS)
    for key in doc:
        if key in mandatory_set or key == "Parent_Hierarchy":
            continue
        if version in ("104", "104db"):
            raise BEJSONValidationError(f"Custom key '{key}' forbidden in {version}", E_RESERVED_KEY_COLLISION)


def validate_bejson(input_data: Union[str, dict], is_file: bool = False) -> ValidationResult:
    """Thread-safe validation. Returns a ValidationResult object."""
    res = ValidationResult()
    try:
        doc = bejson_validator_check_json_syntax(input_data, res, is_file=is_file)
        version = bejson_validator_check_mandatory_keys(doc)
        bejson_validator_check_custom_headers(doc, version)
        bejson_validator_check_records_type(doc, version)
        bejson_validator_check_record_type_parent(doc, version)
        fields_count = bejson_validator_check_fields_structure(doc, version)
        bejson_validator_check_values(doc, version, fields_count)
    except BEJSONValidationError as e:
        res.add_error(str(e))
    except Exception as e:
        res.add_error(f"Unexpected validation error: {e}")
    return res


def bejson_validator_get_report(input_data, is_file: bool = False) -> str:
    res = validate_bejson(input_data, is_file=is_file)
    lines = ["BEJSON Validation Report"]
    lines.append("  File: " + (res.current_file or "<string>"))
    lines.append("  Valid: " + str(res.valid))
    if res.errors:
        lines.append("  Errors:")
        for e in res.errors:
            lines.append("    - " + e)
    if res.warnings:
        lines.append("  Warnings:")
        for w in res.warnings:
            lines.append("    - " + w)
    return "\n".join(lines)


def bejson_validator_validate_string(json_string):
    res = validate_bejson(json_string)
    if not res.valid:
        raise BEJSONValidationError(res.errors[0], E_INVALID_FORMAT)
    return True


def bejson_validator_validate_file(file_path):
    res = validate_bejson(file_path, is_file=True)
    if not res.valid:
        raise BEJSONValidationError(res.errors[0], E_INVALID_FORMAT)
    return True




# ---------------------------------------------------------------------------
# Projects Family Extension
# Provides schemas and safe manipulation functions for the master projects_db
# and individual project trackers.
# ---------------------------------------------------------------------------

import zipfile
import hashlib

PROJECTS_DB_FIELDS = [
    {"name": "Project_Name", "type": "string"},
    {"name": "Project_Version", "type": "string"},
    {"name": "Package_Version", "type": "string"},
    {"name": "Project_Root_Path", "type": "string"},
    {"name": "Project_GUID", "type": "string"},
    {"name": "Last_Seen_Date", "type": "string"},
    {"name": "Session_Id", "type": "string"},
    {"name": "Author", "type": "string"},
    {"name": "Description", "type": "string"},
    {"name": "Project_Modified_Date", "type": "string"},
    {"name": "Package_Date", "type": "string"},
    {"name": "Remote_Repo", "type": "string"},
    {"name": "Launcher", "type": "string"},
    {"name": "Marker_File_Path", "type": "string"},
    {"name": "Drive_Path", "type": "string"},
    {"name": "First_Detected_Date", "type": "string"},
    {"name": "Detected_By_Index_Type", "type": "string"},
    {"name": "Raw_JSON", "type": "string"},
    {"name": "Change_Log", "type": "string"},
    {"name": "User_Feedback", "type": "string"},
    {"name": "Project_Description", "type": "string"},
    {"name": "Date_Changed", "type": "string"},
    {"name": "Project_Type", "type": "string"},
    {"name": "Is_Registered", "type": "string"},
    {"name": "Version", "type": "string"},
    {"name": "Changes", "type": "string"},
    {"name": "Date_YYYY-MM-DD", "type": "string"},
    {"name": "Time_HH-MM_YYYY-MM", "type": "string"},
    {"name": "Package_Description", "type": "string"},
    {"name": "Schema_Name", "type": "string"},
    {"name": "gh_repo_url", "type": "string"},
    {"name": "latest_known_version", "type": "string"},
    {"name": "local_path", "type": "string"},
    {"name": "Archive_Path", "type": "string"},
    {"name": "Archive_Filename", "type": "string"},
    {"name": "Is_Legacy", "type": "string"},
    {"name": "Flags", "type": "string"},
    {"name": "Known_Issues", "type": "string"},
    {"name": "Change_Notes", "type": "string"}
]

def projects_db_get_row_by_archive_path(doc: dict, archive_path: str) -> Optional[int]:
    idx = bejson_core_get_field_index(doc, "Archive_Path")
    if idx == -1: return None
    for i, row in enumerate(doc.get("Values", [])):
        if row[idx] == archive_path:
            return i
    return None

def projects_db_atomic_update_archive_path(doc: dict, old_path: str, new_path: str, new_name: str = None, new_filename: str = None) -> bool:
    idx = bejson_core_get_field_index(doc, "Archive_Path")
    if idx == -1: return False
    
    updated = False
    for i, row in enumerate(doc.get("Values", [])):
        if str(row[idx]).startswith(old_path):
            row[idx] = str(row[idx]).replace(old_path, new_path, 1)
            
            if new_name is not None:
                bejson_core_update_field(doc, i, "Project_Name", new_name)
            
            if new_filename is not None and old_path == str(row[idx]):
                # If we targeted a specific file, update its filename too
                bejson_core_update_field(doc, i, "Archive_Filename", new_filename)
                
            updated = True
            
    return updated

def projects_db_flag_duplicate(doc: dict, archive_path: str) -> bool:
    row_idx = projects_db_get_row_by_archive_path(doc, archive_path)
    if row_idx is None: return False
    
    flags_idx = bejson_core_get_field_index(doc, "Flags")
    if flags_idx == -1: return False
    
    current_flags = doc["Values"][row_idx][flags_idx]
    if current_flags is None: current_flags = ""
    
    if "DUPLICATE" not in current_flags:
        new_flags = (current_flags + " DUPLICATE").strip()
        bejson_core_update_field(doc, row_idx, "Flags", new_flags)
        
    return True
    
def projects_db_flag_misattributed(doc: dict, archive_path: str) -> bool:
    row_idx = projects_db_get_row_by_archive_path(doc, archive_path)
    if row_idx is None: return False
    
    flags_idx = bejson_core_get_field_index(doc, "Flags")
    if flags_idx == -1: return False
    
    current_flags = doc["Values"][row_idx][flags_idx]
    if current_flags is None: current_flags = ""
    
    if "MISATTRIBUTED" not in current_flags:
        new_flags = (current_flags + " MISATTRIBUTED").strip()
        bejson_core_update_field(doc, row_idx, "Flags", new_flags)
        
    return True

def tracker_extract_manifest_safely(zip_path: str) -> Optional[dict]:
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            for fname in z.namelist():
                if fname.endswith('bejson_project.json') or fname.endswith('.bejson_project.json'):
                    with z.open(fname) as f:
                        return json.loads(f.read().decode('utf-8'))
    except Exception as e:
        logging.error(f"[PROJECTS_LIB] Failed to extract manifest from {zip_path}: {e}")
    return None

def compute_sha256(filepath: str) -> Optional[str]:
    try:
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    except Exception as e:
        logging.error(f"[PROJECTS_LIB] SHA256 compute failed for {filepath}: {e}")
        return None

# ---------------------------------------------------------------------------
# About / Info
# ---------------------------------------------------------------------------
def about():
    return (
        "BEJSON_Template_PY_Full v" + str(VERSION) + " (Release_Version " + str(RELEASE_VERSION) + ")\n"
        "Embedded: BEJSON Core error registry + BEJSON Core + BEJSON Core validator\n"
        "Author: Elton Boehnen | boehnenelton2024@gmail.com | "
        "boehnenelton2024.pages.dev | github.com/boehnenelton"
    )


if __name__ == "__main__":
    # Template only -- does not call any core or validator function against
    # real data. Import this file and call e.g. validate_bejson(doc),
    # bejson_core_load_file(path), bejson_core_create_104(...) once wired
    # into a real project.
    print(about())
