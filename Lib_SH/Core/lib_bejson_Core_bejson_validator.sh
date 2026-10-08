# -----------------------------------------------------------------------------
# Library:         lib_bejson_Core_bejson_validator.sh
# Family:          Core
# Module Purpose:  Structural validator for BEJSON 104, 104a and 104db (mandatory keys, Records_Type, Fields, Values, version-specific rules). MFDB rules live in the mfdb_validator module.
# Architecture:    Format-level BEJSON layer that works on any BEJSON document (104, 104a, 104db) through positional Fields/Values and the field-map cache. It does not orchestrate MFDB and is not specific to 104db.
# Format_Scope:    104 | 104a | 104db (generic)
# Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
#                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
#                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
# Version:         2.1.4
# Release_Version: 300
# Date:            2026-10-06
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   c4c84164-e410-4afb-9639-923b529d3419
# -----------------------------------------------------------------------------

set -o pipefail

# Source the error registry (assumes same directory)
_VAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$_VAL_DIR/lib_bejson_Core_bejson_errors.sh" ]]; then
    # shellcheck source=./lib_bejson_Core_bejson_errors.sh
    source "$_VAL_DIR/lib_bejson_Core_bejson_errors.sh"
fi

#-------------------------------------------------------------------------------
# CORE VALIDATION
#-------------------------------------------------------------------------------

# Checks that jq is installed; returns non-zero otherwise.
bejson_validator_check_dependencies() {
    if ! command -v jq >/dev/null 2>&1; then
        echo "ERROR: jq is required for BEJSON validation" >&2
        return 1
    fi
    local jq_ver
    jq_ver=$(jq --version | sed 's/jq-//')
    local jq_major jq_minor
    jq_major="${jq_ver%%.*}"
    jq_minor="${jq_ver#*.}"; jq_minor="${jq_minor%%.*}"
    if [[ "$jq_major" -lt 1 ]] || { [[ "$jq_major" -eq 1 ]] && [[ "$jq_minor" -lt 6 ]]; }; then
        echo "ERROR: jq >= 1.6 is required. Found: $jq_ver" >&2
        return 1
    fi
    return 0
}

# Basic validity check of a BEJSON file with jq: (1) parses as JSON, (2) the six mandatory keys exist, (3) Format is 'BEJSON' and Format_Creator is 'Elton Boehnen', (4) every row has as many cells as there are Fields, (5) the file does not contain the reserved in-memory key _bejson_field_map (E_RESERVED_KEY_COLLISION), (6) field names are unique (E_INVALID_FIELDS). Returns 0 or an E_* code.
# This Bash validator does NOT apply the version-specific rules (record-type count, Record_Type_Parent for 104db, 104a field types, custom-header rules); use the Python, JavaScript or TypeScript validators for full 104 / 104a / 104db validation.
bejson_validator_validate_file() {
    local file_path="$1"
    if [[ ! -f "$file_path" ]]; then
        echo "ERROR: File not found: $file_path" >&2
        return 1
    fi

    # 1. Basic JSON check
    if ! jq . "$file_path" >/dev/null 2>&1; then
        return $E_INVALID_JSON
    fi

    # 2. Mandatory Keys — exact presence check via jq, one key at a time (a =~ match on a joined key string
    #    would hit substrings, e.g. "Format" inside "Format_Creator").
    for k in Format Format_Version Format_Creator Records_Type Fields Values; do
        if ! jq -e --arg key "$k" 'has($key)' "$file_path" >/dev/null 2>&1; then
            return $E_MISSING_MANDATORY_KEY
        fi
    done

    # 3. Format & Creator check
    local fmt creator
    fmt=$(jq -r '.Format' "$file_path")
    creator=$(jq -r '.Format_Creator' "$file_path")
    [[ "$fmt"     != "BEJSON"        ]] && return $E_INVALID_FORMAT
    [[ "$creator" != "Elton Boehnen" ]] && return $E_INVALID_FORMAT_CREATOR

    # 4. Records Length check
    local field_count bad_records
    field_count=$(jq '.Fields | length' "$file_path")
    bad_records=$(jq --argjson fc "$field_count" '.Values | map(select(length != $fc)) | length' "$file_path")
    if [[ "$bad_records" -gt 0 ]]; then
        return $E_RECORD_LENGTH_MISMATCH
    fi

    # 4b. The field-map cache is in-memory only; a persisted copy is forbidden (parity with Py/JS validators)
    if jq -e 'has("_bejson_field_map")' "$file_path" >/dev/null 2>&1; then
        return $E_RESERVED_KEY_COLLISION
    fi

    # 5. Field names must be unique (name-based addressing is ambiguous otherwise)
    if ! jq -e '(.Fields | map(.name)) as $n | ($n | length) == ($n | unique | length)' "$file_path" >/dev/null 2>&1; then
        return $E_INVALID_FIELDS
    fi

    return 0
}

# Export functions for subshell use
export -f bejson_validator_check_dependencies
export -f bejson_validator_validate_file