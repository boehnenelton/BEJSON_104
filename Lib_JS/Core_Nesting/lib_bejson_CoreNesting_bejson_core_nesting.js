/**
 * Library:         lib_bejson_CoreNesting_bejson_core_nesting.js
 * Family:          Core_Nesting
 * Module Purpose:  Nested-104 detection, validation, field-map cache and safe mutation (append-only schema, null-padding).
 * Architecture:    Nested BEJSON 104: a cell of a parent 104 document holds a complete embedded 104 document; the physical cell coordinate (NestAddress) is the implicit foreign key. It is neither 104db nor MFDB.
 * Format_Scope:    Nested 104 (NOT 104db, NOT MFDB)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         0.4.5
 * Release_Version: 300
 * Date:            2026-10-02
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   7b33b477-22ea-481d-ad0d-7c3920253b7e
 */

"use strict";

const NESTING_ERRORS = (typeof require !== 'undefined')
  ? require('./lib_bejson_CoreNesting_bejson_errors.js')
  : (window.NESTING_ERRORS || {});

const VERSION          = "0.4.1";
const NESTING_MAX_DEPTH = 16;
const _VALID_VERSION   = "104";

const _MANDATORY_KEYS = new Set(
  ["Format", "Format_Version", "Format_Creator", "Records_Type", "Fields", "Values"]
);

// ===========================================================================
// NestMap cache
// Key: "<parentFingerprint>:<row>:<col>:<depth>"  →  NestedCell
// ===========================================================================
/** @type {Map<string, object>} */
const _NEST_MAP = new Map();

/**
 * Builds the NestMap cache key 'fingerprint:row:col:depth' for a NestAddress.
 */
/** @param {string} fingerprint @param {number} row @param {number} col @param {number} depth */
function _addrKey(fingerprint, row, col, depth) { return `${fingerprint}:${row}:${col}:${depth}`; }

/**
 * Returns the cached NestedCell for (parentFingerprint, row, col, depth), or undefined.
 */
/**
 * O(1) NestMap lookup by full 4-part address. Returns null on miss.
 * @param {string} parentFingerprint @param {number} row @param {number} col @param {number} depth
 * @returns {object|null}
 */
function bejsonNestingCacheGet(parentFingerprint, row, col, depth) {
  return _NEST_MAP.get(_addrKey(parentFingerprint, row, col, depth)) ?? null;
}

/**
 * Stores a NestedCell under its NestAddress.
 */
/**
 * @param {string} parentFingerprint @param {number} row @param {number} col
 * @param {number} depth @param {object} cell
 */
function bejsonNestingCachePut(parentFingerprint, row, col, depth, cell) {
  _NEST_MAP.set(_addrKey(parentFingerprint, row, col, depth), cell);
}

/**
 * Clears all NestMap entries, or only those of one parent fingerprint. Returns the number removed.
 */
/**
 * Clear cache. If parentFingerprint supplied, clear only that doc's entries.
 * @param {string|null} parentFingerprint @returns {number} entries removed
 */
function bejsonNestingCacheClear(parentFingerprint = null) {
  if (parentFingerprint === null) {
    const totalCount = _NEST_MAP.size;
    _NEST_MAP.clear();
    return totalCount;
  }
  const keyPrefix = `${parentFingerprint}:`;
  let removedCount = 0;
  for (const cacheKey of _NEST_MAP.keys()) {
    if (cacheKey.startsWith(keyPrefix)) { _NEST_MAP.delete(cacheKey); removedCount++; }
  }
  return removedCount;
}

/**
 * Diagnostic snapshot: total entries, unique parents, depth spread.
 */
/** @returns {{ total_entries: number, unique_parents: number, depth_spread: number[] }} */
function bejsonNestingCacheStats() {
  const fingerprintSet = new Set();
  const depthSet = new Set();
  for (const cacheKey of _NEST_MAP.keys()) {
    const keyParts = cacheKey.split(":");
    fingerprintSet.add(keyParts[0]);
    depthSet.add(Number(keyParts[keyParts.length - 1]));
  }
  return {
    total_entries:  _NEST_MAP.size,
    unique_parents: fingerprintSet.size,
    depth_spread:   [...depthSet].sort((a, b) => a - b),
  };
}

/**
 * All cached NestedCells for one parent document and column.
 */
/**
 * Return all cached NestedCells for a given parent doc + column index.
 * @param {string} parentFingerprint @param {number} col @returns {object[]}
 */
function bejsonNestingCacheLookupCol(parentFingerprint, col) {
  const matchingCells = [];
  for (const [cacheKey, cachedCell] of _NEST_MAP.entries()) {
    const keyParts = cacheKey.split(":");
    if (keyParts[0] === parentFingerprint && Number(keyParts[2]) === col) matchingCells.push(cachedCell);
  }
  return matchingCells;
}

// ===========================================================================
// INTERNAL HELPERS
// ===========================================================================

/**
 * Stable identity of a parent document: RELATIONAL_ID if present, else a hash of its Fields.
 */
/** @param {object} doc @returns {string} */
function _docFingerprint(doc) {
  const relationalIdValue = doc["RELATIONAL_ID"] ?? doc["relational_id"];
  if (relationalIdValue) return String(relationalIdValue);
  const fieldsRepr = JSON.stringify(doc["Fields"] ?? []);
  let hashValue = 0;
  for (let charIndex = 0; charIndex < fieldsRepr.length; charIndex++) hashValue = (Math.imul(31, hashValue) + fieldsRepr.charCodeAt(charIndex)) | 0;
  return `hash:${(hashValue >>> 0).toString(16)}`;
}

/**
 * Fast pre-filter: a string cell whose trimmed text starts with { and ends with }.
 */
/** @param {*} value @returns {boolean} */
function _isCandidate(value) {
  if (typeof value !== "string") return false;
  const trimmedValue = value.trim();
  return trimmedValue.startsWith("{") && trimmedValue.endsWith("}");
}

/**
 * JSON.parse of a candidate cell; returns the object or null.
 */
/** @param {string} rawCellText @returns {object|null} */
function _parseCell(rawCellText) {
  try {
    const parsedValue = JSON.parse(rawCellText);
    return (typeof parsedValue === "object" && parsedValue !== null && !Array.isArray(parsedValue)) ? parsedValue : null;
  } catch { return null; }
}

/**
 * Canonical string form of a Fields array (fingerprints, caches).
 */
/** @param {object} doc @returns {string} */
function _fieldsSignature(doc) {
  return JSON.stringify(doc["Fields"] ?? []);
}

/**
 * Strict check that an embedded document is BEJSON 104 (nested cells must be 104 -- not 104a, not 104db, not an MFDB manifest).
 */
/**
 * Validate doc as BEJSON 104 only.
 * @param {*} doc @returns {{ isValid: boolean, errors: string[] }}
 */
function _quickValidate104(doc) {
  const E = NESTING_ERRORS;
  if (typeof doc !== "object" || doc === null || Array.isArray(doc))
    return { isValid: false, errors: [`E${E.E_NESTING_NOT_BEJSON}: not an object`] };

  for (const mandatoryKey of _MANDATORY_KEYS) if (!(mandatoryKey in doc)) return { isValid: false, errors: [] };
  if (doc["Format"] !== "BEJSON")         return { isValid: false, errors: [] };
  if (doc["Format_Version"] !== _VALID_VERSION) return { isValid: false, errors: [] };

  const validationErrors = [];
  if (doc["Format_Creator"] !== "Elton Boehnen")
    validationErrors.push(`E${E.E_NESTING_VALIDATION_FAILED}: Format_Creator must be 'Elton Boehnen'`);

  const recordsTypeValue = doc["Records_Type"];
  if (!Array.isArray(recordsTypeValue) || recordsTypeValue.length !== 1 || typeof recordsTypeValue[0] !== "string")
    validationErrors.push(`E${E.E_NESTING_VALIDATION_FAILED}: Records_Type must be a single-string array`);

  const fieldsList = doc["Fields"];
  if (!Array.isArray(fieldsList))
    validationErrors.push(`E${E.E_NESTING_VALIDATION_FAILED}: Fields must be an array`);

  const valuesList = doc["Values"];
  if (!Array.isArray(valuesList))
    validationErrors.push(`E${E.E_NESTING_VALIDATION_FAILED}: Values must be an array`);

  if (Array.isArray(fieldsList) && Array.isArray(valuesList)) {
    valuesList.forEach((row, rowIndex) => {
      if (Array.isArray(row) && row.length !== fieldsList.length)
        validationErrors.push(
          `E${E.E_NESTING_VALIDATION_FAILED}: positional integrity — ` +
          `row ${rowIndex} has ${row.length} values, Fields has ${fieldsList.length}`
        );
    });
  }
  return { isValid: validationErrors.length === 0, errors: validationErrors };
}

/**
 * Convention check relating the nested Records_Type name to the parent field name; returns a warning string or null.
 */
/** @param {object} doc @param {string} parentFieldName @returns {string|null} */
function _checkRecordsTypeConvention(doc, parentFieldName) {
  const recordsTypeValue = doc["Records_Type"];
  if (!recordsTypeValue || !recordsTypeValue[0]) return null;
  const expectedRecordsType = parentFieldName ? parentFieldName[0].toUpperCase() + parentFieldName.slice(1) : "";
  if (recordsTypeValue[0] !== expectedRecordsType)
    return `W: Records_Type '${recordsTypeValue[0]}' should be '${expectedRecordsType}' by convention`;
  return null;
}

/**
 * Field-name -> column index for a document.
 */
/** @param {object} doc @returns {Object.<string,number>} */
function _buildFieldMap(doc) {
  const fieldNameToIndex = {};
  try { (doc["Fields"] ?? []).forEach((fieldDef, index) => { fieldNameToIndex[fieldDef.name] = index; }); } catch {}
  return fieldNameToIndex;
}

// ===========================================================================
// CORE WALK
// ===========================================================================

/**
 * Recursive scan of one cell: records a NestedCell for an embedded 104 document and descends into its cells, up to depth 16, tracking fingerprints to stop cycles.
 */
/**
 * @param {*} value @param {number} row @param {number} col @param {string} fieldName
 * @param {number} depth @param {Set<string>} seenFingerprints @param {string} parentFingerprint
 * @param {object} parentDoc @param {Map<number,string>} colSchemas
 * @returns {object|null}  NestedCell or null
 */
function _walkCell(value, row, col, fieldName, depth, seenFingerprints, parentFingerprint, parentDoc, colSchemas) {
  const E = NESTING_ERRORS;

  if (depth > NESTING_MAX_DEPTH) {
    console.warn(`[NESTING] depth cap at row=${row} col=${col}`);
    return null;
  }
  if (!_isCandidate(value)) return null;

  const cachedCell = bejsonNestingCacheGet(parentFingerprint, row, col, depth);
  if (cachedCell !== null) return cachedCell;

  const parsedDoc = _parseCell(value);
  if (parsedDoc === null) return null;

  const { isValid: rawIsValid, errors: cellErrors } = _quickValidate104(parsedDoc);
  if (!rawIsValid && cellErrors.length === 0) return null;  // not 104 — skip silently

  const cellWarnings = [];
  let isValid = rawIsValid;

  if (isValid) {
    const fieldsSignature = _fieldsSignature(parsedDoc);
    if (!colSchemas.has(col)) {
      colSchemas.set(col, fieldsSignature);
    } else if (colSchemas.get(col) !== fieldsSignature) {
      cellErrors.push(
        `E${E.E_NESTING_SCHEMA_MISMATCH}: nested doc at row=${row} col=${col} ` +
        `has different Fields schema than other docs in this column`
      );
      isValid = false;
    }
  }

  // Eager field map injection — O(1) for all subsequent consumers (R2)
  if (isValid && !parsedDoc["_nestingFieldMap"]) {
    parsedDoc["_nestingFieldMap"] = _buildFieldMap(parsedDoc);
  }

  if (isValid) {
    const conventionWarning = _checkRecordsTypeConvention(parsedDoc, fieldName);
    if (conventionWarning) cellWarnings.push(conventionWarning);
  }

  const nestedFingerprint = _docFingerprint(parsedDoc);

  if (seenFingerprints.has(nestedFingerprint)) {
    const circularCell = {
      row, col, fieldName, depth, doc: parsedDoc, isValid: false,
      errors: [`E${E.E_NESTING_CIRCULAR_REF}: circular reference at depth ${depth}`],
      warnings: cellWarnings, children: [],
    };
    bejsonNestingCachePut(parentFingerprint, row, col, depth, circularCell);
    return circularCell;
  }

  const childCells = [];

  if (isValid) {
    const childSeenFingerprints = new Set([...seenFingerprints, nestedFingerprint]);
    const childColSchemas = new Map();
    // Pre-built inverted map: idx → name (O(1) lookup vs array[c].name per cell)
    const childFieldMap = parsedDoc["_nestingFieldMap"] ?? _buildFieldMap(parsedDoc);
    const childFieldNameByIndex = Object.fromEntries(Object.entries(childFieldMap).map(([fieldNameKey, indexValue]) => [indexValue, fieldNameKey]));
    const childValues = parsedDoc["Values"] ?? [];
    for (let childRowIndex = 0; childRowIndex < childValues.length; childRowIndex++) {
      const childRowArray = childValues[childRowIndex];
      if (!Array.isArray(childRowArray)) continue;
      for (let childColIndex = 0; childColIndex < childRowArray.length; childColIndex++) {
        const childFieldName = childFieldNameByIndex[childColIndex] ?? `col_${childColIndex}`;
        const childCell = _walkCell(
          childRowArray[childColIndex], childRowIndex, childColIndex, childFieldName, depth + 1,
          childSeenFingerprints, nestedFingerprint, parsedDoc, childColSchemas
        );
        if (childCell !== null) childCells.push(childCell);
      }
    }
  }

  const resolvedCell = { row, col, fieldName, depth, doc: parsedDoc, isValid, errors: cellErrors, warnings: cellWarnings, children: childCells };
  bejsonNestingCachePut(parentFingerprint, row, col, depth, resolvedCell);
  return resolvedCell;
}

// ===========================================================================
// PUBLIC API
// ===========================================================================

/**
 * Entry point; call AFTER normal 104 validation of the parent. Finds all embedded 104 documents and returns a NestingResult. Nested BEJSON is 104-inside-104 through a cell; it is not 104db and not MFDB.
 */
/**
 * Entry point. Call AFTER normal Core 104 validation passes.
 * @param {object}  doc
 * @param {boolean} [useCache=true]
 * @returns {object}  NestingResult
 */
function bejsonNestingScan(doc, useCache = true) {
  const E = NESTING_ERRORS;
  const result = {
    scannedCells: 0, nestedFound: 0, nestedValid: 0,
    nestedInvalid: 0, maxDepthSeen: 0, schemaErrors: 0,
    cells: [], errors: [], warnings: [],
  };

  if (typeof doc !== "object" || doc === null) {
    result.errors.push(`E${E.E_NESTING_NOT_BEJSON}: doc must be an object`);
    return result;
  }

  const fieldsList = doc["Fields"] ?? [];
  const valuesList = doc["Values"] ?? [];
  if (!Array.isArray(fieldsList) || !Array.isArray(valuesList)) {
    result.errors.push(`E${E.E_NESTING_VALIDATION_FAILED}: Fields/Values malformed`);
    return result;
  }

  const documentFingerprint = _docFingerprint(doc);
  const rootSeenFingerprints = new Set([documentFingerprint]);
  const colSchemas = new Map();

  for (let rowIndex = 0; rowIndex < valuesList.length; rowIndex++) {
    const row = valuesList[rowIndex];
    if (!Array.isArray(row)) continue;
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      result.scannedCells++;
      const cellValue = row[colIndex];
      if (!_isCandidate(cellValue)) continue;

      const resolvedFieldName = fieldsList[colIndex]?.name ?? `col_${colIndex}`;

      if (useCache) {
        const cachedHit = bejsonNestingCacheGet(documentFingerprint, rowIndex, colIndex, 1);
        if (cachedHit !== null) {
          result.nestedFound++;
          cachedHit.isValid ? result.nestedValid++ : result.nestedInvalid++;
          result.maxDepthSeen = Math.max(result.maxDepthSeen, cachedHit.depth);
          result.schemaErrors += cachedHit.errors.filter(errorMessage => errorMessage.includes(`E${E.E_NESTING_SCHEMA_MISMATCH}`)).length;
          result.cells.push(cachedHit);
          continue;
        }
      }

      const nestedCell = _walkCell(cellValue, rowIndex, colIndex, resolvedFieldName, 1, rootSeenFingerprints, documentFingerprint, doc, colSchemas);
      if (nestedCell === null) continue;

      result.nestedFound++;
      nestedCell.isValid ? result.nestedValid++ : result.nestedInvalid++;
      result.maxDepthSeen = Math.max(result.maxDepthSeen, nestedCell.depth);
      result.schemaErrors += nestedCell.errors.filter(errorMessage => errorMessage.includes(`E${E.E_NESTING_SCHEMA_MISMATCH}`)).length;
      for (const warningMessage of nestedCell.warnings) result.warnings.push(warningMessage);
      result.cells.push(nestedCell);
    }
  }
  return result;
}

/**
 * Applies mutationFn to a nested document and writes the re-serialized document back into the parent cell. The nested schema is append-only.
 */
/**
 * Apply mutationFn to nestedCell.doc, then write back into parentDoc.Values[row][col].
 * Schema field additions are safe — existing rows are null-padded automatically.
 * Field removals and reorders throw.
 * @param {object}   parentDoc
 * @param {object}   nestedCell
 * @param {Function} mutationFn  receives the live nested doc dict
 */
function bejsonNestingMutate(parentDoc, nestedCell, mutationFn) {
  const E = NESTING_ERRORS;
  const { row, col } = nestedCell;
  const parentValues = parentDoc["Values"] ?? [];

  if (row >= parentValues.length || col >= (parentValues[row] ?? []).length)
    throw new Error(`E${E.E_NESTING_INVALID_CELL}: address row=${row} col=${col} out of bounds`);

  const doc = nestedCell.doc;
  const fieldsBefore = (doc["Fields"] ?? []).map(fieldDef => ({ ...fieldDef }));
  const fieldsCountBefore = fieldsBefore.length;

  mutationFn(doc);

  const fieldsAfter = doc["Fields"] ?? [];
  const fieldsCountAfter = fieldsAfter.length;

  if (fieldsCountAfter < fieldsCountBefore)
    throw new Error(`E${E.E_NESTING_SCHEMA_MISMATCH}: mutation removed fields — not permitted`);

  for (let fieldIndex = 0; fieldIndex < fieldsCountBefore; fieldIndex++) {
    if (fieldsBefore[fieldIndex].name !== fieldsAfter[fieldIndex]?.name || fieldsBefore[fieldIndex].type !== fieldsAfter[fieldIndex]?.type)
      throw new Error(
        `E${E.E_NESTING_SCHEMA_MISMATCH}: mutation reordered/retyped field at index ${fieldIndex} — not permitted`
      );
  }

  if (fieldsCountAfter > fieldsCountBefore) {
    const fieldsAddedCount = fieldsCountAfter - fieldsCountBefore;
    for (const valueRow of (doc["Values"] ?? [])) {
      if (Array.isArray(valueRow)) for (let padIndex = 0; padIndex < fieldsAddedCount; padIndex++) valueRow.push(null);
    }
  }

  delete doc["_nestingFieldMap"];
  parentDoc["Values"][row][col] = JSON.stringify(doc);
}

/**
 * Field-name -> column map for a NestedCell's embedded document.
 */
/** @param {object} nestedCell @returns {Object.<string,number>} */
function bejsonNestingGetFieldMap(nestedCell) {
  if (nestedCell.doc._nestingFieldMap) return nestedCell.doc._nestingFieldMap;
  const fieldMap = _buildFieldMap(nestedCell.doc);
  nestedCell.doc._nestingFieldMap = fieldMap;
  return fieldMap;
}

/**
 * Depth-first flat list of every NestedCell in a NestingResult.
 */
/** @param {object} result @returns {object[]} flat depth-first NestedCell list */
function bejsonNestingFlatten(result) {
  const flattenedCells = [];
  /**
   * Inner helper of flatten: pushes cells and recurses into children.
   */
  function collect(cells) { for (const cellItem of cells) { flattenedCells.push(cellItem); collect(cellItem.children); } }
  collect(result.cells);
  return flattenedCells;
}

/**
 * All NestedCells found in one parent column.
 */
/**
 * Return all top-level NestedCells for a specific column index.
 * @param {object} result @param {number} col @returns {object[]}
 */
function bejsonNestingGetColumn(result, col) {
  return result.cells.filter(cellItem => cellItem.col === col);
}

/**
 * Human-readable summary string of a NestingResult.
 */
/** @param {object} result @returns {string} */
function bejsonNestingSummary(result) {
  const E = NESTING_ERRORS;
  const summaryLines = [
    "BEJSON Core_Nesting Scan Summary",
    `  Cells scanned    : ${result.scannedCells}`,
    `  Nested found     : ${result.nestedFound}`,
    `  Valid nested     : ${result.nestedValid}`,
    `  Invalid nested   : ${result.nestedInvalid}`,
    `  Max depth seen   : ${result.maxDepthSeen}`,
    `  Schema errors    : ${result.schemaErrors}`,
  ];
  if (result.errors.length) { summaryLines.push("  Scan errors:"); result.errors.forEach(errorMessage => summaryLines.push(`    - ${errorMessage}`)); }
  if (result.warnings.length) { summaryLines.push("  Warnings:"); result.warnings.forEach(warningMessage => summaryLines.push(`    ~ ${warningMessage}`)); }
  for (const cellItem of bejsonNestingFlatten(result)) {
    const statusLabel = cellItem.isValid ? "VALID" : "INVALID";
    const indent = "  " + "  ".repeat(cellItem.depth - 1);
    summaryLines.push(`${indent}[${statusLabel}] row=${cellItem.row} col=${cellItem.col} field='${cellItem.fieldName}' depth=${cellItem.depth}`);
    cellItem.errors.forEach(errorMessage => summaryLines.push(`${indent}  ! ${errorMessage}`));
    cellItem.warnings.forEach(warningMessage => summaryLines.push(`${indent}  ~ ${warningMessage}`));
  }
  return summaryLines.join("\n");
}

// ===========================================================================
// EXPORTS
// ===========================================================================
const CoreNesting = {
  VERSION, NESTING_ERRORS, NESTING_MAX_DEPTH,
  bejsonNestingScan, bejsonNestingMutate,
  bejsonNestingCacheGet, bejsonNestingCachePut,
  bejsonNestingCacheClear, bejsonNestingCacheStats, bejsonNestingCacheLookupCol,
  bejsonNestingGetFieldMap, bejsonNestingFlatten,
  bejsonNestingGetColumn, bejsonNestingSummary,
};

if (typeof module !== "undefined" && module.exports) module.exports = CoreNesting;
else if (typeof window !== "undefined") window.BejsonCoreNesting = CoreNesting;