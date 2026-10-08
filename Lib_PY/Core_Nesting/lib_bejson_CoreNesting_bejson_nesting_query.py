"""
Library:         lib_bejson_CoreNesting_bejson_nesting_query.py
Family:          Core_Nesting
Module Purpose:  Dotted-path queries over nested 104 documents (e.g. player_inventory[*].item_id).
Architecture:    Nested BEJSON 104: a cell of a parent 104 document holds a complete embedded 104 document; the physical cell coordinate (NestAddress) is the implicit foreign key. It is neither 104db nor MFDB.
Format_Scope:    Nested 104 (NOT 104db, NOT MFDB)
Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
                 (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
                 (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
Version:         0.1.3
Release_Version: 300
Date:            2026-10-02
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   ef995ff7-fefd-444a-814a-0a28e4a16a8f
"""

import re
from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple

from lib_bejson_CoreNesting_bejson_core_nesting import (
    _build_field_map,
    _is_candidate,
    _parse_cell,
)
from lib_bejson_CoreNesting_bejson_errors import (
    E_NESTING_QUERY_INVALID_PATH,
    E_NESTING_QUERY_EMPTY_PATH,
)

VERSION = "0.1.1"

_SEGMENT_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)(\[(\*|\d+)\])?$")


@dataclass
class QueryMatch:
    """One matched cell at the end of a resolved path."""
    path:         str
    value:        Any
    field_chain:  List[str] = field(default_factory=list)
    row_chain:    List[int] = field(default_factory=list)
    col_chain:    List[int] = field(default_factory=list)


# Parses a dotted path such as player_inventory[*].item_id into (field_name, selector) steps.
def _parse_path(path: str) -> List[Tuple[str, Optional[Any]]]:
    """
    Parses a dotted path string into (field_name, selector) tuples.
    selector is '*' , an int, or None (treated as '*' by the walker).
    Raises ValueError with an E138/E139-prefixed message on bad grammar.
    """
    if not path or not path.strip():
        raise ValueError(f"E{E_NESTING_QUERY_EMPTY_PATH}: path is empty")

    parsed_segments = []
    for raw_segment in path.strip().split("."):
        segment_match = _SEGMENT_RE.match(raw_segment)
        if not segment_match:
            raise ValueError(
                f"E{E_NESTING_QUERY_INVALID_PATH}: bad segment '{raw_segment}' in path '{path}'"
            )
        segment_field_name, _, selector_text = segment_match.groups()
        if selector_text is None:
            selector: Optional[Any] = None
        elif selector_text == "*":
            selector = "*"
        else:
            selector = int(selector_text)
        parsed_segments.append((segment_field_name, selector))
    return parsed_segments


# Recursive walk of a nested-104 document along parsed path steps, collecting QueryMatch results.
def _query_walk(
    doc: dict,
    segments: List[Tuple[str, Optional[Any]]],
    segment_index: int,
    full_path: str,
    field_chain: List[str],
    row_chain: List[int],
    col_chain: List[int],
    match_value: Any,
    results: List[QueryMatch],
) -> None:
    if not isinstance(doc, dict):
        return

    field_name, selector = segments[segment_index]
    field_map = _build_field_map(doc)
    if field_name not in field_map:
        return  # dead branch — field not present at this level, not an error

    col = field_map[field_name]
    values = doc.get("Values", [])
    is_last_segment = segment_index == len(segments) - 1

    row_indices = range(len(values)) if selector in (None, "*") else [selector]

    for row_index in row_indices:
        if row_index < 0 or row_index >= len(values):
            continue
        row = values[row_index]
        if not isinstance(row, list) or col >= len(row):
            continue
        cell_value = row[col]

        if is_last_segment:
            if match_value is None or cell_value == match_value:
                results.append(
                    QueryMatch(
                        path=full_path,
                        value=cell_value,
                        field_chain=field_chain + [field_name],
                        row_chain=row_chain + [row_index],
                        col_chain=col_chain + [col],
                    )
                )
            continue

        if not _is_candidate(cell_value):
            continue
        nested_doc = _parse_cell(cell_value)
        if nested_doc is None:
            continue

        _query_walk(
            nested_doc, segments, segment_index + 1, full_path,
            field_chain + [field_name], row_chain + [row_index], col_chain + [col],
            match_value, results,
        )


# Finds values in a nested 104 document by dotted path (selectors: [*], [n], optional match_value filter). Returns a list of QueryMatch.
def bejson_nesting_query(
    doc: dict, path: str, match_value: Any = None
) -> List[QueryMatch]:
    """
    Resolve a dotted path through doc and its nested BEJSON 104 cells.

    Args:
        doc:         Root or already-nested BEJSON 104 document (dict).
        path:        Dotted path, e.g. "player_inventory[*].item_id".
        match_value: If provided, only cells equal to this value are
                     returned. If None, every cell reached by the path
                     is returned unfiltered.

    Returns:
        List[QueryMatch] — empty list if nothing matched (never raises
        for missing data; only raises ValueError on malformed path syntax).
    """
    parsed_segments = _parse_path(path)  # raises ValueError on bad grammar
    match_results: List[QueryMatch] = []
    _query_walk(doc, parsed_segments, 0, path, [], [], [], match_value, match_results)
    return match_results


# Safe-get convenience: first value at a path, or default.
def bejson_nesting_get_path(doc: dict, path: str, default: Any = None) -> Any:
    """
    Safe-Get convenience wrapper (Section 9 standard): returns the value of
    the FIRST match for path, or `default` if the path resolves to nothing
    or is malformed. Never raises.
    """
    try:
        matches = bejson_nesting_query(doc, path)
    except ValueError:
        return default
    return matches[0].value if matches else default


# Human-readable summary of a query result list.
def bejson_nesting_query_summary(matches: List[QueryMatch]) -> str:
    """Human-readable summary of a query() result list."""
    if not matches:
        return "BEJSON Core_Nesting Query Summary\n  0 matches"
    summary_lines = [f"BEJSON Core_Nesting Query Summary — {len(matches)} match(es)"]
    for query_match in matches:
        chain_text = " -> ".join(
            f"{chain_field_name}[row={chain_row},col={chain_col}]"
            for chain_field_name, chain_row, chain_col in zip(
                query_match.field_chain, query_match.row_chain, query_match.col_chain
            )
        )
        summary_lines.append(f"  {chain_text} = {query_match.value!r}")
    return "\n".join(summary_lines)