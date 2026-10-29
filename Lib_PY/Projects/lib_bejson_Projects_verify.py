"""
File Name:       lib_bejson_Projects_verify.py
Relative Path:   lib/lib_bejson_Projects_verify.py
Family:          Projects
Description:     Read-only integrity audit of the three storage pillars: BEJSON validity of every database,
                 registry -> tracker file linkage, UUID presence, and per-file SHA-256 checks inside snapshots.
VERSION:         1.7.2
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
RELATIONAL_ID:   400a3767-dd59-40e2-a886-34e986468d34
"""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

from lib_bejson_Core_bejson_core import bejson_core_get_field_map, bejson_core_load_file
from lib_bejson_Core_bejson_validator import validate_bejson
from lib_bejson_Projects_paths import StorageLayout
from lib_bejson_Projects_snapshot import ProjectsSnapshotError, projects_snapshot_iter_rows

VERSION = "1.7.2"


@dataclass
class Issue:
    severity: str      # "error" | "warning"
    path: str
    message: str


def _rel(layout: StorageLayout, path: Path) -> str:
    try:
        return layout.relative_ref(path)
    except ValueError:
        return str(path)


def _check_valid(layout: StorageLayout, path: Path, issues: List[Issue]) -> Dict[str, Any]:
    result = validate_bejson(str(path), is_file=True)
    if not result.valid:
        for err in result.errors:
            issues.append(Issue("error", _rel(layout, path), f"BEJSON invalid: {err}"))
        return {}
    return bejson_core_load_file(str(path)) or {}


def _check_snapshot_rows(layout: StorageLayout, path: Path, doc: Dict[str, Any], issues: List[Issue]) -> None:
    seen = set()
    try:
        decoded = list(projects_snapshot_iter_rows(doc))
    except ProjectsSnapshotError as exc:
        issues.append(Issue("error", _rel(layout, path), str(exc)))
        return
    for row, error in decoded:
        rel = row.relative_path
        if rel in seen:
            issues.append(Issue("error", _rel(layout, path), f"duplicate Relative_Path {rel}"))
        seen.add(rel)
        if ".." in Path(rel).parts or Path(rel).is_absolute():
            issues.append(Issue("error", _rel(layout, path), f"unsafe Relative_Path {rel}"))
        if error:
            issues.append(Issue("error", _rel(layout, path), f"{rel}: {error}"))
        elif row.is_dir:
            continue                                   # captured empty directory: no content to hash
        elif hashlib.sha256(row.raw).hexdigest() != row.expected_hash:
            issues.append(Issue("error", _rel(layout, path), f"{rel}: File_Hash mismatch"))


# Audits everything under layout. Returns [] when storage is healthy (or empty).
def projects_verify_storage(layout: StorageLayout) -> List[Issue]:
    issues: List[Issue] = []
    registry_uuids: Dict[str, str] = {}

    if layout.registry_file.exists():
        reg = _check_valid(layout, layout.registry_file, issues)
        if reg:
            fm = bejson_core_get_field_map(reg)
            for row in reg.get("Values", []):
                uid, tracker_ref = row[fm["Versioned_UUID"]], row[fm["Tracker_File"]]
                registry_uuids[uid] = tracker_ref
                snap_ref = row[fm["Snapshot_File"]] if "Snapshot_File" in fm else ""
                status = row[fm["Status"]] if "Status" in fm else ""
                if snap_ref:
                    try:
                        if not layout.resolve_ref(snap_ref).is_file():
                            issues.append(Issue("error", _rel(layout, layout.registry_file),
                                                f"{uid}: snapshot file missing {snap_ref}"))
                    except ValueError:
                        issues.append(Issue("error", _rel(layout, layout.registry_file),
                                            f"{uid}: unsafe Snapshot_File {snap_ref}"))
                elif status in ("chunked", "archived", "restored"):
                    issues.append(Issue("warning", _rel(layout, layout.registry_file),
                                        f"{uid}: status {status} but no Snapshot_File recorded"))
                try:
                    tracker_path = layout.resolve_ref(tracker_ref)
                except ValueError:
                    issues.append(Issue("error", _rel(layout, layout.registry_file), f"{uid}: unsafe Tracker_File {tracker_ref}"))
                    continue
                if not tracker_path.is_file():
                    issues.append(Issue("error", _rel(layout, layout.registry_file), f"{uid}: tracker file missing {tracker_ref}"))
                    continue
                tdoc = _check_valid(layout, tracker_path, issues)
                if tdoc:
                    tfm = bejson_core_get_field_map(tdoc)
                    if uid not in {r[tfm["Versioned_UUID"]] for r in tdoc.get("Values", [])}:
                        issues.append(Issue("error", _rel(layout, tracker_path), f"{uid}: not present in tracker database"))
                    for r in tdoc.get("Values", []):
                        try:
                            json.loads(r[tfm["Tracker_Data"]])
                        except (ValueError, TypeError):
                            issues.append(Issue("error", _rel(layout, tracker_path), f"{r[tfm['Versioned_UUID']]}: Tracker_Data is not JSON"))

    if layout.trackers_dir.is_dir():
        referenced = {Path(layout.resolve_ref(ref)).resolve() for ref in registry_uuids.values()
                      if ".." not in Path(ref).parts}
        for tracker_file in sorted(layout.trackers_dir.glob("*.bejson")):
            if tracker_file.resolve() not in referenced:
                issues.append(Issue("warning", _rel(layout, tracker_file), "tracker database not referenced by registry"))

    if layout.snapshots_dir.is_dir():
        for snap in sorted(layout.snapshots_dir.glob("*/data/*.bejson")):
            doc = _check_valid(layout, snap, issues)
            if not doc:
                continue
            uid = doc.get("Versioned_UUID")
            if uid not in registry_uuids:
                issues.append(Issue("warning", _rel(layout, snap), f"Versioned_UUID {uid} not in registry"))
            _check_snapshot_rows(layout, snap, doc, issues)

    # Untracked chunks (made without tracking) are expected to be absent from the registry; they are still checked
    # for validity and row hashes. One that IS in the registry is out of place: it belongs with the tracked chunks.
    if layout.untracked_dir.is_dir():
        for snap in sorted(layout.untracked_dir.glob("*.bejson")):
            doc = _check_valid(layout, snap, issues)
            if not doc:
                continue
            if doc.get("Versioned_UUID") in registry_uuids:
                issues.append(Issue("warning", _rel(layout, snap),
                                    f"Versioned_UUID {doc.get('Versioned_UUID')} is registered; this chunk belongs in project_snapshots/"))
            _check_snapshot_rows(layout, snap, doc, issues)
    return issues
