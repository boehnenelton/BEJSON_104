# -----------------------------------------------------------------------------
# Library:         lib_bejson_Lists_bejson_errors.sh
# Family:          Lists
# Module Purpose:  Error registry for the Lists family (hierarchical id/parent_id list validation). NOTE: shell exit status is 8-bit, so bejson_lists_* functions return 1 on failure and expose the real 480-499 codes via BEJSON_LISTS_CODES.
# Architecture:    Lists family owns its own codes (480-499) so Core's frozen registry is untouched; the validator layers on Core's structural validator and field map.
# Format_Scope:    104 | 104a (list-shaped documents)
# Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
#                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
#                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
# Version:         1.0.0
# Release_Version: 300
# Date:            2026-10-13
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   569f9b4d-06f2-4422-bf07-31420bef8a5e
# Changelog:
#   1.0.0 (2026-10-13) - New. List-validator error codes moved out of ad-hoc Core codes
#   (35/39/4/12 reuse, TS aliases 4/6/2/8) into a dedicated range. 491-499 reserved.
# -----------------------------------------------------------------------------

[[ -n "${_LIB_BEJSON_LISTS_ERRORS_LOADED:-}" ]] && return 0
readonly _LIB_BEJSON_LISTS_ERRORS_LOADED=1

# ===========================================================================
# LISTS (480-499)
# ===========================================================================
[[ -v E_LISTS_STRUCTURE_INVALID ]] || readonly E_LISTS_STRUCTURE_INVALID=480
[[ -v E_LISTS_INVALID_VERSION ]] || readonly E_LISTS_INVALID_VERSION=481
[[ -v E_LISTS_MISSING_FIELDS ]] || readonly E_LISTS_MISSING_FIELDS=482
[[ -v E_LISTS_SHORT_ROW ]] || readonly E_LISTS_SHORT_ROW=483
[[ -v E_LISTS_NULL_ID ]] || readonly E_LISTS_NULL_ID=484
[[ -v E_LISTS_DUPLICATE_ID ]] || readonly E_LISTS_DUPLICATE_ID=485
[[ -v E_LISTS_ORPHAN ]] || readonly E_LISTS_ORPHAN=486
[[ -v E_LISTS_CYCLE ]] || readonly E_LISTS_CYCLE=487
[[ -v E_LISTS_FIELD_NOT_FOUND ]] || readonly E_LISTS_FIELD_NOT_FOUND=488
[[ -v E_LISTS_FIELD_NOT_ARRAY ]] || readonly E_LISTS_FIELD_NOT_ARRAY=489
[[ -v E_LISTS_ITEM_TYPE_MISMATCH ]] || readonly E_LISTS_ITEM_TYPE_MISMATCH=490

# 491-499 reserved for future Lists codes.
