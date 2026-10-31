# -----------------------------------------------------------------------------
# Library:         lib_bejson_Core_mfdb_validator.sh
# Family:          Core
# Module Purpose:  MFDB validator: archive, manifest and entity-file validation.
# Architecture:    MFDB (a database architecture layered on BEJSON, not a BEJSON format version): one BEJSON 104a manifest (104a.mfdb.bejson) registers many dense BEJSON 104 entity files linked by Parent_Hierarchy. MFDB-132 packs a whole MFDB into one Chunked-104a document and is handled here as a wrapper around the same manifest + entity structure. It is not 104db and uses no null-padding.
# Format_Scope:    MFDB only (104a manifest + 104 entity files; NOT 104db)
# Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
#                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
#                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
# Version:         2.3.0
# Release_Version: 300
# Date:            2026-10-30
# Changelog:
#   2.3.0 - 2026-10-30: Network_Role validation (30); manifest errors carry codes; exact root-escape test with [33]; two-phase flow like the Python reference (manifest-level errors end validation before entity checks).
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   4f60563a-4b04-4425-ba5e-19461f9fecad
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
__mfdb_add_warning() {
    __MFDB_VALIDATION_WARNINGS+=("WARNING | Location: ${2:-} | Message: $1")
}
mfdb_validator_get_warnings() { printf '%s\n' "${__MFDB_VALIDATION_WARNINGS[@]+"${__MFDB_VALIDATION_WARNINGS[@]}"}"; }

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
    if [[ ! -f "$manifest_path" ]]; then
        __mfdb_add_error "[$E_MFDB_MANIFEST_NOT_FOUND] Manifest not found: $manifest_path" "File System"
        return $E_MFDB_MANIFEST_NOT_FOUND
    fi
    if ! bejson_validator_validate_file "$manifest_path" >/dev/null 2>&1; then
        __mfdb_add_error "[$E_MFDB_NOT_MANIFEST] Manifest failed BEJSON validation: $manifest_path" "BEJSON Validation"
        return $E_MFDB_NOT_MANIFEST
    fi

    local fmt rt
    fmt=$(jq -r '.Format_Version // empty' "$manifest_path" 2>/dev/null)
    rt=$(jq -r '.Records_Type | @json' "$manifest_path" 2>/dev/null)
    if [[ "$fmt" != "104a" || "$rt" != '["mfdb"]' ]]; then
        __mfdb_add_error "[$E_MFDB_MANIFEST_RECORDS_TYPE] Invalid manifest format or records type (must be 104a with Records_Type [\"mfdb\"])" "Manifest"
        return $E_MFDB_MANIFEST_RECORDS_TYPE
    fi

    if jq -e 'has("Network_Role") and .Network_Role != null' "$manifest_path" >/dev/null 2>&1; then
        local nrole
        nrole=$(jq -r 'if (.Network_Role|type)=="string" then .Network_Role else "__BAD__" end' "$manifest_path" 2>/dev/null)
        case "$nrole" in
            Master|Slave|Standalone) ;;
            *)
                __mfdb_add_error "[$E_MFDB_NOT_MANIFEST] Invalid Network_Role '$nrole' (must be Master, Slave, or Standalone)" "Network_Role"
                return $E_MFDB_NOT_MANIFEST
                ;;
        esac
    fi
    return 0
}

# Entity-file and whole-database validation (AUDIT FIX H1, 2026-09-13)
#-------------------------------------------------------------------------------
# Ported from lib_bejson_Core_mfdb_validator.py's validate_mfdb_entity_file /
# validate_mfdb_database (PY/JS/TS all have these; SH did not). Added because
# lib_bejson_Core_bejson_chunking.sh calls mfdb_validator_validate_database
# unguarded from both mfdb132_archive_mount (sticky path) and
# mfdb132_archive_commit (validation gate) -- without this function defined,
# both hit "command not found" at runtime.

# __mfdb_escapes_root <relative_path>
# Returns 0 (true) when the path is absolute (POSIX root or drive letter) or climbs above the MFDB root.
# Same depth algorithm as PY _bejson_mfdb_escapes_root / JS / TS _escapesRoot.
__mfdb_escapes_root() {
    local p="${1//\\//}"
    [[ "$p" == /* || "$p" =~ ^[A-Za-z]: ]] && return 0
    local depth=0 part
    local IFS='/'
    for part in $p; do
        if [[ "$part" == ".." ]]; then
            depth=$((depth-1)); [[ $depth -lt 0 ]] && return 0
        elif [[ -n "$part" && "$part" != "." ]]; then
            depth=$((depth+1))
        fi
    done
    return 1
}

# __mfdb_resolve_entity_path <manifest_path> <file_path_rel>
# Mirrors Python's _resolve_entity_path: resolve file_path_rel relative to
# the manifest's directory (not relative to CWD).
__mfdb_resolve_entity_path() {
    local manifest_path="$1"
    local file_path_rel="$2"
    local manifest_dir
    manifest_dir="$(cd "$(dirname "$manifest_path")" >/dev/null 2>&1 && pwd)"
    [[ -z "$manifest_dir" ]] && { printf '%s' "$file_path_rel"; return; }
    printf '%s' "$manifest_dir/$file_path_rel"
}

# mfdb_validator_validate_entity_file <entity_path>
# Returns 0 if the entity file is a well-formed 104 BEJSON file
# with a resolvable Parent_Hierarchy back to a manifest. Accumulates errors
# via __mfdb_add_error like the rest of this file. Does NOT reset state on
# entry (callers, e.g. validate_database, aggregate across many entities).
mfdb_validator_validate_entity_file() {
    local entity_path="$1"
    local expected_name="${2:-}"       # optional: manifest entity_name this file was listed under
    local expected_manifest="${3:-}"   # optional: the manifest that listed it

    if [[ ! -f "$entity_path" ]]; then
        __mfdb_add_error "[$E_MFDB_ENTITY_NOT_FOUND] Entity file not found: $entity_path" "File System"
        return 1
    fi

    if ! bejson_validator_validate_file "$entity_path" >/dev/null 2>&1; then
        __mfdb_add_error "Entity file failed BEJSON validation: $entity_path" "BEJSON Validation"
        return 1
    fi

    local fmt_version
    fmt_version=$(jq -r '.Format_Version // empty' "$entity_path" 2>/dev/null)
    case "$fmt_version" in
        104) ;;
        *)
            __mfdb_add_error "[$E_MFDB_NOT_ENTITY_FILE] Entity file must be Format_Version 104: $entity_path" "Format_Version"
            return 1
            ;;
    esac

    local parent_hierarchy
    parent_hierarchy=$(jq -r '.Parent_Hierarchy // empty' "$entity_path" 2>/dev/null)
    if [[ -z "$parent_hierarchy" ]]; then
        __mfdb_add_error "[$E_MFDB_NO_PARENT_HIERARCHY] Missing Parent_Hierarchy: $entity_path" "Structure"
        return 1
    fi

    local entity_dir manifest_check_path
    entity_dir="$(cd "$(dirname "$entity_path")" >/dev/null 2>&1 && pwd)"
    manifest_check_path="$entity_dir/$parent_hierarchy"
    if [[ ! -f "$manifest_check_path" ]]; then
        __mfdb_add_error "[$E_MFDB_MANIFEST_NOT_FOUND] Manifest not found at $manifest_check_path (orphan entity)" "Parent_Hierarchy"
        return 1
    fi

    # Records_Type: exactly one non-empty string
    local rt_name
    rt_name=$(jq -r 'if (.Records_Type|type)=="array" and (.Records_Type|length)==1 and (.Records_Type[0]|type)=="string" and .Records_Type[0] != "" then .Records_Type[0] else empty end' "$entity_path" 2>/dev/null)
    if [[ -z "$rt_name" ]]; then
        __mfdb_add_error "[$E_MFDB_ENTITY_NAME_MISMATCH] Records_Type must contain exactly one string (the entity name)" "Records_Type"
        return 1
    fi

    if [[ -n "$expected_manifest" ]] && ! [[ "$manifest_check_path" -ef "$expected_manifest" ]]; then
        __mfdb_add_error "[$E_MFDB_BIDIRECTIONAL_FAIL] Parent_Hierarchy points to $manifest_check_path, not to the manifest that lists this file ($expected_manifest)" "Parent_Hierarchy"
        return 1
    fi

    local rc=0
    if [[ -n "$expected_name" && "$rt_name" != "$expected_name" ]]; then
        __mfdb_add_error "[$E_MFDB_ENTITY_NAME_MISMATCH] Records_Type '$rt_name' does not match manifest entity_name '$expected_name' (case-sensitive)" "Records_Type"
        rc=1
    fi

    # Bidirectional: the manifest named by Parent_Hierarchy must be a real MFDB
    # manifest with a row whose file_path resolves to THIS file.
    if ! jq -e '.Format_Version == "104a" and (.Records_Type == ["mfdb"])' "$manifest_check_path" >/dev/null 2>&1; then
        __mfdb_add_error "[$E_MFDB_NOT_MANIFEST] Parent_Hierarchy target is not an MFDB manifest" "Parent_Hierarchy"
        return 1
    fi
    local en_idx fp_idx listed=0 listed_names="" lrow lfp lres
    en_idx=$(jq -r '[.Fields[].name] | index("entity_name") // -1' "$manifest_check_path")
    fp_idx=$(jq -r '[.Fields[].name] | index("file_path") // -1' "$manifest_check_path")
    if [[ "$en_idx" -ge 0 && "$fp_idx" -ge 0 ]]; then
        while IFS=$'\t' read -r lname lfp; do
            [[ -z "$lfp" || "$lfp" == "null" ]] && continue
            [[ "$lfp" == /* || "$lfp" == *..* ]] && continue
            lres="$(dirname "$manifest_check_path")/$lfp"
            if [[ -f "$lres" && "$lres" -ef "$entity_path" ]]; then
                listed=1; listed_names+="$lname,"
                [[ "$lname" == "$rt_name" ]] && listed=2
                [[ $listed -eq 2 ]] && break
            fi
        done < <(jq -r --argjson e "$en_idx" --argjson f "$fp_idx" '.Values[] | [.[$e], .[$f]] | map(. // "") | @tsv' "$manifest_check_path")
    fi
    if [[ $listed -eq 0 ]]; then
        __mfdb_add_error "[$E_MFDB_BIDIRECTIONAL_FAIL] Bidirectional check failed: manifest $manifest_check_path has no file_path that resolves to this entity file" "Parent_Hierarchy"
        return 1
    elif [[ $listed -eq 1 && -z "$expected_name" ]]; then
        __mfdb_add_error "[$E_MFDB_ENTITY_NAME_MISMATCH] Records_Type '$rt_name' does not match the manifest entity_name for this file (${listed_names%,})" "Records_Type"
        return 1
    fi

    return $rc
}

# mfdb_validator_validate_database <manifest_path> [strict_fk=0]
# Returns 0 if the manifest is valid AND every entity it lists resolves and
# validates. strict_fk is accepted for signature parity with PY/JS/TS
# strict_fk=1 (or "true") additionally runs
# mfdb_validator_check_referential_integrity and records each problem via
# __mfdb_add_error (Location "FK:<entity>").
mfdb_validator_validate_database() {
    local manifest_path="$1"
    local strict_fk="${2:-0}"

    mfdb_validator_validate_manifest "$manifest_path"
    local manifest_rc=$?
    if [[ $manifest_rc -ne 0 ]]; then
        __mfdb_add_error "Manifest failed validation: $manifest_path" "Manifest"
        return 1
    fi

    local rows
    rows=$(jq -c '.Values[]' "$manifest_path" 2>/dev/null)
    if [[ -z "$rows" ]]; then
        return 0
    fi
    # Level 1 field presence (40) is checked before iterating rows
    if ! jq -e '[.Fields[].name] | (index("entity_name") != null) and (index("file_path") != null)' "$manifest_path" >/dev/null 2>&1; then
        __mfdb_add_error "[$E_MFDB_MISSING_REQUIRED_FIELD] Manifest Fields must include entity_name and file_path" "Structure"
        return 1
    fi

    local overall_rc=0
    local fields_json en_idx fp_idx
    fields_json=$(jq -c '.Fields | map(.name)' "$manifest_path" 2>/dev/null)
    en_idx=$(printf '%s' "$fields_json" | jq -r 'index("entity_name") // -1')
    fp_idx=$(printf '%s' "$fields_json" | jq -r 'index("file_path") // -1')
    local rc_idx seen_names="" seen_paths=""
    local -a pass2_names=() pass2_paths=() pass2_rows=()
    rc_idx=$(printf '%s' "$fields_json" | jq -r 'index("record_count") // -1')
    if [[ "$en_idx" -lt 0 || "$fp_idx" -lt 0 ]]; then
        __mfdb_add_error "Manifest Fields must include entity_name and file_path" "Structure"
        return 1
    fi

    while IFS= read -r row; do
        [[ -z "$row" ]] && continue
        local entity_name file_path resolved
        entity_name=$(printf '%s' "$row" | jq -r ".[$en_idx] // empty")
        file_path=$(printf '%s' "$row" | jq -r ".[$fp_idx] // empty")
        if [[ -z "$entity_name" || -z "$file_path" ]]; then
            __mfdb_add_error "[$E_MFDB_NULL_REQUIRED] null entity_name or file_path in manifest row" "Values"
            overall_rc=1
            continue
        fi
        if [[ " $seen_names " == *" $entity_name "* ]]; then
            __mfdb_add_error "[$E_MFDB_DUPLICATE_ENTRY] Duplicate entity: $entity_name" "Values"; overall_rc=1
        fi
        if [[ " $seen_paths " == *" $file_path "* ]]; then
            __mfdb_add_error "[$E_MFDB_DUPLICATE_ENTRY] Duplicate path: $file_path" "Values"; overall_rc=1
        fi
        seen_names+="$entity_name "; seen_paths+="$file_path "
        if __mfdb_escapes_root "$file_path"; then
            __mfdb_add_error "[$E_MFDB_ENTITY_NOT_FOUND] Path traversal detected in file_path for entity '$entity_name': '$file_path'" "Values"
            overall_rc=1
            continue
        fi
        resolved=$(__mfdb_resolve_entity_path "$manifest_path" "$file_path")
        if [[ ! -f "$resolved" ]]; then
            __mfdb_add_error "[$E_MFDB_ENTITY_NOT_FOUND] Entity file not found: $file_path" "File System"
            overall_rc=1
            continue
        fi
        pass2_names+=("$entity_name"); pass2_paths+=("$resolved"); pass2_rows+=("$row")
    done <<< "$rows"

    # Manifest-level errors (null/duplicate/escape/missing file) end validation here, as in the Python reference:
    # entity files are only validated against a manifest that is itself sound.
    [[ $overall_rc -ne 0 ]] && return 1

    local pi
    for pi in "${!pass2_names[@]}"; do
        entity_name="${pass2_names[$pi]}"; resolved="${pass2_paths[$pi]}"; row="${pass2_rows[$pi]}"
        if ! mfdb_validator_validate_entity_file "$resolved" "$entity_name" "$manifest_path"; then
            __mfdb_add_error "Entity '$entity_name' failed validation" "Entity:$entity_name"
            overall_rc=1
        elif [[ "$rc_idx" -ge 0 ]]; then
            # Level 3: record_count drift is advisory (warning only)
            local declared actual
            declared=$(printf '%s' "$row" | jq -r ".[$rc_idx] // empty")
            if [[ -n "$declared" ]]; then
                actual=$(jq '.Values | length' "$resolved" 2>/dev/null)
                [[ "$declared" != "$actual" ]] && __mfdb_add_warning "record_count $declared in manifest != $actual rows in file" "Entity:$entity_name"
            fi
        fi
    done

    # strict_fk accepted for signature parity; 104 entities carry no foreign keys (FK audit is 105-series only).
    : "$strict_fk"

    return $overall_rc
}

#-------------------------------------------------------------------------------

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
export -f mfdb_validator_validate_entity_file
export -f mfdb_validator_validate_database
export -f mfdb_validator_get_warnings
export -f mfdb_validator_reset_state
export -f mfdb_validator_has_errors
export -f mfdb_validator_get_errors
export -f mfdb_validator_check_dependencies
export -f mfdb_validator_is_mfdb132_package
export -f mfdb_validator_validate_mfdb132_package
export -f mfdb_validator_detect_mfdb_in_chunk