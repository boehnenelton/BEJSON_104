"""
Library:         lib_bejson_BEHTML_layer_2_scaffold.py
Family:          BEHTML
Module Purpose:  Implements Layer 2 (Surface Content & Interactive Controls, z-index: 32-64) Scaffolding.
Architecture:    BEHTML deterministic spatial layout engine generating tabular BEJSON data viewers,
                 quantized KPI metric cards, action toolbars, and interactive form groups.
Version:         1.0.0
Release_Version: 300
Date Created:    2026-10-24
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   d95f2a31-0a23-4b8c-c49b-6f3b0e9d1282
"""

import html as _html
import logging
from typing import Any, Dict, List, Optional

import lib_bejson_BEHTML_bootstrap  # noqa: F401

logger_instance = logging.getLogger("lib_bejson_BEHTML_layer_2_scaffold")

VERSION = "1.0.0"
RELEASE_VERSION = "300"

# Layer 2 Default Stacking Depth per Spec (Layer 2 = 32 to 64)
BEHTML_LAYER_2_DEFAULT_Z_INDEX = 32
BEHTML_COLOR_ACCENT_RED = "#DE2626"
BEHTML_COLOR_CARD_BG = "#09090d"
BEHTML_COLOR_CARD_BORDER = "#1f1f28"


def behtml_layer_2_scaffold_container(
    container_element_id: str,
    column_x_start_index: int,
    column_x_span_count: int,
    row_y_start_index: int,
    row_y_span_count: int,
    inner_markup_content: str,
    z_layer_index: int = BEHTML_LAYER_2_DEFAULT_Z_INDEX,
    css_class_modifiers: str = ""
) -> str:
    """
    Renders an arbitrary surface content container positioned via CSS grid coordinates:
    grid-column: (x_start + 1) / span x_span;
    grid-row: (y_start + 1) / span y_span;
    """
    # Grid coordinates in CSS Grid are 1-based
    css_col_start = column_x_start_index + 1
    css_row_start = row_y_start_index + 1
    modifier_suffix = f" {css_class_modifiers}" if css_class_modifiers else ""

    return f"""  <section id="{_html.escape(container_element_id)}" class="behtml-layer-2-surface{modifier_suffix}" style="
    grid-column: {css_col_start} / span {column_x_span_count};
    grid-row: {css_row_start} / span {row_y_span_count};
    z-index: {z_layer_index};
    position: relative;
    background: {BEHTML_COLOR_CARD_BG};
    border: 1px solid {BEHTML_COLOR_CARD_BORDER};
    overflow: hidden;
    display: flex;
    flex-direction: column;
  ">
{inner_markup_content}
  </section>"""


def behtml_layer_2_scaffold_table(
    table_element_id: str,
    column_x_start_index: int,
    column_x_span_count: int,
    row_y_start_index: int,
    row_y_span_count: int,
    column_fields_roster: List[str],
    records_values_matrix: List[List[Any]],
    table_title_text: str = ""
) -> str:
    """
    Renders a high-density, BEJSON-compliant tabular viewer snapped to the spatial grid.
    Columns feature the Policy §8.1 red header underline, with contained scrolling.
    """
    logger_instance.debug("Scaffolding Layer 2 Table: %s with %d rows", table_element_id, len(records_values_matrix))

    # Header title
    title_html = ""
    if table_title_text:
        title_html = f"""    <div style="padding: 8px 12px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1a1a22; display: flex; align-items: center; justify-content: space-between;">
      <span>{_html.escape(table_title_text)}</span>
      <span style="color: {BEHTML_COLOR_ACCENT_RED}; font-size: 10px;">{len(records_values_matrix)} RECORDS</span>
    </div>"""

    # Table columns
    headers_html_items = [
        f'<th style="padding: 6px 10px; text-align: left; font-size: 11px; color: #a1a1aa; border-bottom: 2px solid {BEHTML_COLOR_ACCENT_RED}; white-space: nowrap;">{_html.escape(col)}</th>'
        for col in column_fields_roster
    ]
    headers_row_html = "".join(headers_html_items)

    # Table rows
    rows_html_items = []
    for row_values in records_values_matrix:
        cells_html_items = [
            f'<td style="padding: 6px 10px; border-bottom: 1px solid #14141c; font-size: 11px; font-family: monospace; white-space: nowrap;">{_html.escape(str(cell))}</td>'
            for cell in row_values
        ]
        rows_html_items.append(f'      <tr style="transition: background 0.15s ease;" onmouseover="this.style.background=\'#13131c\'" onmouseout="this.style.background=\'transparent\'">{"".join(cells_html_items)}</tr>')
    
    rows_body_html = "\n".join(rows_html_items) if rows_html_items else '      <tr><td colspan="100%" style="padding: 16px; text-align: center; color: #71717a;">No records available</td></tr>'

    table_markup = f"""{title_html}
    <div style="flex: 1; overflow: auto;">
      <table style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead style="position: sticky; top: 0; background: #0c0c12; z-index: 2;">
          <tr>
            {headers_row_html}
          </tr>
        </thead>
        <tbody>
{rows_body_html}
        </tbody>
      </table>
    </div>"""

    return behtml_layer_2_scaffold_container(
        container_element_id=table_element_id,
        column_x_start_index=column_x_start_index,
        column_x_span_count=column_x_span_count,
        row_y_start_index=row_y_start_index,
        row_y_span_count=row_y_span_count,
        inner_markup_content=table_markup
    )


def behtml_layer_2_scaffold_kpi_card(
    card_element_id: str,
    column_x_start_index: int,
    column_x_span_count: int,
    row_y_start_index: int,
    row_y_span_count: int,
    card_title_text: str,
    metric_value_text: str,
    delta_caption_text: str = ""
) -> str:
    """
    Renders an integer-quantized KPI metric display card.
    """
    delta_markup = ""
    if delta_caption_text:
        delta_markup = f'<div style="font-size: 10px; color: {BEHTML_COLOR_ACCENT_RED}; margin-top: 4px; font-weight: 500;">{_html.escape(delta_caption_text)}</div>'

    card_markup = f"""    <div style="padding: 12px; height: 100%; display: flex; flex-direction: column; justify-content: space-between;">
      <div style="font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">{_html.escape(card_title_text)}</div>
      <div>
        <div style="font-size: 24px; font-weight: 700; color: #FFFFFF; font-family: monospace; line-height: 1.1;">{_html.escape(metric_value_text)}</div>
        {delta_markup}
      </div>
      <div style="height: 2px; width: 24px; background: {BEHTML_COLOR_ACCENT_RED}; margin-top: 6px;"></div>
    </div>"""

    return behtml_layer_2_scaffold_container(
        container_element_id=card_element_id,
        column_x_start_index=column_x_start_index,
        column_x_span_count=column_x_span_count,
        row_y_start_index=row_y_start_index,
        row_y_span_count=row_y_span_count,
        inner_markup_content=card_markup
    )


def behtml_layer_2_scaffold_toolbar(
    toolbar_element_id: str,
    column_x_start_index: int,
    column_x_span_count: int,
    row_y_start_index: int,
    action_items_roster: List[Dict[str, str]]
) -> str:
    """
    Renders a single-row (32px / Ry=1) action toolbar with horizontally scrollable controls per Policy §8.4.
    """
    button_html_items = []
    for action in action_items_roster:
        label = action.get("label", "Action")
        action_type = action.get("type", "button")
        is_primary = action.get("is_primary", False)
        bg_color = BEHTML_COLOR_ACCENT_RED if is_primary else "#181820"
        border_color = BEHTML_COLOR_ACCENT_RED if is_primary else "#2c2c36"
        text_color = "#FFFFFF"

        button_html_items.append(
            f'<button style="padding: 4px 10px; height: 24px; background: {bg_color}; border: 1px solid {border_color}; color: {text_color}; font-size: 11px; font-weight: 500; border-radius: 2px; cursor: pointer; white-space: nowrap; font-family: inherit;">{_html.escape(label)}</button>'
        )

    toolbar_markup = f"""    <div style="height: 100%; padding: 4px 8px; display: flex; align-items: center; gap: 6px; overflow-x: auto; white-space: nowrap;">
      {"".join(button_html_items)}
    </div>"""

    return behtml_layer_2_scaffold_container(
        container_element_id=toolbar_element_id,
        column_x_start_index=column_x_start_index,
        column_x_span_count=column_x_span_count,
        row_y_start_index=row_y_start_index,
        row_y_span_count=1,
        inner_markup_content=toolbar_markup
    )
