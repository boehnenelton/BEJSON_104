"""
Library:         lib_bejson_BEHTML_layer_3_scaffold.py
Family:          BEHTML
Module Purpose:  Implements Layer 3 (Contextual Panels & Ephemeral Dialogues, z-index: 96) Scaffolding.
Architecture:    BEHTML deterministic spatial layout engine enforcing strict production occlusion
                 (100% opaque void background #000000/#FFFFFF) to block lower layers without click-through.
Version:         1.0.0
Release_Version: 300
Date Created:    2026-10-24
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   e82d3b41-1b34-4c9d-d50c-7f4c1e0e2393
"""

import html as _html
import logging
from typing import Dict, List, Optional

import lib_bejson_BEHTML_bootstrap  # noqa: F401

logger_instance = logging.getLogger("lib_bejson_BEHTML_layer_3_scaffold")

VERSION = "1.0.0"
RELEASE_VERSION = "300"

# Layer 3 Stacking Depth per Spec (Layer 3 = 96)
BEHTML_LAYER_3_Z_INDEX = 96
BEHTML_COLOR_ACCENT_RED = "#DE2626"
BEHTML_COLOR_MODAL_BG_DARK = "#000000"  # 100% Opaque Void per Spec
BEHTML_COLOR_MODAL_BG_LIGHT = "#FFFFFF"
BEHTML_COLOR_MODAL_BORDER = "#2a2a36"


def behtml_layer_3_scaffold_modal(
    modal_element_id: str,
    modal_title_text: str,
    modal_body_html: str,
    action_buttons_roster: List[Dict[str, str]],
    is_initially_visible: bool = False,
    theme_palette_name: str = "dark"
) -> str:
    """
    Renders an ephemeral modal dialogue with 100% opaque background occlusion (z-index: 96).
    Completely blocks lower layer visibility and pointer events.
    """
    logger_instance.debug("Scaffolding Layer 3 Modal: %s", modal_element_id)

    is_dark_theme = (theme_palette_name.lower() != "light")
    modal_bg_color = BEHTML_COLOR_MODAL_BG_DARK if is_dark_theme else BEHTML_COLOR_MODAL_BG_LIGHT
    text_color = "#FFFFFF" if is_dark_theme else "#000000"
    display_css = "flex" if is_initially_visible else "none"

    button_html_items = []
    for action in action_buttons_roster:
        label = action.get("label", "OK")
        is_primary = action.get("is_primary", False)
        onclick_action = action.get("onclick", "")
        bg_color = BEHTML_COLOR_ACCENT_RED if is_primary else "#1a1a22"
        border_color = BEHTML_COLOR_ACCENT_RED if is_primary else "#2e2e3a"
        onclick_attr = f' onclick="{_html.escape(onclick_action)}"' if onclick_action else ""

        button_html_items.append(
            f'<button{onclick_attr} style="padding: 6px 14px; background: {bg_color}; border: 1px solid {border_color}; color: #FFFFFF; font-size: 11px; font-weight: 600; cursor: pointer; border-radius: 2px; font-family: inherit;">{_html.escape(label)}</button>'
        )

    buttons_bar_html = f"""      <div style="padding: 12px 16px; border-top: 1px solid #1a1a24; display: flex; justify-content: flex-end; gap: 8px;">
        {"".join(button_html_items)}
      </div>""" if button_html_items else ""

    return f"""  <!-- Layer 3 Modal Backdrop & Panel (z-index: {BEHTML_LAYER_3_Z_INDEX}) -->
  <aside id="{_html.escape(modal_element_id)}" class="behtml-layer-3-dialogue" style="
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: {BEHTML_LAYER_3_Z_INDEX};
    background: rgba(0, 0, 0, 0.85);
    display: {display_css};
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  ">
    <!-- Dialogue Window (100% Solid Opaque Occlusion) -->
    <div style="
      width: 480px;
      max-width: 90vw;
      background: {modal_bg_color};
      border: 1px solid {BEHTML_COLOR_MODAL_BORDER};
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.95);
      color: {text_color};
      display: flex;
      flex-direction: column;
      overflow: hidden;
    ">
      <div style="padding: 12px 16px; border-bottom: 1px solid #1a1a24; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">{_html.escape(modal_title_text)}</span>
        <button onclick="document.getElementById('{_html.escape(modal_element_id)}').style.display='none'" style="background: none; border: none; color: #71717a; font-size: 16px; cursor: pointer; line-height: 1;">&times;</button>
      </div>
      <div style="padding: 16px; font-size: 12px; line-height: 1.5; color: #d4d4d8;">
{modal_body_html}
      </div>
{buttons_bar_html}
    </div>
  </aside>"""


def behtml_layer_3_scaffold_flyout(
    flyout_element_id: str,
    flyout_title_text: str,
    flyout_body_html: str,
    dock_side_direction: str = "right",
    width_sublanes_count: int = 6,
    is_initially_visible: bool = False
) -> str:
    """
    Renders a slide-over contextual drawer snapped to sublane dimensions.
    """
    display_css = "flex" if is_initially_visible else "none"
    position_rule = "right: 0;" if dock_side_direction.lower() == "right" else "left: 0;"
    width_pct = (width_sublanes_count / 16.0) * 100.0

    return f"""  <!-- Layer 3 Contextual Flyout (z-index: {BEHTML_LAYER_3_Z_INDEX}) -->
  <aside id="{_html.escape(flyout_element_id)}" class="behtml-layer-3-flyout" style="
    position: fixed;
    top: 0;
    {position_rule}
    width: {width_pct}%;
    min-width: 300px;
    height: 100vh;
    z-index: {BEHTML_LAYER_3_Z_INDEX};
    background: {BEHTML_COLOR_MODAL_BG_DARK};
    border-left: 1px solid {BEHTML_COLOR_MODAL_BORDER};
    display: {display_css};
    flex-direction: column;
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.9);
  ">
    <div style="padding: 14px 16px; border-bottom: 1px solid #1c1c24; display: flex; align-items: center; justify-content: space-between;">
      <span style="font-weight: 600; font-size: 12px; text-transform: uppercase;">{_html.escape(flyout_title_text)}</span>
      <button onclick="document.getElementById('{_html.escape(flyout_element_id)}').style.display='none'" style="background: none; border: none; color: #71717a; font-size: 18px; cursor: pointer;">&times;</button>
    </div>
    <div style="padding: 16px; flex: 1; overflow-y: auto;">
{flyout_body_html}
    </div>
  </aside>"""


def behtml_layer_3_scaffold_inspector_hud(
    hud_element_id: str,
    active_layers_roster: List[int],
    is_debug_mode: bool = False
) -> str:
    """
    Renders a floating Layer Stacking Inspector HUD displaying active z-depths.
    """
    display_css = "block" if is_debug_mode else "none"
    layers_indicators = [
        f'<div style="font-size: 10px; color: {"#DE2626" if lyr == 3 else "#FFFFFF"};">L{lyr} (z: {lyr * 32})</div>'
        for lyr in active_layers_roster
    ]

    return f"""  <div id="{_html.escape(hud_element_id)}" class="behtml-layer-3-hud" style="
    position: fixed;
    bottom: 12px;
    right: 12px;
    z-index: {BEHTML_LAYER_3_Z_INDEX};
    background: #000000;
    border: 1px solid {BEHTML_COLOR_ACCENT_RED};
    padding: 6px 10px;
    display: {display_css};
    font-family: monospace;
    font-size: 10px;
    pointer-events: none;
  ">
    <div style="font-weight: 700; color: {BEHTML_COLOR_ACCENT_RED}; margin-bottom: 2px;">BEHTML LAYER HUD</div>
    {"".join(layers_indicators)}
  </div>"""
