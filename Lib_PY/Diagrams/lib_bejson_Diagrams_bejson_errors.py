"""
Library:         lib_bejson_Diagrams_bejson_errors.py
Family:          Diagrams
Module Purpose:  Implements runtime functionality and logic for lib_bejson_Diagrams_bejson_errors.py.
Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
Version:         1.1.0
Release_Version: 300
Date:            2026-09-25
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   8c1e4a6d-2f9b-4c3e-9a5d-7b1f0e3c6a42
Changelog:
  1.1.0 (2026-09-25) - Added 435 for diagrams_ai_validate_plan_semantics()
          (lib_bejson_Diagrams_diagrams_ai.py): the post-reception,
          pre-approval semantic pass -- enum membership, color format,
          coordinate sanity -- distinct from 433, which only covers
          reference-integrity failures caught while a plan is first parsed.
"""

# ---------------------------------------------------------------------------
# Diagrams (420-449)
# ---------------------------------------------------------------------------
E_DIAGRAMS_NOT_MFDB132_PACKAGE   = 420  # Doc failed mfdb_validator_is_mfdb132_package()
E_DIAGRAMS_MFDB132_INVALID       = 421  # Doc failed mfdb_validator_validate_mfdb132_package()
E_DIAGRAMS_MFDB_DATABASE_INVALID = 422  # Unpacked manifest failed mfdb_validator_validate_database()
E_DIAGRAMS_MISSING_ENTITY        = 423  # Required Board/Connector/Territory entity absent from manifest
E_DIAGRAMS_MISSING_FIELD         = 424  # Required field absent from an entity's Fields[]
E_DIAGRAMS_FK_UNRESOLVED         = 425  # board_membership_fk / conn_from_fk / conn_to_fk / shape_parent_fk points nowhere
E_DIAGRAMS_INVALID_SIZE_CLASS    = 426  # shape_size_class not in the known SIZE_CLASS set
E_DIAGRAMS_INVALID_ROOT          = 427  # mfdb_root_dir has no 104a.mfdb.bejson at its root
E_DIAGRAMS_WRITE_FAILED          = 428  # Atomic write of the .mfdb132.bejson package failed
E_DIAGRAMS_IMPORT_FAILED         = 429  # Unchunk of an .mfdb132.bejson package failed
E_DIAGRAMS_NOT_A_DIAGRAM_PACKAGE = 430  # Package is valid MFDB-132 but not tagged Diagram_Schema
E_DIAGRAMS_AI_EMPTY_PROMPT       = 431  # Prompt supplied to AI diagram generator was empty or whitespace
E_DIAGRAMS_AI_BAD_RESPONSE       = 432  # AI provider response could not be parsed as valid JSON plan
E_DIAGRAMS_AI_INVALID_PLAN       = 433  # AI generated plan failed structural/schema validation
E_DIAGRAMS_AI_PROVIDER_ERROR     = 434  # AI provider API call failed or timed out
E_DIAGRAMS_AI_SEMANTIC_INVALID   = 435  # Plan is structurally sound but fails post-reception semantic checks

# 436-449 reserved for future Diagrams codes.