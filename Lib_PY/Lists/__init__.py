"""
Library:         __init__.py
Family:          Lists
Module Purpose:  Package entry point for the Lists family.
Architecture:    Format-level layer on Core's validator and field map; list-shaped (id/parent_id) 104 / 104a documents.
Format_Scope:    104 | 104a (list-shaped documents)
Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
                 (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
                 (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
Version:         1.0.0
Release_Version: 300
Date:            2026-10-13
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   2b7e91c4-5d03-4a68-b1f7-0c9a4e8d3f15
"""

# This package's public API is exposed by its constituent modules.
# Import directly from the relevant submodule, e.g.:
#   from lib_bejson_Lists_list_validator import bejson_lists_validate, bejson_lists_validate_field
#   from lib_bejson_Lists_bejson_errors import E_LISTS_CYCLE
