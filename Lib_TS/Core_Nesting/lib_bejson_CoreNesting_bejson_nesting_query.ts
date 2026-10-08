/**
 * Library:         lib_bejson_CoreNesting_bejson_nesting_query.ts
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
 * RELATIONAL_ID:   9901acbd-5f02-47b0-b8a8-dd73afec7d41
 */

import type { BejsonDoc104 } from "./lib_bejson_CoreNesting_bejson_core_nesting";
import { CORE_NESTING_ERRORS } from "./lib_bejson_CoreNesting_bejson_errors";

// ---------------------------------------------------------------------------
// Error codes — sourced from the Core_Nesting family error registry
// ---------------------------------------------------------------------------
export const NESTING_QUERY_ERRORS = {
  E_NESTING_QUERY_INVALID_PATH: CORE_NESTING_ERRORS.E_NESTING_QUERY_INVALID_PATH,
  E_NESTING_QUERY_EMPTY_PATH:   CORE_NESTING_ERRORS.E_NESTING_QUERY_EMPTY_PATH,
} as const;

export const VERSION = "0.1.1";

/**
 * Local copy of the candidate pre-filter (string that looks like an embedded object).
 */
// lib_bejson_CoreNesting_bejson_core_nesting.ts does not export _buildFieldMap / _isCandidate / _parseCell
// (module-private); these three tiny predicates are defined locally here.
function _isCandidate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmedValue = value.trim();
  return trimmedValue.startsWith("{") && trimmedValue.endsWith("}");
}

/**
 * Local copy: JSON.parse of a candidate cell, or null.
 */
function _parseCell(rawCellText: string): BejsonDoc104 | null {
  try {
    const parsedValue = JSON.parse(rawCellText);
    return typeof parsedValue === "object" && parsedValue !== null && !Array.isArray(parsedValue) ? (parsedValue as BejsonDoc104) : null;
  } catch {
    return null;
  }
}

/**
 * Local copy: field-name -> column index.
 */
function _buildFieldMap(doc: BejsonDoc104): Record<string, number> {
  const fieldNameToIndex: Record<string, number> = {};
  try {
    (doc.Fields ?? []).forEach((fieldDef, index) => { fieldNameToIndex[fieldDef.name] = index; });
  } catch {
    /* noop — return whatever was built */
  }
  return fieldNameToIndex;
}

type Selector = "*" | number | null;

interface PathSegment {
  name: string;
  selector: Selector;
}

export interface QueryMatch {
  path: string;
  value: unknown;
  fieldChain: string[];
  rowChain: number[];
  colChain: number[];
}

const _SEGMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)(\[(\*|\d+)\])?$/;

/**
 * Parses a dotted path such as player_inventory[*].item_id into (fieldName, selector) steps.
 */
function _parsePath(path: string): PathSegment[] {
  if (!path || !path.trim()) {
    throw new Error(`E${NESTING_QUERY_ERRORS.E_NESTING_QUERY_EMPTY_PATH}: path is empty`);
  }
  return path.trim().split(".").map((rawSegment) => {
    const segmentMatch = _SEGMENT_RE.exec(rawSegment);
    if (!segmentMatch) {
      throw new Error(
        `E${NESTING_QUERY_ERRORS.E_NESTING_QUERY_INVALID_PATH}: bad segment '${rawSegment}' in path '${path}'`
      );
    }
    const [, segmentFieldName, , selectorText] = segmentMatch;
    let selector: Selector = null;
    if (selectorText === "*") selector = "*";
    else if (selectorText !== undefined) selector = parseInt(selectorText, 10);
    return { name: segmentFieldName, selector };
  });
}

/**
 * Recursive walk of a nested-104 document along parsed path steps, collecting matches.
 */
function _queryWalk(
  doc: BejsonDoc104,
  segments: PathSegment[],
  segmentIndex: number,
  fullPath: string,
  fieldChain: string[],
  rowChain: number[],
  colChain: number[],
  matchValue: unknown,
  results: QueryMatch[]
): void {
  if (typeof doc !== "object" || doc === null) return;

  const { name: fieldName, selector } = segments[segmentIndex];
  const fieldMap = _buildFieldMap(doc);
  if (!(fieldName in fieldMap)) return; // dead branch — not an error

  const col = fieldMap[fieldName];
  const values = Array.isArray(doc.Values) ? doc.Values : [];
  const isLastSegment = segmentIndex === segments.length - 1;

  const rowIndices: number[] =
    selector === null || selector === "*" ? values.map((_, indexValue) => indexValue) : [selector];

  for (const rowIndex of rowIndices) {
    if (rowIndex < 0 || rowIndex >= values.length) continue;
    const row = values[rowIndex];
    if (!Array.isArray(row) || col >= row.length) continue;
    const cellValue = row[col];

    if (isLastSegment) {
      if (matchValue === undefined || cellValue === matchValue) {
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
    const nestedDoc = _parseCell(cellValue as string);
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
 * @throws {Error} On malformed path syntax only — never on missing data.
 */
export function bejsonNestingQuery(
  doc: BejsonDoc104, path: string, matchValue?: unknown
): QueryMatch[] {
  const parsedSegments = _parsePath(path); // throws on bad grammar
  const matchResults: QueryMatch[] = [];
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
export function bejsonNestingGetPath(
  doc: BejsonDoc104, path: string, defaultValue: unknown = null
): unknown {
  let matches: QueryMatch[];
  try {
    matches = bejsonNestingQuery(doc, path);
  } catch {
    return defaultValue;
  }
  return matches.length ? matches[0].value : defaultValue;
}

/**
 * Human-readable summary of query results.
 */
/** Human-readable summary of a query() result list. */
export function bejsonNestingQuerySummary(matches: QueryMatch[]): string {
  if (!matches || matches.length === 0) {
    return "BEJSON Core_Nesting Query Summary\n  0 matches";
  }
  const summaryLines = [`BEJSON Core_Nesting Query Summary — ${matches.length} match(es)`];
  for (const queryMatch of matches) {
    const chainText = queryMatch.fieldChain
      .map((chainFieldName, chainIndex) => `${chainFieldName}[row=${queryMatch.rowChain[chainIndex]},col=${queryMatch.colChain[chainIndex]}]`)
      .join(" -> ");
    summaryLines.push(`  ${chainText} = ${JSON.stringify(queryMatch.value)}`);
  }
  return summaryLines.join("\n");
}