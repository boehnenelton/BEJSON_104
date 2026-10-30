/**
 * Library:         lib_bejson_Diagrams_bejson_errors.js
 * Family:          Diagrams
 * Module Purpose:  Error registry and exception classes for the Diagrams family (error codes 420-449).
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         1.2.0
 * Release_Version: 300
 * Date:            2026-10-30
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   7b4a2e1d-8f9c-43e6-a0b5-9d3c1e2f8a74
 */

'use strict';

const DIAGRAMS_ERROR_CODES = Object.freeze({
  E_DIAGRAMS_NOT_MFDB132_PACKAGE:      420,
  E_DIAGRAMS_MFDB132_INVALID:          421,
  E_DIAGRAMS_MFDB_DATABASE_INVALID:    422,
  E_DIAGRAMS_MISSING_ENTITY:           423,
  E_DIAGRAMS_MISSING_FIELD:            424,
  E_DIAGRAMS_FK_UNRESOLVED:            425,
  E_DIAGRAMS_INVALID_SIZE_CLASS:       426,
  E_DIAGRAMS_INVALID_ROOT:             427,
  E_DIAGRAMS_WRITE_FAILED:             428,
  E_DIAGRAMS_IMPORT_FAILED:            429,
  E_DIAGRAMS_NOT_A_DIAGRAM_PACKAGE:    430,
  E_DIAGRAMS_AI_EMPTY_PROMPT:          431,
  E_DIAGRAMS_AI_BAD_RESPONSE:          432,
  E_DIAGRAMS_AI_INVALID_PLAN:          433,
  E_DIAGRAMS_AI_PROVIDER_ERROR:        434,
  E_DIAGRAMS_AI_SEMANTIC_INVALID:      435,
  E_DIAGRAMS_VALIDATION_FAILED:        436,
  E_DIAGRAMS_CIRCULAR_HIERARCHY:       437,
  E_DIAGRAMS_SHAPE_NOT_FOUND:          438,
  E_DIAGRAMS_CONNECTOR_NOT_FOUND:      439,
  E_DIAGRAMS_TERRITORY_NOT_FOUND:      440,
  E_DIAGRAMS_DUPLICATE_ID:             441,
  E_DIAGRAMS_INVALID_COORDINATES:      442,
  E_DIAGRAMS_EXPORT_FAILED:            443,
  E_DIAGRAMS_AI_CALL_FAILED:           444,
  E_DIAGRAMS_AI_SCAFFOLD_FAILED:       445,
  E_DIAGRAMS_AI_PARSE_FAILED:          446,
  E_DIAGRAMS_CONNECTOR_SELF_REFERENCE: 447,
  E_DIAGRAMS_AI_DANGLING_PARENT:       448,
  E_DIAGRAMS_AI_DANGLING_CONNECTOR:    449,
});

class DiagramsError extends Error {
  constructor(message, code = DIAGRAMS_ERROR_CODES.E_DIAGRAMS_VALIDATION_FAILED, context = {}) {
    super(message);
    this.name = 'DiagramsError';
    this.code = code;
    this.context = context;
  }
}

class AIBuildError extends DiagramsError {
  constructor(message, code = DIAGRAMS_ERROR_CODES.E_DIAGRAMS_AI_CALL_FAILED, context = {}) {
    super(message, code, context);
    this.name = 'AIBuildError';
  }
}

const exports_ = Object.assign({}, DIAGRAMS_ERROR_CODES, {
  DIAGRAMS_ERROR_CODES,
  DiagramsError,
  AIBuildError,
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exports_;
}
if (typeof window !== 'undefined') {
  window.DIAGRAMS_ERRORS = exports_;
}
