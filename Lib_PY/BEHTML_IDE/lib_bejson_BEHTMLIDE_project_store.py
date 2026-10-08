"""
Library:         lib_bejson_BEHTMLIDE_project_store.py
Family:          BEHTML_IDE
Module Purpose:  Implements runtime functionality and logic for lib_bejson_BEHTMLIDE_project_store.py.
Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
Version:         0.1.0
Release_Version: 300
Date:            2026-07-31
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   484c2502-d57e-46c6-b7cb-8d0ab04cc05f
"""

import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import lib_bejson_BEHTMLIDE_bootstrap  # noqa: F401  -- adds canonical BEHTML to sys.path
import lib_bejson_BEHTML_bootstrap     # noqa: F401  -- adds canonical Core to sys.path

try:
    from lib_bejson_Core_mfdb_core import (
        mfdb_core_create_database,
        mfdb_core_get_entity_doc,
        mfdb_core_load_manifest,
        mfdb_core_sync_manifest_count,
    )
    from lib_bejson_Core_bejson_core import bejson_core_atomic_write, bejson_core_load_file
except ImportError as e:
    import logging
    logging.critical(f"[BEHTMLIDE_PROJECT_STORE] FATAL: Core library unreachable: {e}")
    raise SystemExit(1)

try:
    from lib_bejson_BEHTML_bejson_schema import SCHEMA_BEHTML_ELEMENT_v1, BEHTML_ROOT_RECORDS_TYPE
    from lib_bejson_BEHTML_core import BEHTMLError
except ImportError as e:
    import logging
    logging.critical(f"[BEHTMLIDE_PROJECT_STORE] FATAL: BEHTML sibling module unreachable: {e}")
    raise SystemExit(1)

from lib_bejson_BEHTMLIDE_bejson_errors import (
    E_BEHTMLIDE_PROJECT_NOT_FOUND,
    E_BEHTMLIDE_PROJECT_EXISTS,
    E_BEHTMLIDE_INVALID_PROJECT_NAME,
    E_BEHTMLIDE_MANIFEST_CORRUPT,
)


class BEHTMLIDEError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(f"[E{code}] {message}")


_SLUG_RE = re.compile(r"[^a-z0-9_]+")


def behtmlide_project_slug(name: str) -> str:
    """Turn a display name into a filesystem-safe project slug."""
    if not name or not name.strip():
        raise BEHTMLIDEError(E_BEHTMLIDE_INVALID_PROJECT_NAME, "project name cannot be empty")
    slug = _SLUG_RE.sub("_", name.strip().lower()).strip("_")
    if not slug:
        raise BEHTMLIDEError(E_BEHTMLIDE_INVALID_PROJECT_NAME, f"'{name}' has no valid characters for a slug")
    return slug


def _manifest_path(projects_root: str, slug: str) -> str:
    return str(Path(projects_root) / slug / "104a.mfdb.bejson")


def behtmlide_list_projects(projects_root: str) -> List[Dict[str, Any]]:
    """List every project (subfolder with a valid manifest) under projects_root."""
    root = Path(projects_root)
    if not root.is_dir():
        return []
    projects = []
    for entry in sorted(root.iterdir()):
        manifest_path = entry / "104a.mfdb.bejson"
        if not manifest_path.is_file():
            continue
        doc = bejson_core_load_file(str(manifest_path))
        if not doc:
            continue
        projects.append({
            "slug": entry.name,
            "name": doc.get("DB_Name", entry.name),
            "modified": doc.get("Created_At"),
            "manifest_path": str(manifest_path),
        })
    return projects


def behtmlide_create_project(projects_root: str, name: str) -> Dict[str, Any]:
    """Create a new project: a fresh MFDB database with one BEHTMLElement entity."""
    slug = behtmlide_project_slug(name)
    project_dir = Path(projects_root) / slug
    if (project_dir / "104a.mfdb.bejson").exists():
        raise BEHTMLIDEError(E_BEHTMLIDE_PROJECT_EXISTS, f"project '{slug}' already exists")

    manifest_path = mfdb_core_create_database(
        root_dir=str(project_dir),
        db_name=name,
        entities=[{
            "name": BEHTML_ROOT_RECORDS_TYPE,
            "fields": SCHEMA_BEHTML_ELEMENT_v1,
            "description": "BEHTML grid elements for this project",
            "file_path": "data/behtmlelement.bejson",
        }],
        db_description=f"BEHTML IDE project: {name}",
    )
    return {"slug": slug, "name": name, "manifest_path": manifest_path}


def behtmlide_get_manifest_path(projects_root: str, slug: str) -> str:
    manifest_path = _manifest_path(projects_root, slug)
    if not os.path.isfile(manifest_path):
        raise BEHTMLIDEError(E_BEHTMLIDE_PROJECT_NOT_FOUND, f"no project '{slug}' under {projects_root}")
    return manifest_path


def behtmlide_load_project_doc(projects_root: str, slug: str) -> Dict[str, Any]:
    """Load a project's BEHTMLElement document (the actual layout)."""
    manifest_path = behtmlide_get_manifest_path(projects_root, slug)
    try:
        doc = mfdb_core_get_entity_doc(manifest_path, BEHTML_ROOT_RECORDS_TYPE)
    except Exception as e:
        raise BEHTMLIDEError(E_BEHTMLIDE_MANIFEST_CORRUPT, f"failed to load '{slug}': {e}")
    if doc is None:
        raise BEHTMLIDEError(E_BEHTMLIDE_MANIFEST_CORRUPT, f"entity doc missing for project '{slug}'")
    return doc


def _resolve_entity_path(manifest_path: str) -> str:
    manifest_doc = bejson_core_load_file(manifest_path)
    fields = [f["name"] for f in manifest_doc["Fields"]]
    name_i, path_i = fields.index("entity_name"), fields.index("file_path")
    for row in manifest_doc["Values"]:
        if row[name_i] == BEHTML_ROOT_RECORDS_TYPE:
            return str(Path(manifest_path).parent / row[path_i])
    raise BEHTMLIDEError(E_BEHTMLIDE_MANIFEST_CORRUPT, "manifest has no BEHTMLElement entity registered")


def behtmlide_save_project_doc(projects_root: str, slug: str, doc: Dict[str, Any]) -> bool:
    """Persist a project's document back to disk and sync the manifest's record count."""
    manifest_path = behtmlide_get_manifest_path(projects_root, slug)
    entity_path = _resolve_entity_path(manifest_path)
    ok = bejson_core_atomic_write(entity_path, doc)
    mfdb_core_sync_manifest_count(manifest_path, BEHTML_ROOT_RECORDS_TYPE)
    return ok