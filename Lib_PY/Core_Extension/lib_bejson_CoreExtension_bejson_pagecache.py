"""
Library:         lib_bejson_CoreExtension_bejson_pagecache.py
Family:          Core_Extension
Module Purpose:  Paginated extraction for large MFDB entities, without ever materializing the full Values array in memory. Requesting page N streams the source .bejson entity file incrementally (chunked reads + json.JSONDecoder.raw_decode() walking the Values array element-by-element, discarding every row outside the target range as it goes — never appending them to a growing list), extracts just that page's rows, writes them to a small standalone temp "page" file next to the entity, and returns them. A later request for the same page reads straight from that small temp file instead of re-scanning the source. Any write to the source entity should call bejson_pagecache_invalidate() so stale pages can't be served — cache freshness is also checked automatically via the source file's mtime+size fingerprint, so even a missed invalidation call self-corrects on the next read rather than silently serving stale data. This is the standard template for the Core_Extension family: every module here is additive, built entirely on Core's public API (bejson_core / mfdb_core), never reaches into Core's internals, and ships its own error range in lib_bejson_CoreExtension_bejson_errors.py (160-189) rather than borrowing Core's. Only handles the common real-world BEJSON entity shape: top-level object, "Values" holds a flat JSON array of rows (each row itself simple JSON — strings/numbers/null/lists/ objects, whatever a normal row cell holds; a row is parsed in full via the real json decoder, so embedded brackets/ quotes/unicode inside a cell value — e.g. FSIDX's Raw_JSON field, which stores literal embedded JSON text — are handled correctly, not by naive bracket-counting). Field map for the return dicts comes from the small "Fields" header array, read up front like any other header key.
Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
Version:         1.0.0
Release_Version: 300
Date:            2026-08-09
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   54b22ddd-a5d3-4f2a-934b-fefd425943ec
"""

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from lib_bejson_CoreExtension_bejson_errors import (
    E_PAGECACHE_ENTITY_NOT_FOUND,
    E_PAGECACHE_INVALID_PAGE_NUMBER,
    E_PAGECACHE_INVALID_PAGE_SIZE,
    E_PAGECACHE_MALFORMED_SOURCE,
    E_PAGECACHE_STREAM_PARSE_FAILED,
    E_PAGECACHE_WRITE_FAILED,
    E_PAGECACHE_CACHE_DIR_UNWRITABLE,
)

VERSION = "1.0.0"
DEFAULT_PAGE_SIZE = 100
_READ_CHUNK_BYTES = 65536  # 64KB per disk read while scanning for a page
_CACHE_SUBDIR = "_pagecache"


class PagecacheError(Exception):
    """Raised for all Core_Extension pagecache failures. .code is the
    E_PAGECACHE_* numeric error code."""
    def __init__(self, code: int, message: str):
        self.code = code
        super().__init__(f"E{code}: {message}")


# ---------------------------------------------------------------------------
# Low-level streaming JSON walk — stdlib-only, full grammar correctness.
# No third-party streaming JSON library is used (none is on the approved
# dependency list); this relies entirely on json.JSONDecoder.raw_decode(),
# which IS the real parser, just fed incrementally instead of requiring the
# whole document as one string. A JSON string is itself a complete, valid
# standalone JSON value, so raw_decode() also works to parse object KEYS
# one at a time without special-casing string-vs-value parsing.
# ---------------------------------------------------------------------------

class _ChunkedReader:
    """Wraps a file handle with a growing text buffer, feeding more disk
    reads only when a decode attempt needs more data than is currently
    buffered. Already-consumed prefix is dropped as we advance, so the
    buffer only ever holds the unconsumed tail plus the current in-progress
    read — never the whole file at once for the steady-state case, though
    the buffer inevitably grows toward end-of-file if the target page is
    near the end (inherent to any linear scan with no persistent row
    index — still strictly better than materializing the full parsed
    object graph, which is the actual source of the memory blowup this
    module exists to avoid)."""

    def __init__(self, fh):
        self._fh = fh
        self._buf = ""
        self._pos = 0  # consumed offset within _buf

    def _fill(self) -> bool:
        chunk = self._fh.read(_READ_CHUNK_BYTES)
        if not chunk:
            return False
        # Drop already-consumed prefix before appending, so _buf doesn't
        # grow unbounded with dead text behind _pos.
        if self._pos > 0:
            self._buf = self._buf[self._pos:]
            self._pos = 0
        self._buf += chunk
        return True

    def peek_char(self) -> Optional[str]:
        while self._pos >= len(self._buf):
            if not self._fill():
                return None
        return self._buf[self._pos]

    def skip_ws(self) -> None:
        while True:
            c = self.peek_char()
            if c is None or c not in " \t\r\n":
                return
            self._pos += 1

    def expect(self, literal_char: str) -> None:
        c = self.peek_char()
        if c != literal_char:
            raise PagecacheError(
                E_PAGECACHE_STREAM_PARSE_FAILED,
                f"expected '{literal_char}' but found {c!r}",
            )
        self._pos += 1

    def raw_decode_next(self) -> Any:
        """Decode exactly one JSON value starting at the current position,
        growing the buffer as needed until raw_decode succeeds or we
        genuinely run out of file (a real malformed-JSON case)."""
        decoder = json.JSONDecoder()
        while True:
            try:
                obj, end = decoder.raw_decode(self._buf, self._pos)
                self._pos = end
                return obj
            except json.JSONDecodeError:
                if not self._fill():
                    raise PagecacheError(
                        E_PAGECACHE_STREAM_PARSE_FAILED,
                        "unexpected end of file while decoding a JSON value",
                    )


def _iter_top_level_header_and_values(reader: "_ChunkedReader"):
    """
    Walks a BEJSON document's top-level object key by key. For every key
    OTHER than "Values", decodes and yields (key, value) normally (these
    are all small: Format, Format_Version, Fields, etc.). For "Values"
    itself, yields ("Values", None) and stops — the caller takes over
    reading the array lazily via iter_values_array() below, since that's
    the one key whose full parse would defeat the entire point of this
    module.
    """
    reader.skip_ws()
    reader.expect("{")
    reader.skip_ws()
    if reader.peek_char() == "}":
        return
    while True:
        reader.skip_ws()
        key = reader.raw_decode_next()  # a JSON string is a valid raw_decode target
        reader.skip_ws()
        reader.expect(":")
        reader.skip_ws()
        if key == "Values":
            yield ("Values", None)
            return
        value = reader.raw_decode_next()
        yield (key, value)
        reader.skip_ws()
        c = reader.peek_char()
        if c == ",":
            reader._pos += 1
            continue
        elif c == "}":
            return
        else:
            raise PagecacheError(
                E_PAGECACHE_STREAM_PARSE_FAILED,
                f"expected ',' or '}}' after value for key {key!r}, found {c!r}",
            )


def _iter_values_array(reader: "_ChunkedReader"):
    """Given the reader positioned right at the Values array's opening
    '[', yields each row one at a time. Never holds more than the current
    row in memory."""
    reader.skip_ws()
    reader.expect("[")
    reader.skip_ws()
    if reader.peek_char() == "]":
        return
    while True:
        row = reader.raw_decode_next()
        yield row
        reader.skip_ws()
        c = reader.peek_char()
        if c == ",":
            reader._pos += 1
            reader.skip_ws()
            continue
        elif c == "]":
            return
        else:
            raise PagecacheError(
                E_PAGECACHE_STREAM_PARSE_FAILED,
                f"expected ',' or ']' inside Values array, found {c!r}",
            )


def _extract_page_streaming(source_path: Path, page_number: int, page_size: int):
    """Returns (fields, page_rows, total_scanned_before_stopping). Streams
    the source file, reads the small header keys fully, then walks Values
    row-by-row, keeping only rows in [start, end) and discarding the rest
    immediately. Stops reading the file the moment the page is complete —
    does not scan the remainder of the file for early/mid pages."""
    start = page_number * page_size
    end = start + page_size

    fields: List[dict] = []
    with open(source_path, "r", encoding="utf-8") as fh:
        reader = _ChunkedReader(fh)
        for key, value in _iter_top_level_header_and_values(reader):
            if key == "Fields":
                fields = value if isinstance(value, list) else []
            if key == "Values":
                break
        else:
            raise PagecacheError(
                E_PAGECACHE_MALFORMED_SOURCE,
                f"{source_path} has no top-level 'Values' key",
            )

        page_rows: List[list] = []
        idx = 0
        for row in _iter_values_array(reader):
            if idx >= end:
                break
            if idx >= start:
                page_rows.append(row)
            idx += 1

    return fields, page_rows


# ---------------------------------------------------------------------------
# Manifest lookup (tiny file — record_count and file_path only, no entity
# data touched at all for this step)
# ---------------------------------------------------------------------------

def _resolve_entity(manifest_path: str, entity_name: str) -> Dict[str, Any]:
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    field_names = [fld.get("name") for fld in manifest.get("Fields", [])]
    try:
        name_idx = field_names.index("entity_name")
        path_idx = field_names.index("file_path")
        count_idx = field_names.index("record_count")
    except ValueError:
        raise PagecacheError(E_PAGECACHE_MALFORMED_SOURCE, "manifest missing expected columns")

    for row in manifest.get("Values", []):
        if row[name_idx] == entity_name:
            return {
                "file_path": row[path_idx],
                "record_count": row[count_idx] if count_idx < len(row) else None,
            }
    raise PagecacheError(E_PAGECACHE_ENTITY_NOT_FOUND, f"no entity named {entity_name!r} in manifest")


def _cache_dir_for(manifest_path: str, cache_dir: Optional[str]) -> Path:
    base = Path(cache_dir) if cache_dir else Path(manifest_path).resolve().parent / _CACHE_SUBDIR
    try:
        base.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise PagecacheError(E_PAGECACHE_CACHE_DIR_UNWRITABLE, f"{base}: {e}")
    return base


def _cache_file_path(cache_dir: Path, entity_name: str, page_number: int, page_size: int) -> Path:
    return cache_dir / f"{entity_name}__p{page_number}_s{page_size}.json"


def _source_fingerprint(source_path: Path) -> str:
    st = source_path.stat()
    return f"{st.st_mtime_ns}:{st.st_size}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def bejson_pagecache_get_page(
    manifest_path: str,
    entity_name: str,
    page_number: int,
    page_size: int = DEFAULT_PAGE_SIZE,
    cache_dir: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Returns page_number's rows (0-indexed) as field-mapped dicts, without
    ever holding the full entity's Values array in memory — neither on a
    cache hit (reads only the small cached page file) nor on a cache miss
    (streams the source, discarding out-of-range rows as it scans, and
    stops the moment the page is complete).
    """
    if page_number < 0:
        raise PagecacheError(E_PAGECACHE_INVALID_PAGE_NUMBER, f"page_number={page_number}")
    if page_size < 1:
        raise PagecacheError(E_PAGECACHE_INVALID_PAGE_SIZE, f"page_size={page_size}")

    entity = _resolve_entity(manifest_path, entity_name)
    source_path = Path(entity["file_path"])
    if not source_path.is_absolute():
        source_path = Path(manifest_path).resolve().parent / source_path
    if not source_path.is_file():
        raise PagecacheError(E_PAGECACHE_ENTITY_NOT_FOUND, f"source file not found: {source_path}")

    fingerprint = _source_fingerprint(source_path)
    cdir = _cache_dir_for(manifest_path, cache_dir)
    cache_path = _cache_file_path(cdir, entity_name, page_number, page_size)

    if cache_path.is_file():
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cached = json.load(f)
            if cached.get("source_fingerprint") == fingerprint:
                return cached.get("rows", [])
        except (json.JSONDecodeError, OSError):
            pass  # fall through to a fresh extract; a corrupt cache file is not fatal

    fields, page_rows = _extract_page_streaming(source_path, page_number, page_size)
    field_names = [f.get("name") for f in fields]
    rows_as_dicts = [dict(zip(field_names, row)) for row in page_rows]

    try:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump({
                "source_fingerprint": fingerprint,
                "page_number": page_number,
                "page_size": page_size,
                "rows": rows_as_dicts,
            }, f)
    except OSError as e:
        raise PagecacheError(E_PAGECACHE_WRITE_FAILED, f"{cache_path}: {e}")

    return rows_as_dicts


def bejson_pagecache_page_count(
    manifest_path: str,
    entity_name: str,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> int:
    """Total page count for an entity. Reads only the manifest's
    record_count column — never touches the entity file itself."""
    if page_size < 1:
        raise PagecacheError(E_PAGECACHE_INVALID_PAGE_SIZE, f"page_size={page_size}")
    entity = _resolve_entity(manifest_path, entity_name)
    count = entity.get("record_count") or 0
    return (count + page_size - 1) // page_size if count else 0


def bejson_pagecache_invalidate(
    manifest_path: str,
    entity_name: str,
    cache_dir: Optional[str] = None,
) -> int:
    """Deletes every cached page file for this entity. Call this after any
    write (add/remove/update) to the entity. Returns count removed. Safe
    to call even if nothing is cached yet."""
    cdir = _cache_dir_for(manifest_path, cache_dir)
    removed = 0
    prefix = f"{entity_name}__p"
    for f in cdir.glob(f"{prefix}*"):
        try:
            f.unlink()
            removed += 1
        except OSError:
            pass
    return removed


def bejson_pagecache_stats(
    manifest_path: str,
    entity_name: str,
    cache_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """Diagnostic snapshot: how many pages are currently cached for this
    entity and their total size on disk."""
    cdir = _cache_dir_for(manifest_path, cache_dir)
    prefix = f"{entity_name}__p"
    files = list(cdir.glob(f"{prefix}*"))
    return {
        "cached_pages": len(files),
        "total_bytes": sum(f.stat().st_size for f in files),
        "cache_dir": str(cdir),
    }