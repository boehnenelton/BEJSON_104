"""
Library:         lib_bejson_BEHTML_bootstrap.py
Family:          BEHTML
Module Purpose:  Implements runtime functionality and logic for lib_bejson_BEHTML_bootstrap.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         0.4.0
Release_Version: 300
Date:            2026-07-30
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   f3c7b02a-1d8e-4f6a-b9c3-7e2a5d048f19
"""

import os
import sys
from pathlib import Path

SCRIPT_PATH = str(Path(__file__).resolve().parent)


def _candidate_paths():
    lib_root = os.environ.get("BEJSON_LIB_ROOT")
    if lib_root:
        yield Path(lib_root) / "Core"              # root already = .../Lib_PY
        yield Path(lib_root) / "Lib_PY" / "Core"    # root = .../libraries
    # Local dev fallback: Core as a flat sibling of this project's own
    # family folder (mirrors the real tree), NOT a copy inside this folder.
    yield Path(SCRIPT_PATH).parent / "Core"


def ensure_core_on_path() -> str:
    """Add the canonical Core directory to sys.path exactly once. Returns the path used."""
    for candidate in _candidate_paths():
        if candidate.is_dir() and (candidate / "lib_bejson_Core_bejson_core.py").exists():
            candidate_str = str(candidate)
            if candidate_str not in sys.path:
                sys.path.insert(0, candidate_str)
            return candidate_str
    raise ImportError(
        "lib_bejson_Core not found. Set BEJSON_LIB_ROOT to the shared library "
        "root, or place the canonical Libraries/Lib_PY/Core alongside this project. "
        "It must never be copied into BEHTML/lib/ — see policy 6.1."
    )


ensure_core_on_path()