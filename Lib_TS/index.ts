/**
 * Library:         index.ts
 * Family:          Lib_TS
 * Module Purpose:  Main entry point for TypeScript library family. v2.1.0: Added Gaming/Backend sub-family (AI, Combat, Inventory, PhysicsBackend, Registry, Terrain, GamingTypes).
 * Architecture:    BEJSON 104db provides single-file multi-entity relational storage with positional null-padding, Record_Type_Parent discriminator headers, and plain-text LLM readability.
 * Version:         2.1.0
 * Release_Version: 300
 * Date:            2026-06-18
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   f35f05b7-d602-49ad-bc3b-0137c25204de
 */

// Types & error classes
export * from "./Core/lib_bejson_Core_bejson_types";

// Core operations (parse, serialize, record CRUD)
export * from "./Core/lib_bejson_Core_bejson_core";
export * from "./Core/lib_bejson_Core_bejson_field_map";

// BEJSON validators (104, 104a, 104db)
export {
  validateDocument,
  validate104,
  validate104a,
  validate104db,
  assertValid,
  isValid,
} from "./Core/lib_bejson_Core_bejson_validators";

// MFDB validators
export {
  discoverRole,
  validateManifest,
  validateEntityFile,
  validateDatabase,
  decodeManifestRecords,
  decodeDatabaseMeta,
} from "./Core/lib_bejson_Core_mfdb_validators";

// MFDB core
export {
  createManifest,
  registerEntity,
  unregisterEntity,
  syncRecordCount,
} from "./Core/lib_bejson_Core_mfdb_core";

export type { EntityValidationOptions, DatabaseValidationOptions } from "./Core/lib_bejson_Core_mfdb_validators";
export type { CreateManifestOptions as MFDBCreateManifestOptions } from "./Core/lib_bejson_Core_mfdb_core";

export * from "./Gaming/lib_bejson_Gaming_bejson_assets";
export * from "./Gaming/lib_bejson_Gaming_bejson_engine";
export * from "./Gaming/lib_bejson_Gaming_bejson_events";
export * from "./Gaming/lib_bejson_Gaming_bejson_grid";
export * from "./Gaming/lib_bejson_Gaming_bejson_input";
export * from "./Gaming/lib_bejson_Gaming_bejson_physics";
export * from "./Gaming/lib_bejson_Gaming_bejson_renderer";

// Gaming / Backend sub-family (v2.1.0)
export * from "./Gaming/Backend/lib_bejson_GamingBackend_types";
export * from "./Gaming/Backend/lib_bejson_GamingBackend_ai";
export * from "./Gaming/Backend/lib_bejson_GamingBackend_combat";
export * from "./Gaming/Backend/lib_bejson_GamingBackend_inventory";
export * from "./Gaming/Backend/lib_bejson_GamingBackend_physics";
export * from "./Gaming/Backend/lib_bejson_GamingBackend_registry";
export * from "./Gaming/Backend/lib_bejson_GamingBackend_terrain";
export * from "./Gaming/Backend/lib_bejson_GamingBackend_state";

// Schema management
export * from "./Core/lib_bejson_Core_bejson_schema";