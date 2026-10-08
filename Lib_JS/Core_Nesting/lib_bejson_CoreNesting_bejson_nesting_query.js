/**
 * Library:         lib_bejson_CoreNesting_bejson_nesting_query.js
 * Family:          Core_Nesting
 * Module Purpose:  Dotted-path queries over nested 104 documents (e.g. player_inventory[*].item_id).
 * Architecture:    Nested BEJSON 104: a cell of a parent 104 document holds a complete embedded 104 document; the physical cell coordinate (NestAddress) is the implicit foreign key. It is neither 104db nor MFDB.
 * Format_Scope:    Nested 104 (NOT 104db, NOT MFDB)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         0.1.5
 * Release_Version: 300
 * Date:            2026-10-02
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   de799779-a226-4cbc-b51a-9ac44372578b
 */

'use strict';

/**
 * Local copy of the candidate pre-filter (string that looks like an embedded object).
 */
// lib_bejson_CoreNesting_bejson_core_nesting.js exports only its public API (scan/mutate/cache/flatten/summary);
// _buildFieldMap/_isCandidate/_parseCell are module-private there, so these three one-line predicates
// are defined locally here.
function _isCandidate(value) {
    if (typeof value !== 'string') return false;
    const trimmedValue = value.trim();
    return trimmedValue.startsWith('{') && trimmedValue.endsWith('}');
}

/**
 * Local copy: JSON.parse of a candidate cell, or null.
 */
function _parseCell(rawCellText) {
    try {
        const parsedValue = JSON.parse(rawCellText);
        return typeof parsedValue === 'object' && parsedValue !== null && !Array.isArray(parsedValue) ? parsedValue : null;
    } catch {
        return null;
    }
}

/**
 * Local copy: field-name -> column index.
 */
function _buildFieldMap(doc) {
    const fieldNameToIndex = {};
    try {
        (doc['Fields'] ?? []).forEach((fieldDef, index) => { fieldNameToIndex[fieldDef.name] = index; });
    } catch {}
    return fieldNameToIndex;
}

// ---------------------------------------------------------------------------
// Error codes — sourced from the Core_Nesting family error registry
// ---------------------------------------------------------------------------
const _NESTING_ERRORS = (typeof require !== 'undefined')
  ? require('./lib_bejson_CoreNesting_bejson_errors.js')
  : (window.NESTING_ERRORS || {});
const { E_NESTING_QUERY_INVALID_PATH, E_NESTING_QUERY_EMPTY_PATH } = _NESTING_ERRORS;

const VERSION = '0.1.1';

const _SEGMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)(\[(\*|\d+)\])?$/;

/**
 * Parses a dotted path such as player_inventory[*].item_id into (fieldName, selector) steps.
 */
function _parsePath(path) {
    if (!path || !path.trim()) {
        throw new Error(`E${E_NESTING_QUERY_EMPTY_PATH}: path is empty`);
    }
    return path.trim().split('.').map((rawSegment) => {
        const segmentMatch = _SEGMENT_RE.exec(rawSegment);
        if (!segmentMatch) {
            throw new Error(
                `E${E_NESTING_QUERY_INVALID_PATH}: bad segment '${rawSegment}' in path '${path}'`
            );
        }
        const [, segmentFieldName, , selectorText] = segmentMatch;
        let selector = null;
        if (selectorText === '*') selector = '*';
        else if (selectorText !== undefined) selector = parseInt(selectorText, 10);
        return { name: segmentFieldName, selector };
    });
}

/**
 * Recursive walk of a nested-104 document along parsed path steps, collecting matches.
 */
function _queryWalk(doc, segments, segmentIndex, fullPath, fieldChain, rowChain, colChain, matchValue, results) {
    if (doc === null || typeof doc !== 'object') return;

    const { name: fieldName, selector } = segments[segmentIndex];
    const fieldMap = _buildFieldMap(doc);
    if (!(fieldName in fieldMap)) return; // dead branch — not an error

    const col = fieldMap[fieldName];
    const values = Array.isArray(doc.Values) ? doc.Values : [];
    const isLastSegment = segmentIndex === segments.length - 1;

    const rowIndices =
        selector === null || selector === '*'
            ? values.map((_, indexValue) => indexValue)
            : [selector];

    for (const rowIndex of rowIndices) {
        if (rowIndex < 0 || rowIndex >= values.length) continue;
        const row = values[rowIndex];
        if (!Array.isArray(row) || col >= row.length) continue;
        const cellValue = row[col];

        if (isLastSegment) {
            if (matchValue === undefined || matchValue === null || cellValue === matchValue) {
                results.push({
                    path: fullPath,
                    value: cellValue,
                    fieldChain: [...fieldChain, fieldName],
                    rowChain: [...rowChain, rowIndex],
                    colChain: [...colChain, col],
                });
            }
            continue;
        }

        if (!_isCandidate(cellValue)) continue;
        const nestedDoc = _parseCell(cellValue);
        if (nestedDoc === null) continue;

        _queryWalk(
            nestedDoc, segments, segmentIndex + 1, fullPath,
            [...fieldChain, fieldName], [...rowChain, rowIndex], [...colChain, col],
            matchValue, results
        );
    }
}

/**
 * Finds values in a nested 104 document by dotted path (selectors [*], [n]; optional matchValue filter). Returns QueryMatch objects.
 */
/**
 * Resolve a dotted path through doc and its nested BEJSON 104 cells.
 * @param {object} doc          Root or already-nested BEJSON 104 document.
 * @param {string} path         Dotted path, e.g. "player_inventory[*].item_id".
 * @param {*} [matchValue]      If provided, only cells === this value are
 *                              returned. If omitted, every cell reached by
 *                              the path is returned unfiltered.
 * @returns {Array} QueryMatch objects — empty array if nothing matched.
 * @throws {Error} On malformed path syntax only.
 */
function bejsonNestingQuery(doc, path, matchValue) {
    const parsedSegments = _parsePath(path); // throws on bad grammar
    const matchResults = [];
    _queryWalk(doc, parsedSegments, 0, path, [], [], [], matchValue, matchResults);
    return matchResults;
}

/**
 * Safe-get: first value at a path, or defaultValue.
 */
/**
 * Safe-Get convenience wrapper (Section 9 standard): returns the value of
 * the FIRST match for path, or `defaultValue` if the path resolves to
 * nothing or is malformed. Never throws.
 */
function bejsonNestingGetPath(doc, path, defaultValue = null) {
    let matches;
    try {
        matches = bejsonNestingQuery(doc, path);
    } catch (pathError) {
        return defaultValue;
    }
    return matches.length ? matches[0].value : defaultValue;
}

/**
 * Human-readable summary of query results.
 */
/** Human-readable summary of a query() result list. */
function bejsonNestingQuerySummary(matches) {
    if (!matches || matches.length === 0) {
        return 'BEJSON Core_Nesting Query Summary\n  0 matches';
    }
    const summaryLines = [`BEJSON Core_Nesting Query Summary — ${matches.length} match(es)`];
    for (const queryMatch of matches) {
        const chainText = queryMatch.fieldChain
            .map((chainFieldName, chainIndex) => `${chainFieldName}[row=${queryMatch.rowChain[chainIndex]},col=${queryMatch.colChain[chainIndex]}]`)
            .join(' -> ');
        summaryLines.push(`  ${chainText} = ${JSON.stringify(queryMatch.value)}`);
    }
    return summaryLines.join('\n');
}

module.exports = {
    VERSION,
    E_NESTING_QUERY_INVALID_PATH,
    E_NESTING_QUERY_EMPTY_PATH,
    bejsonNestingQuery,
    bejsonNestingGetPath,
    bejsonNestingQuerySummary,
};