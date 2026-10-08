"""
Library:         lib_bejson_BEHTMLIDE_bootstrap.py
Family:          BEHTML_IDE
Module Purpose:  Implements runtime functionality and logic for lib_bejson_BEHTMLIDE_bootstrap.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         0.1.0
Release_Version: 300
Date:            2026-07-31
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   106d2d8a-a019-4b18-9d28-2d0abf940e31
"""

import os
import sys
from pathlib import Path

SCRIPT_PATH = str(Path(__file__).resolve().parent)


def _candidate_paths():
    lib_root = os.environ.get("BEJSON_LIB_ROOT")
    if lib_root:
        yield Path(lib_root) / "BEHTML"
        yield Path(lib_root) / "Lib_PY" / "BEHTML"
    yield Path(SCRIPT_PATH).parent / "BEHTML"


def ensure_behtml_on_path() -> str:
    """Add the canonical BEHTML directory to sys.path exactly once. Returns the path used."""
    for candidate in _candidate_paths():
        if candidate.is_dir() and (candidate / "lib_bejson_BEHTML_core.py").exists():
            candidate_str = str(candidate)
            if candidate_str not in sys.path:
                sys.path.insert(0, candidate_str)
            return candidate_str
    raise ImportError(
        "lib_bejson_BEHTML not found. Set BEJSON_LIB_ROOT, or place BEHTML "
        "alongside this project. Never copy it into BEHTML_IDE/ -- see policy 6.1."
    )


ensure_behtml_on_path()