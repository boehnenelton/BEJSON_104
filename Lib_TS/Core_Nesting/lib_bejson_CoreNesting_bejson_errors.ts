/**
 * Library:         lib_bejson_CoreNesting_bejson_errors.ts
 * Family:          Core_Nesting
 * Module Purpose:  Error codes for the Nesting layer.
 * Architecture:    Nested BEJSON 104: a cell of a parent 104 document holds a complete embedded 104 document; the physical cell coordinate (NestAddress) is the implicit foreign key. It is neither 104db nor MFDB.
 * Format_Scope:    Nested 104 (NOT 104db, NOT MFDB)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         1.0.2
 * Release_Version: 300
 * Date:            2026-10-02
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   c34bd609-3e16-49d2-99a3-42257ce8025a
 */

// ===========================================================================
// ERROR CODES — Core_Nesting range: 130–159
// ===========================================================================
export const CORE_NESTING_ERRORS = {
  E_NESTING_INVALID_CELL:       130,
  E_NESTING_NOT_BEJSON:         131,
  E_NESTING_DEPTH_EXCEEDED:     132,
  E_NESTING_CACHE_MISS:         133,
  E_NESTING_SCHEMA_MISMATCH:    134,
  E_NESTING_CIRCULAR_REF:       135,
  E_NESTING_VALIDATION_FAILED:  136,
  E_NESTING_FIELD_MAP_FAILED:   137,
  E_NESTING_QUERY_INVALID_PATH: 138,
  E_NESTING_QUERY_EMPTY_PATH:   139,
  // 140-159 reserved for future Core_Nesting codes.
} as const;

export type CoreNestingErrorCode = typeof CORE_NESTING_ERRORS[keyof typeof CORE_NESTING_ERRORS];