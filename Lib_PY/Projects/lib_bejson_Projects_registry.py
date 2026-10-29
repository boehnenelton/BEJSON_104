"""
File Name:       lib_bejson_Projects_registry.py
Relative Path:   lib/lib_bejson_Projects_registry.py
Family:          Projects
Description:     Tracker database + master registry persistence. Each project gets
                 storage/trackers/data/<project>.bejson (one record per Versioned_UUID, upserted, history kept);
                 every UUID is keyed to its tracker file in storage/master/data/registry.bejson, together with
                 version, original source location, snapshot file and lifecycle status
                 (tracked -> chunked -> archived -> restored). Legacy 3-field registries migrate on first write.
                 Writes are PID-locked, validated, and atomic.
VERSION:         1.7.2
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
RELATIONAL_ID:   34163cb6-191e-4ebc-883f-dd807506f5a0
"""

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from lib_bejson_Core_bejson_core import (
    bejson_core_atomic_write,
    bejson_core_get_field_map,
    bejson_core_load_file,
)
from lib_bejson_Core_bejson_validator import validate_bejson
from lib_bejson_Projects_locks import ProjectsPathLock
from lib_bejson_Projects_logging import projects_logging_get_logger
from lib_bejson_Projects_paths import StorageLayout, projects_paths_sanitize_name
from lib_bejson_Projects_tracker import TrackerInfo

VERSION = "1.7.2"
TRACKER_RECORDS_TYPE = "TrackerRecord"
REGISTRY_RECORDS_TYPE = "RegistryRecord"
STATUS_TRACKED, STATUS_CHUNKED, STATUS_ARCHIVED, STATUS_RESTORED = "tracked", "chunked", "archived", "restored"
VALID_STATUSES = (STATUS_TRACKED, STATUS_CHUNKED, STATUS_ARCHIVED, STATUS_RESTORED)
MIN_UUID_PREFIX = 8

TRACKER_FIELDS = [
    {"name": "Versioned_UUID", "type": "string"},
    {"name": "Project_Name", "type": "string"},
    {"name": "Tracker_Data", "type": "string"},
]
LEGACY_REGISTRY_FIELDS = [
    {"name": "Versioned_UUID", "type": "string"},
    {"name": "Project_Name", "type": "string"},
    {"name": "Tracker_File", "type": "string"},
]
REGISTRY_FIELDS = LEGACY_REGISTRY_FIELDS + [
    {"name": "Project_Version", "type": "string"},
    {"name": "Package_Version", "type": "string"},
    {"name": "Original_Path", "type": "string"},
    {"name": "Snapshot_File", "type": "string"},
    {"name": "Status", "type": "string"},
    {"name": "Updated_At", "type": "string"},
]
# Values given to the v2 columns when a legacy row is migrated.
_MIGRATION_FILL = ["", "", "", "", STATUS_TRACKED, ""]

_log = projects_logging_get_logger("registry")


class ProjectsRegistryError(Exception):
    """Raised when a registry/tracker database is corrupt, ambiguous, or cannot be written."""


def projects_registry_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _new_doc(records_type: str, fields: List[Dict[str, str]]) -> Dict[str, Any]:
    return {
        "Format": "BEJSON",
        "Format_Version": "104a",
        "Format_Creator": "Elton Boehnen",
        "Records_Type": [records_type],
        "Fields": [dict(f) for f in fields],
        "Values": [],
    }


def _field_names(doc: Dict[str, Any]) -> List[str]:
    return [f.get("name") for f in doc.get("Fields", [])]


# A legacy 3-field registry is upgraded in memory: columns appended, rows padded. Nothing is lost.
def _migrate_registry(doc: Dict[str, Any]) -> Dict[str, Any]:
    if _field_names(doc) != [f["name"] for f in LEGACY_REGISTRY_FIELDS]:
        return doc
    doc["Fields"] = [dict(f) for f in REGISTRY_FIELDS]
    doc["Values"] = [list(row) + list(_MIGRATION_FILL) for row in doc["Values"]]
    doc.pop("_bejson_field_map", None)
    _log.info("migrated legacy registry to v2 (%d rows)", len(doc["Values"]))
    return doc


# Loads an existing database or returns a fresh one. An existing file that is unreadable, invalid, or has a
# different record type raises instead of being silently overwritten.
def _load_or_new(path: Path, records_type: str, fields: List[Dict[str, str]]) -> Dict[str, Any]:
    if not path.exists():
        return _new_doc(records_type, fields)
    doc = bejson_core_load_file(str(path))
    if doc is None:
        raise ProjectsRegistryError(f"{path} exists but cannot be parsed; refusing to overwrite")
    result = validate_bejson(doc)
    if not result.valid:
        raise ProjectsRegistryError(f"{path} failed BEJSON validation: {'; '.join(result.errors)}")
    if doc.get("Records_Type") != [records_type]:
        raise ProjectsRegistryError(f"{path} has Records_Type {doc.get('Records_Type')}, expected [{records_type!r}]")
    if records_type == REGISTRY_RECORDS_TYPE:
        doc = _migrate_registry(doc)
    names = _field_names(doc)
    if names != [f["name"] for f in fields]:
        raise ProjectsRegistryError(f"{path} has unexpected Fields {names}")
    return doc


# Merge-upsert keyed by Versioned_UUID. Columns named in `changes` are overwritten; on an existing row every other
# column is preserved; on a new row the remaining columns come from `new_defaults` (else ""). Returns added/updated.
def _upsert_row(doc: Dict[str, Any], changes: Dict[str, Any], new_defaults: Optional[Dict[str, Any]] = None) -> str:
    field_map = bejson_core_get_field_map(doc)
    uuid_idx = field_map["Versioned_UUID"]
    for i, row in enumerate(doc["Values"]):
        if row[uuid_idx] == changes["Versioned_UUID"]:
            merged = list(row)
            for name, value in changes.items():
                merged[field_map[name]] = value
            doc["Values"][i] = merged
            return "updated"
    new_row: List[Any] = [""] * len(doc["Fields"])
    for name, value in {**(new_defaults or {}), **changes}.items():
        new_row[field_map[name]] = value
    doc["Values"].append(new_row)
    return "added"


# Validates then atomically writes (caller holds the lock).
def _write_validated(path: Path, doc: Dict[str, Any]) -> None:
    clean = {k: v for k, v in doc.items() if not k.startswith("_")}
    result = validate_bejson(clean)
    if not result.valid:
        raise ProjectsRegistryError(f"refusing to write invalid BEJSON to {path}: {'; '.join(result.errors)}")
    if not bejson_core_atomic_write(str(path), clean):
        raise ProjectsRegistryError(f"atomic write failed for {path}")


def _locked_upsert(path: Path, records_type: str, fields: List[Dict[str, str]], changes: Dict[str, Any],
                   new_defaults: Optional[Dict[str, Any]] = None, must_exist: bool = False) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    with ProjectsPathLock(path):
        doc = _load_or_new(path, records_type, fields)
        if must_exist:
            idx = bejson_core_get_field_map(doc)["Versioned_UUID"]
            if not any(r[idx] == changes["Versioned_UUID"] for r in doc["Values"]):
                raise ProjectsRegistryError(f"{changes['Versioned_UUID']} is not in {path.name}")
        action = _upsert_row(doc, changes, new_defaults)
        _write_validated(path, doc)
    return action


# Pillar 1: upsert this tracker into the project's tracker database. Returns the database path.
def projects_registry_store_tracker(layout: StorageLayout, info: TrackerInfo) -> Path:
    db_path = layout.tracker_db(info.project_name)
    action = _locked_upsert(db_path, TRACKER_RECORDS_TYPE, TRACKER_FIELDS, {
        "Versioned_UUID": info.versioned_uuid,
        "Project_Name": info.project_name,
        "Tracker_Data": json.dumps(info.tracker_data, ensure_ascii=False),
    })
    _log.info("tracker record %s in %s", action, db_path.name)
    return db_path


# Pillar 2: key the UUID to its tracker file and record version + original location. Status and Snapshot_File are
# only defaulted for a brand-new row so re-tracking never rewinds an archived/chunked entry.
def projects_registry_register_uuid(layout: StorageLayout, info: TrackerInfo, tracker_db: Path,
                                    original_path: Optional[Path] = None) -> Path:
    changes = {
        "Versioned_UUID": info.versioned_uuid,
        "Project_Name": info.project_name,
        "Tracker_File": layout.relative_ref(tracker_db),
        "Project_Version": info.project_version,
        "Package_Version": info.package_version,
        "Updated_At": projects_registry_now(),
    }
    if original_path is not None:
        changes["Original_Path"] = str(Path(original_path).resolve())
    action = _locked_upsert(layout.registry_file, REGISTRY_RECORDS_TYPE, REGISTRY_FIELDS, changes,
                            new_defaults={"Status": STATUS_TRACKED})
    _log.info("registry entry %s for %s", action, info.versioned_uuid)
    return layout.registry_file


# Both pillars in order: tracker database first, registry second.
def projects_registry_register(layout: StorageLayout, info: TrackerInfo,
                               original_path: Optional[Path] = None) -> Tuple[Path, Path]:
    tracker_db = projects_registry_store_tracker(layout, info)
    registry = projects_registry_register_uuid(layout, info, tracker_db, original_path)
    return tracker_db, registry


# Updates lifecycle columns of an existing registry row (Status, Snapshot_File, Original_Path). Unknown keys and
# invalid statuses are rejected.
def projects_registry_update(layout: StorageLayout, versioned_uuid: str, **columns: str) -> None:
    allowed = {"Status", "Snapshot_File", "Original_Path"}
    unknown = set(columns) - allowed
    if unknown:
        raise ProjectsRegistryError(f"cannot update columns {sorted(unknown)}")
    if "Status" in columns and columns["Status"] not in VALID_STATUSES:
        raise ProjectsRegistryError(f"invalid status {columns['Status']!r}")
    _locked_upsert(layout.registry_file, REGISTRY_RECORDS_TYPE, REGISTRY_FIELDS,
                   {"Versioned_UUID": versioned_uuid, "Updated_At": projects_registry_now(), **columns},
                   must_exist=True)


# UUID previously issued for the same project name + version + package, or None. Lets re-runs on a tracker-less
# folder stay idempotent instead of minting a new UUID every time. Corrupt databases are treated as "no match".
def projects_registry_find_uuid(layout: StorageLayout, project_name: str,
                                project_version: str, package_version: str) -> Optional[str]:
    db_path = layout.tracker_db(projects_paths_sanitize_name(project_name))
    if not db_path.exists():
        return None
    doc = bejson_core_load_file(str(db_path))
    if not doc or not isinstance(doc.get("Values"), list):
        return None
    field_map = bejson_core_get_field_map(doc)
    if "Versioned_UUID" not in field_map or "Tracker_Data" not in field_map:
        return None
    for row in doc["Values"]:
        try:
            data = json.loads(row[field_map["Tracker_Data"]])
        except (ValueError, TypeError, IndexError):
            continue
        if (str(data.get("Project_Version", "")).strip() == str(project_version)
                and str(data.get("Package_Version", "")).strip() == str(package_version)):
            return row[field_map["Versioned_UUID"]]
    return None


# Registry rows as dicts keyed by field name (empty list when no registry exists yet). Legacy files are
# presented in v2 shape without being rewritten.
def projects_registry_list(layout: StorageLayout) -> List[Dict[str, Any]]:
    if not layout.registry_file.exists():
        return []
    doc = _load_or_new(layout.registry_file, REGISTRY_RECORDS_TYPE, REGISTRY_FIELDS)
    field_map = bejson_core_get_field_map(doc)
    return [{name: row[idx] for name, idx in field_map.items()} for row in doc["Values"]]


# True when the master registry already holds this Versioned_UUID.
def projects_registry_has_uuid(layout: StorageLayout, versioned_uuid: str) -> bool:
    try:
        return any(row["Versioned_UUID"] == versioned_uuid for row in projects_registry_list(layout))
    except ProjectsRegistryError:
        return False


# One row by full UUID or unique prefix (>= 8 chars). Not found / ambiguous -> ProjectsRegistryError.
def projects_registry_get(layout: StorageLayout, selector: str) -> Dict[str, Any]:
    selector = (selector or "").strip().lower()
    rows = projects_registry_list(layout)
    exact = [r for r in rows if r["Versioned_UUID"].lower() == selector]
    if exact:
        return exact[0]
    if len(selector) >= MIN_UUID_PREFIX:
        matches = [r for r in rows if r["Versioned_UUID"].lower().startswith(selector)]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            raise ProjectsRegistryError(f"UUID prefix {selector!r} is ambiguous ({len(matches)} matches)")
    raise ProjectsRegistryError(f"no registry entry matches {selector!r}")


# Every registered version of one project, oldest registration first (file order).
def projects_registry_versions(layout: StorageLayout, project_name: str) -> List[Dict[str, Any]]:
    safe = projects_paths_sanitize_name(project_name)
    return [r for r in projects_registry_list(layout) if r["Project_Name"] == safe]
