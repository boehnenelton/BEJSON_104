/**
 * Library:         lib_bejson_Diagrams_diagrams_core.ts
 * Family:          Diagrams
 * Module Purpose:  Core packaging, model serialization, and schema constants for the Diagrams family.
 * Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
 * Version:         1.2.0
 * Release_Version: 300
 * Date:            2026-10-29
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   4d9e2a1c-8b7f-4c56-9a0d-3f8e1b2a7c50
 */

import { BEJSONDocument, BEJSONField } from "../Core/lib_bejson_Core_bejson_types";
import { bejson_core_get_field_map, bejson_core_get_field_index } from "../Core/lib_bejson_Core_bejson_field_map";
import { DiagramModel, validateDiagramModel } from "./lib_bejson_Diagrams_diagrams_validator";
import { DiagramsError, DIAGRAMS_ERROR_CODES as E } from "./lib_bejson_Diagrams_bejson_errors";

export const BOARD_BASE_FIELDS: BEJSONField[] = [
  { name: "shape_id",          type: "string" },
  { name: "shape_entity_name", type: "string" },
  { name: "shape_cx",          type: "number" },
  { name: "shape_cy",          type: "number" },
  { name: "shape_size_class",  type: "string" },
  { name: "shape_kind",        type: "string" },
  { name: "shape_parent_fk",   type: "string" },
  { name: "shape_collapsed",   type: "boolean" },
];

export const CONNECTOR_BASE_FIELDS: BEJSONField[] = [
  { name: "conn_id",      type: "string" },
  { name: "conn_from_fk", type: "string" },
  { name: "conn_to_fk",   type: "string" },
  { name: "conn_flow",    type: "string" },
];

export const TERRITORY_BASE_FIELDS: BEJSONField[] = [
  { name: "terr_id",    type: "string" },
  { name: "terr_kind",  type: "string" },
  { name: "terr_cx",    type: "number" },
  { name: "terr_cy",    type: "number" },
  { name: "terr_size",  type: "number" },
  { name: "terr_label", type: "string" },
  { name: "terr_color", type: "string" },
];

export const SHAPE_BASE_FIELDS: BEJSONField[] = [
  { name: "board_membership_fk", type: "string" },
  { name: "shape_label",         type: "string" },
  { name: "shape_color",         type: "string" },
  { name: "shape_font_color",    type: "string" },
  { name: "shape_text",          type: "string" },
];

export const KNOWN_SIZE_CLASSES = ["small", "medium", "large", "huge"] as const;
export const KNOWN_SHAPE_KINDS = ["rect", "circle"] as const;
export const KNOWN_FLOW_VALUES = ["forward", "backward", "bidirectional", "none"] as const;

export const DIAGRAM_SCHEMA_TAG = "BEJSON-Diagram-1";

export const CHUNKED_104_FIELDS: BEJSONField[] = [
  { name: "File_Name",      type: "string" },
  { name: "File_Extension", type: "string" },
  { name: "File_Content",   type: "string" },
  { name: "File_Version",   type: "string" },
  { name: "File_Hash",      type: "string" },
  { name: "Relative_Path",  type: "string" },
  { name: "Is_Binary",      type: "boolean" },
  { name: "Is_Mounted",     type: "boolean" },
];

function _cleanDocForJson(doc: BEJSONDocument, ensureParentHierarchy: boolean = false): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (!k.startsWith("_")) {
      cleaned[k] = v;
    }
  }
  if (ensureParentHierarchy && !("Parent_Hierarchy" in cleaned)) {
    cleaned.Parent_Hierarchy = "../104a.mfdb.bejson";
  }
  return cleaned;
}

/**
 * Creates a single-file MFDB 1.32 package document from a DiagramModel.
 */
export function createMfdb132PackageFromModel(model: DiagramModel, dbName: string): BEJSONDocument {
  const valResult = validateDiagramModel(model);
  if (!valResult.valid) {
    const msgs = valResult.errors.map(e => e.message).join("; ");
    throw new DiagramsError(`Diagram validation failed: ${msgs}`, E.E_DIAGRAMS_VALIDATION_FAILED, valResult.errors);
  }

  const values: any[][] = [];

  values.push([
    "104a.mfdb.bejson",
    ".bejson",
    JSON.stringify(_cleanDocForJson(model.manifest, false), null, 2),
    "1.32",
    "",
    "104a.mfdb.bejson",
    false,
    false
  ]);

  values.push([
    "board.bejson",
    ".bejson",
    JSON.stringify(_cleanDocForJson(model.boardDoc, true), null, 2),
    "1.0.0",
    "",
    "data/board.bejson",
    false,
    false
  ]);

  values.push([
    "connector.bejson",
    ".bejson",
    JSON.stringify(_cleanDocForJson(model.connectorDoc, true), null, 2),
    "1.0.0",
    "",
    "data/connector.bejson",
    false,
    false
  ]);

  values.push([
    "territory.bejson",
    ".bejson",
    JSON.stringify(_cleanDocForJson(model.territoryDoc, true), null, 2),
    "1.0.0",
    "",
    "data/territory.bejson",
    false,
    false
  ]);

  for (const [entityName, shapeDoc] of model.shapeDocs.entries()) {
    values.push([
      `${entityName.toLowerCase()}.bejson`,
      ".bejson",
      JSON.stringify(_cleanDocForJson(shapeDoc, true), null, 2),
      "1.0.0",
      "",
      `data/${entityName.toLowerCase()}.bejson`,
      false,
      false
    ]);
  }

  return {
    Format: "BEJSON",
    Format_Version: "104a",
    Format_Creator: "Elton Boehnen",
    Schema_Name: "MFDB-132",
    Schema_Version: "1.32",
    Schema_Description: "MFDB 1.32 single-file diagram package.",
    Chunk_Date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Session_Is_Mounted: false,
    Mount_Path: "",
    Package_Version: "1",
    MFDB_Version: String((model.manifest as any).MFDB_Version || "1.32"),
    DB_Name: dbName,
    Package_Format: "MFDB-Chunked-104a",
    Diagram_Schema: DIAGRAM_SCHEMA_TAG,
    Records_Type: ["MFDB-132"],
    Fields: CHUNKED_104_FIELDS,
    Values: values,
  } as unknown as BEJSONDocument;
}

/**
 * Extracts a DiagramModel from a single-file MFDB 1.32 package document
 * using Core's O(1) Field-Map Cache.
 */
export function extractDiagramModelFromMfdb132(chunkDoc: BEJSONDocument): DiagramModel {
  const fm = bejson_core_get_field_map(chunkDoc);
  const relIdx = fm["Relative_Path"];
  const contentIdx = fm["File_Content"];
  if (relIdx === undefined || contentIdx === undefined) {
    throw new DiagramsError("Corrupted MFDB-132 diagram package: missing Relative_Path or File_Content field.", E.E_DIAGRAMS_IMPORT_FAILED);
  }

  let manifest: BEJSONDocument | null = null;
  let boardDoc: BEJSONDocument | null = null;
  let connectorDoc: BEJSONDocument | null = null;
  let territoryDoc: BEJSONDocument | null = null;
  const shapeDocs = new Map<string, BEJSONDocument>();

  for (const row of chunkDoc.Values || []) {
    const relPath = String(row[relIdx] ?? "");
    const content = String(row[contentIdx] ?? "");
    if (!relPath || !content) continue;

    const doc = JSON.parse(content) as BEJSONDocument;
    if (relPath === "104a.mfdb.bejson") {
      manifest = doc;
    } else if (relPath.includes("board.bejson")) {
      boardDoc = doc;
    } else if (relPath.includes("connector.bejson")) {
      connectorDoc = doc;
    } else if (relPath.includes("territory.bejson")) {
      territoryDoc = doc;
    } else if (doc.Records_Type && doc.Records_Type[0]?.startsWith("Shape_")) {
      shapeDocs.set(doc.Records_Type[0], doc);
    }
  }

  if (!manifest || !boardDoc) {
    throw new DiagramsError("Corrupted or incomplete MFDB-132 diagram package: manifest or board missing.", E.E_DIAGRAMS_IMPORT_FAILED);
  }

  const model: DiagramModel = {
    manifest,
    boardDoc,
    connectorDoc: connectorDoc || ({
      Format: "BEJSON", Format_Version: "104", Format_Creator: "Elton Boehnen",
      Parent_Hierarchy: "../104a.mfdb.bejson",
      Records_Type: ["Connector"], Fields: CONNECTOR_BASE_FIELDS, Values: []
    } as unknown as BEJSONDocument),
    territoryDoc: territoryDoc || ({
      Format: "BEJSON", Format_Version: "104", Format_Creator: "Elton Boehnen",
      Parent_Hierarchy: "../104a.mfdb.bejson",
      Records_Type: ["Territory"], Fields: TERRITORY_BASE_FIELDS, Values: []
    } as unknown as BEJSONDocument),
    shapeDocs,
  };

  const valResult = validateDiagramModel(model);
  if (!valResult.valid) {
    const msgs = valResult.errors.map(e => e.message).join("; ");
    throw new DiagramsError(`Imported package validation failed: ${msgs}`, E.E_DIAGRAMS_VALIDATION_FAILED, valResult.errors);
  }

  return model;
}

export function diagrams_core_find_row_by_field(doc: BEJSONDocument, fieldName: string, value: unknown): unknown[] | null {
  const idx = bejson_core_get_field_index(doc, fieldName);
  if (idx < 0) return null;
  for (const row of doc.Values || []) {
    if (row[idx] === value) return row;
  }
  return null;
}

export const diagrams_core_create_mfdb132_package_from_model = createMfdb132PackageFromModel;
export const diagrams_core_extract_diagram_model_from_mfdb132 = extractDiagramModelFromMfdb132;
