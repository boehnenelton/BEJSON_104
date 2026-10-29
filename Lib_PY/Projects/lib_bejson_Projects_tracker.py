"""
File Name:       lib_bejson_Projects_tracker.py
Relative Path:   lib/lib_bejson_Projects_tracker.py
Family:          Projects
Description:     Tracker detection, identity extraction and auto-generation for a target directory.
                 Reads an existing bejson_project.json (or legacy .bejson_project.json); otherwise derives
                 a tracker from the folder name (spaces -> "_", V#-PKG# honoured). Never writes into the
                 target directory and never invents a global Project_GUID.
VERSION:         1.7.2
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
RELATIONAL_ID:   427b28a3-a3f5-4dfa-bdc9-df3f52ca3d57
"""

import json
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from lib_bejson_Core_bejson_core import bejson_core_get_field_map
from lib_bejson_Projects_logging import projects_logging_get_logger
from lib_bejson_Projects_paths import projects_paths_sanitize_name

VERSION = "1.7.2"
TRACKER_FILENAMES = ("bejson_project.json", ".bejson_project.json")
DEFAULT_PROJECT_VERSION = "100"
DEFAULT_PACKAGE_VERSION = "1"
GUID_PLACEHOLDER = "GUID_PLACEHOLDER"
_FOLDER_VERSION_RE = re.compile(r"V(\d+)-PKG(\d+)", re.IGNORECASE)
_FOLDER_SUFFIX_RE = re.compile(r"[-_ ]*V\d+-PKG\d+.*$", re.IGNORECASE)

_log = projects_logging_get_logger("tracker")

# (project_name, project_version, package_version) -> previously issued Versioned_UUID or None
UuidLookup = Callable[[str, str, str], Optional[str]]


@dataclass
class TrackerInfo:
    project_name: str
    project_version: str
    package_version: str
    versioned_uuid: str
    tracker_data: Dict[str, Any]
    source: str                      # "existing" | "generated"
    tracker_path: Optional[str] = None
    notes: list = field(default_factory=list)


# First tracker file present in target_dir (current name wins over legacy), else None.
def projects_tracker_find_file(target_dir: Path) -> Optional[Path]:
    for name in TRACKER_FILENAMES:
        candidate = Path(target_dir) / name
        if candidate.is_file():
            return candidate
    return None


# Parses a tracker file; returns None (with a warning) when unreadable or not a JSON object.
def projects_tracker_read_file(path: Path) -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        _log.warning("Tracker %s unreadable (%s); falling back to generated tracker", path, exc)
        return None
    if not isinstance(data, dict):
        _log.warning("Tracker %s is not a JSON object; falling back to generated tracker", path)
        return None
    return data


# (name, version, package) parsed from a folder name like "My Tool-V12-PKG3"; defaults when no V#-PKG# present.
def projects_tracker_derive_from_folder(folder_name: str) -> tuple:
    name = projects_paths_sanitize_name(_FOLDER_SUFFIX_RE.sub("", folder_name.replace(" ", "_")))
    match = _FOLDER_VERSION_RE.search(folder_name)
    if match:
        return name, match.group(1), match.group(2)
    return name, DEFAULT_PROJECT_VERSION, DEFAULT_PACKAGE_VERSION


def _is_uuid(value: Any) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


# Pulls identity values from a tracker document: top-level headers first, then the first Values row through the
# field-map cache (no positional indices). Missing values come back as "".
def projects_tracker_extract_identity(tracker_doc: Dict[str, Any]) -> Dict[str, str]:
    keys = ("Project_Name", "Project_Version", "Package_Version", "Versioned_UUID")
    identity = {key: _clean(tracker_doc.get(key)) for key in keys}
    values = tracker_doc.get("Values")
    if isinstance(values, list) and values and isinstance(values[0], list):
        field_map = bejson_core_get_field_map(tracker_doc)
        for key in keys:
            if not identity[key] and key in field_map and field_map[key] < len(values[0]):
                identity[key] = _clean(values[0][field_map[key]])
    return identity


# Detects the tracker in target_dir or builds one. A Versioned_UUID that is absent or not a real UUID (e.g. the
# template placeholder) is replaced by a previously issued UUID for the same name+version (lookup) or a fresh uuid4.
def projects_tracker_detect_or_create(target_dir: Path,
                                      uuid_lookup: Optional[UuidLookup] = None) -> TrackerInfo:
    target_dir = Path(target_dir)
    folder_name, folder_ver, folder_pkg = projects_tracker_derive_from_folder(target_dir.name)

    tracker_path = projects_tracker_find_file(target_dir)
    doc = projects_tracker_read_file(tracker_path) if tracker_path else None

    if doc is not None:
        identity = projects_tracker_extract_identity(doc)
        name = projects_paths_sanitize_name(identity["Project_Name"] or folder_name)
        pver = identity["Project_Version"] or folder_ver
        pkg = identity["Package_Version"] or folder_pkg
        notes = []
        v_uuid = identity["Versioned_UUID"]
        if not _is_uuid(v_uuid):
            v_uuid = (uuid_lookup(name, pver, pkg) if uuid_lookup else None) or str(uuid.uuid4())
            notes.append("tracker had no valid Versioned_UUID; assigned one")
        doc["Versioned_UUID"] = v_uuid
        return TrackerInfo(name, pver, pkg, v_uuid, doc, "existing", str(tracker_path), notes)

    v_uuid = (uuid_lookup(folder_name, folder_ver, folder_pkg) if uuid_lookup else None) or str(uuid.uuid4())
    generated = {
        "Format": "BEJSON",
        "Format_Version": "104a",
        "Format_Creator": "Elton Boehnen",
        "Project_Name": folder_name,
        "Project_Version": folder_ver,
        "Package_Version": folder_pkg,
        "Versioned_UUID": v_uuid,
        "Project_GUID": GUID_PLACEHOLDER,
        "Records_Type": ["RootPackage"],
        "Fields": [{"name": "change_log", "type": "string"}],
        "Values": [],
    }
    return TrackerInfo(folder_name, folder_ver, folder_pkg, v_uuid, generated, "generated", None,
                       ["no tracker in target; generated from folder name"])
