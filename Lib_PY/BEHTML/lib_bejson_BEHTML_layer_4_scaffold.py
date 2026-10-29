"""
Library:         lib_bejson_BEHTML_layer_4_scaffold.py
Family:          BEHTML
Module Purpose:  Implements Layer 4 (Persistent Chrome & Global Navigation, z-index: 128) Scaffolding.
Architecture:    BEHTML deterministic spatial layout engine generating the 64px top-docked control hub,
                 collapsible BEM hamburger sidebar drawer, sticky cubic brand badge, and telemetry status strip.
Version:         1.0.0
Release_Version: 300
Date Created:    2026-10-24
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   f73a4c52-2c45-4d0e-e61d-8a5d2f1f3404
"""

import html as _html
import logging
from typing import Dict, List, Optional

import lib_bejson_BEHTML_bootstrap  # noqa: F401

logger_instance = logging.getLogger("lib_bejson_BEHTML_layer_4_scaffold")

VERSION = "1.0.0"
RELEASE_VERSION = "300"

# Layer 4 Stacking Depth per Spec (Layer 4 = 128)
BEHTML_LAYER_4_Z_INDEX = 128
BEHTML_COLOR_ACCENT_RED = "#DE2626"
BEHTML_COLOR_HEADER_BG = "#060608"
BEHTML_COLOR_SIDEBAR_BG = "#08080c"
BEHTML_COLOR_CHROME_BORDER = "#1f1f28"


def behtml_layer_4_scaffold_brand_badge(
    brand_title_text: str,
    system_version_label: str = "v1.0.0",
    cubic_taxonomy_type: str = "104a"
) -> str:
    """
    Renders the official Elton Boehnen cubic brand visual anchor per Policy §8.2 / §8.3.
    """
    # 104a Isometric Floating Top Cube SVG Icon
    cube_svg = """<svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block;">
  <polygon points="16,8 26,13 16,18 6,13" fill="#181822" stroke="#FFFFFF" stroke-width="1.2"/>
  <polygon points="6,13 16,18 16,28 6,23" fill="#0d0d12" stroke="#FFFFFF" stroke-width="1.2"/>
  <polygon points="16,18 26,13 26,23 16,28" fill="#13131c" stroke="#FFFFFF" stroke-width="1.2"/>
  <polygon points="16,3 24,7 16,11 8,7" fill="none" stroke="#DE2626" stroke-width="1.4"/>
</svg>"""

    return f"""    <div class="behtml-brand-badge" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
      {cube_svg}
      <div style="display: flex; flex-direction: column;">
        <span style="font-weight: 700; font-size: 13px; letter-spacing: 0.5px; color: #FFFFFF;">{_html.escape(brand_title_text)}</span>
        <span style="font-size: 9px; color: {BEHTML_COLOR_ACCENT_RED}; font-family: monospace; letter-spacing: 0.5px;">{_html.escape(system_version_label)}</span>
      </div>
    </div>"""


def behtml_layer_4_scaffold_header_bar(
    header_element_id: str,
    brand_title_text: str,
    system_version_label: str = "v1.0.0",
    center_controls_markup: str = "",
    right_controls_markup: str = "",
    sidebar_toggle_target_id: str = "behtml-sidebar-drawer"
) -> str:
    """
    Renders the top-docked control hub (64px / 2x Ry=32px height) enforcing Layer 4 persistent chrome.
    """
    logger_instance.debug("Scaffolding Layer 4 Header Bar: %s", header_element_id)
    brand_badge_html = behtml_layer_4_scaffold_brand_badge(brand_title_text, system_version_label)

    return f"""  <!-- Layer 4 Persistent Top-Docked Control Hub (z-index: {BEHTML_LAYER_4_Z_INDEX}) -->
  <header id="{_html.escape(header_element_id)}" class="behtml-layer-4-header" style="
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 64px;
    z-index: {BEHTML_LAYER_4_Z_INDEX};
    background: {BEHTML_COLOR_HEADER_BG};
    border-bottom: 1px solid {BEHTML_COLOR_CHROME_BORDER};
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
  ">
    <!-- Left: Hamburger Trigger & Brand Badge -->
    <div style="display: flex; align-items: center; gap: 14px;">
      <button onclick="var sb=document.getElementById('{_html.escape(sidebar_toggle_target_id)}'); if(sb) sb.classList.toggle('is-open');" style="
        background: transparent;
        border: 1px solid #282834;
        width: 32px;
        height: 32px;
        color: #FFFFFF;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 4px;
        padding: 6px;
      " aria-label="Toggle Navigation">
        <span style="width: 16px; height: 1.5px; background: #FFFFFF; display: block;"></span>
        <span style="width: 16px; height: 1.5px; background: {BEHTML_COLOR_ACCENT_RED}; display: block;"></span>
        <span style="width: 16px; height: 1.5px; background: #FFFFFF; display: block;"></span>
      </button>
{brand_badge_html}
    </div>

    <!-- Center: Primary Section Tabs / Sub-Navigation -->
    <div style="display: flex; align-items: center; gap: 8px; overflow-x: auto;">
{center_controls_markup}
    </div>

    <!-- Right: Operational Actions / Telemetry -->
    <div style="display: flex; align-items: center; gap: 10px;">
{right_controls_markup}
    </div>
  </header>"""


def behtml_layer_4_scaffold_sidebar_drawer(
    drawer_element_id: str,
    navigation_items_roster: List[Dict[str, str]],
    is_initially_open: bool = False
) -> str:
    """
    Renders the collapsible BEM hamburger sidebar drawer occupying 3 lanes (18.75% / 25%) in Layer 4.
    """
    nav_links_html_items = []
    for nav_item in navigation_items_roster:
        label = nav_item.get("label", "Navigation Link")
        href = nav_item.get("href", "#")
        is_active = nav_item.get("is_active", False)
        bg_style = "background: #14141c; color: #FFFFFF; border-left: 3px solid #DE2626;" if is_active else "color: #a1a1aa; border-left: 3px solid transparent;"

        nav_links_html_items.append(
            f'      <a href="{_html.escape(href)}" style="display: block; padding: 10px 16px; font-size: 12px; font-weight: 500; text-decoration: none; transition: all 0.15s ease; {bg_style}" onmouseover="this.style.color=\'#FFFFFF\'; this.style.background=\'#121218\';" onmouseout="this.style.color=\'{ "#FFFFFF" if is_active else "#a1a1aa" }\'; this.style.background=\'{ "#14141c" if is_active else "transparent" }\';">{_html.escape(label)}</a>'
        )

    initial_class = " is-open" if is_initially_open else ""

    return f"""  <!-- Layer 4 Hamburger Sidebar Drawer (z-index: {BEHTML_LAYER_4_Z_INDEX}) -->
  <style>
    #{_html.escape(drawer_element_id)} {{
      transform: translateX(-100%);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }}
    #{_html.escape(drawer_element_id)}.is-open {{
      transform: translateX(0);
    }}
  </style>
  <nav id="{_html.escape(drawer_element_id)}" class="behtml-layer-4-sidebar{initial_class}" style="
    position: fixed;
    top: 64px;
    left: 0;
    width: 280px;
    max-width: 80vw;
    height: calc(var(--app-height) - 64px);
    z-index: {BEHTML_LAYER_4_Z_INDEX};
    background: {BEHTML_COLOR_SIDEBAR_BG};
    border-right: 1px solid {BEHTML_COLOR_CHROME_BORDER};
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    box-shadow: 8px 0 24px rgba(0, 0, 0, 0.7);
  ">
    <div style="padding: 12px 16px; font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #161620;">
      SYSTEM NAVIGATION
    </div>
    <div style="flex: 1; padding: 8px 0;">
{"".join(nav_links_html_items)}
    </div>
    <div style="padding: 12px 16px; border-top: 1px solid #161620; font-size: 10px; color: #52525b;">
      BEHTML ARCHITECTURE · LAYER 4
    </div>
  </nav>"""


def behtml_layer_4_scaffold_telemetry_strip(
    status_message_text: str,
    is_operational_active: bool = True
) -> str:
    """
    Renders the bottom 32px telemetry status strip.
    """
    accent_indicator = BEHTML_COLOR_ACCENT_RED if is_operational_active else "#52525b"
    return f"""  <!-- Layer 4 Bottom Telemetry Strip (z-index: {BEHTML_LAYER_4_Z_INDEX}) -->
  <footer class="behtml-layer-4-telemetry" style="
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100vw;
    height: 32px;
    z-index: {BEHTML_LAYER_4_Z_INDEX};
    background: {BEHTML_COLOR_HEADER_BG};
    border-top: 1px solid {BEHTML_COLOR_CHROME_BORDER};
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    font-size: 11px;
    font-family: monospace;
  ">
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="width: 6px; height: 6px; border-radius: 50%; background: {accent_indicator}; display: inline-block;"></span>
      <span style="color: #a1a1aa;">{_html.escape(status_message_text)}</span>
    </div>
    <div style="color: #52525b; font-size: 10px;">
      Ry=32px · Z-PLANE 128
    </div>
  </footer>"""
