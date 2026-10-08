/**
 * Library:         lib_bejson_Core_bejson_core.ts
 * Family:          Core
 * Module Purpose:  Format-level helpers: parse/serialize, field index and record access, factories createEmpty104 / createEmpty104a / createEmpty104db (getRecordsByType is 104db-only).
 * Architecture:    Format-level BEJSON layer that works on any BEJSON document (104, 104a, 104db) through positional Fields/Values and the field-map cache. It does not orchestrate MFDB and is not specific to 104db.
 * Format_Scope:    104 | 104a | 104db (generic)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         2.1.8
 * Release_Version: 300
 * Date:            2026-10-06
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   7e99af52-dbe4-46bb-ace3-5f67373e655c
 */

import {
  BEJSONDocument,
  BEJSONField,
  BEJSONValue,
  BEJSONCoreError,
  BEJSON_CORE_CODES,
} from "./lib_bejson_Core_bejson_types";

// Universal library release line. Only this file --
// the Core BEJSON file -- defines RELEASE_VERSION as a real code variable;
// all other library files declare it in the header comment only.
export const RELEASE_VERSION: number = 300;

// ---------------------------------------------------------------------------
// Parse & Serialize
// ---------------------------------------------------------------------------

/**
 * Parses JSON text into a BEJSONDocument (any version: 104, 104a, 104db, or an MFDB manifest/entity file). Throws BEJSONCoreError on invalid JSON. Structure is not validated -- use validate104/104a/104db.
 */
/**
 * Optimal BEJSON Parsing Standard (TS)
 * Enforces native JSON.parse() immediately wrapped in structural validation.
 * No regex pre-processing.
 */
export function parse(text: string): BEJSONDocument {
  if (typeof text !== 'string') {
    throw new BEJSONCoreError(BEJSON_CORE_CODES.PARSE_ERROR, 'Input must be a string.');
  }

  let raw: unknown;
  try {
    // 1. Parse Object Tree using native engine directly
    raw = JSON.parse(text);
  } catch (e) {
    throw new BEJSONCoreError(
      BEJSON_CORE_CODES.PARSE_ERROR,
      "Invalid JSON: " + String(e)
    );
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BEJSONCoreError(
      BEJSON_CORE_CODES.PARSE_ERROR,
      "Parsed JSON root must be an object."
    );
  }

  return raw as BEJSONDocument;
}

/**
 * Serializes a document to JSON text (indent default 2).
 */
export function serialize(doc: BEJSONDocument, indent: number = 2): string {
  if (doc === null || doc === undefined) {
    throw new BEJSONCoreError(
      BEJSON_CORE_CODES.NULL_DOCUMENT,
      "Cannot serialize null or undefined document."
    );
  }
  try {
    // Strip internal metadata keys (starting with _) before serialization
    const cleanDoc: Record<string, any> = {};
    for (const key in doc) {
      if (Object.prototype.hasOwnProperty.call(doc, key) && !key.startsWith("_")) {
        cleanDoc[key] = doc[key];
      }
    }
    return JSON.stringify(cleanDoc, null, indent || undefined);
  } catch (e) {
    throw new BEJSONCoreError(
      BEJSON_CORE_CODES.SERIALIZATION_ERROR,
      "Serialization failed: " + String(e)
    );
  }
}

// ---------------------------------------------------------------------------
// Field index helpers
// ---------------------------------------------------------------------------

/**
 * Column index of a field name via the cached field map; throws if the field does not exist.
 */
export function getFieldIndex(doc: BEJSONDocument, name: string): number {
  _assertDoc(doc);
  const idx = doc.Fields.findIndex((f) => f.name === name);
  if (idx === -1) {
    throw new BEJSONCoreError(
      BEJSON_CORE_CODES.FIELD_NOT_FOUND,
      "Field not found: " + name
    );
  }
  return idx;
}

/**
 * List of field names in column order.
 */
export function getFieldNames(doc: BEJSONDocument): string[] {
  _assertDoc(doc);
  return doc.Fields.map((f) => f.name);
}

/**
 * The Fields array (name + type definitions).
 */
export function getFields(doc: BEJSONDocument): BEJSONField[] {
  _assertDoc(doc);
  return doc.Fields.map((f) => Object.assign({}, f));
}

// ---------------------------------------------------------------------------
// Record accessors
// ---------------------------------------------------------------------------

/**
 * Row at `index` as an object {fieldName: value}. In a 104db document the object includes Record_Type_Parent.
 */
export function getRecord(
  doc: BEJSONDocument,
  index: number
): Record<string, BEJSONValue> {
  _assertDoc(doc);
  _assertIndex(doc, index);
  return _rowToObject(doc.Fields, doc.Values[index]);
}

/**
 * All rows as {fieldName: value} objects.
 */
export function getAllRecords(
  doc: BEJSONDocument
): Record<string, BEJSONValue>[] {
  _assertDoc(doc);
  return doc.Values.map((row) => _rowToObject(doc.Fields, row));
}

/**
 * One cell by (row index, field name).
 */
export function getFieldValue(
  doc: BEJSONDocument,
  index: number,
  fieldName: string
): BEJSONValue {
  _assertDoc(doc);
  _assertIndex(doc, index);
  const fi = getFieldIndex(doc, fieldName);
  return doc.Values[index][fi];
}

/**
 * Number of rows.
 */
export function getRecordCount(doc: BEJSONDocument): number {
  _assertDoc(doc);
  return doc.Values.length;
}


// ---------------------------------------------------------------------------
// Factory functions — createEmpty104 / createEmpty104a / createEmpty104db
// ---------------------------------------------------------------------------

/**
 * New empty BEJSON 104 document -- exactly ONE record type, strict (no custom top-level keys). The format of every MFDB entity file.
 */
/**
 * Create a valid, empty BEJSON 104 document.
 * @param recordType  Single string entry for Records_Type.
 * @param fields      Field definitions array.
 * @param values      Optional initial values (default: empty array).
 * @param parentHierarchy Optional Parent_Hierarchy path string.
 */
export function createEmpty104(
  recordType: string,
  fields: BEJSONField[],
  values: BEJSONValue[][] = [],
  parentHierarchy?: string
): BEJSONDocument {
  const doc: BEJSONDocument = {
    Format: "BEJSON",
    Format_Version: "104",
    Format_Creator: "Elton Boehnen",
    Records_Type: [recordType],
    Fields: fields,
    Values: values,
  };
  if (parentHierarchy !== undefined) {
    (doc as Record<string, unknown>)["Parent_Hierarchy"] = parentHierarchy;
  }
  return doc;
}

/**
 * New empty BEJSON 104a document -- one record type plus optional custom headers. The format of the MFDB manifest.
 */
/**
 * Create a valid, empty BEJSON 104a document.
 * @param recordType    Single string entry for Records_Type.
 * @param fields        Field definitions (primitive types only: string/integer/number/boolean).
 * @param customHeaders Optional PascalCase file-level metadata keys (104a only).
 */
export function createEmpty104a(
  recordType: string,
  fields: BEJSONField[],
  customHeaders: Record<string, string | number | boolean> = {}
): BEJSONDocument {
  return {
    Format: "BEJSON",
    Format_Version: "104a",
    Format_Creator: "Elton Boehnen",
    Records_Type: [recordType],
    Fields: fields,
    Values: [],
    ...customHeaders,
  };
}

/**
 * New empty BEJSON 104db document -- ONE file with 2+ record types, Record_Type_Parent first, per-field ownership, null-padding. Single-file format; not MFDB.
 */
/**
 * Create a valid, empty BEJSON 104db document.
 * @param recordTypes  Two or more entity name strings.
 * @param fields       Fields array — first entry must be Record_Type_Parent.
 */
export function createEmpty104db(
  recordTypes: [string, string, ...string[]],
  fields: BEJSONField[]
): BEJSONDocument {
  return {
    Format: "BEJSON",
    Format_Version: "104db",
    Format_Creator: "Elton Boehnen",
    Records_Type: recordTypes,
    Fields: fields,
    Values: [],
  };
}

// ---------------------------------------------------------------------------
// 104db — entity-scoped record access
// ---------------------------------------------------------------------------

/**
 * 104db ONLY: rows whose Record_Type_Parent (column 0) equals `type`. Throws UNSUPPORTED_OPERATION on 104/104a documents. (MFDB entities need no filter: each entity is its own file.)
 */
export function getRecordsByType(
  doc: BEJSONDocument,
  type: string
): Record<string, BEJSONValue>[] {
  _assertDoc(doc);
  if (doc.Format_Version !== "104db") {
    throw new BEJSONCoreError(
      BEJSON_CORE_CODES.UNSUPPORTED_OPERATION,
      "getRecordsByType is only valid on BEJSON 104db documents."
    );
  }
  return doc.Values.filter((row) => row[0] === type).map((row) =>
    _rowToObject(doc.Fields, row)
  );
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Returns a NEW document with the row appended (documents are treated as immutable). Row length must equal the field count; values are coerced to the field types.
 */
export function appendRecord(
  doc: BEJSONDocument,
  values: BEJSONValue[]
): BEJSONDocument {
  _assertDoc(doc);
  _assertRowLength(doc, values);
  const coerced = values.map((v, i) => _coerceValue(v, doc.Fields[i].type));
  return _cloneWith(doc, { Values: [...doc.Values, coerced] });
}

/**
 * Returns a NEW document with the row at `index` replaced (length check + type coercion).
 */
export function updateRecord(
  doc: BEJSONDocument,
  index: number,
  values: BEJSONValue[]
): BEJSONDocument {
  _assertDoc(doc);
  _assertIndex(doc, index);
  _assertRowLength(doc, values);
  const coerced = values.map((v, i) => _coerceValue(v, doc.Fields[i].type));
  const newValues = doc.Values.map((row, i) =>
    i === index ? coerced : row
  );
  return _cloneWith(doc, { Values: newValues });
}

/**
 * Returns a NEW document without the row at `index`.
 */
export function deleteRecord(doc: BEJSONDocument, index: number): BEJSONDocument {
  _assertDoc(doc);
  _assertIndex(doc, index);
  const newValues = doc.Values.filter((_, i) => i !== index);
  return _cloneWith(doc, { Values: newValues });
}

/**
 * Returns a NEW document with one cell changed (by row index and field name).
 */
export function setFieldValue(
  doc: BEJSONDocument,
  index: number,
  fieldName: string,
  value: BEJSONValue
): BEJSONDocument {
  _assertDoc(doc);
  _assertIndex(doc, index);
  const fi = getFieldIndex(doc, fieldName);
  const coerced = _coerceValue(value, doc.Fields[fi].type);
  const newRow = [...doc.Values[index]];
  newRow[fi] = coerced;
  const newValues = doc.Values.map((row, i) => (i === index ? newRow : row));
  return _cloneWith(doc, { Values: newValues });
}

// ---------------------------------------------------------------------------
// Encryption Utilities Optimized
// ---------------------------------------------------------------------------

/**
 * Derives an AES-GCM CryptoKey from a password and salt with PBKDF2 (Web Crypto).
 */
/**
 * Derives a CryptoKey from a password and salt.
 * Caller should cache this key to avoid PBKDF2 bottlenecks.
 */
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Internal Key Cache for current session/document operation.
// Fixed-size LRU (12 slots): sessions that decrypt several entities with different password/salt pairs
// avoid repeated PBKDF2 derivation while memory stays bounded.
const _KEY_CACHE_MAX_SLOTS = 12;
const _keyCache: Array<{ password: string; salt: string; key: CryptoKey }> = [];

/**
 * Derived-key cache lookup (LRU); derives on a miss.
 */
async function _getOrDeriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const saltHex = _ab2hex(salt as BufferSource);
  const hitIdx = _keyCache.findIndex((e) => e.password === password && e.salt === saltHex);
  if (hitIdx !== -1) {
    const [hit] = _keyCache.splice(hitIdx, 1);
    _keyCache.push(hit); // move to most-recently-used end
    return hit.key;
  }
  const key = await deriveKey(password, salt);
  if (_keyCache.length >= _KEY_CACHE_MAX_SLOTS) {
    _keyCache.shift(); // evict least-recently-used
  }
  _keyCache.push({ password, salt: saltHex, key });
  return key;
}

/**
 * Normalizes a BufferSource to a byte-accurate Uint8Array view.
 */
// Accepts either a raw ArrayBuffer (e.g. crypto.subtle.encrypt's return value) or a
// typed-array view over one (e.g. crypto.getRandomValues output) — both are valid
// BufferSource shapes; under TS 5.7+'s generic ArrayBufferLike typing, bare 'Uint8Array' values do not
// flow interchangeably, so this builds an explicit, byte-accurate view.
function _toUint8(buf: BufferSource): Uint8Array {
  return ArrayBuffer.isView(buf)
    ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    : new Uint8Array(buf);
}

/**
 * BufferSource -> hex string.
 */
function _ab2hex(buf: BufferSource): string {
  return Array.from(_toUint8(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * BufferSource -> base64 string.
 */
function _ab2base64(buf: BufferSource): string {
  return btoa(String.fromCharCode(...Array.from(_toUint8(buf))));
}

/**
 * base64 string -> Uint8Array.
 */
function _base642ab(base64: string): Uint8Array {
  const b = atob(base64);
  return new Uint8Array(b.length).map((_, i) => b.charCodeAt(i));
}

/**
 * Encrypts one row (AES-GCM) into an ENC:AES-GCM:... string and returns a NEW document. Works on any version; do not encrypt the Record_Type_Parent cell of a 104db row.
 */
export async function encryptRecord(
  doc: BEJSONDocument,
  recordIndex: number,
  password: string,
  providedSalt?: Uint8Array
): Promise<BEJSONDocument> {
  _assertDoc(doc);
  _assertIndex(doc, recordIndex);

  // Reuse salt if provided, otherwise generate. Reusing salt allows key caching.
  const salt = providedSalt || crypto.getRandomValues(new Uint8Array(16));
  const key = await _getOrDeriveKey(password, salt);
  const saltB64 = _ab2base64(salt as BufferSource);

  const row = doc.Values[recordIndex];
  const newRow = [...row];

  for (let j = 0; j < newRow.length; j++) {
    const field = doc.Fields[j];
    if (field.name === "Record_Type_Parent" || field.name === "is_encrypted") continue;
    if (newRow[j] === null || (typeof newRow[j] === "string" && (newRow[j] as string).startsWith("ENC:AES-GCM:"))) continue;

    const dataEnc = new TextEncoder().encode(JSON.stringify(newRow[j]));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, dataEnc);

    newRow[j] = "ENC:AES-GCM:" + saltB64 + ":" + _ab2base64(iv) + ":" + _ab2base64(ciphertext);
  }

  const ieIdx = doc.Fields.findIndex((f) => f.name === "is_encrypted");
  if (ieIdx !== -1) newRow[ieIdx] = true;

  const newValues = doc.Values.map((r, i) => (i === recordIndex ? newRow : r));
  return _cloneWith(doc, { Values: newValues });
}

/**
 * Decrypts a row produced by encryptRecord; throws on a wrong password.
 */
export async function decryptRecord(
  doc: BEJSONDocument,
  recordIndex: number,
  password: string
): Promise<BEJSONDocument> {
  _assertDoc(doc);
  _assertIndex(doc, recordIndex);

  const row = doc.Values[recordIndex];
  const newRow = [...row];

  for (let j = 0; j < newRow.length; j++) {
    const val = newRow[j];
    if (typeof val !== "string" || !val.startsWith("ENC:AES-GCM:")) continue;

    const parts = val.split(":");
    if (parts.length !== 5) continue;

    const salt = _base642ab(parts[2]);
    const iv = _base642ab(parts[3]);
    const ct = _base642ab(parts[4]);

    const key = await _getOrDeriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource);
    newRow[j] = JSON.parse(new TextDecoder().decode(decrypted));
  }

  const ieIdx = doc.Fields.findIndex((f) => f.name === "is_encrypted");
  if (ieIdx !== -1) {
    newRow[ieIdx] = newRow.some((v, idx) => doc.Fields[idx].name !== "is_encrypted" && typeof v === "string" && v.startsWith("ENC:AES-GCM:"));
  }

  const newValues = doc.Values.map((r, i) => (i === recordIndex ? newRow : r));
  return _cloneWith(doc, { Values: newValues });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Throws if the value is not a BEJSON document object.
 */
function _assertDoc(doc: BEJSONDocument): void {
  if (doc === null || doc === undefined) throw new BEJSONCoreError(BEJSON_CORE_CODES.NULL_DOCUMENT, "Document is null.");
}

/**
 * Throws if a row index is out of range.
 */
function _assertIndex(doc: BEJSONDocument, index: number): void {
  if (index < 0 || index >= doc.Values.length) throw new BEJSONCoreError(BEJSON_CORE_CODES.INDEX_OUT_OF_BOUNDS, "Index out of bounds.");
}

/**
 * Throws if a row's length differs from the field count.
 */
function _assertRowLength(doc: BEJSONDocument, values: BEJSONValue[]): void {
  if (values.length !== doc.Fields.length) throw new BEJSONCoreError(BEJSON_CORE_CODES.WRITE_LENGTH_MISMATCH, "Length mismatch.");
}

/**
 * Zips a row with Fields into {fieldName: value}.
 */
function _rowToObject(fields: BEJSONField[], row: BEJSONValue[]): Record<string, BEJSONValue> {
  const obj: Record<string, BEJSONValue> = {};
  for (let i = 0; i < fields.length; i++) obj[fields[i].name] = row[i];
  return obj;
}

/**
 * Shallow-clones a document with overrides (supports the immutable mutation helpers).
 */
function _cloneWith(doc: BEJSONDocument, overrides: Partial<BEJSONDocument>): BEJSONDocument {
  return Object.assign({}, doc, overrides);
}

/**
 * Coerces a value to the field type (string, integer, number, boolean) or throws WRITE_TYPE_MISMATCH. array/object values pass through.
 */
function _coerceValue(value: any, fieldType: string): BEJSONValue {
  if (fieldType === "string") return String(value);
  if (fieldType === "integer" || fieldType === "number") {
    const num = fieldType === "integer" ? parseInt(value, 10) : parseFloat(value);
    if (isNaN(num)) throw new BEJSONCoreError(BEJSON_CORE_CODES.WRITE_TYPE_MISMATCH, "Coercion failed.");
    return num;
  }
  if (fieldType === "boolean") {
    if (typeof value === "boolean") return value;
    if (String(value).toLowerCase() === "true") return true;
    if (String(value).toLowerCase() === "false") return false;
    throw new BEJSONCoreError(BEJSON_CORE_CODES.WRITE_TYPE_MISMATCH, "Coercion failed.");
  }
  return value as BEJSONValue;
}