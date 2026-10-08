"""
Library:         lib_bejson_Bookmaker_bookwriter_core.py
Family:          Bookmaker
Module Purpose:  Implements runtime functionality and logic for lib_bejson_Bookmaker_bookwriter_core.py.
Architecture:    BEJSON 104db provides single-file multi-entity relational storage with positional null-padding, Record_Type_Parent discriminator headers, and plain-text LLM readability.
Version:         1.0.0
Release_Version: 300
Date:            2026-08-21
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   1b8b5777-a7fd-4665-88d6-84cd98f7f26e
"""

import html
import re
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from lib_bejson_Core_bejson_core import (
    bejson_core_atomic_write,
    bejson_core_load_file,
    bejson_core_get_field_map,
)

from lib_bejson_Bookmaker_bejson_errors import (
    E_BOOKMAKER_FILE_NOT_FOUND,
    E_BOOKMAKER_WRITE_FAILED,
)


class BookmakerError(Exception):
    def __init__(self, message: str, code: int, context: Optional[dict] = None):
        super().__init__(message)
        self.code = code
        self.context = context or {}


# ---------------------------------------------------------------------------
# Canonical Book/Chapter 104db schema. BOOK_FIELDS/CHAPTER_FIELDS are the
# per-record-type field lists (used to build rows and by the validator);
# ALL_FIELDS is the single flat, Record_Type_Parent-annotated Fields array
# that actually goes into doc["Fields"] (Core validator Mandate for 104db).
# ---------------------------------------------------------------------------

BOOK_FIELDS: List[Dict[str, str]] = [
    {"name": "entry_id", "type": "string"},
    {"name": "topic", "type": "string"},
    {"name": "title", "type": "string"},
    {"name": "plan_name", "type": "string"},
    {"name": "generation_date", "type": "string"},
]

CHAPTER_FIELDS: List[Dict[str, str]] = [
    {"name": "chapter_number", "type": "integer"},
    {"name": "chapter_title", "type": "string"},
    {"name": "content", "type": "string"},
]

RECORDS_TYPE_BOOK = "Book"
RECORDS_TYPE_CHAPTER = "Chapter"

ALL_FIELDS: List[Dict[str, str]] = (
    [{"name": "Record_Type_Parent", "type": "string"}]
    + [{**f, "Record_Type_Parent": RECORDS_TYPE_BOOK} for f in BOOK_FIELDS]
    + [{**f, "Record_Type_Parent": RECORDS_TYPE_CHAPTER} for f in CHAPTER_FIELDS]
)


def _book_row(entry_id: str, topic: str, title: str, plan_name: str, generation_date: str) -> list:
    """Builds one null-padded 104db row for the Book record type."""
    return ["Book", entry_id, topic, title, plan_name, generation_date, None, None, None]


def _chapter_row(chapter_number: int, chapter_title: str, content: str) -> list:
    """Builds one null-padded 104db row for the Chapter record type."""
    return ["Chapter", None, None, None, None, None, chapter_number, chapter_title, content]


# ---------------------------------------------------------------------------
# Document creation / persistence
# ---------------------------------------------------------------------------

def bookwriter_core_new_book_doc(plan_name: str, topic: str, title: str) -> Dict[str, Any]:
    """Creates a fresh, empty (no chapters yet) 104db book document."""
    entry_id = str(uuid.uuid4())[:12]
    generation_date = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {
        "Format": "BEJSON", "Format_Version": "104db", "Format_Creator": "Elton Boehnen",
        "Records_Type": [RECORDS_TYPE_BOOK, RECORDS_TYPE_CHAPTER],
        "Fields": ALL_FIELDS,
        "Values": [_book_row(entry_id, topic, title, plan_name, generation_date)],
    }


def bookwriter_core_load_or_create(book_file_path: str, plan_name: str, topic: str, title: str) -> Dict[str, Any]:
    """Loads an existing book document, or creates a fresh one if the file
    doesn't exist yet (or fails to load)."""
    path = Path(book_file_path)
    if path.exists():
        existing_doc = bejson_core_load_file(str(path))
        if existing_doc:
            return existing_doc
    return bookwriter_core_new_book_doc(plan_name, topic, title)


def bookwriter_core_write_file(book_file_path: str, book_doc: Dict[str, Any]) -> str:
    """Atomically writes a book document. Raises BookmakerError on failure
    (this never silently drops a chapter that was already generated)."""
    if not bejson_core_atomic_write(book_file_path, book_doc):
        raise BookmakerError(f"Atomic write failed for {book_file_path}", E_BOOKMAKER_WRITE_FAILED)
    return book_file_path


def bookwriter_core_load_file(book_file_path: str) -> Dict[str, Any]:
    path = Path(book_file_path)
    if not path.is_file():
        raise BookmakerError(f"Book file not found: {book_file_path}", E_BOOKMAKER_FILE_NOT_FOUND)
    doc = bejson_core_load_file(str(path))
    if doc is None:
        raise BookmakerError(f"Book file failed to load: {book_file_path}", E_BOOKMAKER_FILE_NOT_FOUND)
    return doc


# ---------------------------------------------------------------------------
# Row access (Field Map Cache -- never a raw positional index against Values)
# ---------------------------------------------------------------------------

def bookwriter_core_get_book_row(book_doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Returns the book's own metadata row as a field-name-keyed dict, or
    None if no Book row is present."""
    fm = bejson_core_get_field_map(book_doc)
    rtp_index = fm.get("Record_Type_Parent")
    if rtp_index is None:
        return None
    for row in book_doc.get("Values", []):
        if row[rtp_index] == RECORDS_TYPE_BOOK:
            return {f["name"]: row[fm[f["name"]]] for f in BOOK_FIELDS if f["name"] in fm}
    return None


def bookwriter_core_get_chapter_rows(book_doc: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Returns every Chapter row as a field-name-keyed dict, sorted by
    chapter_number."""
    fm = bejson_core_get_field_map(book_doc)
    rtp_index = fm.get("Record_Type_Parent")
    if rtp_index is None:
        return []
    chapter_rows = [
        {f["name"]: row[fm[f["name"]]] for f in CHAPTER_FIELDS if f["name"] in fm}
        for row in book_doc.get("Values", [])
        if row[rtp_index] == RECORDS_TYPE_CHAPTER
    ]
    return sorted(chapter_rows, key=lambda r: r["chapter_number"])


def bookwriter_core_written_chapter_numbers(book_doc: Dict[str, Any]) -> set:
    return {row["chapter_number"] for row in bookwriter_core_get_chapter_rows(book_doc)}


def bookwriter_core_chapter_content_by_number(book_doc: Dict[str, Any], chapter_number: int) -> Optional[str]:
    for row in bookwriter_core_get_chapter_rows(book_doc):
        if row["chapter_number"] == chapter_number:
            return row["content"]
    return None


def bookwriter_core_append_chapter(book_doc: Dict[str, Any], chapter_number: int,
                                    chapter_title: str, content: str) -> Dict[str, Any]:
    """Appends one Chapter row in place. Returns the same doc for chaining."""
    book_doc.setdefault("Values", []).append(_chapter_row(chapter_number, chapter_title, content))
    return book_doc


# ---------------------------------------------------------------------------
# Chapter-generation prompt templates (ported unchanged from book_writer.py)
# ---------------------------------------------------------------------------

CHAPTER_PROMPT_TEMPLATE = """You are writing a book titled "{book_title}" on the topic of "{topic}".

*** CRITICAL INSTRUCTION ***
Your CURRENT ASSIGNMENT is to ONLY write the content for the single chapter titled: "{chapter_title}".
Do NOT write the entire book. Do NOT write other chapters. Focus exclusively on delivering a complete,
high-quality draft of this one chapter, in Markdown.

Write in normal wrapping prose paragraphs. Do not dump raw long unbroken lines (long URLs, long
unbroken code lines, ASCII art, etc.) -- if you include a link, use Markdown link syntax
[text](url) rather than a bare URL, and keep code lines reasonably short so they read cleanly in a
narrow, fixed-width container.

If you include a table, use standard Markdown pipe-table syntax (a header row, a |---|---|
separator row, then data rows) -- it will automatically render in a horizontally-scrollable,
width-contained box. If you include code or a schema/JSON example, use a fenced code block and
always tag it with a language (```python, ```json, ```bejson, etc.) -- JSON/BEJSON/schema blocks
get their own distinct scrollable box, everything else gets the standard code box. Do not write
raw HTML for tables or code -- plain Markdown is all that's needed; the renderer handles the
containment, scrolling, and accessibility markup for you.

--- ATTACHED CONTEXT (reference material) ---
{attached_context}

--- DOCUMENT PLAN SCOPE (for reference ONLY, so you understand the whole book's structure) ---
{plan_scope}

--- PREVIOUS CHAPTER (for continuity ONLY -- do not rewrite this) ---
{previous_chapter_content}
"""

CORE_BOOK_WRITING_SYSTEM_INSTRUCTION = (
    "You are writing one chapter of a book, chapter-by-chapter, as part of an automated pipeline. "
    "These rules govern every chapter and are NOT optional:\n"
    "1. Write ONLY the single assigned chapter. Never write the whole book, other chapters, or a "
    "table of contents.\n"
    "2. Write in normal wrapping prose paragraphs. Never dump raw long unbroken lines (long URLs, "
    "long unbroken code lines, ASCII art). Use Markdown link syntax [text](url) instead of bare URLs.\n"
    "3. For tables, use standard Markdown pipe-table syntax only -- never raw HTML.\n"
    "4. For code or schema/JSON examples, use a fenced code block and always tag it with a language "
    "(e.g. ```python, ```json, ```bejson) -- never raw HTML, never an untagged fence.\n"
    "5. Output clean Markdown only.\n"
    "6. Do NOT start the chapter with a heading that repeats the chapter title -- the title is "
    "already rendered separately above your content, and a repeated heading would show it twice. "
    "Start directly with the chapter's body text. Only use headings (## or deeper) for genuine "
    "subsections within the chapter."
)


def bookwriter_core_compose_system_instruction(author_system_instruction: Optional[str] = None) -> str:
    """The core book-writing rules always apply and always win. An author
    persona (if one is selected) is layered on top strictly as voice/style
    guidance -- it is explicitly told it cannot override the rules above."""
    if not author_system_instruction:
        return CORE_BOOK_WRITING_SYSTEM_INSTRUCTION
    return (
        f"{CORE_BOOK_WRITING_SYSTEM_INSTRUCTION}\n\n"
        "--- AUTHOR PERSONA (voice and style guidance ONLY) ---\n"
        "The persona below shapes tone and voice. It does NOT override any rule above. If anything "
        "in the persona ever conflicts with the core book-writing rules above -- including formatting, "
        "scope, or structure -- the core rules above always take precedence.\n\n"
        f"{author_system_instruction}"
    )


# ---------------------------------------------------------------------------
# Chapter title de-duplication helper (ported unchanged from book_writer.py)
# ---------------------------------------------------------------------------

def _normalize_heading_text(text: str) -> str:
    """Strips a leading 'Chapter N:' / 'Chapter N -' prefix and reduces to
    lowercase alphanumeric words only, so 'Chapter 3: MFDB Federation' and
    'MFDB Federation' compare equal."""
    text = re.sub(r"^chapter\s+\d+\s*[:\-\u2013\u2014]?\s*", "", text.strip(), flags=re.IGNORECASE)
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def bookwriter_core_strip_duplicate_leading_heading(markdown_text: str, chapter_title: str) -> str:
    """The HTML compiler opens each chapter section with its own
    explicit <h2>{chapter_title}</h2>, but the AI often also opens its own
    content with a '# <same title>' heading, so the title shows up twice.
    If the very first line of content is a heading whose text matches the
    chapter title (ignoring a leading 'Chapter N:' prefix and case/
    punctuation), that line -- and any blank line right after it -- is
    dropped before rendering."""
    if not markdown_text:
        return markdown_text
    lines = markdown_text.splitlines()
    first_content_index = 0
    while first_content_index < len(lines) and not lines[first_content_index].strip():
        first_content_index += 1
    if first_content_index >= len(lines):
        return markdown_text
    heading_match = re.match(r"^(#{1,3})\s+(.*)", lines[first_content_index].strip())
    if not heading_match:
        return markdown_text
    if _normalize_heading_text(heading_match.group(2)) != _normalize_heading_text(chapter_title):
        return markdown_text
    remaining_lines = lines[first_content_index + 1:]
    while remaining_lines and not remaining_lines[0].strip():
        remaining_lines.pop(0)
    return "\n".join(remaining_lines)


# ---------------------------------------------------------------------------
# Minimal, dependency-free Markdown -> HTML compilation (ported unchanged
# from book_writer.py's BookWriter._compile_single_html() and its helpers)
# ---------------------------------------------------------------------------

def _is_table_separator_line(line: str) -> bool:
    stripped = line.strip().strip("|")
    cells = [c.strip() for c in stripped.split("|")]
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", c) for c in cells)


def _render_markdown_table(header_line: str, body_lines: list) -> str:
    def split_row(line):
        return [html.escape(c.strip()) for c in line.strip().strip("|").split("|")]

    header_cells = split_row(header_line)
    header_html = "".join(f"<th>{c}</th>" for c in header_cells)
    body_html_rows = []
    for row_line in body_lines:
        row_cells = split_row(row_line)
        body_html_rows.append("<tr>" + "".join(f"<td>{c}</td>" for c in row_cells) + "</tr>")
    table_html = (
        f"<table><thead><tr>{header_html}</tr></thead>"
        f"<tbody>{''.join(body_html_rows)}</tbody></table>"
    )
    return (
        '<div class="bw-table-wrap" role="region" aria-label="Table" tabindex="0">'
        f"{table_html}</div>"
    )


def _fenced_block_wrapper_class(fence_language: str) -> tuple:
    """Returns (css_class, aria_label) -- fenced blocks tagged json/bejson/
    schema get the schema-box styling; everything else (or untagged) gets
    the generic code-box styling. Both share the same horizontal-scroll,
    contained-width mechanics."""
    if fence_language.lower() in ("json", "bejson", "schema"):
        return "bw-schema-box", f"Schema ({fence_language})" if fence_language else "Schema"
    label = f"Code example ({fence_language})" if fence_language else "Code example"
    return "bw-code-wrap", label


def _markdown_to_html_fragment(markdown_text: str) -> str:
    markdown_lines = markdown_text.splitlines()
    html_output_lines = []
    inside_code_block = False
    fence_language = ""
    line_index = 0
    while line_index < len(markdown_lines):
        markdown_line = markdown_lines[line_index]

        if markdown_line.strip().startswith("```"):
            if not inside_code_block:
                inside_code_block = True
                fence_language = markdown_line.strip()[3:].strip()
                wrapper_class, aria_label = _fenced_block_wrapper_class(fence_language)
                html_output_lines.append(
                    f'<div class="{wrapper_class}" role="region" aria-label="{html.escape(aria_label)}" tabindex="0">'
                    f"<pre><code>"
                )
            else:
                inside_code_block = False
                html_output_lines.append("</code></pre></div>")
            line_index += 1
            continue

        if inside_code_block:
            html_output_lines.append(html.escape(markdown_line))
            line_index += 1
            continue

        # Markdown pipe-table: a header row immediately followed by a
        # |---|---| separator row.
        if ("|" in markdown_line and line_index + 1 < len(markdown_lines)
                and _is_table_separator_line(markdown_lines[line_index + 1])):
            header_line = markdown_line
            body_lines = []
            line_index += 2
            while line_index < len(markdown_lines) and "|" in markdown_lines[line_index] and markdown_lines[line_index].strip():
                body_lines.append(markdown_lines[line_index])
                line_index += 1
            html_output_lines.append(_render_markdown_table(header_line, body_lines))
            continue

        heading_match = re.match(r"^(#{1,6})\s+(.*)", markdown_line)
        if heading_match:
            heading_level = min(len(heading_match.group(1)) + 1, 6)  # nest under the chapter <h2>
            html_output_lines.append(f"<h{heading_level}>{html.escape(heading_match.group(2))}</h{heading_level}>")
            line_index += 1
            continue

        if not markdown_line.strip():
            html_output_lines.append("")
            line_index += 1
            continue

        escaped_line = html.escape(markdown_line)
        escaped_line = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped_line)
        escaped_line = re.sub(r"\*(.+?)\*", r"<i>\1</i>", escaped_line)
        html_output_lines.append(f"<p>{escaped_line}</p>")
        line_index += 1
    return "\n".join(html_output_lines)


def bookwriter_core_compile_html(book_doc: Dict[str, Any]) -> str:
    """Compiles a book document's Book row + all Chapter rows into one
    complete, width-contained, styled HTML document string. Caller writes
    the returned string to disk (this function is pure -- no file I/O)."""
    book_row = bookwriter_core_get_book_row(book_doc)
    if book_row is None:
        raise BookmakerError("Cannot compile: book document has no Book row.", E_BOOKMAKER_FILE_NOT_FOUND)
    book_title = book_row["title"]
    book_topic = book_row["topic"]
    chapter_rows = bookwriter_core_get_chapter_rows(book_doc)

    article_sections = []
    for chapter_row in chapter_rows:
        chapter_title = chapter_row["chapter_title"]
        chapter_number = chapter_row["chapter_number"]
        chapter_html_body = _markdown_to_html_fragment(
            bookwriter_core_strip_duplicate_leading_heading(chapter_row["content"], chapter_title))
        heading_id = f"chapter-{chapter_number}-title"
        article_sections.append(
            f'<article id="chapter-{chapter_number}" role="article" aria-labelledby="{heading_id}">\n'
            f'<h2 id="{heading_id}">{html.escape(chapter_title)}</h2>\n{chapter_html_body}\n</article>'
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(book_title)}</title>
<style>
*{{box-sizing:border-box;}}
body{{background:#FFFFFF;color:#000000;font-family:Inter,sans-serif;margin:0;padding:0 1rem;overflow-wrap:break-word;word-wrap:break-word;word-break:break-word;}}
.book-container{{max-width:800px;width:100%;margin:0 auto;padding:2rem 0;}}
h1,h2,h3{{font-family:'Source Code Pro',monospace;overflow-wrap:break-word;word-break:break-word;}}
p,li,blockquote{{overflow-wrap:break-word;word-wrap:break-word;word-break:break-word;}}
img{{max-width:100%;height:auto;}}
article{{margin-bottom:3rem;max-width:100%;}}
footer{{margin-top:3rem;border-top:1px solid #000;padding-top:1rem;font-size:0.85rem;overflow-wrap:break-word;}}

/* --- Preset horizontally-scrollable, width-contained boxes ---
   .bw-table-wrap  : any Markdown table
   .bw-code-wrap   : fenced code blocks (no language, or a non-schema language)
   .bw-schema-box  : fenced code blocks tagged json/bejson/schema */
.bw-table-wrap,.bw-code-wrap,.bw-schema-box{{
  max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:1rem 0;
  border:1px solid #ddd;border-radius:4px;
}}
.bw-table-wrap:focus,.bw-code-wrap:focus,.bw-schema-box:focus{{outline:2px solid #DE2626;outline-offset:2px;}}
.bw-table-wrap table{{border-collapse:collapse;width:max-content;min-width:100%;}}
.bw-table-wrap th,.bw-table-wrap td{{padding:.5rem .75rem;border:1px solid #ddd;text-align:left;white-space:nowrap;}}
.bw-table-wrap th{{background:#f4f4f4;}}
.bw-code-wrap,.bw-schema-box{{background:#000000;padding:0;}}
.bw-schema-box{{border-color:#DE2626;}}
.bw-code-wrap pre,.bw-schema-box pre{{
  margin:0;padding:1rem;white-space:pre;color:#FFFFFF;width:max-content;min-width:100%;
}}
</style>
</head>
<body>
<div class="book-container">
<h1>{html.escape(book_title)}</h1>
<p><em>{html.escape(book_topic)}</em></p>
{''.join(article_sections)}
<footer>
Elton Boehnen | boehnenelton2024@gmail.com | boehnenelton2024.pages.dev |
<a href="https://github.com/boehnenelton">github.com/boehnenelton</a>
</footer>
</div>
</body>
</html>"""


def bookwriter_core_write_html(book_doc: Dict[str, Any], dest_path: str) -> str:
    """Compiles and writes the book's HTML to dest_path. Returns dest_path."""
    compiled = bookwriter_core_compile_html(book_doc)
    Path(dest_path).write_text(compiled, encoding="utf-8")
    return dest_path