"""
Library:         lib_bejson_BEHTML_bejson_errors.py
Family:          BEHTML
Module Purpose:  Implements runtime functionality and logic for lib_bejson_BEHTML_bejson_errors.py.
Architecture:    Nested BEJSON 104 embeds tabular structures inside parent cell strings using implicit physical coordinates NestAddress(parent_fp, row, col, depth) without synthetic foreign key fields.
Version:         0.2.0
Release_Version: 300
Date:            2026-08-07
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   85947cce-52f5-460b-98fb-eb5288004d20
"""

# ---------------------------------------------------------------------------
# BEHTML (300-329)
# ---------------------------------------------------------------------------
E_BEHTML_NOT_BEJSON            = 300  # Doc argument is not a dict
E_BEHTML_SCHEMA_MISMATCH       = 301  # Records_Type is not "BEHTMLElement"
E_BEHTML_MISSING_ELEMENT_ID    = 302  # element_id field absent or null
E_BEHTML_DUPLICATE_ELEMENT_ID  = 303  # element_id collides with another record
E_BEHTML_INVALID_Y_INDEX       = 304  # y_start is negative or not an integer
E_BEHTML_INVALID_X_ADDRESS     = 305  # x_start outside the 0-7 octal lane range
E_BEHTML_X_SPAN_OVERFLOW       = 306  # x_start + x_span exceeds 8 lanes
E_BEHTML_INVALID_Y_SPAN        = 307  # y_span is not a positive integer
E_BEHTML_MATRIX_SHATTERED      = 308  # computed px height not a multiple of Ry (32px)
E_BEHTML_INVALID_ELEMENT_TYPE  = 309  # element_type not in the known control set
E_BEHTML_PARENT_NOT_FOUND      = 310  # parent_id_fk points to a missing element_id
E_BEHTML_INVALID_BEM_MODIFIER  = 311  # modifier string fails BEM grammar
E_BEHTML_PALETTE_VIOLATION     = 312  # black-on-red contrast law violated
E_BEHTML_ELEMENT_NOT_FOUND     = 313  # element_id not present in document (crud.py)
E_BEHTML_INVALID_CONTENT_KIND  = 314  # content_kind not in KNOWN_CONTENT_KINDS (crud.py)
E_BEHTML_INVALID_URL           = 315  # content_kind="url" but content_ref fails URL validation (crud.py)
E_BEHTML_MISSING_FIELD_BINDING = 316  # content_kind="field_binding" but content_ref is empty (crud.py)
E_BEHTML_OVERLAP_DETECTED      = 317  # placed rectangle collides with an existing element (collision.py)
E_BEHTML_RENDER_FAILED         = 318  # renderer raised while producing an element's markup (render.py)

# 319-329 reserved for future BEHTML codes.