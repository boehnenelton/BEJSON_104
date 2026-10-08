"""
Library:         lib_bejson_Bookmaker_bookwriter_validator.py
Family:          Bookmaker
Module Purpose:  Implements runtime functionality and logic for lib_bejson_Bookmaker_bookwriter_validator.py.
Architecture:    BEJSON 104db provides single-file multi-entity relational storage with positional null-padding, Record_Type_Parent discriminator headers, and plain-text LLM readability.
Version:         1.0.0
Release_Version: 300
Date:            2026-08-21
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   5abf5bad-e10d-4a72-99dd-1422669d5f54
"""

import json
from dataclasses import dataclass, field as dc_field
from pathlib import Path
from typing import Any, Dict, List, Union

from lib_bejson_Core_bejson_validator import validate_bejson
from lib_bejson_Core_bejson_core import bejson_core_get_field_map

from lib_bejson_Bookmaker_bookwriter_core import (
    RECORDS_TYPE_BOOK,
    RECORDS_TYPE_CHAPTER,
    bookwriter_core_get_book_row,
    bookwriter_core_get_chapter_rows,
)
from lib_bejson_Bookmaker_bejson_errors import (
    E_BOOKMAKER_CORE_VALIDATION_FAILED,
    E_BOOKMAKER_NOT_BOOK_RECORDS_TYPE,
    E_BOOKMAKER_MISSING_BOOK_ROW,
    E_BOOKMAKER_MISSING_BOOK_FIELD,
    E_BOOKMAKER_DUPLICATE_CHAPTER,
)


class BookValidationError(Exception):
    def __init__(self, message: str, code: int, context: dict = None):
        super().__init__(message)
        self.code = code
        self.context = context or {}


@dataclass
class BookValidationResult:
    valid: bool = True
    errors: List[str] = dc_field(default_factory=list)
    warnings: List[str] = dc_field(default_factory=list)

    def add_error(self, message: str, location: str = ""):
        self.valid = False
        self.errors.append(f"ERROR | Location: {location} | Message: {message}" if location else f"ERROR | Message: {message}")

    def add_warning(self, message: str, location: str = ""):
        self.warnings.append(f"WARNING | Location: {location} | Message: {message}" if location else f"WARNING | Message: {message}")


REQUIRED_BOOK_ROW_FIELDS = ("entry_id", "topic", "title")


def _validate_book_structure(doc: Dict[str, Any], result: BookValidationResult) -> None:
    """Stage 2: book-specific structural rules against an already-Stage-1
    -valid 104db document."""
    if doc.get("Records_Type") != [RECORDS_TYPE_BOOK, RECORDS_TYPE_CHAPTER]:
        result.add_error(
            f"Records_Type must be exactly ['{RECORDS_TYPE_BOOK}', '{RECORDS_TYPE_CHAPTER}'].",
            "Structure",
        )
        return  # Everything below assumes the right Records_Type shape.

    fm = bejson_core_get_field_map(doc)
    rtp_index = fm.get("Record_Type_Parent")
    book_row_count = sum(1 for row in doc.get("Values", []) if row[rtp_index] == RECORDS_TYPE_BOOK)
    if book_row_count != 1:
        result.add_error(f"Expected exactly 1 Book row, found {book_row_count}.", "Book")
        return

    book_row = bookwriter_core_get_book_row(doc)
    for required_field_name in REQUIRED_BOOK_ROW_FIELDS:
        if not book_row.get(required_field_name):
            result.add_error(f"Book row field '{required_field_name}' is missing or empty.", "Book")

    chapter_rows = bookwriter_core_get_chapter_rows(doc)
    seen_chapter_numbers = set()
    for chapter_row in chapter_rows:
        chapter_number = chapter_row["chapter_number"]
        if chapter_number in seen_chapter_numbers:
            result.add_error(f"Duplicate chapter_number {chapter_number} -- one copy would "
                              f"silently shadow the other when read back.", f"Chapter {chapter_number}")
        seen_chapter_numbers.add(chapter_number)
        if not (chapter_row.get("content") or "").strip():
            result.add_warning(f"Chapter {chapter_number} ('{chapter_row.get('chapter_title')}') "
                                f"has empty content.", f"Chapter {chapter_number}")

    if seen_chapter_numbers:
        highest_number = max(seen_chapter_numbers)
        missing_numbers = sorted(set(range(1, highest_number)) - seen_chapter_numbers)
        if missing_numbers:
            result.add_warning(
                f"Gap in chapter_number sequence below the highest written chapter "
                f"({highest_number}): missing {missing_numbers}. A book mid-generation "
                f"having 1..N written and nothing past N is normal and NOT a gap; this is "
                f"specifically a hole below the highest number.",
                "Chapters",
            )


def bookwriter_validator_validate_book(doc: Dict[str, Any]) -> BookValidationResult:
    """Validates an in-memory book document. Stage 1 = generic Core
    validate_bejson(); Stage 2 = book-specific structural rules. Stage 2 is
    never attempted if Stage 1 fails.

    Note: Core's own bejson_core_get_field_map() intentionally injects an
    in-document "_bejson_field_map" cache key onto any doc it's called
    against (stripped automatically by bejson_core_atomic_write before
    anything is ever persisted to disk -- see that function's own "Strip
    internal metadata keys" step). But this file's own row-reading helpers
    (bookwriter_core_get_book_row/get_chapter_rows) call that same
    function, so a natural sequence like "append a chapter, then validate
    before writing" can hand Stage 1 a doc that already carries that
    leftover in-memory-only cache key -- which Stage 1 (correctly) rejects
    as a forbidden custom header in 104db. Since this key is never real
    document content and never reaches disk anyway, we strip it here too,
    on a shallow copy, purely so in-memory validation doesn't get a false
    positive from an implementation detail of a Core performance cache."""
    result = BookValidationResult()

    doc_for_stage1 = {k: v for k, v in doc.items() if not k.startswith("_")}
    core_res = validate_bejson(doc_for_stage1, is_file=False)
    if not core_res.valid:
        for e in core_res.errors:
            result.add_error(e, "Stage 1: Core BEJSON")
        return result
    for w in core_res.warnings:
        result.add_warning(w, "Stage 1: Core BEJSON")

    _validate_book_structure(doc, result)
    return result


def bookwriter_validator_validate_book_file(book_file_path: Union[str, Path]) -> BookValidationResult:
    """Validates a book document loaded from disk. Same two-stage
    contract as bookwriter_validator_validate_book(); Stage 1 runs
    against the file directly (so a JSON-syntax error is reported as a
    Stage 1 failure, exactly like every other Core-validated file)."""
    result = BookValidationResult()

    core_res = validate_bejson(str(book_file_path), is_file=True)
    if not core_res.valid:
        for e in core_res.errors:
            result.add_error(e, "Stage 1: Core BEJSON")
        return result
    for w in core_res.warnings:
        result.add_warning(w, "Stage 1: Core BEJSON")

    doc = json.loads(Path(book_file_path).read_text(encoding="utf-8"))
    _validate_book_structure(doc, result)
    return result