"""
Library:        lib_bejson_Diagrams_diagrams_ai.py
Family:         Diagrams
Description:    Prompt-to-diagram builder. Turns a plain-English user prompt
                 into a structured "build plan" (shapes/connectors/
                 territories) via Gemini (lib_bejson_AI_bejson_gemini.py),
                 then the caller (diagram_mfdb.py) executes that plan
                 through its own normal create_shape()/create_connector()/
                 create_territory() calls -- this library never touches an
                 MFDB root directly, it only talks to the model and
                 validates what comes back.

                 System-instruction design: the caller hands this library
                 its OWN live field schema (whatever it actually enforces on
                 writes -- BOARD_FIELDS/CONNECTOR_FIELDS/TERRITORY_FIELDS/
                 SHAPE_BASE_FIELDS-shaped lists) rather than this library
                 hardcoding a copy of that schema, so there's no drift
                 between what the AI is told and what the app will actually
                 accept. Each field is rendered as a spreadsheet-style row
                 (Field | Type | Example) -- literally the same Field-Map
                 mental model BEJSON itself uses (Fields[] columns, Values[]
                 rows) -- plus a worked example diagram, so the model is
                 taught the contract the same way a person reading the
                 BEJSON crash course would be.
Version:        1.1.0
Date:           2026-09-25
Author:         Elton Boehnen
Contact:        boehnenelton2024@gmail.com | boehnenelton2024.pages.dev | github.com/boehnenelton
Format_Creator: Elton Boehnen
RELATIONAL_ID:  9b4e7c2a-5d1f-4a86-b03e-6c9f2a4d8b17
Release_Version: 300
Changelog:
  1.1.0 (2026-09-25) - Audit finding: this library only ever did structural
          validation (tempId reference integrity) before a plan was handed
          back to the caller for execution -- there was no check that the
          VALUES in a plan were things the app would actually accept
          (sizeClass/kind/flow enums, hex colors, numeric coordinates), and
          diagram_mfdb.ai_build_diagram_from_prompt() executed a plan the
          moment it came back with no approval step in between. Added
          diagrams_ai_validate_plan_semantics() (post-reception, pre-
          approval: errors vs. warnings returned separately) for the first
          gap; the second is closed by the caller's own propose/approve
          split (see diagram_mfdb.ai_propose_diagram_from_prompt() /
          ai_apply_diagram_plan()). Also fixed AUTHOR_CONTACT_BLOCK, which
          had the wrong email address baked into every system-instruction
          call.
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from lib_bejson_AI_bejson_gemini import get_standard_api
from lib_bejson_AI_bejson_errors import AIException

from lib_bejson_Diagrams_bejson_errors import (
    E_DIAGRAMS_AI_EMPTY_PROMPT,
    E_DIAGRAMS_AI_BAD_RESPONSE,
    E_DIAGRAMS_AI_INVALID_PLAN,
    E_DIAGRAMS_AI_PROVIDER_ERROR,
    E_DIAGRAMS_AI_SEMANTIC_INVALID,
)

AUTHOR_CONTACT_BLOCK = (
    "Elton Boehnen | boehnenelton2024@gmail.com | boehnenelton2024.pages.dev | "
    "github.com/boehnenelton"
)


class AIBuildError(Exception):
    def __init__(self, message: str, code: int, context: Optional[dict] = None):
        super().__init__(message)
        self.code = code
        self.context = context or {}


def _field_table(fields: List[Dict[str, str]], example_row: Dict[str, Any], title: str) -> str:
    """
    Renders a field list as a spreadsheet-style reference table: one row per
    column, its declared type, and a real example value -- the same
    Fields[]/Values[] pairing BEJSON documents themselves use, just written
    out as prose the model can read without parsing JSON schema.
    """
    lines = [f"{title} (Field | Type | Example value)"]
    for f in fields:
        name = f["name"]
        example = example_row.get(name, "")
        lines.append(f"  - {name} | {f['type']} | {example!r}")
    return "\n".join(lines)


def diagrams_ai_build_system_instructions(
    board_fields: List[Dict[str, str]],
    connector_fields: List[Dict[str, str]],
    territory_fields: List[Dict[str, str]],
    shape_own_fields: List[Dict[str, str]],
    known_size_classes: List[str],
    known_shape_kinds: List[str],
    known_flow_values: List[str],
) -> str:
    """
    Builds the full system instruction text for the diagram-building model.
    Pass in the CALLER's live field lists (diagram_mfdb.py's own
    BOARD_FIELDS/CONNECTOR_FIELDS/TERRITORY_FIELDS/SHAPE_BASE_FIELDS) so this
    stays in sync with whatever the app actually accepts on writes -- this
    library holds no schema copy of its own.
    """
    board_example = {
        "shape_id": "shape_1a2b3c4d5e", "shape_entity_name": "Shape_shape_1a2b3c4d5e",
        "shape_cx": 300, "shape_cy": 150, "shape_size_class": "medium",
        "shape_kind": "rect", "shape_parent_fk": None, "shape_collapsed": False,
    }
    conn_example = {
        "conn_id": "conn_9f8e7d6c5b", "conn_from_fk": "shape_1a2b3c4d5e",
        "conn_to_fk": "shape_2b3c4d5e6f", "conn_flow": "forward",
    }
    terr_example = {
        "terr_id": "terr_5e6f7a8b9c", "terr_kind": "rect", "terr_cx": 450,
        "terr_cy": 150, "terr_size": 300, "terr_label": "Zone A", "terr_color": "#2a6496",
    }
    shape_own_example = {
        "board_membership_fk": "shape_1a2b3c4d5e", "shape_label": "Auth Service",
        "shape_color": "#334455", "shape_font_color": "auto", "shape_text": "",
    }

    return f"""You are the diagram-building assistant embedded in the BEJSON Diagrammer, a
tool by {AUTHOR_CONTACT_BLOCK}. You turn a user's plain-English request into a
structured diagram build plan for that app's MFDB-backed diagram store.

## How the data is actually shaped (MFDB / BEJSON)

The diagram lives in an MFDB database: one manifest (104a.mfdb.bejson) that
lists entities, each entity a separate table of Fields (columns) and Values
(rows) -- the same shape as a spreadsheet: one header row of column names,
one data row per record. The manifest itself is described the same way:

MFDB manifest (Field | Type | Example value)
  - entity_name | string | 'Board'
  - file_path | string | 'data/board.bejson'
  - description | string | 'One row per shape placed on the board'
  - primary_key | string | 'shape_id'

The diagram has three entities plus each shape's own private entity:

{_field_table(board_fields, board_example, "Board entity -- one row per shape placed on the board")}

{_field_table(shape_own_fields, shape_own_example, "Shape's own entity -- one row, this shape's content")}
  (board_membership_fk on this row equals that shape's shape_id on Board --
  that's the foreign key tying the two together.)

{_field_table(connector_fields, conn_example, "Connector entity -- one row per line between two shapes")}
  (conn_from_fk / conn_to_fk are foreign keys into Board.shape_id.)

{_field_table(territory_fields, terr_example, "Territory entity -- one row per background zone/grouping")}

Known enums -- use ONLY these values:
  - shape_size_class / sizeClass: {known_size_classes}
  - shape_kind / kind: {known_shape_kinds}
  - conn_flow / flow: {known_flow_values}

## Your job

Given the user's prompt, decide what shapes, connectors, and territories
would represent it, and respond with ONLY a single JSON object (no markdown
fences, no prose before or after) matching this build-plan contract:

{{
  "shapes": [
    {{
      "tempId": "s1",
      "label": "Auth Service",
      "kind": "rect",
      "sizeClass": "medium",
      "cx": 300, "cy": 150,
      "color": "#334455",
      "fontColor": "auto",
      "text": "",
      "parentTempId": null
    }}
  ],
  "connectors": [
    {{ "fromTempId": "s1", "toTempId": "s2", "flow": "forward" }}
  ],
  "territories": [
    {{ "kind": "rect", "cx": 450, "cy": 150, "size": 300, "label": "Zone A", "color": "#2a6496" }}
  ]
}}

Rules:
  - "tempId" is YOUR OWN short local id (e.g. "s1", "s2") -- the real
    shape_id doesn't exist yet, it's assigned when the app actually creates
    the shape. Connectors and parentTempId reference these tempIds, never
    real ids.
  - Every connector's fromTempId/toTempId MUST match a tempId you defined
    in "shapes". Every shape's parentTempId MUST be null or another tempId
    you defined (never a shape's own tempId).
  - Lay shapes out on a 50px grid, spaced so boxes don't overlap -- medium
    shapes are roughly 200x100, so space centers at least 250-300px apart
    horizontally when connected left-to-right, more for "large"/"huge".
  - color is a hex string (e.g. "#334455"); fontColor is "auto" unless the
    user asks for a specific text color.
  - Omit "connectors" or "territories" entirely (or leave as an empty list)
    if the prompt doesn't call for any.
  - If the request is unclear or not diagram-shaped, return
    {{"shapes": [], "connectors": [], "territories": []}} rather than
    guessing wildly.
  - Respond with ONLY the JSON object. No commentary, no code fences.
"""


def _strip_code_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t[3:]
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
        if t.lstrip().lower().startswith("json"):
            t = t.lstrip()[4:]
    return t.strip()


def diagrams_ai_build_plan(user_prompt: str, system_instructions: str,
                            model_id: Optional[str] = None,
                            temperature: float = 0.4) -> Dict[str, Any]:
    """
    Calls Gemini with the given system instructions + the user's prompt,
    parses the JSON build plan back out, and structurally validates it
    (every connector/parent reference resolves to a declared tempId) before
    handing it back to the caller to actually execute. Raises AIBuildError
    on any failure -- empty prompt, provider error, unparseable response, or
    an internally-inconsistent plan.
    """
    prompt = (user_prompt or "").strip()
    if not prompt:
        raise AIBuildError("Prompt is empty.", E_DIAGRAMS_AI_EMPTY_PROMPT)

    api = get_standard_api()
    try:
        raw = api.generate(prompt, model_id=model_id,
                            system_instruction=system_instructions,
                            temperature=temperature)
    except AIException as e:
        raise AIBuildError(f"AI provider error: {e}", E_DIAGRAMS_AI_PROVIDER_ERROR)

    cleaned = _strip_code_fences(raw or "")
    try:
        plan = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise AIBuildError(
            f"Model response wasn't valid JSON: {e}", E_DIAGRAMS_AI_BAD_RESPONSE,
            {"raw_response": raw},
        )

    if not isinstance(plan, dict):
        raise AIBuildError("Model response JSON wasn't an object.", E_DIAGRAMS_AI_BAD_RESPONSE,
                            {"raw_response": raw})

    shapes = plan.setdefault("shapes", []) or []
    connectors = plan.setdefault("connectors", []) or []
    territories = plan.setdefault("territories", []) or []

    temp_ids = set()
    for s in shapes:
        tid = s.get("tempId")
        if not tid:
            raise AIBuildError("A shape in the plan is missing tempId.", E_DIAGRAMS_AI_INVALID_PLAN,
                                {"shape": s})
        if tid in temp_ids:
            raise AIBuildError(f"Duplicate tempId '{tid}' in plan.", E_DIAGRAMS_AI_INVALID_PLAN)
        temp_ids.add(tid)

    for s in shapes:
        pid = s.get("parentTempId")
        if pid is not None and pid not in temp_ids:
            raise AIBuildError(f"Shape '{s.get('tempId')}' parentTempId '{pid}' "
                                f"doesn't match any declared shape tempId.",
                                E_DIAGRAMS_AI_INVALID_PLAN, {"plan": plan})
        if pid == s.get("tempId"):
            raise AIBuildError(f"Shape '{pid}' lists itself as its own parentTempId.",
                                E_DIAGRAMS_AI_INVALID_PLAN)

    for c in connectors:
        for key in ("fromTempId", "toTempId"):
            if c.get(key) not in temp_ids:
                raise AIBuildError(
                    f"Connector {key} '{c.get(key)}' doesn't match any declared shape tempId.",
                    E_DIAGRAMS_AI_INVALID_PLAN, {"plan": plan},
                )

    return plan


_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{8}$")


def diagrams_ai_validate_plan_semantics(
    plan: Dict[str, Any],
    known_size_classes: List[str],
    known_shape_kinds: List[str],
    known_flow_values: List[str],
) -> Tuple[List[str], List[str]]:
    """
    Post-reception validation, run AFTER diagrams_ai_build_plan()'s
    structural pass and BEFORE the plan is ever shown to the user for
    approval or executed against the diagram. Structural validation only
    proves the plan's tempId references are internally consistent; this
    proves the VALUES in it are things the app will actually accept --
    real size classes, real shape kinds, real flow directions, well-formed
    hex colors, numeric coordinates. Never raises: returns (errors,
    warnings) so the caller decides policy -- this app's policy (see
    diagram_mfdb.ai_propose_diagram_from_prompt) is errors block approval,
    warnings are shown but don't.
    """
    errors: List[str] = []
    warnings: List[str] = []

    for s in plan.get("shapes", []):
        tid = s.get("tempId", "?")
        sc = s.get("sizeClass")
        if sc not in known_size_classes:
            errors.append(f"Shape '{tid}': sizeClass {sc!r} is not one of {known_size_classes}.")
        kind = s.get("kind")
        if kind not in known_shape_kinds:
            errors.append(f"Shape '{tid}': kind {kind!r} is not one of {known_shape_kinds}.")
        for coord in ("cx", "cy"):
            if not isinstance(s.get(coord), (int, float)):
                errors.append(f"Shape '{tid}': {coord} is not numeric ({s.get(coord)!r}).")
        color = s.get("color")
        if color is not None and not _HEX_COLOR_RE.match(str(color)):
            warnings.append(f"Shape '{tid}': color {color!r} doesn't look like a hex color -- "
                             "will likely render oddly.")
        font_color = s.get("fontColor")
        if font_color not in (None, "auto") and not _HEX_COLOR_RE.match(str(font_color)):
            warnings.append(f"Shape '{tid}': fontColor {font_color!r} is neither 'auto' nor a hex color.")
        label = s.get("label")
        if not label or not str(label).strip():
            warnings.append(f"Shape '{tid}': no label -- will show up blank on the board.")

    for i, c in enumerate(plan.get("connectors", [])):
        flow = c.get("flow")
        if flow not in known_flow_values:
            errors.append(f"Connector #{i} ({c.get('fromTempId')}->{c.get('toTempId')}): "
                           f"flow {flow!r} is not one of {known_flow_values}.")

    for i, t in enumerate(plan.get("territories", [])):
        for coord in ("cx", "cy", "size"):
            if not isinstance(t.get(coord), (int, float)):
                errors.append(f"Territory #{i}: {coord} is not numeric ({t.get(coord)!r}).")
        color = t.get("color")
        if color is not None and not _HEX_COLOR_RE.match(str(color)):
            warnings.append(f"Territory #{i}: color {color!r} doesn't look like a hex color.")

    return errors, warnings
