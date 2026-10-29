"""
Library:         lib_bejson_BEHTML_layer_1_scaffold.py
Family:          BEHTML
Module Purpose:  Implements Layer 1 (Base Canvas & Viewport Void, z-index: 0) Scaffolding.
Architecture:    BEHTML deterministic spatial layout engine enforcing 8-lane / 16-sublane coordinate grids,
                 Ry=32px row quantization, dynamic visualViewport height synchronization, and transparent production grid.
Version:         1.0.0
Release_Version: 300
Date Created:    2026-10-24
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   c84e1b20-9f12-4a7b-b38a-5e2a9d8c0171
"""

import html as _html
import logging
from typing import Optional

import lib_bejson_BEHTML_bootstrap  # noqa: F401

logger_instance = logging.getLogger("lib_bejson_BEHTML_layer_1_scaffold")

VERSION = "1.0.0"
RELEASE_VERSION = "300"

# Spatial & Token Constants per Policy §8.1 and Spec
BEHTML_LAYER_1_Z_INDEX = 0
BEHTML_LAYER_1_ROW_QUANTUM_PX = 32
BEHTML_LAYER_1_BASE_LANES = 8
BEHTML_LAYER_1_SUBLANES = 16

BEHTML_COLOR_CANVAS_DARK = "#000000"
BEHTML_COLOR_CANVAS_LIGHT = "#FFFFFF"
BEHTML_COLOR_TEXT_WHITE = "#FFFFFF"
BEHTML_COLOR_TEXT_BLACK = "#000000"
BEHTML_COLOR_ACCENT_RED = "#DE2626"
BEHTML_COLOR_DIVIDER_DARK = "#1a1a1a"
BEHTML_COLOR_DIVIDER_LIGHT = "#e5e5e5"


def behtml_layer_1_get_viewport_sync_script() -> str:
    """
    Returns the JavaScript snippet for synchronizing --app-height with window.visualViewport,
    eliminating mobile browser address bar jump, jitter, and layout distortion.
    """
    return """<script>
(function() {
  function syncViewportHeight() {
    if (window.visualViewport) {
      document.documentElement.style.setProperty('--app-height', window.visualViewport.height + 'px');
    } else {
      document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
    }
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewportHeight);
    window.visualViewport.addEventListener('scroll', syncViewportHeight);
  }
  window.addEventListener('resize', syncViewportHeight);
  syncViewportHeight();
})();
</script>"""


def behtml_layer_1_get_base_css(
    theme_palette_name: str = "dark",
    grid_mode_type: str = "16_sublane",
    is_debug_mode: bool = False
) -> str:
    """
    Generates Layer 1 base CSS containing the viewport lock, CSS variables,
    contained custom scrollbars, and grid track definitions.
    """
    is_dark_theme = (theme_palette_name.lower() != "light")
    canvas_background_color = BEHTML_COLOR_CANVAS_DARK if is_dark_theme else BEHTML_COLOR_CANVAS_LIGHT
    text_foreground_color = BEHTML_COLOR_TEXT_WHITE if is_dark_theme else BEHTML_COLOR_TEXT_BLACK
    border_structural_color = BEHTML_COLOR_DIVIDER_DARK if is_dark_theme else BEHTML_COLOR_DIVIDER_LIGHT

    # Grid columns definition
    if grid_mode_type == "8_lane":
        column_track_css = "repeat(8, 12.5%)"
    else:
        column_track_css = "repeat(16, 6.25%)"

    # Production vs Debug Grid lines
    if is_debug_mode:
        grid_debug_overlay_css = """
      background-image: 
        linear-gradient(to right, rgba(222, 38, 38, 0.15) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
      background-size: 6.25% 32px;
"""
    else:
        grid_debug_overlay_css = "      background-image: none;\n"

    return f"""  <style>
    :root {{
      --app-height: 100vh;
      --behtml-ry: {BEHTML_LAYER_1_ROW_QUANTUM_PX}px;
      --behtml-bg-canvas: {canvas_background_color};
      --behtml-fg-text: {text_foreground_color};
      --behtml-accent-red: {BEHTML_COLOR_ACCENT_RED};
      --behtml-border-divider: {border_structural_color};
    }}
    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }}
    html, body {{
      width: 100vw;
      height: var(--app-height);
      overflow: hidden;
      background-color: var(--behtml-bg-canvas);
      color: var(--behtml-fg-text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", monospace;
      font-size: 13px;
      line-height: 1.4;
    }}
    /* Layer 1 Root Canvas Grid Stage */
    .behtml-layer-1-canvas {{
      position: relative;
      width: 100vw;
      height: var(--app-height);
      display: grid;
      grid-template-columns: {column_track_css};
      grid-auto-rows: var(--behtml-ry);
      z-index: {BEHTML_LAYER_1_Z_INDEX};
      overflow: hidden;
{grid_debug_overlay_css}    }}
    /* Contained Scrollbar Styling */
    ::-webkit-scrollbar {{
      width: 6px;
      height: 6px;
    }}
    ::-webkit-scrollbar-track {{
      background: transparent;
    }}
    ::-webkit-scrollbar-thumb {{
      background: #2a2a32;
      border-radius: 3px;
    }}
    ::-webkit-scrollbar-thumb:hover {{
      background: var(--behtml-accent-red);
    }}
  </style>"""


def behtml_layer_1_scaffold_page(
    page_title_text: str,
    body_content_markup: str,
    theme_palette_name: str = "dark",
    grid_mode_type: str = "16_sublane",
    is_debug_mode: bool = False,
    extra_head_tags_markup: str = ""
) -> str:
    """
    Materializes a complete, spec-compliant BEHTML HTML5 document wrapper enforcing Layer 1
    viewport lock, spatial grid layout, dynamic height sync, and tri-color variables.
    """
    logger_instance.debug("Scaffolding Layer 1 Page Shell with theme=%s, debug=%s", theme_palette_name, is_debug_mode)
    
    escaped_title_text = _html.escape(page_title_text)
    base_css_markup = behtml_layer_1_get_base_css(
        theme_palette_name=theme_palette_name,
        grid_mode_type=grid_mode_type,
        is_debug_mode=is_debug_mode
    )
    viewport_sync_script = behtml_layer_1_get_viewport_sync_script()

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>{escaped_title_text}</title>
{base_css_markup}
{extra_head_tags_markup}
</head>
<body>
  <main class="behtml-layer-1-canvas" id="behtml-canvas-stage">
{body_content_markup}
  </main>
{viewport_sync_script}
</body>
</html>
"""


def behtml_layer_1_scaffold_canvas_stage(
    inner_markup_content: str,
    z_layer_index: int = BEHTML_LAYER_1_Z_INDEX,
    is_debug_mode: bool = False
) -> str:
    """
    Materializes the inner canvas stage wrapper container for Layer 1.
    """
    debug_class_name = " behtml-layer-1-canvas--debug" if is_debug_mode else ""
    return f"""<div class="behtml-layer-1-canvas{debug_class_name}" style="z-index: {z_layer_index};">
{inner_markup_content}
</div>"""
