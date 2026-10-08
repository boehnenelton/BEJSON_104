/**
 * Library:         lib_bejson_Core_bejson_validator.js
 * Family:          Core
 * Module Purpose:  Structural validator for BEJSON 104, 104a and 104db (mandatory keys, Records_Type, Fields, Values, version-specific rules). MFDB rules live in the mfdb_validator module.
 * Architecture:    Format-level BEJSON layer that works on any BEJSON document (104, 104a, 104db) through positional Fields/Values and the field-map cache. It does not orchestrate MFDB and is not specific to 104db.
 * Format_Scope:    104 | 104a | 104db (generic)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         2.0.4
 * Release_Version: 300
 * Date:            2026-10-02
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   f8dd5e1c-e1a1-46d2-808d-ef871d334510
 */

'use strict';

// ---------------------------------------------------------------------------
// Error codes (mirror bash readonly values / Python constants)
// ---------------------------------------------------------------------------
const BEJSON_ERRORS = (typeof require !== 'undefined') 
  ? require('./lib_bejson_Core_bejson_errors.js') 
  : (window.BEJSON_ERRORS || {});

const {
  E_INVALID_JSON,
  E_MISSING_MANDATORY_KEY,
  E_INVALID_FORMAT,
  E_INVALID_VERSION,
  E_INVALID_RECORDS_TYPE,
  E_INVALID_FIELDS,
  E_INVALID_VALUES,
  E_TYPE_MISMATCH,
  E_RECORD_LENGTH_MISMATCH,
  E_RESERVED_KEY_COLLISION,
  E_INVALID_RECORD_TYPE_PARENT,
  E_NULL_VIOLATION,
  E_FILE_NOT_FOUND,
  E_PERMISSION_DENIED,
  E_ATOMIC_WRITE_FAILED
} = BEJSON_ERRORS;

const VALID_VERSIONS    = new Set(['104', '104a', '104db']);
const MANDATORY_KEYS    = ['Format', 'Format_Version', 'Format_Creator', 'Records_Type', 'Fields', 'Values'];
const VALID_FIELD_TYPES = new Set(['string', 'integer', 'number', 'boolean', 'array', 'object']);

// ---------------------------------------------------------------------------
// Validation exception
// ---------------------------------------------------------------------------

class BEJSONValidationError extends Error {
  
  /**
   * Error type for validation failures (BEJSONValidationError); carries a numeric code.
   */
  constructor(message, code) {
    super(message);
    this.name = 'BEJSONValidationError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Validation state — mirrors bash globals / Python ValidationState
// ---------------------------------------------------------------------------

class ValidationState {
  /**
   * Validation state holder: error and warning lists collected during one validation run.
   */
  constructor() {
    this.errors      = [];
    this.warnings    = [];
    this.currentFile = '';
  }

  
  /**
   * Clears errors and warnings.
   */
  reset() {
    this.errors      = [];
    this.warnings    = [];
    this.currentFile = '';
  }

  
  /**
   * Records a hard error (invalidates the document).
   */
  addError(message, location = '', context = '') {
    let entry = 'ERROR';
    if (location) entry += ` | Location: ${location}`;
    entry += ` | Message: ${message}`;
    if (context) entry += ` | Context: ${context}`;
    this.errors.push(entry);
  }

  
  /**
   * Records a non-fatal warning.
   */
  addWarning(message, location = '') {
    let entry = 'WARNING';
    if (location) entry += ` | Location: ${location}`;
    entry += ` | Message: ${message}`;
    this.warnings.push(entry);
  }

  
  /**
   * Copy of the error list.
   */
  getErrors() { return [...this.errors]; }

  
  /**
   * Copy of the warning list.
   */
  getWarnings() { return [...this.warnings]; }

  
  /**
   * True when any error was recorded.
   */
  hasErrors() { return this.errors.length > 0; }

  
  /**
   * True when any warning was recorded.
   */
  hasWarnings() { return this.warnings.length > 0; }

  
  /**
   * Number of errors.
   */
  errorCount() { return this.errors.length; }

  
  /**
   * Number of warnings.
   */
  warningCount() { return this.warnings.length; }
}

// Module-level default state (mirrors bash global arrays / Python _state)
const _state = new ValidationState();

// ---------------------------------------------------------------------------
// Convenience accessors that operate on the module-level state
// (mirror the exported bash / Python functions)
// ---------------------------------------------------------------------------

/**
 * Clears the module-level validation state before a new run.
 */
function bejson_validator_reset_state() {
  _state.reset();
}

/**
 * Errors of the last run.
 */
function bejson_validator_get_errors() {
  return _state.getErrors();
}

/**
 * Warnings of the last run.
 */
function bejson_validator_get_warnings() {
  return _state.getWarnings();
}

/**
 * True if the last run recorded errors.
 */
function bejson_validator_has_errors() {
  return _state.hasErrors();
}

/**
 * True if the last run recorded warnings.
 */
function bejson_validator_has_warnings() {
  return _state.hasWarnings();
}

/**
 * Error count of the last run.
 */
function bejson_validator_error_count() {
  return _state.errorCount();
}

/**
 * Warning count of the last run.
 */
function bejson_validator_warning_count() {
  return _state.warningCount();
}

// ---------------------------------------------------------------------------
// Dependency check (no-op in JS — JSON is built-in)
// mirrors bejson_validator_check_dependencies
// ---------------------------------------------------------------------------

/**
 * Compatibility stub: always true (no external tools are needed in JS).
 */
function bejson_validator_check_dependencies() {
  return true;
}

// ---------------------------------------------------------------------------
// JSON syntax validation
// mirrors bejson_validator_check_json_syntax
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Environment Abstraction Layer
// ---------------------------------------------------------------------------

const IO_PROVIDER = {
  readFile: (path) => {
    if (typeof require !== 'undefined') {
      try {
        const fs = require('fs');
        return fs.readFileSync(path, 'utf8');
      } catch (e) {
        throw new Error(`Node.js fs failed: ${e.message}`);
      }
    }
    throw new Error('File I/O not available in this environment');
  },
  exists: (path) => {
    if (typeof require !== 'undefined') {
      try {
        const fs = require('fs');
        return fs.existsSync(path);
      } catch (e) {
        return false;
      }
    }
    return false;
  }
};

/**
 * Step 1: parses the input (JSON text, or a file path when isFile is true) and returns the document; records an error if the JSON is invalid.
 */
function bejson_validator_check_json_syntax(input, isFile = false) {
  let text;

  if (isFile) {
    if (!IO_PROVIDER.exists(input)) {
      _state.addError(`File not found: ${input}`, 'File System');
      throw new BEJSONValidationError(`File not found: ${input}`, E_FILE_NOT_FOUND);
    }
    try {
      text = IO_PROVIDER.readFile(input);
      _state.currentFile = input;
    } catch (err) {
      _state.addError(`IO Error: ${err.message}`, 'File System');
      throw new BEJSONValidationError(`IO Error: ${err.message}`, E_FILE_NOT_FOUND);
    }
  } else {
    text = input;
  }

  if (typeof text === 'object' && text !== null) {
    return text; // already parsed
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    _state.addError(`Invalid JSON syntax: ${err.message}`, 'JSON Parse');
    throw new BEJSONValidationError(`Invalid JSON syntax: ${err.message}`, E_INVALID_JSON);
  }
}

// ---------------------------------------------------------------------------
// Mandatory key validation
// mirrors bejson_validator_check_mandatory_keys
// ---------------------------------------------------------------------------

/**
 * Step 2: the six mandatory top-level keys (Format, Format_Version, Format_Creator, Records_Type, Fields, Values) must exist
 * and Format_Creator must be a string. Returns Format_Version ('104', '104a' or '104db'). Same keys for every version and for MFDB manifest/entity files (104a / 104).
 */
function bejson_validator_check_mandatory_keys(doc) {
  for (const key of MANDATORY_KEYS) {
    if (!(key in doc)) {
      _state.addError(`Missing mandatory top-level key: '${key}'`, 'Top-Level Keys');
      throw new BEJSONValidationError(`Missing mandatory key: ${key}`, E_MISSING_MANDATORY_KEY);
    }
  }

  if (doc['Format'] !== 'BEJSON') {
    _state.addError(
      `Invalid 'Format' value: Expected 'BEJSON', got '${doc['Format']}'`,
      'Top-Level Keys/Format',
    );
    throw new BEJSONValidationError('Invalid Format', E_INVALID_FORMAT);
  }

  const version = doc['Format_Version'] ?? '';

  if (!VALID_VERSIONS.has(version)) {
    _state.addError(
      `Invalid 'Format_Version': Expected '104', '104a', or '104db', got '${version}'`,
      'Top-Level Keys/Format_Version',
    );
    throw new BEJSONValidationError(`Invalid version: ${version}`, E_INVALID_VERSION);
  }

  if (typeof doc['Format_Creator'] !== 'string') {
    _state.addError("Invalid 'Format_Creator': Must be a string", 'Top-Level Keys/Format_Creator');
    throw new BEJSONValidationError('Invalid Format_Creator', E_INVALID_FORMAT);
  }

  const checks = [
    ['Records_Type', E_INVALID_RECORDS_TYPE, 'Top-Level Keys/Records_Type'],
    ['Fields',       E_INVALID_FIELDS,       'Top-Level Keys/Fields'],
    ['Values',       E_INVALID_VALUES,       'Top-Level Keys/Values'],
  ];
  for (const [key, code, section] of checks) {
    if (!Array.isArray(doc[key])) {
      _state.addError(`Invalid '${key}': Must be an array`, section);
      throw new BEJSONValidationError(`Invalid ${key}`, code);
    }
  }

  return version;
}

// ---------------------------------------------------------------------------
// Records_Type validation
// mirrors bejson_validator_check_records_type
// ---------------------------------------------------------------------------

/**
 * Step 3: Records_Type must be an array. 104 and 104a need exactly ONE type; 104db needs TWO or more. An MFDB manifest is 104a, so its Records_Type is the single entry ["mfdb"].
 */
function bejson_validator_check_records_type(doc, version) {
  const rt    = doc['Records_Type'];
  const count = rt.length;

  if (version === '104' || version === '104a') {
    if (count !== 1 || typeof rt[0] !== 'string') {
      _state.addError(
        `For BEJSON ${version}, 'Records_Type' must contain exactly one string. Found ${count} entries.`,
        'Records_Type',
      );
      throw new BEJSONValidationError('Bad Records_Type', E_INVALID_RECORDS_TYPE);
    }
  } else if (version === '104db') {
    if (count < 2) {
      _state.addError(
        `For BEJSON 104db, 'Records_Type' must contain two or more unique strings. Found ${count} entries.`,
        'Records_Type',
      );
      throw new BEJSONValidationError('Bad Records_Type', E_INVALID_RECORDS_TYPE);
    }
    const seen = new Set();
    for (let i = 0; i < rt.length; i++) {
      if (typeof rt[i] !== 'string') {
        _state.addError(`Records_Type[${i}] must be a string`, `Records_Type[${i}]`);
        throw new BEJSONValidationError('Bad Records_Type entry', E_INVALID_RECORDS_TYPE);
      }
      if (seen.has(rt[i])) {
        _state.addError(`Duplicate type '${rt[i]}' found in 'Records_Type'`, 'Records_Type');
        throw new BEJSONValidationError(`Duplicate Records_Type: ${rt[i]}`, E_INVALID_RECORDS_TYPE);
      }
      seen.add(rt[i]);
    }
  }
}

// ---------------------------------------------------------------------------
// Fields structure validation
// mirrors bejson_validator_check_fields_structure
// ---------------------------------------------------------------------------

/**
 * Step 4: every field needs a name and a valid lowercase type. 104a forbids array/object types. In 104db every field except Record_Type_Parent must carry a Record_Type_Parent property naming its owning entity.
 */
function bejson_validator_check_fields_structure(doc, version) {
  const fields = doc['Fields'];
  if (!fields || fields.length === 0) {
    _state.addError("'Fields' array cannot be empty", 'Fields Array');
    throw new BEJSONValidationError('Empty Fields', E_INVALID_FIELDS);
  }

  const seenNames = new Set();
  for (let i = 0; i < fields.length; i++) {
    const fieldDef = fields[i];
    if (typeof fieldDef !== 'object' || fieldDef === null || Array.isArray(fieldDef)) {
      _state.addError(`Field at index ${i} must be an object`, `Fields[${i}]`);
      throw new BEJSONValidationError(`Field ${i} not an object`, E_INVALID_FIELDS);
    }

    const name = fieldDef['name'];
    if (typeof name !== 'string') {
      _state.addError(
        `Field at index ${i}: Missing or invalid 'name' (must be string)`,
        `Fields[${i}]`,
      );
      throw new BEJSONValidationError(`Field ${i} bad name`, E_INVALID_FIELDS);
    }

    if (seenNames.has(name)) {
      _state.addError(`Duplicate field name '${name}' found in 'Fields' array`, `Fields[${i}]`);
      throw new BEJSONValidationError(`Duplicate field: ${name}`, E_INVALID_FIELDS);
    }
    seenNames.add(name);

    const ftype = fieldDef['type'];
    if (typeof ftype !== 'string' || !VALID_FIELD_TYPES.has(ftype)) {
      _state.addError(
        `Field '${name}' (index ${i}): Invalid type '${ftype}'. Valid: ${[...VALID_FIELD_TYPES].join(', ')}`,
        `Fields[${i}]`,
      );
      throw new BEJSONValidationError(`Field ${name} invalid type`, E_INVALID_FIELDS);
    }

    if (version === '104a' && (ftype === 'array' || ftype === 'object')) {
      _state.addError(
        `Field '${name}' (index ${i}): Type '${ftype}' not allowed in 104a.`,
        `Fields[${i}]`,
      );
      throw new BEJSONValidationError(`Field ${name} disallowed type for 104a`, E_INVALID_FIELDS);
    }
  }

  return fields.length;
}

// ---------------------------------------------------------------------------
// 104db Record_Type_Parent validation
// mirrors bejson_validator_check_record_type_parent
// ---------------------------------------------------------------------------

/**
 * Step 5 (104db only): first field must be Record_Type_Parent and each row's column 0 must be one of Records_Type. This discriminator does not exist in 104/104a or in MFDB entity files.
 */
function bejson_validator_check_record_type_parent(doc) {
  const fields = doc['Fields'];
  const first  = fields[0] ?? {};
  if (!fields.length || first['name'] !== 'Record_Type_Parent' || first['type'] !== 'string') {
    _state.addError(
      `For BEJSON 104db, the first field must be {"name": "Record_Type_Parent", "type": "string"}. ` +
      `Found: ${JSON.stringify(first)}`,
      'Fields[0]',
    );
    throw new BEJSONValidationError('Bad Record_Type_Parent field', E_INVALID_RECORD_TYPE_PARENT);
  }

  const validTypes = new Set(doc['Records_Type']);
  for (let i = 0; i < doc['Values'].length; i++) {
    const record = doc['Values'][i];
    if (!Array.isArray(record)) {
      _state.addError(`Values[${i}] must be an array (record)`, `Values[${i}]`);
      throw new BEJSONValidationError(`Bad record at ${i}`, E_INVALID_VALUES);
    }
    const rtp = record[0] ?? null;
    if (!rtp) {
      _state.addError(
        `Record at 'Values' index ${i}: 'Record_Type_Parent' is missing or null`,
        `Values[${i}][0]`,
      );
      throw new BEJSONValidationError(`Missing RTP at ${i}`, E_INVALID_RECORD_TYPE_PARENT);
    }
    if (!validTypes.has(rtp)) {
      _state.addError(
        `Record at 'Values' index ${i}: 'Record_Type_Parent' value '${rtp}' ` +
        `does not match any declared type in 'Records_Type'`,
        `Values[${i}][0]`,
      );
      throw new BEJSONValidationError(`Invalid RTP '${rtp}' at ${i}`, E_INVALID_RECORD_TYPE_PARENT);
    }
  }
}

// ---------------------------------------------------------------------------
// Values validation
// mirrors bejson_validator_check_values
// ---------------------------------------------------------------------------

/**
 * Returns the JSON type name of a value ('null', 'array', 'object', 'string', 'number', 'boolean').
 */
function _jsonType(value) {
  if (value === null)             return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (Number.isInteger(value))    return 'integer';
  if (typeof value === 'number')  return 'number';
  if (typeof value === 'string')  return 'string';
  if (Array.isArray(value))       return 'array';
  if (typeof value === 'object')  return 'object';
  return 'unknown';
}

/**
 * Step 6: every row has one cell per field and each non-null cell matches its field type. null is always allowed (it is the null-padding in 104db).
 */
function bejson_validator_check_values(doc, version, fieldsCount) {
  const values = doc['Values'];
  const fields = doc['Fields'];

  for (let i = 0; i < values.length; i++) {
    const record = values[i];
    if (!Array.isArray(record)) {
      _state.addError(`Values[${i}] must be an array (record)`, `Values[${i}]`);
      throw new BEJSONValidationError(`Bad record at ${i}`, E_INVALID_VALUES);
    }

    if (record.length !== fieldsCount) {
      _state.addError(
        `Record at 'Values' index ${i} has ${record.length} elements, ` +
        `but 'Fields' defines ${fieldsCount} fields.`,
        `Values[${i}]`,
      );
      throw new BEJSONValidationError(`Length mismatch at ${i}`, E_RECORD_LENGTH_MISMATCH);
    }

    const recordType = (version === '104db' && record.length > 0) ? record[0] : null;

    for (let j = 0; j < record.length; j++) {
      const value     = record[j];
      const fieldDef  = fields[j];
      const fieldName = fieldDef['name'];
      const fieldType = fieldDef['type'];
      const fieldParent = fieldDef['Record_Type_Parent'] ?? '';

      // 104db applicability: field not for this record type → must be null
      if (version === '104db' && fieldParent && j > 0) {
        if (fieldParent !== recordType) {
          if (value !== null) {
            _state.addError(
              `Record at 'Values' index ${i} (type '${recordType}'), ` +
              `field '${fieldName}' (index ${j}): not applicable to this type; must be null.`,
              `Values[${i}][${j}]`,
            );
            throw new BEJSONValidationError('Null violation', E_NULL_VIOLATION);
          }
          continue;
        }
      }

      if (value === null) continue;

      const vtype = _jsonType(value);
      let typeValid = false;

      switch (fieldType) {
        case 'string':
          typeValid = typeof value === 'string';
          break;
        case 'integer':
          typeValid = Number.isInteger(value) && typeof value !== 'boolean';
          break;
        case 'number':
          typeValid = typeof value === 'number' && typeof value !== 'boolean';
          break;
        case 'boolean':
          typeValid = typeof value === 'boolean';
          break;
        case 'array':
          typeValid = Array.isArray(value);
          break;
        case 'object':
          typeValid = typeof value === 'object' && !Array.isArray(value);
          break;
      }

      if (!typeValid) {
        _state.addError(
          `Record at 'Values' index ${i}, field '${fieldName}' (index ${j}): ` +
          `Value '${value}' is of type '${vtype}', but 'Fields' defines type '${fieldType}'.`,
          `Values[${i}][${j}]`,
        );
        throw new BEJSONValidationError(`Type mismatch at [${i}][${j}]`, E_TYPE_MISMATCH);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Custom headers validation (104a)
// mirrors bejson_validator_check_custom_headers
// ---------------------------------------------------------------------------

const _PASCAL_CASE = /^[A-Z][a-zA-Z0-9_]*$/;

/**
 * Step 7: custom top-level keys. 104 and 104db forbid them (except Parent_Hierarchy); 104a allows them as file-level metadata. MFDB manifests use that 104a allowance for MFDB_Version, DB_Name, etc.
 */
function bejson_validator_check_custom_headers(doc, version) {
  const mandatorySet = new Set(MANDATORY_KEYS);
  for (const key of Object.keys(doc)) {
    if (mandatorySet.has(key) || key === 'Parent_Hierarchy') continue;
    if (version === '104' || version === '104db') {
      _state.addError(
        `For BEJSON ${version}, custom top-level key '${key}' is not permitted.`,
        `Top-Level Keys/${key}`,
      );
      throw new BEJSONValidationError(`Unexpected key: ${key}`, E_RESERVED_KEY_COLLISION);
    }
    // 104a: Custom headers allowed, no strict naming enforcement
    // 104a custom headers carry file-level metadata only; PascalCase is recommended, not enforced.
    // 104 and 104db forbid custom top-level keys (rejected above); Parent_Hierarchy is the built-in exception.
  }
}

// ---------------------------------------------------------------------------
// Main validation entry points
// mirrors bejson_validator_validate_string / bejson_validator_validate_file
// ---------------------------------------------------------------------------

/**
 * Runs all steps on a JSON string. Returns true/false; details via get_errors / get_warnings. Structural BEJSON rules only (MFDB rules are in mfdb_validator).
 */
function bejson_validator_validate_string(jsonString) {
  bejson_validator_reset_state();
  const doc          = bejson_validator_check_json_syntax(jsonString, false);
  const version      = bejson_validator_check_mandatory_keys(doc);
  bejson_validator_check_custom_headers(doc, version);
  bejson_validator_check_records_type(doc, version);
  const fieldsCount  = bejson_validator_check_fields_structure(doc, version);
  if (version === '104db') bejson_validator_check_record_type_parent(doc);
  bejson_validator_check_values(doc, version, fieldsCount);
  return true;
}

/**
 * Same as validate_string, reading a file path.
 */
function bejson_validator_validate_file(filePath) {
  bejson_validator_reset_state();
  try {
    const text = IO_PROVIDER.readFile(filePath);
    _state.currentFile = filePath;
    return bejson_validator_validate_string(text);
  } catch (err) {
    _state.addError(`IO Error: ${err.message}`, 'File System');
    throw new BEJSONValidationError(`IO Error: ${err.message}`, E_FILE_NOT_FOUND);
  }
}

// ---------------------------------------------------------------------------
// Validation report
// mirrors bejson_validator_get_report
// ---------------------------------------------------------------------------

/**
 * Runs validation and returns a human-readable report string.
 */
function bejson_validator_get_report(input, isFile = false) {
  let valid = false;
  try {
    if (isFile) {
      valid = bejson_validator_validate_file(input);
    } else {
      valid = bejson_validator_validate_string(input);
    }
  } catch (_) {
    // errors captured in _state
  }

  const lines = [
    '=== BEJSON Validation Report ===',
    `Status: ${valid ? 'VALID' : 'INVALID'}`,
    '',
    `Errors: ${bejson_validator_error_count()}`,
  ];
  if (bejson_validator_has_errors()) {
    lines.push('---');
    lines.push(...bejson_validator_get_errors());
  }
  lines.push('', `Warnings: ${bejson_validator_warning_count()}`);
  if (bejson_validator_has_warnings()) {
    lines.push('---');
    lines.push(...bejson_validator_get_warnings());
  }

  return lines.join('\n');
}