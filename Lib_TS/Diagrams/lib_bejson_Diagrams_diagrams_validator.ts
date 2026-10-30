/**
 * Library:         lib_bejson_Diagrams_diagrams_validator.ts
 * Family:          Diagrams
 * Module Purpose:  Validation and remediation algorithms for BEJSON Diagrammer MFDB models and 1.32 packages.
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         1.2.0
 * Release_Version: 300
 * Date:            2026-10-29
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   5c8d3e2a-1f7b-40a9-b6c8-2e9f1a7d4b60
 */

import { BEJSONDocument, ValidationResult } from "../Core/lib_bejson_Core_bejson_types";
import { bejson_core_get_field_map } from "../Core/lib_bejson_Core_bejson_field_map";
import { _emitError, _emitWarning, _makeResult } from "../Core/lib_bejson_Core_bejson_validators";
import {
  validateManifest,
  validateEntityFile,
  isMfdb132Package,
  validateMfdb132Package,
} from "../Core/lib_bejson_Core_mfdb_validators";
import {
  DIAGRAM_SCHEMA_TAG,
  KNOWN_SIZE_CLASSES,
  extractDiagramModelFromMfdb132,
} from "./lib_bejson_Diagrams_diagrams_core";
import { DIAGRAMS_ERROR_CODES as E } from "./lib_bejson_Diagrams_bejson_errors";

export interface DiagramModel {
  manifest: BEJSONDocument;
  boardDoc: BEJSONDocument;
  connectorDoc: BEJSONDocument;
  territoryDoc: BEJSONDocument;
  shapeDocs: Map<string, BEJSONDocument>; // entity_name -> BEJSONDocument
}

function _ensureParentHierarchyForCheck(doc: BEJSONDocument): BEJSONDocument {
  if ("Parent_Hierarchy" in doc) return doc;
  return { ...doc, Parent_Hierarchy: "../104a.mfdb.bejson" } as BEJSONDocument;
}

export function validateDiagramModel(model: DiagramModel): ValidationResult {
  const r = _makeResult();

  if (model.manifest) {
    const mRes = validateManifest(model.manifest);
    for (const err of mRes.errors) {
      _emitError(r, err.code, "[Manifest] " + err.message, err.field, err.recordIndex);
    }
  } else {
    _emitError(r, E.E_DIAGRAMS_MISSING_ENTITY, "Manifest is missing from DiagramModel.");
    return r;
  }

  if (model.boardDoc) {
    const bRes = validateEntityFile(_ensureParentHierarchyForCheck(model.boardDoc), { expectedEntityName: "Board" });
    for (const err of bRes.errors) {
      _emitError(r, err.code, "[Board Entity] " + err.message, err.field, err.recordIndex);
    }
  } else {
    _emitError(r, E.E_DIAGRAMS_MISSING_ENTITY, "Board entity is missing from DiagramModel.");
    return r;
  }

  if (model.connectorDoc) {
    const cRes = validateEntityFile(_ensureParentHierarchyForCheck(model.connectorDoc), { expectedEntityName: "Connector" });
    for (const err of cRes.errors) {
      _emitError(r, err.code, "[Connector Entity] " + err.message, err.field, err.recordIndex);
    }
  }

  if (model.territoryDoc) {
    const tRes = validateEntityFile(_ensureParentHierarchyForCheck(model.territoryDoc), { expectedEntityName: "Territory" });
    for (const err of tRes.errors) {
      _emitError(r, err.code, "[Territory Entity] " + err.message, err.field, err.recordIndex);
    }
  }

  const boardDoc = model.boardDoc;
  const bFm = bejson_core_get_field_map(boardDoc);
  const shapeIdIdx = bFm["shape_id"];
  const parentFkIdx = bFm["shape_parent_fk"];
  const entityNameIdx = bFm["shape_entity_name"];
  const sizeClassIdx = bFm["shape_size_class"];

  if (shapeIdIdx === undefined || entityNameIdx === undefined) {
    _emitError(r, E.E_DIAGRAMS_MISSING_FIELD, "Board entity missing required shape_id or shape_entity_name field.");
    return r;
  }

  const shapeIds = new Set<string>();
  const parentMap = new Map<string, string>();
  const knownSizes = new Set<string>(KNOWN_SIZE_CLASSES);

  for (let i = 0; i < (boardDoc.Values || []).length; i++) {
    const row = boardDoc.Values[i];
    const sid = String(row[shapeIdIdx]);
    const pid = parentFkIdx !== undefined && row[parentFkIdx] ? String(row[parentFkIdx]) : null;
    const ename = String(row[entityNameIdx]);
    const sc = sizeClassIdx !== undefined && row[sizeClassIdx] ? String(row[sizeClassIdx]) : null;

    if (shapeIds.has(sid)) {
      _emitError(r, E.E_DIAGRAMS_DUPLICATE_ID, `Duplicate shape_id '${sid}' in Board registry.`, "shape_id", i);
    }
    shapeIds.add(sid);

    if (sc && !knownSizes.has(sc)) {
      _emitWarning(r, E.E_DIAGRAMS_INVALID_SIZE_CLASS, `shape_size_class '${sc}' not in known set.`, "shape_size_class", i);
    }

    if (pid) {
      parentMap.set(sid, pid);
    }

    const shapeDoc = model.shapeDocs.get(ename);
    if (!shapeDoc) {
      _emitError(r, E.E_DIAGRAMS_SHAPE_NOT_FOUND, `Shape entity '${ename}' for shape_id '${sid}' is missing.`, "shape_entity_name", i);
    } else {
      const sFm = bejson_core_get_field_map(shapeDoc);
      const bmfkIdx = sFm["board_membership_fk"];
      if (bmfkIdx === undefined) {
        _emitError(r, E.E_DIAGRAMS_MISSING_FIELD, `Shape entity '${ename}' missing required board_membership_fk.`);
      } else if (shapeDoc.Values?.[0]?.[bmfkIdx] !== sid) {
        _emitError(r, E.E_DIAGRAMS_FK_UNRESOLVED, `Shape entity '${ename}' board_membership_fk does not match Board shape_id '${sid}'.`);
      }
    }
  }

  for (const [sid, pid] of parentMap.entries()) {
    if (!shapeIds.has(pid)) {
      _emitError(r, E.E_DIAGRAMS_FK_UNRESOLVED, `Shape '${sid}' references non-existent parent shape '${pid}'.`);
    }
  }

  for (const startId of parentMap.keys()) {
    let curr = startId;
    const visited = new Set<string>([curr]);
    while (parentMap.has(curr)) {
      curr = parentMap.get(curr)!;
      if (visited.has(curr)) {
        _emitError(r, E.E_DIAGRAMS_CIRCULAR_HIERARCHY, `Circular parent hierarchy detected involving shape '${curr}'.`);
        break;
      }
      visited.add(curr);
    }
  }

  const connDoc = model.connectorDoc;
  if (connDoc) {
    const cFm = bejson_core_get_field_map(connDoc);
    const fromIdx = cFm["conn_from_fk"];
    const toIdx = cFm["conn_to_fk"];

    for (let i = 0; i < (connDoc.Values || []).length; i++) {
      const row = connDoc.Values[i];
      const fromFk = String(row[fromIdx]);
      const toFk = String(row[toIdx]);

      if (!shapeIds.has(fromFk)) {
        _emitError(r, E.E_DIAGRAMS_FK_UNRESOLVED, `Connector from_fk '${fromFk}' does not exist on the board.`, "conn_from_fk", i);
      }
      if (!shapeIds.has(toFk)) {
        _emitError(r, E.E_DIAGRAMS_FK_UNRESOLVED, `Connector to_fk '${toFk}' does not exist on the board.`, "conn_to_fk", i);
      }
    }
  }

  return r;
}

export function remediateDiagramModel(model: DiagramModel): DiagramModel {
  if (!model.boardDoc || !model.boardDoc.Values) return model;

  const bFm = bejson_core_get_field_map(model.boardDoc);
  const shapeIdIdx = bFm["shape_id"];
  const parentFkIdx = bFm["shape_parent_fk"];

  if (shapeIdIdx === undefined) return model;

  const validShapeIds = new Set<string>();
  const seenShapeIds = new Set<string>();
  const filteredBoardRows: any[] = [];

  for (const row of model.boardDoc.Values) {
    const sid = String(row[shapeIdIdx]);
    if (!sid || seenShapeIds.has(sid)) continue;
    seenShapeIds.add(sid);
    validShapeIds.add(sid);
    filteredBoardRows.push(row);
  }
  model.boardDoc.Values = filteredBoardRows;

  if (parentFkIdx !== undefined) {
    for (const row of model.boardDoc.Values) {
      const pid = row[parentFkIdx] ? String(row[parentFkIdx]) : null;
      if (pid && !validShapeIds.has(pid)) {
        row[parentFkIdx] = null;
      }
    }
  }

  if (model.connectorDoc && model.connectorDoc.Values) {
    const cFm = bejson_core_get_field_map(model.connectorDoc);
    const fromIdx = cFm["conn_from_fk"];
    const toIdx = cFm["conn_to_fk"];
    if (fromIdx !== undefined && toIdx !== undefined) {
      model.connectorDoc.Values = model.connectorDoc.Values.filter((row) => {
        const fromFk = String(row[fromIdx]);
        const toFk = String(row[toIdx]);
        return validShapeIds.has(fromFk) && validShapeIds.has(toFk);
      });
    }
  }

  return model;
}

export function diagrams_validator_validate_package(doc: Record<string, any>): ValidationResult {
  const r = _makeResult();
  if (!isMfdb132Package(doc as any)) {
    _emitError(r, E.E_DIAGRAMS_NOT_MFDB132_PACKAGE, "Document is not a recognized MFDB-132 package.");
    return r;
  }
  const pkgCheck = validateMfdb132Package(doc as any);
  if (!pkgCheck.valid) {
    for (const e of pkgCheck.errors) {
      _emitError(r, E.E_DIAGRAMS_MFDB132_INVALID, e);
    }
    return r;
  }
  if (doc.Diagram_Schema && doc.Diagram_Schema !== DIAGRAM_SCHEMA_TAG) {
    _emitError(r, E.E_DIAGRAMS_NOT_A_DIAGRAM_PACKAGE, `Package Diagram_Schema != '${DIAGRAM_SCHEMA_TAG}'.`);
    return r;
  }
  try {
    extractDiagramModelFromMfdb132(doc as BEJSONDocument);
  } catch (err: any) {
    _emitError(r, err?.code || E.E_DIAGRAMS_VALIDATION_FAILED, err?.message || String(err));
  }
  return r;
}

export const validate_diagram_model = validateDiagramModel;
export const remediate_diagram_model = remediateDiagramModel;
