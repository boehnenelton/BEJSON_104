# -----------------------------------------------------------------------------
# Library:         lib_bejson_Core_mfdb_validator.sh
# Family:          Core
# Module Purpose:  MFDB validator: archive, manifest and entity-file validation.
# Architecture:    MFDB (a database architecture layered on BEJSON, not a BEJSON format version): one BEJSON 104a manifest (104a.mfdb.bejson) registers many dense BEJSON 104 entity files linked by Parent_Hierarchy. MFDB-132 packs a whole MFDB into one Chunked-104a document and is handled here as a wrapper around the same manifest + entity structure. It is not 104db and uses no null-padding.
# Format_Scope:    MFDB only (104a manifest + 104 entity files; NOT 104db)
# Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
#                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
#                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
# Version:         2.1.5
# Release_Version: 300
# Date:            2026-10-02
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   f270cbc2-2c5b-4780-8724-312974d1639b
# -----------------------------------------------------------------------------

set -o pipefail

# Source base validator if not already loaded
_MFDB_VAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! declare -f bejson_validator_validate_file > /dev/null 2>&1; then
    # shellcheck source=./lib_bejson_Core_bejson_validator.sh
    source "${_MFDB_VAL_DIR}/lib_bejson_Core_bejson_validator.sh"
fi

#-------------------------------------------------------------------------------
# Error codes (30–49)
#-------------------------------------------------------------------------------

[[ -v E_MFDB_NOT_MANIFEST ]] || readonly E_MFDB_NOT_MANIFEST=30
[[ -v E_MFDB_NOT_ENTITY_FILE ]] || readonly E_MFDB_NOT_ENTITY_FILE=31
[[ -v E_MFDB_MANIFEST_RECORDS_TYPE ]] || readonly E_MFDB_MANIFEST_RECORDS_TYPE=32
[[ -v E_MFDB_ENTITY_NOT_FOUND ]] || readonly E_MFDB_ENTITY_NOT_FOUND=33
[[ -v E_MFDB_ENTITY_NAME_MISMATCH ]] || readonly E_MFDB_ENTITY_NAME_MISMATCH=34
[[ -v E_MFDB_DUPLICATE_ENTRY ]] || readonly E_MFDB_DUPLICATE_ENTRY=35
[[ -v E_MFDB_NO_PARENT_HIERARCHY ]] || readonly E_MFDB_NO_PARENT_HIERARCHY=36
[[ -v E_MFDB_MANIFEST_NOT_FOUND ]] || readonly E_MFDB_MANIFEST_NOT_FOUND=37
[[ -v E_MFDB_BIDIRECTIONAL_FAIL ]] || readonly E_MFDB_BIDIRECTIONAL_FAIL=38
[[ -v E_MFDB_FK_UNRESOLVED ]] || readonly E_MFDB_FK_UNRESOLVED=39
[[ -v E_MFDB_MISSING_REQUIRED_FIELD ]] || readonly E_MFDB_MISSING_REQUIRED_FIELD=40
[[ -v E_MFDB_NULL_REQUIRED ]] || readonly E_MFDB_NULL_REQUIRED=41
[[ -v E_MFDB_INVALID_ARCHIVE ]] || readonly E_MFDB_INVALID_ARCHIVE=42

#-------------------------------------------------------------------------------
# Validation state
#-------------------------------------------------------------------------------

__MFDB_VALIDATION_ERRORS=()
__MFDB_VALIDATION_WARNINGS=()

# Clears the collected errors and warnings.
mfdb_validator_reset_state() {
    __MFDB_VALIDATION_ERRORS=()
    __MFDB_VALIDATION_WARNINGS=()
}

# Records an MFDB validation error with a location.
__mfdb_add_error() {
    local message="$1"
    local location="${2:-}"
    __MFDB_VALIDATION_ERRORS+=("ERROR | Location: $location | Message: $message")
}

# True if any error was recorded.
mfdb_validator_has_errors()   { [[ ${#__MFDB_VALIDATION_ERRORS[@]}   -gt 0 ]]; }
# Prints the recorded errors, one per line.
mfdb_validator_get_errors()    { printf '%s\n' "${__MFDB_VALIDATION_ERRORS[@]+"${__MFDB_VALIDATION_ERRORS[@]}"}"; }

#-------------------------------------------------------------------------------
# Archive Validation
#-------------------------------------------------------------------------------

# Validates a .mfdb.zip as an MFDB container (manifest present, entity files listed in it exist).
# mfdb_validator_validate_archive <archive_path>
mfdb_validator_validate_archive() {
    local archive_path="$1"
    mfdb_validator_reset_state
    if [[ ! -f "$archive_path" ]]; then
        __mfdb_add_error "Archive not found: $archive_path" "File System"
        return $E_MFDB_MANIFEST_NOT_FOUND
    fi

    if ! unzip -l "$archive_path" | grep -q "104a.mfdb.bejson"; then
        __mfdb_add_error "Missing 104a.mfdb.bejson manifest inside archive" "Zip Structure"
        return $E_MFDB_INVALID_ARCHIVE
    fi
    return 0
}

#-------------------------------------------------------------------------------
# Main validation
#-------------------------------------------------------------------------------

# Validates the manifest: BEJSON 104a document named *.mfdb.bejson with Records_Type ["mfdb"] and the required MFDB headers/fields. A 104db file is not an MFDB manifest. (Entity-file and whole-database validation are provided by the Python, JavaScript and TypeScript validators.)
mfdb_validator_validate_manifest() {
    local manifest_path="$1"
    mfdb_validator_reset_state
    [[ ! -f "$manifest_path" ]] && return $E_MFDB_MANIFEST_NOT_FOUND
    bejson_validator_validate_file "$manifest_path" || return $E_MFDB_NOT_MANIFEST
    
    local rt=$(jq -r '.Records_Type | @json' "$manifest_path" 2>/dev/null)
    [[ "$rt" != '["mfdb"]' ]] && return $E_MFDB_MANIFEST_RECORDS_TYPE
    return 0
}

#-------------------------------------------------------------------------------
# Dependency check
#-------------------------------------------------------------------------------

# Checks that the required tools (jq, unzip) are installed.
mfdb_validator_check_dependencies() {
    if ! command -v unzip >/dev/null 2>&1; then
        echo "ERROR: Required command 'unzip' not found" >&2
        return 1
    fi
    # Strictly enforce jq >= 1.6 via base validator
    if ! bejson_validator_check_dependencies; then
        return 1
    fi
    return 0
}

#-------------------------------------------------------------------------------
# MFDB 1.32 chunked-package validation
#-------------------------------------------------------------------------------
# The chunking library owns bejson_core_chunking_create_mfdb132_package /
# bejson_core_chunking_unchunk_mfdb132_package (packaging and IO) and calls these functions for validation;
# validation logic lives in the validator family.

MFDB_VALIDATOR_MANIFEST_FILENAME="104a.mfdb.bejson"

# Echoes true or false: is this Chunked-104a document a packaged MFDB-132 (an MFDB stored in one chunk document)?
# mfdb_validator_is_mfdb132_package <doc_json>
# Echoes "true" or "false".
mfdb_validator_is_mfdb132_package() {
    local doc_json="$1"
    printf '%s' "$doc_json" | jq -r '
        if (.Format_Version == "104a")
           and (.Schema_Name == "MFDB-132")
           and (.Package_Format == "MFDB-Chunked-104a")
           and (.MFDB_Version != null and .MFDB_Version != "")
           and (.DB_Name != null and .DB_Name != "")
        then "true" else "false" end'
}

# Level-1 validation of an MFDB-132 package document; prints {valid, errors, warnings} as JSON.
# mfdb_validator_validate_mfdb132_package <doc_json>
# Prints {"valid":bool,"errors":[...],"warnings":[...]} as JSON.
mfdb_validator_validate_mfdb132_package() {
    local doc_json="$1"
    local is_pkg
    is_pkg=$(mfdb_validator_is_mfdb132_package "$doc_json")

    if [[ "$is_pkg" != "true" ]]; then
        jq -n '{"valid": false, "errors": ["Document is not a recognized MFDB-132 package (missing/incorrect Schema_Name/Package_Format/MFDB_Version/DB_Name)."], "warnings": []}'
        return
    fi

    printf '%s' "$doc_json" | jq \
        --arg manifest "$MFDB_VALIDATOR_MANIFEST_FILENAME" '
        def records_type_ok: (.Records_Type == ["MFDB-132"]);
        def manifest_found: ([.Values[] | select(.[5] == $manifest)] | length) > 0;
        {
          "valid": (records_type_ok and manifest_found),
          "errors": (
            (if records_type_ok then [] else ["Records_Type must be exactly [\"MFDB-132\"] for an MFDB-132 package."] end)
            +
            (if manifest_found then [] else ["Chunked package does not contain the MFDB manifest (\($manifest)) — not a complete MFDB package."] end)
          ),
          "warnings": []
        }'
}

# Finds and validates an MFDB embedded in any Chunked-104a document; prints {entities, errors, warnings} as JSON.
# mfdb_validator_detect_mfdb_in_chunk <doc_json>
# Prints a JSON object: {mfdb_detected, valid, db_name, mfdb_version,
# entities: [...], errors: [...], warnings: [...]}
mfdb_validator_detect_mfdb_in_chunk() {
    local doc_json="$1"
    local manifest_name="$MFDB_VALIDATOR_MANIFEST_FILENAME"

    local manifest_content
    manifest_content=$(printf '%s' "$doc_json" | jq -r --arg m "$manifest_name" '
        ([.Values[] | select(.[5] == $m)] | .[0]) as $row
        | if $row == null then "__NOT_FOUND__"
          elif $row[6] == true then "__IS_BINARY__"
          else $row[2] end' 2>/dev/null)

    if [[ "$manifest_content" == "__NOT_FOUND__" || -z "$manifest_content" ]]; then
        jq -n --arg m "$manifest_name" '{
            "mfdb_detected": false, "valid": false, "db_name": null, "mfdb_version": null,
            "entities": [], "errors": ["No manifest (\($m)) found in chunk — no MFDB present."], "warnings": []
        }'
        return
    fi
    if [[ "$manifest_content" == "__IS_BINARY__" ]]; then
        jq -n '{
            "mfdb_detected": false, "valid": false, "db_name": null, "mfdb_version": null,
            "entities": [], "errors": ["Manifest row is flagged Is_Binary — its content was never stored, cannot validate."], "warnings": []
        }'
        return
    fi

    if ! printf '%s' "$manifest_content" | jq -e . >/dev/null 2>&1; then
        jq -n '{
            "mfdb_detected": true, "valid": false, "db_name": null, "mfdb_version": null,
            "entities": [], "errors": ["Manifest content is not valid JSON."], "warnings": []
        }'
        return
    fi

    # Level 1 manifest checks + build the entity list with per-entity Level 2
    # checks, by looking each entity's file_path up in the chunk itself.
    jq -n \
        --argjson doc "$doc_json" \
        --argjson manifest "$manifest_content" \
        --arg m "$manifest_name" '
        def find_row($rel): ([$doc.Values[] | select(.[5] == $rel)] | if length > 0 then .[0] else null end);

        ($manifest.Format_Version == "104a") as $fmt_ok |
        ($manifest.Records_Type == ["mfdb"]) as $rt_ok |
        ($manifest.Fields // [] | map(.name)) as $mfields |
        ($mfields | index("entity_name")) as $en_idx |
        ($mfields | index("file_path")) as $fp_idx |

        if ($en_idx == null or $fp_idx == null) then
          {
            "mfdb_detected": true, "valid": false,
            "db_name": ($manifest.DB_Name // null),
            "mfdb_version": ($manifest.MFDB_Version // null),
            "entities": [],
            "errors": (
              (if $fmt_ok then [] else ["Manifest Format_Version must be \"104a\"."] end)
              + (if $rt_ok then [] else ["Manifest Records_Type must be exactly [\"mfdb\"]."] end)
              + ["Manifest Fields must include \"entity_name\" and \"file_path\"."]
            ),
            "warnings": []
          }
        else
        {
          "mfdb_detected": true,
          "db_name": ($manifest.DB_Name // null),
          "mfdb_version": ($manifest.MFDB_Version // null),
          "entities": [
            $manifest.Values[] as $erow |
            ($erow[$en_idx]) as $entity_name |
            ($erow[$fp_idx]) as $file_path |
            (find_row($file_path)) as $chunk_row |
            {
              "entity_name": $entity_name,
              "file_path": $file_path,
              "found_in_chunk": ($chunk_row != null),
              "errors": (
                (if ($entity_name != null and $file_path != null) then [] else ["entity_name/file_path must not be null."] end)
                + (if $chunk_row == null then
                     ["Entity file \($file_path) listed in manifest was not found in chunk."]
                   elif $chunk_row[6] == true then
                     ["Entity row is flagged Is_Binary — content was never stored, cannot validate."]
                   else
                     ($chunk_row[2] | try (fromjson) as $edoc | (
                        (if $edoc.Format_Version == "104" then [] else ["Entity Format_Version must be \"104\"."] end)
                        + (if $edoc.Records_Type == [$entity_name] then [] else ["Entity Records_Type must be exactly [\"\($entity_name)\"]."] end)
                        + (if ($edoc | has("Parent_Hierarchy")) then [] else ["Entity is missing mandatory \"Parent_Hierarchy\" key."] end)
                     ) catch ["Entity file content is not valid JSON."])
                   end)
              )
            }
            | . + {"valid": (.errors | length == 0)}
          ],
          "errors": (
            (if $fmt_ok then [] else ["Manifest Format_Version must be \"104a\"."] end)
            + (if $rt_ok then [] else ["Manifest Records_Type must be exactly [\"mfdb\"]."] end)
          ),
          "warnings": []
        }
        | . + {"valid": ((.errors | length == 0) and (.entities | all(.valid)))}
        end'
}

# Export functions
export -f mfdb_validator_validate_archive
export -f mfdb_validator_validate_manifest
export -f mfdb_validator_reset_state
export -f mfdb_validator_has_errors
export -f mfdb_validator_get_errors
export -f mfdb_validator_check_dependencies
export -f mfdb_validator_is_mfdb132_package
export -f mfdb_validator_validate_mfdb132_package
export -f mfdb_validator_detect_mfdb_in_chunk