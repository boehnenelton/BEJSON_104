/**
 * Library:         lib_bejson_Diagrams_bejson_errors.ts
 * Family:          Diagrams
 * Module Purpose:  Error registry for the Diagrams family (error codes 420-449).
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         1.2.0
 * Release_Version: 300
 * Date:            2026-10-29
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   7b4a2e1d-8f9c-43e6-a0b5-9d3c1e2f8a74
 */

export const E_DIAGRAMS_NOT_MFDB132_PACKAGE      = 420;
export const E_DIAGRAMS_MFDB132_INVALID          = 421;
export const E_DIAGRAMS_MFDB_DATABASE_INVALID    = 422;
export const E_DIAGRAMS_MISSING_ENTITY           = 423;
export const E_DIAGRAMS_MISSING_FIELD            = 424;
export const E_DIAGRAMS_FK_UNRESOLVED            = 425;
export const E_DIAGRAMS_INVALID_SIZE_CLASS       = 426;
export const E_DIAGRAMS_INVALID_ROOT             = 427;
export const E_DIAGRAMS_WRITE_FAILED             = 428;
export const E_DIAGRAMS_IMPORT_FAILED            = 429;
export const E_DIAGRAMS_NOT_A_DIAGRAM_PACKAGE    = 430;
export const E_DIAGRAMS_AI_EMPTY_PROMPT          = 431;
export const E_DIAGRAMS_AI_BAD_RESPONSE          = 432;
export const E_DIAGRAMS_AI_INVALID_PLAN          = 433;
export const E_DIAGRAMS_AI_PROVIDER_ERROR        = 434;
export const E_DIAGRAMS_AI_SEMANTIC_INVALID      = 435;
export const E_DIAGRAMS_VALIDATION_FAILED        = 436;
export const E_DIAGRAMS_CIRCULAR_HIERARCHY       = 437;
export const E_DIAGRAMS_SHAPE_NOT_FOUND          = 438;
export const E_DIAGRAMS_CONNECTOR_NOT_FOUND      = 439;
export const E_DIAGRAMS_TERRITORY_NOT_FOUND      = 440;
export const E_DIAGRAMS_DUPLICATE_ID             = 441;
export const E_DIAGRAMS_INVALID_COORDINATES      = 442;
export const E_DIAGRAMS_EXPORT_FAILED            = 443;
export const E_DIAGRAMS_AI_CALL_FAILED           = 444;
export const E_DIAGRAMS_AI_SCAFFOLD_FAILED       = 445;
export const E_DIAGRAMS_AI_PARSE_FAILED          = 446;
export const E_DIAGRAMS_CONNECTOR_SELF_REFERENCE = 447;
export const E_DIAGRAMS_AI_DANGLING_PARENT       = 448;
export const E_DIAGRAMS_AI_DANGLING_CONNECTOR    = 449;

export const DIAGRAMS_ERROR_CODES = {
  E_DIAGRAMS_NOT_MFDB132_PACKAGE,
  E_DIAGRAMS_MFDB132_INVALID,
  E_DIAGRAMS_MFDB_DATABASE_INVALID,
  E_DIAGRAMS_MISSING_ENTITY,
  E_DIAGRAMS_MISSING_FIELD,
  E_DIAGRAMS_FK_UNRESOLVED,
  E_DIAGRAMS_INVALID_SIZE_CLASS,
  E_DIAGRAMS_INVALID_ROOT,
  E_DIAGRAMS_WRITE_FAILED,
  E_DIAGRAMS_IMPORT_FAILED,
  E_DIAGRAMS_NOT_A_DIAGRAM_PACKAGE,
  E_DIAGRAMS_AI_EMPTY_PROMPT,
  E_DIAGRAMS_AI_BAD_RESPONSE,
  E_DIAGRAMS_AI_INVALID_PLAN,
  E_DIAGRAMS_AI_PROVIDER_ERROR,
  E_DIAGRAMS_AI_SEMANTIC_INVALID,
  E_DIAGRAMS_VALIDATION_FAILED,
  E_DIAGRAMS_CIRCULAR_HIERARCHY,
  E_DIAGRAMS_SHAPE_NOT_FOUND,
  E_DIAGRAMS_CONNECTOR_NOT_FOUND,
  E_DIAGRAMS_TERRITORY_NOT_FOUND,
  E_DIAGRAMS_DUPLICATE_ID,
  E_DIAGRAMS_INVALID_COORDINATES,
  E_DIAGRAMS_EXPORT_FAILED,
  E_DIAGRAMS_AI_CALL_FAILED,
  E_DIAGRAMS_AI_SCAFFOLD_FAILED,
  E_DIAGRAMS_AI_PARSE_FAILED,
  E_DIAGRAMS_CONNECTOR_SELF_REFERENCE,
  E_DIAGRAMS_AI_DANGLING_PARENT,
  E_DIAGRAMS_AI_DANGLING_CONNECTOR,
} as const;

export type DiagramsErrorCode = typeof DIAGRAMS_ERROR_CODES[keyof typeof DIAGRAMS_ERROR_CODES];

export class DiagramsError extends Error {
  public readonly code: number;
  public readonly context?: any;
  constructor(message: string, code: number = DIAGRAMS_ERROR_CODES.E_DIAGRAMS_VALIDATION_FAILED, context?: any) {
    super(message);
    this.name = "DiagramsError";
    this.code = code;
    this.context = context;
  }
}

export class AIBuildError extends DiagramsError {
  constructor(message: string, code: number = DIAGRAMS_ERROR_CODES.E_DIAGRAMS_AI_CALL_FAILED, context?: any) {
    super(message, code, context);
    this.name = "AIBuildError";
  }
}
