########################################
# lib_bejson_Core_md_to_html
# Markdown to Standardized Semantic HTML5 Conversion Engine
# Copied & Adapted from Admin System Tools: MD_To_HTML
# Version: 3.1.0
# Author: Elton Boehnen · boehnenelton2024@gmail.com
########################################

import re
from typing import List, Optional

VERSION: str = "3.1.0"


def escape_html(text: str) -> str:
    """Escape characters that are special in HTML content."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def slugify(text: str) -> str:
    """Generate clean URL anchor slugs from heading text."""
    slug = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[-\s]+", "-", slug)


def inline_spans(text: str) -> str:
    """Handle bold, italic, strikethrough, links, and images."""
    # Images before links (images start with !)
    text = re.sub(
        r"!\[([^\]]*)\]\(([^)]+)\)",
        lambda m: f'<img src="{m.group(2)}" alt="{escape_html(m.group(1))}" loading="lazy">',
        text,
    )
    # Links
    text = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda m: f'<a href="{m.group(2)}" target="_blank" rel="noopener">{escape_html(m.group(1))}</a>',
        text,
    )
    # Bold + italic (***text*** or ___text___)
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"<strong><em>\1</em></strong>", text)
    text = re.sub(r"___(.+?)___", r"<strong><em>\1</em></strong>", text)
    # Bold (**text** or __text__)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"__(.+?)__", r"<strong>\1</strong>", text)
    # Italic (*text* or _text_)
    text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)
    text = re.sub(r"(?<!\w)_([^_\s][^_]*)_(?!\w)", r"<em>\1</em>", text)
    # Strikethrough (~~text~~)
    text = re.sub(r"~~(.+?)~~", r"<del>\1</del>", text)
    return text


def inline(text: str) -> str:
    """Convert inline Markdown elements while preserving code literals."""
    parts = []
    last = 0
    for m in re.finditer(r"`([^`]+)`", text):
        parts.append(inline_spans(text[last:m.start()]))
        parts.append(f"<code>{escape_html(m.group(1))}</code>")
        last = m.end()
    parts.append(inline_spans(text[last:]))
    return "".join(parts)


def is_table_separator(line: str) -> bool:
    """Check if line is a Markdown table separator."""
    return bool(re.match(r"^\|?[\s\-:|]+[\|\-:]+[\s\-:|]*\|?$", line.strip()))


def is_table_row(line: str) -> bool:
    """Check if line contains table delimiters."""
    return "|" in line


def parse_table(lines: List[str]) -> str:
    """Convert Markdown table lines into responsive HTML wrapped in .table-container."""
    rows = []
    for line in lines:
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        rows.append(cells)

    if len(rows) < 2:
        return "<p>" + inline(" ".join(lines)) + "</p>"

    html = [
        '<div class="table-container">',
        "<table>",
        "<thead>",
        "<tr>",
    ]
    for cell in rows[0]:
        html.append(f"  <th>{inline(cell)}</th>")
    html += ["</tr>", "</thead>", "<tbody>"]

    for row in rows[2:]:
        html.append("<tr>")
        for cell in row:
            html.append(f"  <td>{inline(cell)}</td>")
        html.append("</tr>")
    html += ["</tbody>", "</table>", "</div>"]
    return "\n".join(html)


def sanitize_html(html_str: str) -> str:
    """Sanitize output by removing MS Word/Office XML tags and attributes."""
    html_str = re.sub(r"</?o:p[^>]*>", "", html_str, flags=re.IGNORECASE)
    html_str = re.sub(r'style="[^"]*mso-[^"]*"', "", html_str, flags=re.IGNORECASE)
    return html_str


def convert_markdown_to_html(md_text: str) -> str:
    """
    Convert Markdown document to standardized HTML.
    Ported from Admin System Tools: MD_To_HTML.
    """
    if not md_text:
        return ""

    lines = md_text.splitlines()
    output = []
    i = 0

    def flush_paragraph(buf: list):
        if buf:
            content = inline(" ".join(buf))
            output.append(f"<p>{content}</p>")
            buf.clear()

    para_buf = []

    while i < len(lines):
        line = lines[i]

        # Fenced code block (``` or ~~~)
        fence_match = re.match(r"^\s*(`{3,}|~{3,})\s*([^\s`~]*)", line)
        if fence_match:
            flush_paragraph(para_buf)
            fence_char = fence_match.group(1)
            lang = fence_match.group(2).strip().lower()
            lang_attr = f' class="language-{escape_html(lang)}"' if lang else ""
            code_lines = []
            i += 1
            while i < len(lines):
                if re.match(rf"^\s*{re.escape(fence_char[:3])}+\s*$", lines[i]):
                    break
                code_lines.append(escape_html(lines[i]))
                i += 1
            joined_code = "\n".join(code_lines)
            output.append(f"<pre><code{lang_attr}>{joined_code}</code></pre>")
            i += 1
            continue

        # Horizontal rule
        if re.match(r"^(\*{3,}|-{3,}|_{3,})\s*$", line.strip()):
            flush_paragraph(para_buf)
            output.append("<hr>")
            i += 1
            continue

        # ATX Headings (# through ######)
        heading_match = re.match(r"^(#{1,6})\s+(.*)", line)
        if heading_match:
            flush_paragraph(para_buf)
            level = len(heading_match.group(1))
            heading_raw = heading_match.group(2).strip()
            slug = slugify(heading_raw)
            text = inline(heading_raw)
            output.append(f'<h{level} id="{slug}">{text}</h{level}>')
            i += 1
            continue

        # GitHub-style Callouts / Alerts (> [!NOTE])
        callout_match = re.match(r"^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)", line, flags=re.IGNORECASE)
        if callout_match:
            flush_paragraph(para_buf)
            kind = callout_match.group(1).lower()
            extra = callout_match.group(2).strip()
            bq_lines = []
            if extra:
                bq_lines.append(extra)
            i += 1
            while i < len(lines) and lines[i].startswith(">"):
                clean_line = lines[i].lstrip("> ").rstrip()
                if clean_line:
                    bq_lines.append(clean_line)
                i += 1
            inner_content = inline(" ".join(bq_lines)) if bq_lines else ""
            output.append(
                f'<blockquote class="callout callout-{kind}"><p><strong>{kind.title()}:</strong> {inner_content}</p></blockquote>'
            )
            continue

        # Standard Blockquote
        if line.startswith(">"):
            flush_paragraph(para_buf)
            bq_lines = []
            while i < len(lines) and lines[i].startswith(">"):
                bq_lines.append(lines[i].lstrip("> ").rstrip())
                i += 1
            inner = convert_markdown_to_html("\n".join(bq_lines))
            output.append(f"<blockquote>\n{inner}\n</blockquote>")
            continue

        # Task list (- [ ] or - [x])
        task_match = re.match(r"^\s*[\*\-\+]\s+\[([ xX])\]\s+(.*)", line)
        if task_match:
            flush_paragraph(para_buf)
            output.append('<ul class="task-list">')
            while i < len(lines):
                tm = re.match(r"^\s*[\*\-\+]\s+\[([ xX])\]\s+(.*)", lines[i])
                if not tm:
                    break
                checked = ' checked="checked"' if tm.group(1).lower() == "x" else ""
                item_text = inline(tm.group(2).strip())
                output.append(
                    f'<li class="task-item"><input type="checkbox" disabled{checked}> <span>{item_text}</span></li>'
                )
                i += 1
            output.append("</ul>")
            continue

        # Standard Unordered list
        if re.match(r"^\s*[\*\-\+]\s+(.*)", line):
            flush_paragraph(para_buf)
            output.append("<ul>")
            while i < len(lines) and re.match(r"^\s*[\*\-\+]\s+(.*)", lines[i]):
                if re.match(r"^\s*[\*\-\+]\s+\[([ xX])\]\s+", lines[i]):
                    break
                m = re.match(r"^\s*[\*\-\+]\s+(.*)", lines[i])
                item_text = inline(m.group(1).strip())
                output.append(f"<li>{item_text}</li>")
                i += 1
            output.append("</ul>")
            continue

        # Ordered list
        if re.match(r"^\s*\d+\.\s+(.*)", line):
            flush_paragraph(para_buf)
            output.append("<ol>")
            while i < len(lines) and re.match(r"^\s*\d+\.\s+(.*)", lines[i]):
                m = re.match(r"^\s*\d+\.\s+(.*)", lines[i])
                item_text = inline(m.group(1).strip())
                output.append(f"<li>{item_text}</li>")
                i += 1
            output.append("</ol>")
            continue

        # Table (detect header row + separator row)
        if (
            is_table_row(line)
            and i + 1 < len(lines)
            and is_table_separator(lines[i + 1])
        ):
            flush_paragraph(para_buf)
            table_lines = []
            while i < len(lines) and is_table_row(lines[i]):
                table_lines.append(lines[i])
                i += 1
            output.append(parse_table(table_lines))
            continue

        # Blank line: flush buffer
        if line.strip() == "":
            flush_paragraph(para_buf)
            i += 1
            continue

        # Normal paragraph text
        para_buf.append(line.strip())
        i += 1

    flush_paragraph(para_buf)
    result = "\n".join(output)
    return sanitize_html(result)
