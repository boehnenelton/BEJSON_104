/**
 * Library:         lib_bejson_Core_bejson_core.js
 * Family:          Core
 * Module Purpose:  Format-level engine and helpers: version/stat checks, field-map access, backup and write handling (BEJSONEngine), CryptoUtils. Defines RELEASE_VERSION.
 * Architecture:    Format-level BEJSON layer that works on any BEJSON document (104, 104a, 104db) through positional Fields/Values and the field-map cache. It does not orchestrate MFDB and is not specific to 104db.
 * Format_Scope:    104 | 104a | 104db (generic)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         2.0.12
 * Release_Version: 300
 * Date:            2026-10-06
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   935912e9-0e3f-4c4a-9d43-e97694a3ea91
 */

'use strict';

const BEJSON_ERRORS = (typeof require !== 'undefined') 
  ? require('./lib_bejson_Core_bejson_errors.js') 
  : (window.BEJSON_ERRORS || {});

 const {
     E_CORE_INVALID_VERSION,
     E_CORE_INVALID_OPERATION,
     E_CORE_INDEX_OUT_OF_BOUNDS,
     E_CORE_FIELD_NOT_FOUND,
     E_CORE_TYPE_CONVERSION_FAILED,
     E_CORE_BACKUP_FAILED,
     E_CORE_WRITE_FAILED,
     E_CORE_QUERY_FAILED,
     E_CORE_ENCRYPTION_FAILED,
     E_CORE_DECRYPTION_FAILED
 } = BEJSON_ERRORS;

// Universal library release line. Only this file --
// the Core BEJSON file -- defines RELEASE_VERSION as a real code variable;
// all other library files declare it in the header comment only.
const RELEASE_VERSION = 300;

 // --- Environment Detection ---
let crypto = (typeof window !== 'undefined' && window.crypto) ? window.crypto : null;
if (!crypto && typeof require !== 'undefined') {
    try {
        crypto = require('crypto').webcrypto;
    } catch (e) {
        // Fallback for older Node.js or other environments
    }
}

class BEJSONCoreError extends Error {
    /**
     * Error type for core-layer failures (BEJSONCoreError); `code` is the numeric E_* value from the registry.
     */
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = "BEJSONCoreError";
    }
}

class BEJSONEngine {
    /**
     * BEJSONEngine: a minimal system registry / update loop (state 'BOOT'). It is a runtime helper, NOT a BEJSON format feature, and has nothing to do with 104, 104a, 104db or MFDB. A game-oriented copy also exists in Lib_JS/Gaming.
     */
    constructor() {
        this.systems = new Map();
        this.state = 'BOOT';
    }
    /**
     * BEJSONEngine helper: stores a named system object. Not format-related.
     */
    registerSystem(name, system) { this.systems.set(name, system); }
    getSystem(name) { return this.systems.get(name); }
    /**
     * BEJSONEngine helper: calls step(dt) / update(dt) on each registered system. Not format-related.
     */
    loop(dt) {
        this.systems.forEach(s => {
            if (s.step) s.step(dt);
            if (s.update) s.update(dt);
        });
    }
}

// --- Internal Key Cache for current session/document operation ---
// Fixed-size LRU of derived keys (12 slots): sessions that switch between several password/salt
// pairs avoid repeated PBKDF2 derivation.
const _KEY_CACHE_MAX_SLOTS = 12;
const _keyCache = [];

/**
 * Returns an AES key for (password, salt) from a 12-slot LRU cache, deriving it with PBKDF2 on a miss; a providedKey bypasses derivation. Used by record encryption.
 */
async function _getOrDeriveKey(password, salt, providedKey = null) {
    if (providedKey) return providedKey;
    const saltB64 = CryptoUtils.ab2base64(salt);
    const hitIdx = _keyCache.findIndex((e) => e.password === password && e.salt === saltB64);
    if (hitIdx !== -1) {
        const [hit] = _keyCache.splice(hitIdx, 1);
        _keyCache.push(hit); // move to most-recently-used end
        return hit.key;
    }
    const key = await CryptoUtils.deriveKey(password, salt);
    if (_keyCache.length >= _KEY_CACHE_MAX_SLOTS) {
        _keyCache.shift(); // evict least-recently-used
    }
    _keyCache.push({ password, salt: saltB64, key });
    return key;
}

const CryptoUtils = {
    /**
     * CryptoUtils: derives an AES-GCM key from a password and salt with PBKDF2 (Web Crypto).
     */
    async deriveKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
        return await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    /**
     * CryptoUtils: ArrayBuffer/Uint8Array -> base64 string.
     */
    ab2base64(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); },
    /**
     * CryptoUtils: base64 string -> Uint8Array.
     */
    base642ab(base64) { const b = atob(base64); return new Uint8Array(b.length).map((_, i) => b.charCodeAt(i)); },

    /**
     * Encrypts one row of a BEJSON document in place (AES-GCM) into an 'ENC:AES-GCM:...' string cell. Works on any version; for 104db the discriminator cell in column 0 should not be encrypted. Reusing providedSalt/providedKey avoids re-deriving the key.
     */
    async encryptRecord(doc, recordIndex, password, providedSalt = null, providedKey = null) {
        if (recordIndex < 0 || recordIndex >= doc.Values.length) throw new BEJSONCoreError("Index out of bounds", E_CORE_INDEX_OUT_OF_BOUNDS);
        
        const record = doc.Values[recordIndex];
        // REUSE salt if provided, otherwise generate. Reusing salt allows key caching.
        const salt = providedSalt || crypto.getRandomValues(new Uint8Array(16));
        const key = await _getOrDeriveKey(password, salt, providedKey);
        const saltB64 = this.ab2base64(salt);
        
        const newRecord = [...record];
        for (let i = 0; i < newRecord.length; i++) {
            const field = doc.Fields[i];
            if (field.name === "Record_Type_Parent" || field.name === "is_encrypted") continue;
            
            const val = newRecord[i];
            if (val === null) continue;
            if (typeof val === "object" && val._enc === "AES-GCM") continue;

            const dataEnc = new TextEncoder().encode(JSON.stringify(val));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, dataEnc);
            
            const ivB64 = this.ab2base64(iv);
            const ctB64 = this.ab2base64(ciphertext);
            
            newRecord[i] = {
                _enc: "AES-GCM",
                salt: saltB64,
                iv: ivB64,
                ct: ctB64
            };
        }

        const ieIdx = doc.Fields.findIndex(f => f.name === "is_encrypted");
        if (ieIdx !== -1) newRecord[ieIdx] = true;

        doc.Values[recordIndex] = newRecord;
        return doc;
    },

    /**
     * Reverses encryptRecord for one row and returns the decrypted record. Throws BEJSONCoreError on a wrong password or out-of-range index.
     */
    async decryptRecord(doc, recordIndex, password) {
        if (recordIndex < 0 || recordIndex >= doc.Values.length) throw new BEJSONCoreError("Index out of bounds", E_CORE_INDEX_OUT_OF_BOUNDS);
        
        const record = doc.Values[recordIndex];
        const newRecord = [...record];
        
        for (let i = 0; i < newRecord.length; i++) {
            const val = newRecord[i];
            
            // Accepts both the string format (ENC:AES-GCM:...) and the object format
            let saltB64, ivB64, ctB64;
            
            if (typeof val === "string" && val.startsWith("ENC:AES-GCM:")) {
                const parts = val.split(":");
                if (parts.length === 5) {
                    saltB64 = parts[2];
                    ivB64 = parts[3];
                    ctB64 = parts[4];
                }
            } else if (val && typeof val === "object" && val._enc === "AES-GCM") {
                saltB64 = val.salt;
                ivB64 = val.iv;
                ctB64 = val.ct;
            }
            
            if (!saltB64 || !ivB64 || !ctB64) continue;
            
            try {
                const salt = this.base642ab(saltB64);
                const iv = this.base642ab(ivB64);
                const ct = this.base642ab(ctB64);
                const key = await _getOrDeriveKey(password, salt);
                
                const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
                newRecord[i] = JSON.parse(new TextDecoder().decode(decrypted));
            } catch (e) {
                throw new BEJSONCoreError("Decryption failed at field " + i + ": " + e.message, E_CORE_DECRYPTION_FAILED);
            }
        }

        const ieIdx = doc.Fields.findIndex(f => f.name === "is_encrypted");
        if (ieIdx !== -1) {
            newRecord[ieIdx] = newRecord.some((v, idx) => {
                if (doc.Fields[idx].name === "is_encrypted") return false;
                return (typeof v === "string" && v.startsWith("ENC:AES-GCM:")) || (v && v._enc === "AES-GCM");
            });
        }

        doc.Values[recordIndex] = newRecord;
        return doc;
    }
};

/**
 * Cheap check only: the object exists and Format === 'BEJSON'. Not validation -- use bejson_validator_* for the 104/104a/104db rules.
 */
// Lightweight document helpers used by parsers
function bejson_core_is_valid(doc) { return !!(doc && doc.Format === "BEJSON"); }
/**
 * Returns Format_Version ('104', '104a', '104db'), or null. MFDB has no Format_Version of its own (its manifest is 104a).
 */
function bejson_core_get_version(doc) { return doc ? (doc.Format_Version || doc.Version) : null; }
/**
 * Returns {records, fields} counts for a document.
 */
function bejson_core_get_stats(doc) {
    if (!doc || !doc.Values) return { records: 0, fields: 0 };
    return { records: doc.Values.length, fields: doc.Fields ? doc.Fields.length : 0 };
}

// Global Field Map Cache
const _FIELD_MAP_CACHE = new Map();

/**
 * Returns {fieldName: columnIndex}, built once and cached (in-document and in a global Map). All field access should use it; do not hardcode positions. In a 104db document column 0 is Record_Type_Parent.
 */
/**
 * Returns a mapping of field name to index.
 * Utilizes both in-document caching and a global cache for performance.
 */
// Provenance registry: only maps built by get_field_map are trusted. A map that arrived through
// JSON.parse is never in this WeakMap, so it cannot be forged into acceptance.
const _BEJSON_OWNED_MAPS = new WeakMap();

/**
 * O(1) guard for an in-document field-map cache: trusted only if it is registered in the module's WeakMap (built by this engine, so a map parsed from JSON can never pass), its stored size equals Fields.length, and the first, middle and last field names resolve to 0, mid and last. Duplicate field names fail the size check and force a rebuild.
 */
function _bejson_core_field_map_is_fresh(cached, fields) {
    // O(1) guard: size match plus first/middle/last field resolve to 0, len>>1, len-1.
    if (!cached || typeof cached !== 'object' || !Array.isArray(fields)) return false;
    const count = fields.length;
    if (_BEJSON_OWNED_MAPS.get(cached) !== count) return false;   // unforgeable size; duplicate names fail here too
    if (count === 0) return true;
    const last = count - 1, mid = count >> 1;
    return cached[fields[0].name] === 0 && cached[fields[last].name] === last && cached[fields[mid].name] === mid;
}

/**
 * Returns {fieldName: columnIndex}. The in-document cache (_bejson_field_map) is used only if fresh (see _bejson_core_field_map_is_fresh), otherwise it is rebuilt from Fields. The shared cache key is JSON-encoded (field names containing commas cannot collide) and each document gets its own copy, so one caller cannot corrupt another document's map. All field access should use it; in a 104db document column 0 is Record_Type_Parent.
 */
function bejson_core_get_field_map(doc) {
    if (!doc || !doc.Fields) return {};

    // In-document cache: reused only after the O(1) freshness guard; stale or forged maps are rebuilt
    if (doc._bejson_field_map) {
        if (_bejson_core_field_map_is_fresh(doc._bejson_field_map, doc.Fields)) return doc._bejson_field_map;
        try { delete doc._bejson_field_map; } catch(e) {}
    }

    const fieldNames = doc.Fields.map(f => f.name);
    const cacheKey = (doc.Format_Version || '104') + ':' + JSON.stringify(fieldNames);  // JSON key: names containing ',' cannot collide

    let fieldMap;
    if (_FIELD_MAP_CACHE.has(cacheKey)) {
        fieldMap = _FIELD_MAP_CACHE.get(cacheKey);
    } else {
        fieldMap = {};
        doc.Fields.forEach((f, i) => { fieldMap[f.name] = i; });
        _FIELD_MAP_CACHE.set(cacheKey, fieldMap);
    }

    // Per-document copy: the shared cache is never handed out, so caller mutation cannot leak across documents
    const docMap = Object.assign({}, fieldMap);
    _BEJSON_OWNED_MAPS.set(docMap, doc.Fields.length);
    try { doc._bejson_field_map = docMap; } catch(e) {}

    return docMap;
}
/**
 * Column index of one field name via the cache; -1 when unknown.
 */
/**
 * Returns the positional index of a field name using the cache.
 * Returns -1 on miss (consistent with JS/PY; TS core throws — see audit FM4).
 */
function bejson_core_get_field_index(doc, fieldName) {
    const fieldMap = bejson_core_get_field_map(doc);
    const idx = fieldMap[fieldName];
    return (idx !== undefined) ? idx : -1;
}

/**
 * Empties the global field-map cache (use after changing Fields at runtime).
 */
/**
 * Clears the field map cache.
 * Call this if a document's Fields array has been mutated in-place after a
 * cache entry was built — otherwise stale indices will be returned indefinitely.
 */
function bejson_core_clear_field_map_cache() {
    _FIELD_MAP_CACHE.clear();
}

/**
 * Serializes any BEJSON document (104, 104a, 104db, or an MFDB manifest/entity file) to JSON, dropping '_'-prefixed in-memory keys so they never reach disk.
 */
/**
 * Serializes a BEJSON document to a string, stripping internal metadata keys
 * (those starting with '_') to prevent leakage into persisted files.
 * @param {Object} doc - The BEJSON document to serialize.
 * @param {number} indent - Indentation spaces.
 * @returns {string} The JSON string.
 */
function bejson_core_serialize(doc, indent = 2) {
    if (!doc) return "";
    const cleanDoc = {};
    Object.keys(doc).forEach(key => {
        if (!key.startsWith("_")) cleanDoc[key] = doc[key];
    });
    return JSON.stringify(cleanDoc, null, indent);
}

const CoreExports = {
    RELEASE_VERSION,
    BEJSONCoreError,
    BEJSONEngine,
    Crypto: CryptoUtils,
    bejson_core_is_valid,
    bejson_core_get_version,
    bejson_core_get_stats,
    bejson_core_get_field_map,
    bejson_core_get_field_index,
    bejson_core_clear_field_map_cache,
    bejson_core_serialize,
    // Error codes
    E_CORE_INVALID_VERSION, E_CORE_INVALID_OPERATION, E_CORE_INDEX_OUT_OF_BOUNDS,
    E_CORE_FIELD_NOT_FOUND, E_CORE_TYPE_CONVERSION_FAILED, E_CORE_BACKUP_FAILED,
    E_CORE_WRITE_FAILED, E_CORE_QUERY_FAILED, E_CORE_ENCRYPTION_FAILED, E_CORE_DECRYPTION_FAILED
};

// UMD-like export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoreExports;
}
if (typeof window !== 'undefined') {
    window.BEJSON = window.BEJSON || {};
    Object.assign(window.BEJSON, CoreExports);
}