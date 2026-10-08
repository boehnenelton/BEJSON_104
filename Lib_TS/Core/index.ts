/**
 * Library:         index.ts
 * Family:          Core
 * Module Purpose:  Barrel file re-exporting the TypeScript Core API (validators, core helpers, MFDB helpers).
 * Architecture:    Barrel only. It re-exports generic BEJSON modules, the 104db validator and the MFDB modules side by side; the re-export does not merge their concepts.
 * Format_Scope:    Barrel: re-exports generic, 104db and MFDB modules
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         2.0.6
 * Release_Version: 300
 * Date:            2026-10-06
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   813c8808-e108-462c-a9e3-4e4a5d530455
 */

// Types & error classes
export * from "./lib_bejson_Core_bejson_types";

// Core operations (parse, serialize, record CRUD)
export * from "./lib_bejson_Core_bejson_core";
export * from "./lib_bejson_Core_bejson_field_map";

// BEJSON validators (104, 104a, 104db)
export {
  validateDocument,
  validate104,
  validate104a,
  validate104db,
  assertValid,
  isValid,
} from "./lib_bejson_Core_bejson_validators";

// MFDB validators
export {
  discoverRole,
  validateManifest,
  validateEntityFile,
  validateDatabase,
  decodeManifestRecords,
  decodeDatabaseMeta,
} from "./lib_bejson_Core_mfdb_validators";

// MFDB core
export {
  createManifest,
  registerEntity,
  unregisterEntity,
  syncRecordCount,
} from "./lib_bejson_Core_mfdb_core";

export type { EntityValidationOptions, DatabaseValidationOptions } from "./lib_bejson_Core_mfdb_validators";
export type { CreateManifestOptions as MFDBCreateManifestOptions } from "./lib_bejson_Core_mfdb_core";

// Schema management
export * from "./lib_bejson_Core_bejson_schema";