/**
 * Library:         lib_bejson_Core_bejson_list_validator.ts
 * Family:          Core
 * Module Purpose:  Validates list/hierarchy-shaped documents (id/parent_id) on 104 or 104a; the caller loads the document (often an MFDB entity file).
 * Architecture:    Format-level BEJSON layer that works on any BEJSON document (104, 104a, 104db) through positional Fields/Values and the field-map cache. It does not orchestrate MFDB and is not specific to 104db.
 * Format_Scope:    104 | 104a | 104db (generic)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         1.2.4
 * Release_Version: 300
 * Date:            2026-10-02
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   e6f1e7a2-bc71-44d4-af34-5bf0f45b29b2
 */

import { validateDocument } from "./lib_bejson_Core_bejson_validators";
import { BEJSONDocument, ValidationResult, BEJSON_VALIDATION_CODES as E } from "./lib_bejson_Core_bejson_types";

/**
 * Validates a list/hierarchy-shaped document (id / parent_id rows): standard BEJSON structure first, then required id fields, resolvable parent references and no cycles. Valid for 104 and 104a documents (for an MFDB, an entity file the caller loaded).
 */
/**
 * Validates a Hierarchical List (BEJSON 104a with id and parent_id fields).
 * Ensures no orphans exist and structure follows positional integrity.
 */
export function validateList(jsonString: string): ValidationResult {
  // Parse once; a malformed jsonString returns a ValidationResult error instead of throwing JSON.parse's SyntaxError.
  let doc: BEJSONDocument;
  try {
    doc = JSON.parse(jsonString);
  } catch (e) {
    return {
      valid: false,
      errors: [{ code: E.INVALID_JSON, message: `Malformed JSON: ${(e as Error).message}` }],
      warnings: []
    };
  }

  const result = validateDocument(doc);
  if (!result.valid) return result;

  if (doc.Format_Version !== "104a") {
    result.valid = false;
    result.errors.push({
      code: E.VERSION_CONSTRAINT,
      message: "Hierarchical List must be BEJSON 104a."
    });
    return result;
  }

  const idIdx = doc.Fields.findIndex(f => f.name === "id");
  const pidIdx = doc.Fields.findIndex(f => f.name === "parent_id");

  if (idIdx === -1 || pidIdx === -1) {
    result.valid = false;
    result.errors.push({
      code: E.MISSING_MANDATORY_KEY,
      message: "Hierarchical List requires 'id' and 'parent_id' fields."
    });
    return result;
  }

  const ids = new Set<any>();
  const parentRefs = new Map<any, any>();

  for (let i = 0; i < doc.Values.length; i++) {
    const row = doc.Values[i];
    const id = row[idIdx];
    const pid = row[pidIdx];

    if (id === null || id === undefined) {
      result.valid = false;
      result.errors.push({
        code: E.VALUE_TYPE_MISMATCH,
        message: `Row ${i} has null or undefined id.`,
        recordIndex: i
      });
      continue;
    }

    if (ids.has(id)) {
      result.valid = false;
      result.errors.push({
        code: E.DUPLICATE_FIELD_NAME, // Using duplicate field name code for duplicate IDs
        message: `Duplicate ID detected: ${id}`,
        recordIndex: i
      });
    }
    ids.add(id);

    if (pid !== null && pid !== undefined && pid !== "") {
      parentRefs.set(id, pid);
    }
  }

  // Orphan Detection
  for (const [uid, pid] of parentRefs.entries()) {
    if (!ids.has(pid)) {
      result.valid = false;
      result.errors.push({
        code: E.MFDB_FK_UNRESOLVED,
        message: `Orphan detected: Record ${uid} references non-existent parent ${pid}.`
      });
    }
  }

  // Cycle Detection (Bonus for TS implementation)
  for (const startId of parentRefs.keys()) {
    let currentId = startId;
    const visited = new Set([currentId]);
    while (parentRefs.has(currentId)) {
      currentId = parentRefs.get(currentId);
      if (visited.has(currentId)) {
        result.valid = false;
        result.errors.push({
          code: E.VERSION_CONSTRAINT,
          message: `Cycle detected in hierarchy involving ID: ${currentId}`
        });
        break;
      }
      visited.add(currentId);
    }
  }

  return result;
}