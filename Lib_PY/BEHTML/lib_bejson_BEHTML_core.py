"""
Library:         lib_bejson_BEHTML_core.py
Family:          BEHTML
Module Purpose:  Implements runtime functionality and logic for lib_bejson_BEHTML_core.py.
Architecture:    BEJSON Core provides foundational format parsing, schema enforcement, path security, positional field map caching, and multi-format integration across runtime environments.
Version:         0.1.0
Release_Version: 300
Date:            2026-07-30
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   871cfec2-f578-4b74-86ee-4bcf686a4b69
"""

import re
from typing import Optional

try:
    from lib_bejson_BEHTML_bejson_errors import (
        E_BEHTML_INVALID_Y_INDEX,
        E_BEHTML_INVALID_X_ADDRESS,
        E_BEHTML_X_SPAN_OVERFLOW,
        E_BEHTML_INVALID_Y_SPAN,
        E_BEHTML_MATRIX_SHATTERED,
        E_BEHTML_INVALID_BEM_MODIFIER,
        E_BEHTML_PALETTE_VIOLATION,
    )
except ImportError as e:
    import logging
    logging.critical(f"[BEHTML_CORE] FATAL: Error registry unreachable: {e}")
    raise SystemExit(1)


class BEHTMLError(Exception):
    """Raised for any BEHTML spatial-law or contrast-law violation."""
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(f"[E{code}] {message}")


# ---------------------------------------------------------------------------
# Universal Spatial Constants (Spec sections 2, 3)
# ---------------------------------------------------------------------------
BEHTML_RY_PX = 32            # Universal Y-axis quantum, in pixels
BEHTML_X_LANES = 8           # Octal Segment Base: X0..X7
BEHTML_X_QUANTUM_PCT = 12.5  # Each lane = 100 / BEHTML_X_LANES
BEHTML_QUANTIZATION_TOLERANCE = 0.001  # Anti-Drift Auditor floating-point tolerance

# Tri-Color Visual Linguistics (Spec section 5.1)
BEHTML_COLOR_WHITE = "#FFFFFF"
BEHTML_COLOR_BLACK = "#000000"
BEHTML_COLOR_ACCENT = "#DE2626"


# ---------------------------------------------------------------------------
# Y-Axis Quantization (Law of Integer Multiples)
# ---------------------------------------------------------------------------
def behtml_core_quantize_y(height_px: float) -> int:
    """
    Round an arbitrary pixel height to the nearest positive integer multiple
    of BEHTML_RY_PX (k), per Spec 2.1. Returns k, not px.
    """
    if height_px is None or height_px < 0:
        raise BEHTMLError(E_BEHTML_INVALID_Y_INDEX, f"height_px must be >= 0, got {height_px}")
    k = round(height_px / BEHTML_RY_PX)
    return max(1, k)


def behtml_core_y_span_to_px(y_span: int) -> int:
    """Convert an integer row-span (k) to its exact pixel footprint."""
    if not isinstance(y_span, int) or y_span < 1:
        raise BEHTMLError(E_BEHTML_INVALID_Y_SPAN, f"y_span must be a positive integer, got {y_span}")
    return y_span * BEHTML_RY_PX


def behtml_core_validate_quantization(actual_px: float, y_span: int,
                                       tolerance: float = BEHTML_QUANTIZATION_TOLERANCE) -> bool:
    """
    Anti-Drift Auditor check (Spec section 6). Confirms actual_px matches
    y_span * Ry within tolerance. Raises E_BEHTML_MATRIX_SHATTERED if not.
    """
    expected_px = behtml_core_y_span_to_px(y_span)
    if abs(actual_px - expected_px) >= tolerance:
        raise BEHTMLError(
            E_BEHTML_MATRIX_SHATTERED,
            f"actual_px={actual_px} deviates from expected {expected_px} "
            f"(y_span={y_span}) by >= {tolerance}px"
        )
    return True


def behtml_core_control_padding_y(visual_height_px: float, y_span: int = 1) -> float:
    """
    The '28px Paradox' (Spec 2.2): derive symmetrical top/bottom padding so a
    visually shorter control (e.g. 28px) still occupies a full y_span * Ry
    DOM footprint. Returns padding-per-side in px.
    """
    footprint_px = behtml_core_y_span_to_px(y_span)
    gap = footprint_px - visual_height_px
    if gap < 0:
        raise BEHTMLError(
            E_BEHTML_MATRIX_SHATTERED,
            f"visual_height_px={visual_height_px} exceeds footprint {footprint_px} for y_span={y_span}"
        )
    return gap / 2.0


# ---------------------------------------------------------------------------
# X-Axis Octal Segment Base (Spec section 3.1)
# ---------------------------------------------------------------------------
def behtml_core_validate_x_address(x_start: int, x_span: int = 1) -> bool:
    """Validate a lane index/span pair fits inside X0..X7."""
    if not isinstance(x_start, int) or not (0 <= x_start < BEHTML_X_LANES):
        raise BEHTMLError(E_BEHTML_INVALID_X_ADDRESS, f"x_start must be 0-{BEHTML_X_LANES-1}, got {x_start}")
    if not isinstance(x_span, int) or x_span < 1:
        raise BEHTMLError(E_BEHTML_X_SPAN_OVERFLOW, f"x_span must be a positive integer, got {x_span}")
    if x_start + x_span > BEHTML_X_LANES:
        raise BEHTMLError(
            E_BEHTML_X_SPAN_OVERFLOW,
            f"x_start({x_start}) + x_span({x_span}) exceeds {BEHTML_X_LANES} lanes"
        )
    return True


def behtml_core_x_span_to_percent(x_span: int) -> float:
    """Convert a lane-count span into its exact percentage width."""
    return round(x_span * BEHTML_X_QUANTUM_PCT, 4)


def behtml_core_percent_to_x_span(percent: float) -> int:
    """Inverse of behtml_core_x_span_to_percent, rounded to nearest whole lane."""
    return max(1, round(percent / BEHTML_X_QUANTUM_PCT))


# ---------------------------------------------------------------------------
# BEM Class Construction (Spec section 4) — behtml- namespace, spec 0,1,0
# ---------------------------------------------------------------------------
_BEM_TOKEN_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _validate_bem_token(token: str, label: str) -> None:
    if not token or not _BEM_TOKEN_RE.match(token):
        raise BEHTMLError(
            E_BEHTML_INVALID_BEM_MODIFIER,
            f"{label} '{token}' fails BEM grammar (lowercase, digits, hyphens only)"
        )


def behtml_core_bem_class(block: str, element: Optional[str] = None,
                           modifier: Optional[str] = None) -> str:
    """
    Build a single flattened-specificity BEM class under the 'behtml-'
    namespace, e.g. behtml_core_bem_class('grid', 'cell', 'w-50')
    -> 'behtml-grid__cell--w-50'.
    """
    _validate_bem_token(block, "block")
    cls = f"behtml-{block}"
    if element:
        _validate_bem_token(element, "element")
        cls += f"__{element}"
    if modifier:
        _validate_bem_token(modifier, "modifier")
        cls += f"--{modifier}"
    return cls


def behtml_core_grid_cell_classes(x_start: int, x_span: int, y_span: int = 1,
                                    active: bool = False) -> list:
    """
    Build the full class list for a grid cell: base cell class, width
    modifier (derived from x_span %), row-height modifier, and optional
    active-column state modifier (Spec 4.3).
    """
    behtml_core_validate_x_address(x_start, x_span)
    pct = behtml_core_x_span_to_percent(x_span)
    pct_slug = str(pct).replace(".0", "").replace(".", "-")
    classes = [
        behtml_core_bem_class("grid", "cell"),
        behtml_core_bem_class("grid", "cell", f"w-{pct_slug}"),
        behtml_core_bem_class("grid", "row", f"{y_span}r"),
    ]
    if active:
        classes.append(behtml_core_bem_class("grid", "cell", "active-column"))
    return classes


# ---------------------------------------------------------------------------
# Tri-Color Contrast Guard (Spec section 5.2 — Ironclad Contrast Heuristics)
# ---------------------------------------------------------------------------
def behtml_core_validate_contrast(font_color: str, background_color: str) -> bool:
    """
    Enforce the First Law: black font is strictly prohibited on a #DE2626
    background. Raises E_BEHTML_PALETTE_VIOLATION if violated.
    """
    font_color = (font_color or "").upper()
    background_color = (background_color or "").upper()
    if background_color == BEHTML_COLOR_ACCENT and font_color == BEHTML_COLOR_BLACK:
        raise BEHTMLError(
            E_BEHTML_PALETTE_VIOLATION,
            "Black font on #DE2626 background violates the First Law of Palette"
        )
    return True