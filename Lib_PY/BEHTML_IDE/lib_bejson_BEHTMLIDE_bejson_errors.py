"""
Library:         lib_bejson_BEHTMLIDE_bejson_errors.py
Family:          BEHTML_IDE
Module Purpose:  Implements runtime functionality and logic for lib_bejson_BEHTMLIDE_bejson_errors.py.
Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
Version:         0.1.0
Release_Version: 300
Date:            2026-07-31
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   78b788f9-9d5e-4419-a911-ab4c1cbd6859
"""

# ---------------------------------------------------------------------------
# BEHTML_IDE (330-359)
# ---------------------------------------------------------------------------
E_BEHTMLIDE_PROJECT_NOT_FOUND     = 330  # slug doesn't resolve to an existing project
E_BEHTMLIDE_PROJECT_EXISTS        = 331  # create called with a slug that's already taken
E_BEHTMLIDE_INVALID_PROJECT_NAME  = 332  # empty / illegal characters in project name
E_BEHTMLIDE_MALFORMED_REQUEST     = 333  # required field missing from an API payload
E_BEHTMLIDE_MANIFEST_CORRUPT      = 334  # project's 104a.mfdb.bejson failed to load/validate

# 335-359 reserved for future BEHTML_IDE codes.