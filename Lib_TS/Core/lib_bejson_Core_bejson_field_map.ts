/**
 * Library:         lib_bejson_Core_bejson_field_map.ts
 * Family:          Core
 * Module Purpose:  Field-name to index cache: get_field_map, get_field_index, clear_field_map_cache.
 * Architecture:    Format-level BEJSON layer that works on any BEJSON document (104, 104a, 104db) through positional Fields/Values and the field-map cache. It does not orchestrate MFDB and is not specific to 104db.
 * Format_Scope:    104 | 104a | 104db (generic)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         2.1.5
 * Release_Version: 300
 * Date:            2026-10-06
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   687e2105-6fb5-412c-a511-8d4fa218b4c6
 */

import { BEJSONDocument } from './lib_bejson_Core_bejson_types';

/**
 * Field Map type: mapping of field name to its positional index.
 */
export type FieldMap = { [key: string]: number };

/**
 * Internal global cache for FieldMaps. Never handed out: each document receives its own copy.
 * The key is JSON-encoded so field names containing "," cannot collide.
 */
const _FIELD_MAP_CACHE: Map<string, FieldMap> = new Map();

const FIELD_MAP_CACHE_KEY = "_bejson_field_map";
// Provenance registry: only maps built here are trusted. A map that arrived through JSON.parse is never
// in this WeakMap, so it cannot be forged into acceptance.
const _OWNED_MAPS: WeakMap<object, number> = new WeakMap();

/**
 * O(1) freshness guard for an in-document cache: size matches Fields and the first, middle
 * and last field names resolve to 0, len>>1, len-1. Duplicate names fail the size check.
 */
function _fieldMapIsFresh(cached: unknown, fields: unknown): boolean {
    if (!cached || typeof cached !== "object" || !Array.isArray(fields)) return false;
    const map = cached as FieldMap;
    const count = fields.length;
    if (_OWNED_MAPS.get(map) !== count) return false;  // unforgeable size; duplicate names fail here too
    if (count === 0) return true;
    const last = count - 1;
    const mid = count >> 1;
    return map[fields[0].name] === 0 && map[fields[last].name] === last && map[fields[mid].name] === mid;
}

/**
 * Returns {fieldName: columnIndex}. The in-document cache is reused only after the O(1) freshness guard passes (map registered by this engine, right size, first/middle/last entries correct); otherwise it is rebuilt from Fields. The shared cache key is JSON-encoded and each document gets its own copy, so lookups are O(1) and callers cannot corrupt other documents. Use this for every field access instead of hardcoded positions. Works for 104, 104a, 104db (column 0 is Record_Type_Parent in 104db).
 */
/**
 * Generates a mapping of field names to their indices for a BEJSON document.
 * The in-document cache is reused only after the O(1) freshness guard passes; a stale or
 * forged (for example parsed-from-disk) map is discarded and rebuilt.
 */
export function bejson_core_get_field_map(doc: BEJSONDocument): FieldMap {
    if (!doc || !doc.Fields) return {};

    const anyDoc = doc as any;
    const cachedDocMap = anyDoc[FIELD_MAP_CACHE_KEY];
    if (cachedDocMap !== undefined) {
        if (_fieldMapIsFresh(cachedDocMap, doc.Fields)) return cachedDocMap as FieldMap;
        try { delete anyDoc[FIELD_MAP_CACHE_KEY]; } catch { /* frozen document */ }
    }

    const fieldNames = doc.Fields.map(f => f.name);
    const cacheKey = (doc.Format_Version || "104") + ":" + JSON.stringify(fieldNames);

    let shared = _FIELD_MAP_CACHE.get(cacheKey);
    if (!shared) {
        shared = {};
        fieldNames.forEach((name, i) => { shared![name] = i; });
        _FIELD_MAP_CACHE.set(cacheKey, shared);
    }

    const docMap: FieldMap = Object.assign({}, shared);
    _OWNED_MAPS.set(docMap, fieldNames.length);
    try { anyDoc[FIELD_MAP_CACHE_KEY] = docMap; } catch { /* frozen document */ }
    return docMap;
}

/**
 * Column index of one field via the cache; -1 when unknown.
 */
/**
 * Returns the index of a specific field by name, using the freshness-guarded cache.
 */
export function bejson_core_get_field_index(doc: BEJSONDocument, fieldName: string): number {
    const fieldMap = bejson_core_get_field_map(doc);
    const idx = fieldMap[fieldName];
    return (idx !== undefined) ? idx : -1;
}

/**
 * Empties the field-map cache.
 */
/**
 * Clears the internal field map cache.
 */
export function bejson_core_clear_field_map_cache(): void {
    _FIELD_MAP_CACHE.clear();
}