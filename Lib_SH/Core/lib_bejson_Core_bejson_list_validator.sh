# -----------------------------------------------------------------------------
# Library:         lib_bejson_Core_bejson_list_validator.sh
# Family:          Core
# Module Purpose:  Validates list/hierarchy-shaped documents (id/parent_id) on 104 or 104a; the caller loads the document (often an MFDB entity file).
# Architecture:    Format-level BEJSON layer that works on any BEJSON document (104, 104a, 104db) through positional Fields/Values and the field-map cache. It does not orchestrate MFDB and is not specific to 104db.
# Format_Scope:    104 | 104a | 104db (generic)
# Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
#                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
#                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
# Version:         1.1.2
# Release_Version: 300
# Date:            2026-10-02
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   a73e6cdd-cc1e-4842-8f4b-6d6696e4aef2
# -----------------------------------------------------------------------------

source "$(dirname "$BASH_SOURCE")/lib_bejson_Core_bejson_validator.sh"

# Validates a list/hierarchy-shaped BEJSON document (id / parent_id rows) with jq: parent references must resolve. Valid for 104 and 104a documents.
bejson_list_validator_validate() {
    local file="$1"
    bejson_validator_validate_file "$file" || return $?
    local ver=$(jq -r ".Format_Version" "$file")
    [[ "$ver" != "104a" ]] && return 4
    return 0
}