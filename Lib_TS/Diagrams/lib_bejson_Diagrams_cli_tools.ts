/**
 * Library:         lib_bejson_Diagrams_cli_tools.ts
 * Family:          Diagrams
 * Module Purpose:  Spatial layout scaffolding and XML tag parsing (<scaffold>, <zone>) for AI diagram generation.
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         1.2.0
 * Release_Version: 300
 * Date:            2026-10-29
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   64b9314e-f6bf-4807-84c7-a2852eae1771
 */

export interface DiagramPlanShape {
  tempId: string;
  label: string;
  text?: string;
  kind?: string;
  sizeClass?: string;
  color?: string;
  fontColor?: string;
  cx?: number;
  cy?: number;
  parentTempId?: string | null;
  [key: string]: any;
}

export interface DiagramPlanConnector {
  fromTempId: string;
  toTempId: string;
  flow?: string;
}

export interface DiagramPlanTerritory {
  kind?: string;
  cx?: number;
  cy?: number;
  size?: number;
  label?: string;
  color?: string;
}

export interface DiagramPlan {
  shapes?: DiagramPlanShape[];
  connectors?: DiagramPlanConnector[];
  territories?: DiagramPlanTerritory[];
}

export const XML_SCAFFOLD_PATTERN = /<scaffold\s+type=["'](?<type>\w+)["'](?<attrs>[^>]*)>(?<content>[\s\S]*?)<\/scaffold>/gi;
export const XML_ZONE_PATTERN = /<zone\s+name=["'](?<name>[^"']+)["'](?<attrs>[^>]*)>(?<content>[\s\S]*?)<\/zone>/gi;
export const XML_ATTR_PATTERN = /(?<key>\w+)=["'](?<val>[^"']+)["']/g;

export function parseXmlAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of (attrStr || "").matchAll(XML_ATTR_PATTERN)) {
    if (m.groups) {
      attrs[m.groups.key] = m.groups.val;
    }
  }
  return attrs;
}

export function parseXmlTags(responseText: string): {
  scaffolds: Array<{ type: string; attributes: Record<string, string>; content: string }>;
  zones: Array<{ name: string; attributes: Record<string, string>; content: string }>;
  cleaned_text: string;
} {
  const text = responseText || "";
  const scaffolds: Array<{ type: string; attributes: Record<string, string>; content: string }> = [];
  for (const m of text.matchAll(XML_SCAFFOLD_PATTERN)) {
    if (m.groups) {
      scaffolds.push({
        type: m.groups.type.toLowerCase(),
        attributes: parseXmlAttributes(m.groups.attrs),
        content: m.groups.content.trim(),
      });
    }
  }
  const zones: Array<{ name: string; attributes: Record<string, string>; content: string }> = [];
  for (const m of text.matchAll(XML_ZONE_PATTERN)) {
    if (m.groups) {
      zones.push({
        name: m.groups.name,
        attributes: parseXmlAttributes(m.groups.attrs),
        content: m.groups.content.trim(),
      });
    }
  }
  const cleanedText = text.replace(XML_SCAFFOLD_PATTERN, "").replace(XML_ZONE_PATTERN, "").trim();
  return { scaffolds, zones, cleaned_text: cleanedText };
}

export function enhanceSystemPromptWithXmlTools(basePrompt: string): string {
  const xmlGuidance = `
Advanced Layout Scaffolding:
You may emit spatial tags or align your coordinates using standard modes:
1. Flowchart: Left-to-right (horizontal step +240px) or top-to-bottom (vertical step +160px).
2. Tree: Hierarchy where child nodes branch outward from root node.
3. Grid: Organized matrix of components with regular row/col offsets.
4. Zones: Group logical subsystems inside bounding territories.
`;
  return basePrompt + "\n" + xmlGuidance;
}

export function snapToGrid(val: number, gridSize: number = 50): number {
  if (typeof val !== "number" || isNaN(val)) return 200;
  return Math.round(val / gridSize) * gridSize;
}

export function applyLayoutScaffolding(plan: DiagramPlan): DiagramPlan {
  if (!plan || !Array.isArray(plan.shapes)) return plan;

  const shapes = plan.shapes;
  const occupied = new Set<string>();

  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    let cx = typeof s.cx === "number" && !isNaN(s.cx) ? snapToGrid(s.cx) : 200 + (i % 5) * 240;
    let cy = typeof s.cy === "number" && !isNaN(s.cy) ? snapToGrid(s.cy) : 200 + Math.floor(i / 5) * 160;

    let key = `${cx}_${cy}`;
    while (occupied.has(key)) {
      cx = snapToGrid(cx + 240);
      key = `${cx}_${cy}`;
    }

    occupied.add(key);
    s.cx = cx;
    s.cy = cy;
  }

  if (Array.isArray(plan.territories)) {
    for (const t of plan.territories) {
      t.cx = typeof t.cx === "number" && !isNaN(t.cx) ? snapToGrid(t.cx) : 300;
      t.cy = typeof t.cy === "number" && !isNaN(t.cy) ? snapToGrid(t.cy) : 300;
      t.size = typeof t.size === "number" && !isNaN(t.size) ? Math.max(80, snapToGrid(t.size, 40)) : 240;
    }
  }

  return plan;
}

export const parse_xml_attributes = parseXmlAttributes;
export const parse_xml_tags = parseXmlTags;
export const snap_to_grid = snapToGrid;
export const apply_layout_scaffolding = applyLayoutScaffolding;
export const enhance_system_prompt_with_xml_tools = enhanceSystemPromptWithXmlTools;
