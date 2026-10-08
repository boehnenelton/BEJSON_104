"""
Library:         lib_bejson_Cognition_bejson_errors.py
Family:          Cognition
Module Purpose:  Implements runtime functionality and logic for lib_bejson_Cognition_bejson_errors.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         1.0.0
Release_Version: 300
Date:            2026-07-18
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   771448b9-dfb8-4e3c-9a6c-2e9627ab3a13
"""

# ---------------------------------------------------------------------------
# Cognition (270-289)
# ---------------------------------------------------------------------------
E_COGNITION_INVALID_MATRIX    = 270  # reserved, not yet raised anywhere
E_COGNITION_AGENT_NOT_FOUND   = 271  # reserved, not yet raised anywhere
E_COGNITION_INDEX_MISSING     = 272  # reserved, not yet raised anywhere
E_COGNITION_PATCH_FAILED      = 273  # reserved, not yet raised anywhere
E_COGNITION_SCHEMA_VIOLATION  = 274  # reserved, not yet raised anywhere
E_COGNITION_LOCK_TIMEOUT      = 275

# 276-289 reserved for future Cognition codes.

# NOTE: E_COGNITION_SANDBOX_VIOLATION is numbered 403, outside the
# documented Cognition range (270-289). It was already defined this way in
# lib_bejson_Cognition_bejson_cognition.py before this file existed; kept
# as-is here rather than renumbered, to avoid a wire-compatibility break.
# Flagging so it isn't mistaken for a future 400-series family's code.
E_COGNITION_SANDBOX_VIOLATION = 403