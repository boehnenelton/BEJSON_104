/**
 * Library:         index.ts
 * Family:          Lists
 * Module Purpose:  Barrel file re-exporting the TypeScript Lists API (list validator, field validator, error codes).
 * Architecture:    Barrel only.
 * Format_Scope:    104 | 104a (list-shaped documents)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         1.0.0
 * Release_Version: 300
 * Date:            2026-10-13
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   b1bf9a97-83b5-4e7d-a697-d76c3850416f
 */

export * from "./lib_bejson_Lists_bejson_errors";
export * from "./lib_bejson_Lists_list_validator";
