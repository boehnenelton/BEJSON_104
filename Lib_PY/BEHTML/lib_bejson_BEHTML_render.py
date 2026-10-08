"""
Library:         lib_bejson_BEHTML_render.py
Family:          BEHTML
Module Purpose:  Implements runtime functionality and logic for lib_bejson_BEHTML_render.py.
Architecture:    Nested BEJSON 104 embeds tabular structures inside parent cell strings using implicit physical coordinates NestAddress(parent_fp, row, col, depth) without synthetic foreign key fields.
Version:         0.1.0
Release_Version: 300
Date:            2026-07-30
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   16a42e12-69f4-4540-b82f-351fa1cd27ed
"""

import html as _html
from typing import Any, Dict, List, Optional

import lib_bejson_BEHTML_bootstrap  # noqa: F401  -- adds canonical Core to sys.path

try:
    from lib_bejson_Core_bejson_core import bejson_core_get_field_index
except ImportError as e:
    import logging
    logging.critical(f"[BEHTML_RENDER] FATAL: Core library unreachable: {e}")
    raise SystemExit(1)

try:
    from lib_bejson_BEHTML_bejson_errors import E_BEHTML_RENDER_FAILED
    from lib_bejson_BEHTML_core import (
        BEHTMLError,
        BEHTML_RY_PX,
        BEHTML_X_LANES,
        BEHTML_COLOR_WHITE,
        BEHTML_COLOR_BLACK,
        BEHTML_COLOR_ACCENT,
        behtml_core_bem_class,
        behtml_core_grid_cell_classes,
    )
    from lib_bejson_BEHTML_crud import behtml_crud_row_to_dict, behtml_crud_list_by_parent
except ImportError as e:
    import logging
    logging.critical(f"[BEHTML_RENDER] FATAL: BEHTML sibling module unreachable: {e}")
    raise SystemExit(1)


# element_type -> HTML tag (Spec section 4.2 Component Layer)
ELEMENT_TAG_MAP = {
    "input": "input",
    "textarea": "textarea",
    "button": "button",
    "combobox": "select",
    "checkbox": "input",
    "radio": "input",
    "label": "label",
    "container": "div",
    "hamburger_menu": "button",
    "toolbar": "div",
    "grid_cell": "div",
}
VOID_TAGS = {"input"}


def _render_content(element: Dict[str, Any]) -> str:
    """Render the inner content of an element per its content_kind."""
    content_ref = element.get("content_ref") or ""
    content_kind = element.get("content_kind") or "text"
    if content_kind == "text":
        return _html.escape(content_ref)
    if content_kind == "field_binding":
        return "{{ " + content_ref + " }}"
    if content_kind == "url":
        safe_href = _html.escape(content_ref, quote=True)
        return f'<a href="{safe_href}">{_html.escape(content_ref)}</a>'
    if content_kind == "asset_ref":
        safe_src = _html.escape(content_ref, quote=True)
        return f'<img src="{safe_src}" alt="">'
    return _html.escape(content_ref)


def _render_element(doc: Dict[str, Any], element: Dict[str, Any], indent: int) -> str:
    try:
        tag = ELEMENT_TAG_MAP.get(element.get("element_type"), "div")
        classes = behtml_core_grid_cell_classes(
            element.get("x_start", 0), element.get("x_span", 1),
            element.get("y_span", 1), active=bool(element.get("is_active")),
        )
        classes.append(behtml_core_bem_class("control", element.get("element_type") or "unknown"))
        modifiers = (element.get("bem_modifiers") or "").split(",")
        classes.extend(
            behtml_core_bem_class("control", element.get("element_type") or "unknown", m.strip())
            for m in modifiers if m.strip()
        )
        class_attr = " ".join(classes)

        style = (
            f"grid-column: {element.get('x_start', 0) + 1} / span {element.get('x_span', 1)}; "
            f"grid-row: {element.get('y_start', 0) + 1} / span {element.get('y_span', 1)};"
        )
        if element.get("z_index"):
            style += f" z-index: {element['z_index']};"

        pad = " " * indent
        children = behtml_crud_list_by_parent(doc, element.get("element_id"))
        inner_children = "\n".join(_render_element(doc, c, indent + 2) for c in children)

        if tag in VOID_TAGS:
            return f'{pad}<{tag} class="{class_attr}" style="{style}">'
        inner = _render_content(element) if not children else inner_children
        return f'{pad}<{tag} class="{class_attr}" style="{style}">{inner}</{tag}>'
    except Exception as e:
        raise BEHTMLError(E_BEHTML_RENDER_FAILED, f"failed to render element_id={element.get('element_id')}: {e}")


def behtml_render_html(doc: Dict[str, Any]) -> str:
    """Render the full document as an HTML fragment, root grid container + all nested elements."""
    roots = behtml_crud_list_by_parent(doc, None)
    body = "\n".join(_render_element(doc, el, 2) for el in roots)
    return f'<div class="{behtml_core_bem_class("grid")}">\n{body}\n</div>'


def behtml_render_css() -> str:
    """Render the base stylesheet: grid container rules + tri-color palette variables."""
    return (
        f".{behtml_core_bem_class('grid')} {{\n"
        f"  display: grid;\n"
        f"  grid-template-columns: repeat({BEHTML_X_LANES}, 1fr);\n"
        f"  grid-auto-rows: {BEHTML_RY_PX}px;\n"
        f"  background: {BEHTML_COLOR_BLACK};\n"
        f"  color: {BEHTML_COLOR_WHITE};\n"
        f"}}\n"
        f".{behtml_core_bem_class('grid', 'cell')} {{\n"
        f"  box-sizing: border-box;\n"
        f"}}\n"
        f".{behtml_core_bem_class('grid', 'cell', 'active-column')} {{\n"
        f"  outline: 2px solid {BEHTML_COLOR_ACCENT};\n"
        f"}}\n"
    )


def behtml_render_document(doc: Dict[str, Any]) -> Dict[str, str]:
    """Convenience wrapper: returns {'html': ..., 'css': ...} in one call."""
    return {"html": behtml_render_html(doc), "css": behtml_render_css()}