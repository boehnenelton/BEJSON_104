/**
 * Library:         lib_bejson_Diagrams_diagrams_ai.ts
 * Family:          Diagrams
 * Module Purpose:  AI system instructions builder and plan validation for the Diagrams family.
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         1.3.0
 * Release_Version: 300
 * Date:            2026-10-29
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   8a9f2e1d-4b7c-43e6-90d5-3c1e8b2a7f50
 */

import { BEJSONField } from "../Core/lib_bejson_Core_bejson_types";
import { DiagramPlan } from "./lib_bejson_Diagrams_cli_tools";

export function diagrams_ai_build_system_instructions(
  boardFields: BEJSONField[],
  connectorFields: BEJSONField[],
  territoryFields: BEJSONField[],
  shapeBaseFields: BEJSONField[],
  knownSizeClasses: readonly string[],
  knownShapeKinds: readonly string[],
  knownFlowValues: readonly string[]
): string {
  return `You are an expert systems diagrammer and spatial software architect.
Author attribution: Elton Boehnen (boehnenelton2024@gmail.com | boehnenelton2024.pages.dev | github.com/boehnenelton)

Your task is to take natural language requirements from the user and construct a structured diagram build plan adhering to the BEJSON Diagrammer MFDB Schema.

The diagram structure consists of:
1. Shapes: Nodes on the board.
   - tempId: STRICTLY UNIQUE string identifier for each shape (e.g. 'node_1', 'node_2', 'node_3'). NEVER DUPLICATE TEMP IDs.
   - label: concise descriptive label
   - text: optional multi-line explanatory body text
   - kind: ${knownShapeKinds.map(k => `'${k}'`).join(" or ")}
   - sizeClass: ${knownSizeClasses.map(sc => `'${sc}'`).join(", ")}
   - color: hex color code (default '#d9d9d9', children darker: '#b3b3b3', '#8c8c8c')
   - fontColor: 'auto', '#ffffff', or '#000000'
   - cx: NUMERIC horizontal center coordinate in pixels (e.g. 200, 460, 720). MUST BE A NUMBER, NOT A STRING OR NODE ID.
   - cy: NUMERIC vertical center coordinate in pixels (e.g. 180, 360, 540). MUST BE A NUMBER, NOT A STRING OR NODE ID.
   - parentTempId: optional parent shape tempId establishing tree hierarchy (must match an existing parent shape's tempId)

2. Connectors: Relationships between shapes.
   - fromTempId: source shape tempId (MUST EXACTLY MATCH a tempId in the shapes array or existing board node)
   - toTempId: destination shape tempId (MUST EXACTLY MATCH a tempId in the shapes array or existing board node)
   - flow: ${knownFlowValues.map(f => `'${f}'`).join(", ")}

3. Territories: Bounding background regions or zones.
   - kind: 'rect' or 'circle'
   - cx: NUMERIC horizontal center coordinate
   - cy: NUMERIC vertical center coordinate
   - size: width/height or diameter in pixels (min 80, typical 240-400)
   - label: territory name
   - color: brand territory hex color ('#000000', '#DE2626', '#737373', '#a6a6a6')

CRITICAL VALIDATION MANDATES:
1. Every shape MUST have a UNIQUE tempId ('node_1', 'node_2', 'node_3'...).
2. cx and cy MUST ALWAYS BE NUMERIC values (e.g. 200, 350). Do NOT output strings, "px" suffixes, or node IDs for cx/cy.
3. Every connector's fromTempId and toTempId MUST match a valid tempId defined in the shapes list. DO NOT reference missing or imaginary node IDs.
4. Prevent overlapping shapes by providing at least 200px horizontal and 140px vertical spacing between center coordinates.
5. Place root nodes near top (cy: 180) and cascade child tiers downward (cy + 160) or horizontally (cx + 260).

Response Format:
Return strictly a valid JSON object without surrounding markdown fences or commentary:
{
  "shapes": [ ... ],
  "connectors": [ ... ],
  "territories": [ ... ]
}`;
}

export function diagrams_ai_validate_plan_semantics(
  plan: DiagramPlan,
  knownSizeClasses: readonly string[],
  knownShapeKinds: readonly string[],
  knownFlowValues: readonly string[],
  existingShapeIds?: Iterable<string>
): [string[], string[]] {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!plan || typeof plan !== "object") {
    errors.push("Plan root must be an object.");
    return [errors, warnings];
  }

  const shapes = plan.shapes || [];
  const connectors = plan.connectors || [];
  const territories = plan.territories || [];

  const tempIds = new Set<string>(existingShapeIds ? Array.from(existingShapeIds) : []);
  const labelToTempId = new Map<string, string>();

  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];

    if (!s.tempId || typeof s.tempId !== "string" || s.tempId.trim() === "") {
      s.tempId = `node_${i + 1}`;
      warnings.push(`Shape at index ${i} was missing tempId, auto-assigned '${s.tempId}'.`);
    }

    if (tempIds.has(s.tempId)) {
      const original = s.tempId;
      s.tempId = `${original}_${i + 1}`;
      warnings.push(`Shape '${original}' had a duplicate tempId, auto-assigned '${s.tempId}'.`);
    }
    tempIds.add(s.tempId);

    if (s.label) {
      labelToTempId.set(s.label.trim().toLowerCase(), s.tempId);
    }

    if (s.sizeClass && !knownSizeClasses.includes(s.sizeClass)) {
      warnings.push(`Shape '${s.tempId}' unknown sizeClass '${s.sizeClass}', defaulting to 'medium'.`);
    }
    if (s.kind && !knownShapeKinds.includes(s.kind)) {
      warnings.push(`Shape '${s.tempId}' unknown kind '${s.kind}', defaulting to 'rect'.`);
    }
    if (s.color && !/^#[0-9a-fA-F]{6}$/.test(s.color)) {
      warnings.push(`Shape '${s.tempId}' non-standard hex color '${s.color}'.`);
    }

    if (typeof s.cx === "string") {
      const parsed = parseFloat((s.cx as string).replace(/px/gi, "").trim());
      if (!isNaN(parsed)) (s as any).cx = parsed;
    }
    if (typeof s.cy === "string") {
      const parsed = parseFloat((s.cy as string).replace(/px/gi, "").trim());
      if (!isNaN(parsed)) (s as any).cy = parsed;
    }

    if (typeof s.cx !== "number" || isNaN(s.cx)) {
      const col = i % 4;
      (s as any).cx = 200 + col * 260;
      warnings.push(`Shape '${s.tempId}' cx was non-numeric, auto-assigned to ${s.cx}.`);
    }
    if (typeof s.cy !== "number" || isNaN(s.cy)) {
      const row = Math.floor(i / 4);
      (s as any).cy = 200 + row * 180;
      warnings.push(`Shape '${s.tempId}' cy was non-numeric, auto-assigned to ${s.cy}.`);
    }
  }

  for (const s of shapes) {
    if (s.parentTempId) {
      if (!tempIds.has(s.parentTempId)) {
        const fuzzy = labelToTempId.get(s.parentTempId.toLowerCase());
        if (fuzzy) {
          s.parentTempId = fuzzy;
          warnings.push(`Shape '${s.tempId}' parentTempId resolved to '${fuzzy}' via label matching.`);
        } else {
          warnings.push(`Shape '${s.tempId}' unresolved parentTempId '${s.parentTempId}', promoted to root.`);
          s.parentTempId = undefined;
        }
      }
    }
  }

  const validConnectors = [];
  for (let i = 0; i < connectors.length; i++) {
    const c = connectors[i];

    if (!c.fromTempId || !tempIds.has(c.fromTempId)) {
      const fuzzyFrom = c.fromTempId ? labelToTempId.get(c.fromTempId.toLowerCase()) : null;
      if (fuzzyFrom) {
        c.fromTempId = fuzzyFrom;
      }
    }

    if (!c.toTempId || !tempIds.has(c.toTempId)) {
      const fuzzyTo = c.toTempId ? labelToTempId.get(c.toTempId.toLowerCase()) : null;
      if (fuzzyTo) {
        c.toTempId = fuzzyTo;
      }
    }

    if (tempIds.has(c.fromTempId) && tempIds.has(c.toTempId)) {
      if (c.flow && !knownFlowValues.includes(c.flow)) {
        warnings.push(`Connector at index ${i} unknown flow '${c.flow}', defaulting to 'none'.`);
      }
      validConnectors.push(c);
    } else {
      warnings.push(`Connector at index ${i} ('${c.fromTempId}' -> '${c.get ? c.get("toTempId") : c.toTempId}') had unresolved endpoints and was auto-filtered.`);
    }
  }
  plan.connectors = validConnectors;

  for (let i = 0; i < territories.length; i++) {
    const t = territories[i];
    if (typeof t.cx === "string") {
      const parsed = parseFloat((t.cx as string).replace(/px/gi, "").trim());
      if (!isNaN(parsed)) (t as any).cx = parsed;
    }
    if (typeof t.cy === "string") {
      const parsed = parseFloat((t.cy as string).replace(/px/gi, "").trim());
      if (!isNaN(parsed)) (t as any).cy = parsed;
    }
    if (typeof t.size === "string") {
      const parsed = parseFloat((t.size as string).replace(/px/gi, "").trim());
      if (!isNaN(parsed)) (t as any).size = parsed;
    }

    if (typeof t.cx !== "number" || isNaN(t.cx)) (t as any).cx = 300;
    if (typeof t.cy !== "number" || isNaN(t.cy)) (t as any).cy = 300;
    if (typeof t.size !== "number" || isNaN(t.size)) (t as any).size = 350;
  }

  return [errors, warnings];
}
