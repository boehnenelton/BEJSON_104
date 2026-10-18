/**
 * Library:         lib_bejson_Lists_list_validator.ts
 * Family:          Lists
 * Module Purpose:  Validates list/hierarchy-shaped documents (id/parent_id) on 104 or 104a, plus array-field homogeneity; the caller loads the document (often an MFDB entity file).
 * Architecture:    Format-level layer on Core's structural validator and field map. Reports every error with a Lists code (480-499, lib_bejson_Lists_bejson_errors.ts). Does not orchestrate MFDB and is not specific to 104db.
 * Format_Scope:    104 | 104a (list-shaped documents)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         2.0.0
 * Release_Version: 300
 * Date:            2026-10-13
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   e70b1a3a-101b-4f8c-926c-7f942bf1e2cc
 *
 * Changelog:
 *   2.0.0 (2026-10-13) - Moved from Core to the new Lists family (was lib_bejson_Core_bejson_list_validator.ts
 *           1.2.4). validateList() -> bejsonListsValidate(); the array-homogeneity check that existed only in
 *           JS is now bejsonListsValidateField() here too (parity). FIXES: duplicate id and cycle errors were
 *           filed under unrelated Core codes (DUPLICATE_FIELD_NAME=6, VERSION_CONSTRAINT=4), null ids under
 *           VALUE_TYPE_MISMATCH(8), missing fields under MISSING_MANDATORY_KEY(2) -- all now have their own
 *           Lists codes (480-490); cycle was reported once per member, now once per cycle with its path; id 0 /
 *           false no longer treated as "no parent"; short rows reported instead of reading undefined; only
 *           104a was accepted -- now 104 and 104a, matching PY; accepts a JSON string or a parsed document;
 *           stats {item_count, root_count, max_depth} returned when valid.
 *   1.2.4 - Last Core version.
 */

import { validateDocument } from "../Core/lib_bejson_Core_bejson_validators";
import { bejson_core_get_field_index } from "../Core/lib_bejson_Core_bejson_field_map";
import { BEJSONDocument, ValidationResult } from "../Core/lib_bejson_Core_bejson_types";
import { LISTS_ERRORS as C } from "./lib_bejson_Lists_bejson_errors";

export const LISTS_SUPPORTED_VERSIONS = ["104", "104a"] as const;
export const LISTS_FIELD_TYPES = ["string", "number", "integer", "boolean", "object"] as const;
export type ListsFieldType = typeof LISTS_FIELD_TYPES[number];

export interface ListsStats {
  item_count: number;
  root_count: number;
  max_depth: number;
}

export interface ListsResult extends ValidationResult {
  stats?: ListsStats;
}

const isRootRef = (pid: unknown): boolean => pid === null || pid === undefined || pid === "";

function newResult(): ListsResult {
  return { valid: true, errors: [], warnings: [] };
}

function failer(result: ListsResult) {
  return (code: number, message: string, recordIndex?: number): void => {
    result.valid = false;
    result.errors.push(recordIndex === undefined ? { code, message } : { code, message, recordIndex });
  };
}

/**
 * Validate a hierarchical list document.
 * @param input JSON string or already-parsed BEJSON document.
 */
export function bejsonListsValidate(input: string | BEJSONDocument): ListsResult {
  const result = newResult();
  const fail = failer(result);

  let doc: BEJSONDocument;
  if (typeof input === "string") {
    try {
      doc = JSON.parse(input);
    } catch (e) {
      fail(C.E_LISTS_STRUCTURE_INVALID, `Malformed JSON: ${(e as Error).message}`);
      return result;
    }
  } else {
    doc = input;
  }

  // 1. Structural validation (Core)
  const structural = validateDocument(doc);
  if (!structural.valid) {
    structural.errors.forEach((e) => fail(C.E_LISTS_STRUCTURE_INVALID, e.message, e.recordIndex));
    return result;
  }

  // 2. Format version
  if (!(LISTS_SUPPORTED_VERSIONS as readonly string[]).includes(doc.Format_Version)) {
    fail(C.E_LISTS_INVALID_VERSION, `Lists require Format_Version 104 or 104a; got ${doc.Format_Version}.`);
    return result;
  }

  // 3. Core list fields via the field-map cache
  const idIdx = bejson_core_get_field_index(doc, "id");
  const pidIdx = bejson_core_get_field_index(doc, "parent_id");
  if (idIdx === -1 || pidIdx === -1) {
    fail(C.E_LISTS_MISSING_FIELDS, "Missing core list fields: id, parent_id");
    return result;
  }
  const need = Math.max(idIdx, pidIdx) + 1;

  // 4. Per-row checks
  const ids = new Set<unknown>();
  const parentRefs = new Map<unknown, unknown>();
  (doc.Values as unknown[][]).forEach((row, i) => {
    if (row.length < need) {
      fail(C.E_LISTS_SHORT_ROW, `Row ${i} too short (${row.length} cells, need ${need}).`, i);
      return;
    }
    const uid = row[idIdx];
    const pid = row[pidIdx];
    if (uid === null || uid === undefined) {
      fail(C.E_LISTS_NULL_ID, `Row ${i} has null id.`, i);
      return;
    }
    if (typeof uid === "object" || (typeof pid === "object" && pid !== null)) {
      fail(C.E_LISTS_NULL_ID, `Row ${i} has a non-scalar id or parent_id.`, i);
      return;
    }
    if (ids.has(uid)) {
      fail(C.E_LISTS_DUPLICATE_ID, `Duplicate ID detected: ${String(uid)}`, i);
      return;
    }
    ids.add(uid);
    if (!isRootRef(pid)) parentRefs.set(uid, pid);
  });

  // 5. Orphans
  for (const [uid, pid] of parentRefs) {
    if (!ids.has(pid)) fail(C.E_LISTS_ORPHAN, `Orphan detected: ${String(uid)} -> ${String(pid)}`);
  }

  // 6. Cycles (iterative; each cycle reported once, with its path)
  const state = new Map<unknown, number>(); // 1 = on current path, 2 = done
  for (const start of parentRefs.keys()) {
    if (state.has(start)) continue;
    const path: unknown[] = [];
    let cur: unknown = start;
    while (parentRefs.has(cur) && !state.has(cur)) {
      state.set(cur, 1);
      path.push(cur);
      cur = parentRefs.get(cur);
    }
    if (state.get(cur) === 1) {
      const loop = path.slice(path.indexOf(cur)).concat([cur]);
      fail(C.E_LISTS_CYCLE, `Circular dependency: ${loop.map(String).join(" -> ")}`);
    }
    path.forEach((n) => state.set(n, 2));
  }

  if (result.valid) {
    const depth = new Map<unknown, number>();
    let maxDepth = 0;
    for (const n of ids) {
      const chain: unknown[] = [];
      let cur: unknown = n;
      while (parentRefs.has(cur) && !depth.has(cur)) {
        chain.push(cur);
        cur = parentRefs.get(cur);
      }
      const base = depth.get(cur) ?? 0;
      for (let k = chain.length - 1, step = 1; k >= 0; k--, step++) depth.set(chain[k], base + step);
      maxDepth = Math.max(maxDepth, depth.get(n) ?? 0);
    }
    result.stats = { item_count: ids.size, root_count: ids.size - parentRefs.size, max_depth: maxDepth };
  }
  return result;
}

function typeOk(item: unknown, allowed: ListsFieldType): boolean {
  if (allowed === "integer") return typeof item === "number" && Number.isInteger(item);
  if (allowed === "object") return item !== null && typeof item === "object" && !Array.isArray(item);
  return typeof item === allowed;
}

/**
 * Array-field homogeneity: every non-null cell of `fieldName` must be an array whose elements all match
 * `allowedType`. Works on 104 / 104a documents.
 */
export function bejsonListsValidateField(
  doc: BEJSONDocument,
  fieldName: string,
  allowedType: ListsFieldType,
): ListsResult {
  const result = newResult();
  const fail = failer(result);

  if (!doc || !Array.isArray(doc.Fields) || !Array.isArray(doc.Values)) {
    fail(C.E_LISTS_STRUCTURE_INVALID, "Document must be an object with Fields and Values arrays.");
    return result;
  }
  if (!(LISTS_FIELD_TYPES as readonly string[]).includes(allowedType)) {
    fail(C.E_LISTS_STRUCTURE_INVALID,
      `allowedType must be one of ${LISTS_FIELD_TYPES.join(", ")}; got '${String(allowedType)}'.`);
    return result;
  }
  const idx = bejson_core_get_field_index(doc, fieldName);
  if (idx === -1) {
    fail(C.E_LISTS_FIELD_NOT_FOUND, `Field '${fieldName}' not found in document.`);
    return result;
  }
  (doc.Values as unknown[][]).forEach((row, r) => {
    if (row.length <= idx) {
      fail(C.E_LISTS_SHORT_ROW, `Row ${r} too short for field '${fieldName}'.`, r);
      return;
    }
    const val = row[idx];
    if (val === null || val === undefined) return;
    if (!Array.isArray(val)) {
      fail(C.E_LISTS_FIELD_NOT_ARRAY, `Row ${r}: field '${fieldName}' must be an array.`, r);
      return;
    }
    val.forEach((item, k) => {
      if (!typeOk(item, allowedType)) {
        fail(C.E_LISTS_ITEM_TYPE_MISMATCH,
          `Row ${r} list item ${k} type mismatch: expected '${allowedType}', got '${item === null ? "null" : typeof item}'.`, r);
      }
    });
  });
  return result;
}
