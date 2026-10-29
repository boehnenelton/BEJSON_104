"""
Library:         lib_bejson_BEHTML_layer_scaffolds.py
Family:          BEHTML
Module Purpose:  Unified Master Compositor and Orchestration API for BEHTML Layers 1 through 4.
Architecture:    BEHTML multi-layer stacking engine enforcing z-index = layer * 32,
                 transparent production grid, tri-color tokens, and viewport height synchronization.
Version:         1.0.0
Release_Version: 300
Date Created:    2026-10-24
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   a12b3c4d-5e6f-7081-92a3-b4c5d6e7f809
"""

import logging
from typing import Any, Dict, List, Optional

import lib_bejson_BEHTML_bootstrap  # noqa: F401

from lib_bejson_BEHTML_layer_1_scaffold import (
    behtml_layer_1_scaffold_page,
    behtml_layer_1_get_base_css,
    behtml_layer_1_get_viewport_sync_script,
    BEHTML_LAYER_1_Z_INDEX,
    BEHTML_LAYER_1_ROW_QUANTUM_PX
)
from lib_bejson_BEHTML_layer_2_scaffold import (
    behtml_layer_2_scaffold_container,
    behtml_layer_2_scaffold_table,
    behtml_layer_2_scaffold_kpi_card,
    behtml_layer_2_scaffold_toolbar,
    BEHTML_LAYER_2_DEFAULT_Z_INDEX
)
from lib_bejson_BEHTML_layer_3_scaffold import (
    behtml_layer_3_scaffold_modal,
    behtml_layer_3_scaffold_flyout,
    behtml_layer_3_scaffold_inspector_hud,
    BEHTML_LAYER_3_Z_INDEX
)
from lib_bejson_BEHTML_layer_4_scaffold import (
    behtml_layer_4_scaffold_header_bar,
    behtml_layer_4_scaffold_sidebar_drawer,
    behtml_layer_4_scaffold_brand_badge,
    behtml_layer_4_scaffold_telemetry_strip,
    BEHTML_LAYER_4_Z_INDEX
)

logger_instance = logging.getLogger("lib_bejson_BEHTML_layer_scaffolds")

VERSION = "1.0.0"
RELEASE_VERSION = "300"


def behtml_compose_application_page(
    page_title_text: str,
    brand_title_text: str,
    system_version_label: str = "v1.0.0",
    theme_palette_name: str = "dark",
    grid_mode_type: str = "16_sublane",
    is_debug_mode: bool = False,
    layer_2_surface_markup_roster: Optional[List[str]] = None,
    layer_3_dialogues_markup_roster: Optional[List[str]] = None,
    navigation_items_roster: Optional[List[Dict[str, str]]] = None,
    telemetry_status_message: str = "SYSTEM OPERATIONAL · ALL LAYERS SYNCHRONIZED"
) -> str:
    """
    Composes a complete, production-grade BEHTML application page unifying all 4 architectural layers:
    - Layer 1 (z: 0): Base Canvas, Grid Tracks, Viewport Lock
    - Layer 2 (z: 32-64): Surface Content, Data Tables, KPI Cards
    - Layer 3 (z: 96): Contextual Dialogues & Flyouts (100% Solid Occlusion)
    - Layer 4 (z: 128): Top Control Hub Header, Hamburger Sidebar Drawer, Telemetry Strip
    """
    logger_instance.info("Composing Multi-Layer BEHTML Application: %s", page_title_text)

    # 1. Prepare Layer 4 Persistent Chrome
    nav_items = navigation_items_roster or [
        {"label": "Overview Dashboard", "href": "#overview", "is_active": True},
        {"label": "Entity Stores", "href": "#entities", "is_active": False},
        {"label": "Configuration", "href": "#config", "is_active": False},
        {"label": "Telemetry & Diagnostics", "href": "#diagnostics", "is_active": False}
    ]
    sidebar_html = behtml_layer_4_scaffold_sidebar_drawer(
        drawer_element_id="behtml-sidebar-drawer",
        navigation_items_roster=nav_items,
        is_initially_open=False
    )
    header_html = behtml_layer_4_scaffold_header_bar(
        header_element_id="behtml-top-header",
        brand_title_text=brand_title_text,
        system_version_label=system_version_label,
        sidebar_toggle_target_id="behtml-sidebar-drawer"
    )
    telemetry_html = behtml_layer_4_scaffold_telemetry_strip(
        status_message_text=telemetry_status_message,
        is_operational_active=True
    )

    # 2. Prepare Layer 3 Contextual Panels & HUD
    dialogues_list = layer_3_dialogues_markup_roster or []
    hud_html = behtml_layer_3_scaffold_inspector_hud(
        hud_element_id="behtml-layer-hud",
        active_layers_roster=[1, 2, 3, 4],
        is_debug_mode=is_debug_mode
    )
    layer_3_markup = "\n".join(dialogues_list) + ("\n" + hud_html if is_debug_mode else "")

    # 3. Prepare Layer 2 Surface Content (Offset row 2 for header bar)
    surfaces_list = layer_2_surface_markup_roster or []
    layer_2_markup = "\n".join(surfaces_list)

    # Combine inside Layer 1 body content
    # Note: Header occupies top 64px (rows 0-1), telemetry occupies bottom 32px
    full_body_content = f"""{header_html}
{sidebar_html}
{layer_2_markup}
{layer_3_markup}
{telemetry_html}"""

    # 4. Scaffolding Layer 1 Page Wrapper
    # In full application mode, we add top padding for header and bottom padding for telemetry
    extra_head_styles = """  <style>
    /* Offset Layer 1 grid content beneath the 64px fixed header and above 32px telemetry strip */
    .behtml-layer-1-canvas {
      padding-top: 64px;
      padding-bottom: 32px;
      height: calc(var(--app-height) - 96px);
      margin-top: 64px;
    }
  </style>"""

    return behtml_layer_1_scaffold_page(
        page_title_text=page_title_text,
        body_content_markup=full_body_content,
        theme_palette_name=theme_palette_name,
        grid_mode_type=grid_mode_type,
        is_debug_mode=is_debug_mode,
        extra_head_tags_markup=extra_head_styles
    )
