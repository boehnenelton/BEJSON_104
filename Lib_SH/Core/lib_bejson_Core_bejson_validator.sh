# -----------------------------------------------------------------------------
# Library:         lib_bejson_Core_bejson_validator.sh
# Family:          Core
# Module Purpose:  Structural validator for BEJSON 104, 104a and 104db (mandatory keys, Records_Type, Fields, Values, version-specific rules). MFDB rules live in the mfdb_validator module.
# Architecture:    Format-level BEJSON layer that works on any BEJSON document (104, 104a, 104db) through positional Fields/Values and the field-map cache. It does not orchestrate MFDB and is not specific to 104db.
# Format_Scope:    104 | 104a | 104db (generic)
# Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
#                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
#                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
# Version:         2.2.0
# Release_Version: 300
# Date:            2026-10-28
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   d8f4a395-f5cb-417c-ba28-af60d6c26eff
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
# Also checks (2.2.0): Fields[].type is one of the six types, and the version rules (custom-header rule, Records_Type count, 104a primitives only, 104db Record_Type_Parent rules, per-cell value types) via __bejson_validator_check_version_rules. Parity with the Python validator.
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

    # 3b. Field type check (closed set; "any" is NOT valid)
    local bad_types
    bad_types=$(jq -r '[.Fields[] | .type | select(IN("string","integer","number","boolean","array","object") | not)] | length' "$file_path")
    if [[ "$bad_types" -gt 0 ]]; then
        return $E_INVALID_FIELDS
    fi

    # 4. Records Length check
    local field_count bad_records
    field_count=$(jq '.Fields | length' "$file_path")
    bad_records=$(jq --argjson fc "$field_count" '.Values | map(select(length != $fc)) | length' "$file_path")
    if [[ "$bad_records" -gt 0 ]]; then
        return $E_RECORD_LENGTH_MISMATCH
    fi

    # 4b. The '_' prefix is reserved for in-memory caches (_bejson_field_map, _nesting_field_map, ...); a file never carries one
    if jq -e 'keys | map(select(startswith("_"))) | length > 0' "$file_path" >/dev/null 2>&1; then
        return $E_RESERVED_KEY_COLLISION
    fi

    # 5. Field names must be unique (name-based addressing is ambiguous otherwise)
    if ! jq -e '(.Fields | map(.name)) as $n | ($n | length) == ($n | unique | length)' "$file_path" >/dev/null 2>&1; then
        return $E_INVALID_FIELDS
    fi

    # 6. Version-specific rules
    local vr_rc
    __bejson_validator_check_version_rules "$file_path"
    vr_rc=$?
    [[ $vr_rc -ne 0 ]] && return $vr_rc

    return 0
}

# __bejson_validator_check_version_rules <file>
# Version rules for 104/104a/104db. First failure detail is left in BEJSON_VALIDATOR_LAST_ERROR.
__bejson_validator_check_version_rules() {
    local file_path="$1" out code detail
    BEJSON_VALIDATOR_LAST_ERROR=""
    out=$(jq -r '
      def tok($t; $x):
        if $x == null then true
        elif $t == "string"  then ($x|type) == "string"
        elif $t == "integer" then (($x|type) == "number") and ($x == ($x|floor))
        elif $t == "number"  then ($x|type) == "number"
        elif $t == "boolean" then ($x|type) == "boolean"
        elif $t == "array"   then ($x|type) == "array"
        elif $t == "object"  then ($x|type) == "object"
        else true end;
      . as $d | .Format_Version as $v
      | if ($v | IN("104","104a","104db") | not) then ""
        else
          ($d.Fields) as $F | ($d.Records_Type) as $rt
          | (if $v == "105db" then 1 else 0 end) as $uc
          | ({"104":"104","104a":"104a","104db":"104db","105":"104","105a":"104a","105db":"104db"}[$v]) as $b
          | (if $v | IN("105","105a") then 1 else 0 end) as $off
          | def col($i): if $v == "105db" then (if $i == 0 then 0 else $i + 1 end) else $i + $off end;
          if ($b | IN("104","104db")) and ([$d | keys[] | select(IN("Format","Format_Version","Format_Creator","Records_Type","Fields","Values","Parent_Hierarchy") | not)] | length > 0) then
            "E_RESERVED_KEY_COLLISION\tcustom header forbidden in " + $v
          elif ($rt | type) != "array" then "E_INVALID_RECORDS_TYPE\tRecords_Type must be a list"
          elif ($b | IN("104","104a")) and ($rt | length) != 1 then "E_INVALID_RECORDS_TYPE\t" + $v + " must have exactly 1 record type, found " + ($rt|length|tostring)
          elif $b == "104db" and ($rt | length) < 2 then "E_INVALID_RECORDS_TYPE\t" + $v + " requires 2+ types"
          elif $b == "104db" and (($F[0].name // "") != "Record_Type_Parent") then "E_INVALID_RECORD_TYPE_PARENT\t" + $v + " first field must be Record_Type_Parent"
          elif $b == "104db" and ([$d.Values[] | select(length > 0) | select((.[0]) as $x | ($rt | index($x)) == null)] | length > 0) then "E_INVALID_RECORD_TYPE_PARENT\t" + $v + " row discriminator not in Records_Type"
          elif $b == "104a" and ([$F[] | select(.type | IN("array","object"))] | length > 0) then "E_INVALID_FIELDS\t" + $v + " forbids complex types"
          elif $b == "104db" and ([$F[1:][] | select(has("Record_Type_Parent") | not)] | length > 0) then "E_INVALID_RECORD_TYPE_PARENT\t" + $v + " field missing Record_Type_Parent owner"
          elif ([ $d.Values | to_entries[] | .key as $r | .value as $row | ($F | to_entries[]) | select(tok(.value.type; $row[col(.key)]) | not) ] | length > 0) then
            ([ $d.Values | to_entries[] | .key as $r | .value as $row | ($F | to_entries[]) | select(tok(.value.type; $row[col(.key)]) | not) | "row \($r), col \(col(.key)) (\(.value.name)): expected \(.value.type)" ] | .[0]) as $m
            | "E_TYPE_MISMATCH\tType mismatch at " + $m
          else "" end
        end' "$file_path" 2>/dev/null)
    [[ -z "$out" ]] && return 0
    code="${out%%$'\t'*}"; detail="${out#*$'\t'}"
    BEJSON_VALIDATOR_LAST_ERROR="$detail"
    echo "$detail" >&2
    case "$code" in
        E_RESERVED_KEY_COLLISION)      return $E_RESERVED_KEY_COLLISION ;;
        E_INVALID_RECORDS_TYPE)        return $E_INVALID_RECORDS_TYPE ;;
        E_INVALID_RECORD_TYPE_PARENT)  return $E_INVALID_RECORD_TYPE_PARENT ;;
        E_INVALID_FIELDS)              return $E_INVALID_FIELDS ;;
        E_INVALID_VALUES)              return $E_INVALID_VALUES ;;
        E_TYPE_MISMATCH)               return $E_TYPE_MISMATCH ;;
    esac
    return 1
}

# Export functions for subshell use
export -f __bejson_validator_check_version_rules
export -f bejson_validator_check_dependencies
export -f bejson_validator_validate_file