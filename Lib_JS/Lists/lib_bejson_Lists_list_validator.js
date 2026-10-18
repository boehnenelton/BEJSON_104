/**
 * Library:         lib_bejson_Lists_list_validator.js
 * Family:          Lists
 * Module Purpose:  Validates list/hierarchy-shaped documents (id/parent_id) on 104 or 104a, plus array-field homogeneity; the caller loads the document (often an MFDB entity file).
 * Architecture:    Format-level layer on Core's field map and structural validator. Reports every error with a Lists code (480-499, lib_bejson_Lists_bejson_errors.js). Does not orchestrate MFDB and is not specific to 104db.
 * Format_Scope:    104 | 104a (list-shaped documents)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         2.0.0
 * Release_Version: 300
 * Date:            2026-10-13
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   ce0cedbb-ac8e-435a-8668-53291e7b4749
 *
 * Changelog:
 *   2.0.0 (2026-10-13) - Moved from Core to the new Lists family (was lib_bejson_Core_bejson_list_validator.js
 *           1.2.4). ListValidator.validate -> bejson_lists_validate; validateListField ->
 *           bejson_lists_validate_field (now returns a result object like the PY/TS/SH ports instead of
 *           throwing). Global BEJSON_LIST_VALIDATOR -> BEJSON_LISTS.
 *           FIXES: (1) the 104 Core JS validator module exports NOTHING, so the old
 *           StandardValidator.bejson_validator_validate_string was undefined and validate() threw
 *           TypeError on every call -- structural validation now uses Core when it is exported and a local
 *           structural check otherwise (Core itself is frozen and untouched; see change-log); (2) stray ESM
 *           `export` lines inside a CommonJS file (SyntaxError under require()) removed; (3) only 104a was
 *           accepted -- now 104 and 104a, matching PY; (4) duplicate ids silently accepted, no cycle
 *           detection, no null-id check -- all added; (5) id 0 / false treated as "no parent"; (6) first
 *           error only -- every error reported; (7) accepts a JSON string or a parsed document.
 *   1.2.4 - Last Core version.
 */

'use strict';

const _isNode = (typeof require !== 'undefined');
const _core = _isNode ? require('../Core/lib_bejson_Core_bejson_core.js') : (window.BEJSON || {});
const _validator = _isNode ? require('../Core/lib_bejson_Core_bejson_validator.js') : (window.BEJSON_VALIDATOR || {});
const LISTS_ERRORS = _isNode ? require('./lib_bejson_Lists_bejson_errors.js') : (window.LISTS_ERRORS || {});

const SUPPORTED_VERSIONS = ['104', '104a'];
const FIELD_TYPES = ['string', 'number', 'integer', 'boolean', 'object'];

function _isRootRef(pid) {
  return pid === null || pid === undefined || pid === '';
}

/**
 * Local structural check, used only when Core's validator module is not usable (the 104 Core JS validator
 * has no exports). Mirrors the 104/104a rules Core enforces: mandatory keys, Format, Fields shape,
 * unique field names, every row exactly Fields.length cells.
 * @returns {string[]} messages (empty when structurally valid)
 */
function _localStructureErrors(doc) {
  const out = [];
  for (const k of ['Format', 'Format_Version', 'Format_Creator', 'Records_Type', 'Fields', 'Values']) {
    if (!(k in doc)) out.push(`Missing mandatory key: '${k}'`);
  }
  if (out.length) return out;
  if (doc.Format !== 'BEJSON') out.push(`Invalid Format: '${doc.Format}'`);
  if (!Array.isArray(doc.Records_Type)) out.push("Invalid 'Records_Type': must be an array");
  if (!Array.isArray(doc.Fields)) out.push("Invalid 'Fields': must be an array");
  if (!Array.isArray(doc.Values)) out.push("Invalid 'Values': must be an array");
  if (out.length) return out;
  const seen = new Set();
  doc.Fields.forEach((f, i) => {
    if (!f || typeof f.name !== 'string' || typeof f.type !== 'string') out.push(`Fields[${i}] needs string name and type`);
    else if (seen.has(f.name)) out.push(`Duplicate field name: '${f.name}'`);
    else seen.add(f.name);
  });
  doc.Values.forEach((row, i) => {
    if (!Array.isArray(row)) out.push(`Values[${i}] must be an array`);
    else if (row.length !== doc.Fields.length) out.push(`Values[${i}] has ${row.length} cells, expected ${doc.Fields.length}`);
  });
  return out;
}

function _structureErrors(doc, text) {
  if (typeof _validator.bejson_validator_validate_string === 'function') {
    try {
      _validator.bejson_validator_validate_string(text);
      return [];
    } catch (e) {
      const msgs = (typeof _validator.bejson_validator_get_errors === 'function' ? _validator.bejson_validator_get_errors() : [])
        .map(x => (typeof x === 'string' ? x : (x && x.message) || String(x)));
      return msgs.length ? msgs : [e.message];
    }
  }
  return _localStructureErrors(doc);
}

/**
 * Validate a hierarchical list document.
 * @param {string|object} input JSON string or already-parsed BEJSON document.
 * @returns {{is_valid:boolean, errors:string[], error_codes:number[], stats?:object}}
 */
function bejson_lists_validate(input) {
  const errors = [];
  const codes = [];
  const fail = (code, msg) => { codes.push(code); errors.push(msg); };
  const result = () => ({ is_valid: errors.length === 0, errors, error_codes: codes });

  let doc;
  let text;
  if (typeof input === 'string') {
    text = input;
    try { doc = JSON.parse(text); } catch (e) {
      fail(LISTS_ERRORS.E_LISTS_STRUCTURE_INVALID, `Malformed JSON: ${e.message}`);
      return result();
    }
  } else if (input && typeof input === 'object' && !Array.isArray(input)) {
    doc = input;
    text = JSON.stringify(input);
  } else {
    fail(LISTS_ERRORS.E_LISTS_STRUCTURE_INVALID, 'Input must be a JSON string or a document object.');
    return result();
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    fail(LISTS_ERRORS.E_LISTS_STRUCTURE_INVALID, 'Document root must be an object.');
    return result();
  }

  // 1. Structural validation
  const structural = _structureErrors(doc, text);
  if (structural.length) {
    structural.forEach(m => fail(LISTS_ERRORS.E_LISTS_STRUCTURE_INVALID, m));
    return result();
  }

  // 2. Format version
  if (!SUPPORTED_VERSIONS.includes(doc.Format_Version)) {
    fail(LISTS_ERRORS.E_LISTS_INVALID_VERSION, `Lists require Format_Version 104 or 104a; got ${doc.Format_Version}.`);
    return result();
  }

  // 3. Core list fields via the field-map cache
  const fm = _core.bejson_core_get_field_map(doc);
  const idIdx = fm.id;
  const pidIdx = fm.parent_id;
  if (idIdx === undefined || pidIdx === undefined) {
    fail(LISTS_ERRORS.E_LISTS_MISSING_FIELDS, 'Missing core list fields: id, parent_id');
    return result();
  }
  const need = Math.max(idIdx, pidIdx) + 1;

  // 4. Per-row checks
  const ids = new Set();
  const parentRefs = new Map();
  doc.Values.forEach((row, i) => {
    if (row.length < need) {
      fail(LISTS_ERRORS.E_LISTS_SHORT_ROW, `Row ${i} too short (${row.length} cells, need ${need}).`);
      return;
    }
    const uid = row[idIdx];
    const pid = row[pidIdx];
    if (uid === null || uid === undefined) {
      fail(LISTS_ERRORS.E_LISTS_NULL_ID, `Row ${i} has null id.`);
      return;
    }
    if (typeof uid === 'object' || (typeof pid === 'object' && pid !== null)) {
      fail(LISTS_ERRORS.E_LISTS_NULL_ID, `Row ${i} has a non-scalar id or parent_id.`);
      return;
    }
    if (ids.has(uid)) {
      fail(LISTS_ERRORS.E_LISTS_DUPLICATE_ID, `Duplicate ID detected: ${uid}`);
      return;
    }
    ids.add(uid);
    if (!_isRootRef(pid)) parentRefs.set(uid, pid);
  });

  // 5. Orphans
  for (const [uid, pid] of parentRefs) {
    if (!ids.has(pid)) fail(LISTS_ERRORS.E_LISTS_ORPHAN, `Orphan detected: ${uid} -> ${pid}`);
  }

  // 6. Cycles (iterative; each cycle reported once, with its path)
  const state = new Map(); // 1 = on current path, 2 = done
  for (const start of parentRefs.keys()) {
    if (state.has(start)) continue;
    const path = [];
    let cur = start;
    while (parentRefs.has(cur) && !state.has(cur)) {
      state.set(cur, 1);
      path.push(cur);
      cur = parentRefs.get(cur);
    }
    if (state.get(cur) === 1) {
      const loop = path.slice(path.indexOf(cur)).concat([cur]);
      fail(LISTS_ERRORS.E_LISTS_CYCLE, `Circular dependency: ${loop.join(' -> ')}`);
    }
    path.forEach(n => state.set(n, 2));
  }

  const out = result();
  if (out.is_valid) {
    const depth = new Map();
    let maxDepth = 0;
    for (const n of ids) {
      const chain = [];
      let cur = n;
      while (parentRefs.has(cur) && !depth.has(cur)) { chain.push(cur); cur = parentRefs.get(cur); }
      const base = depth.get(cur) || 0;
      for (let k = chain.length - 1, step = 1; k >= 0; k--, step++) depth.set(chain[k], base + step);
      maxDepth = Math.max(maxDepth, depth.get(n) || 0);
    }
    out.stats = { item_count: ids.size, root_count: ids.size - parentRefs.size, max_depth: maxDepth };
  }
  return out;
}

function _typeOk(item, allowed) {
  if (allowed === 'integer') return typeof item === 'number' && Number.isInteger(item);
  if (allowed === 'object') return item !== null && typeof item === 'object' && !Array.isArray(item);
  return typeof item === allowed;
}

/**
 * Array-field homogeneity: every non-null cell of `fieldName` must be an array whose elements all match
 * `allowedType` (string | number | integer | boolean | object). Works on 104 / 104a documents.
 * @returns {{is_valid:boolean, errors:string[], error_codes:number[]}}
 */
function bejson_lists_validate_field(doc, fieldName, allowedType) {
  const errors = [];
  const codes = [];
  const fail = (code, msg) => { codes.push(code); errors.push(msg); };
  const result = () => ({ is_valid: errors.length === 0, errors, error_codes: codes });

  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.Fields) || !Array.isArray(doc.Values)) {
    fail(LISTS_ERRORS.E_LISTS_STRUCTURE_INVALID, 'Document must be an object with Fields and Values arrays.');
    return result();
  }
  if (!FIELD_TYPES.includes(allowedType)) {
    fail(LISTS_ERRORS.E_LISTS_STRUCTURE_INVALID, `allowedType must be one of ${FIELD_TYPES.join(', ')}; got '${allowedType}'.`);
    return result();
  }
  const idx = _core.bejson_core_get_field_map(doc)[fieldName];
  if (idx === undefined) {
    fail(LISTS_ERRORS.E_LISTS_FIELD_NOT_FOUND, `Field '${fieldName}' not found in document.`);
    return result();
  }
  doc.Values.forEach((row, r) => {
    if (row.length <= idx) {
      fail(LISTS_ERRORS.E_LISTS_SHORT_ROW, `Row ${r} too short for field '${fieldName}'.`);
      return;
    }
    const val = row[idx];
    if (val === null || val === undefined) return;
    if (!Array.isArray(val)) {
      fail(LISTS_ERRORS.E_LISTS_FIELD_NOT_ARRAY, `Row ${r}: field '${fieldName}' must be an array.`);
      return;
    }
    val.forEach((item, k) => {
      if (!_typeOk(item, allowedType)) {
        fail(LISTS_ERRORS.E_LISTS_ITEM_TYPE_MISMATCH,
          `Row ${r} list item ${k} type mismatch: expected '${allowedType}', got '${item === null ? 'null' : typeof item}'.`);
      }
    });
  });
  return result();
}

const ListsExports = { bejson_lists_validate, bejson_lists_validate_field, SUPPORTED_VERSIONS, FIELD_TYPES };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ListsExports;
}
if (typeof window !== 'undefined') {
  window.BEJSON_LISTS = window.BEJSON_LISTS || {};
  Object.assign(window.BEJSON_LISTS, ListsExports);
}
