/**
 * Library:         lib_bejson_Core_bejson_list_validator.js
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
 * RELATIONAL_ID:   11a19263-ce03-4f34-a277-77c3f6d5b2f9
 */

'use strict';

const StandardValidator = (typeof require !== 'undefined') 
  ? require('./lib_bejson_Core_bejson_validator.js') 
  : (window.BEJSON_VALIDATOR || {});

const ListValidator = {
    /**
     * Validates a list/hierarchy-shaped BEJSON document given as a JSON string: first the standard BEJSON
     * structure check, then the id/parent_id rules (parent references must resolve). Valid for 104 and 104a.
     * Returns { is_valid, errors }.
     */
    validate: function(jsonString) {
        if (!StandardValidator.bejson_validator_validate_string(jsonString)) {
            return { is_valid: false, errors: StandardValidator.bejson_validator_get_errors() };
        }
        const doc = JSON.parse(jsonString);
        if (doc.Format_Version !== '104a') return { is_valid: false, errors: ['Must be 104a'] };
        // single-pass field map
        const _fm = {};
        doc.Fields.forEach((f, i) => { _fm[f.name] = i; });
        const idIdx  = _fm['id']        !== undefined ? _fm['id']        : -1;
        const pidIdx = _fm['parent_id'] !== undefined ? _fm['parent_id'] : -1;
        if (idIdx === -1 || pidIdx === -1) return { is_valid: false, errors: ['Missing core fields'] };
        const ids = new Set();
        const parentRefs = new Map();
        for (let row of doc.Values) {
            ids.add(row[idIdx]);
            if (row[pidIdx]) parentRefs.set(row[idIdx], row[pidIdx]);
        }
        for (let [uid, pid] of parentRefs) {
            if (!ids.has(pid)) return { is_valid: false, errors: ['Orphan detected'] };
        }
        return { is_valid: true, errors: [] };
    }
};

// --- Array Field Homogeneity Validator ---
// Genuinely distinct capability from ListValidator.validate() above: checks that every
// element of an array-typed field matches an expected JS type, rather than checking
// hierarchical id/parent_id orphan references. Matches this file's original header
// description ("ensure array homogeneity"), which ListValidator.validate() does not.
const bejson_core = (typeof require !== 'undefined') ? require('./lib_bejson_Core_bejson_core.js') : (window.BEJSON || {});
const { bejson_core_get_field_map } = bejson_core;

/**
 * Array-field homogeneity check: every element of an array-typed field must have the expected JS type
 * (allowedType). The field is resolved through the field map. Works on 104 / 104a documents (for an
 * MFDB, an entity file loaded by the caller). Not related to 104db or to MFDB itself.
 */
function validateListField(doc, fieldName, allowedType) {
    const fieldMap = bejson_core_get_field_map ? bejson_core_get_field_map(doc) : null;
    const idx = fieldMap ? fieldMap[fieldName] : doc.Fields.findIndex(f => f.name === fieldName);
    if (idx === undefined || idx === -1) {
        throw new Error(`Field '${fieldName}' not found in document.`);
    }

    doc.Values.forEach((row, rIdx) => {
        const val = row[idx];
        if (val !== null) {
            if (!Array.isArray(val)) {
                throw new Error(`Row ${rIdx} validation error: Field '${fieldName}' must be an array.`);
            }
            val.forEach((item, iIdx) => {
                if (typeof item !== allowedType) {
                    throw new Error(`Row ${rIdx} list item ${iIdx} type mismatch: expected '${allowedType}', got '${typeof item}'`);
                }
            });
        }
    });

    return true;
}

if (typeof module !== 'undefined') module.exports = { ...ListValidator, validateListField };
if (typeof window !== 'undefined') {
    window.BEJSON_LIST_VALIDATOR = window.BEJSON_LIST_VALIDATOR || {};
    Object.assign(window.BEJSON_LIST_VALIDATOR, { ...ListValidator, validateListField });
}
export { ListValidator, validateListField };
export default ListValidator;