"""
Library:         lib_bejson_Bookmaker_bejson_errors.py
Family:          Bookmaker
Module Purpose:  Implements runtime functionality and logic for lib_bejson_Bookmaker_bejson_errors.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         1.0.0
Release_Version: 300
Date:            2026-08-21
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   c404939b-303e-48f3-958a-b12631fdcd4c
"""

# ---------------------------------------------------------------------------
# Bookmaker (450-479)
# ---------------------------------------------------------------------------
E_BOOKMAKER_CORE_VALIDATION_FAILED = 450  # Stage 1 (generic Core validate_bejson) failed
E_BOOKMAKER_NOT_BOOK_RECORDS_TYPE  = 451  # Records_Type != ["Book", "Chapter"]
E_BOOKMAKER_MISSING_BOOK_ROW       = 452  # Zero, or more than one, Book row present
E_BOOKMAKER_MISSING_BOOK_FIELD     = 453  # Book row missing a required non-empty field (topic/title/entry_id)
E_BOOKMAKER_DUPLICATE_CHAPTER      = 454  # Two Chapter rows share the same chapter_number
E_BOOKMAKER_CHAPTER_GAP            = 455  # chapter_number sequence has a gap (warning only, book may be mid-generation)
E_BOOKMAKER_EMPTY_CHAPTER_CONTENT  = 456  # A Chapter row's content is empty/whitespace-only (warning only)
E_BOOKMAKER_FILE_NOT_FOUND         = 457  # Book file path does not exist
E_BOOKMAKER_WRITE_FAILED           = 458  # Atomic write of the book document failed
E_BOOKMAKER_PLAN_EMPTY             = 459  # Referenced plan document has zero chapter tasks

# 460-479 reserved for future Bookmaker codes.