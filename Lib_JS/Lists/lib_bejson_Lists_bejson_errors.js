/**
 * Library:         lib_bejson_Lists_bejson_errors.js
 * Family:          Lists
 * Module Purpose:  Error registry for the Lists family (hierarchical id/parent_id list validation).
 * Architecture:    Lists family owns its own codes (480-499) so Core's frozen registry is untouched; the validator layers on Core's structural validator and field map.
 * Format_Scope:    104 | 104a (list-shaped documents)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         1.0.0
 * Release_Version: 300
 * Date:            2026-10-13
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   a7591ed9-380b-4c56-9ede-72ae4400fb5e
 * Changelog:
 *   1.0.0 (2026-10-13) - New. List-validator error codes moved out of ad-hoc Core codes
 *   (35/39/4/12 reuse, TS aliases 4/6/2/8) into a dedicated range. 491-499 reserved.
 */

// ===========================================================================
// ERROR CODES -- Lists range: 480-499
// ===========================================================================
const LISTS_ERRORS = Object.freeze({
  E_LISTS_STRUCTURE_INVALID:   480,  // Input is not a document, malformed JSON, or the Core structural validator rejected it
  E_LISTS_INVALID_VERSION:     481,  // Format_Version is not 104 or 104a
  E_LISTS_MISSING_FIELDS:      482,  // Document lacks the id and/or parent_id field
  E_LISTS_SHORT_ROW:           483,  // A Values row has fewer cells than the id/parent_id columns need
  E_LISTS_NULL_ID:             484,  // A row has a null id, or a non-scalar id / parent_id
  E_LISTS_DUPLICATE_ID:        485,  // Two rows share the same id
  E_LISTS_ORPHAN:              486,  // parent_id references an id that does not exist
  E_LISTS_CYCLE:               487,  // parent_id chain loops back on itself (incl. self-parent)
  E_LISTS_FIELD_NOT_FOUND:     488,  // validate_field: named field is not in Fields
  E_LISTS_FIELD_NOT_ARRAY:     489,  // validate_field: a non-null cell is not an array
  E_LISTS_ITEM_TYPE_MISMATCH:  490,  // validate_field: an array element has the wrong type
  // 491-499 reserved for future Lists codes.
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LISTS_ERRORS;
}
if (typeof window !== 'undefined') {
    window.LISTS_ERRORS = LISTS_ERRORS;
}
