"""
Library:         lib_bejson_CoreExtension_bejson_errors.py
Family:          Core_Extension
Module Purpose:  Error registry for the Core_Extension family — the FIRST member of a new family category sitting alongside Core (which now includes the nesting modules). Core_Extension is where new Core-adjacent capabilities land that are useful across every BEJSON/MFDB consumer but don't belong inside the immutable Core family itself (Core stays untouched; extensions are additive, built entirely on Core's public API, never on its internals). Same isolated-per-family error-code pattern as every other family: Core_Nesting (130-159), AI (200-219), Cognition (270-289), BEHTML (300-329), BEHTML_IDE (330-359). Core_Extension claims 160-189, immediately after Core_Nesting, keeping the Core-adjacent families clustered together in the registry.
Architecture:    Nested BEJSON 104 embeds tabular structures inside parent cell strings using implicit physical coordinates NestAddress(parent_fp, row, col, depth) without synthetic foreign key fields.
Version:         1.0.0
Release_Version: 300
Date:            2026-08-09
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   2b7d998c-3b91-4489-9227-252d5ca9218f
"""

# ---------------------------------------------------------------------------
# Core_Extension (160-189)
# ---------------------------------------------------------------------------

# --- bejson_pagecache (160-179) ---
E_PAGECACHE_ENTITY_NOT_FOUND      = 160  # entity_name not in the manifest
E_PAGECACHE_INVALID_PAGE_NUMBER   = 161  # page_number < 0
E_PAGECACHE_INVALID_PAGE_SIZE     = 162  # page_size < 1
E_PAGECACHE_MALFORMED_SOURCE      = 163  # source entity file isn't valid BEJSON shape
E_PAGECACHE_STREAM_PARSE_FAILED   = 164  # streaming Values-array walk hit malformed JSON
E_PAGECACHE_WRITE_FAILED          = 165  # couldn't write the page temp file
E_PAGECACHE_CACHE_DIR_UNWRITABLE  = 166  # cache directory couldn't be created/isn't writable

# 167-179 reserved for future bejson_pagecache codes.
# 180-189 reserved for future Core_Extension modules beyond bejson_pagecache.