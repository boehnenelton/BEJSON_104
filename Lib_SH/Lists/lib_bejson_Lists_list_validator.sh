# -----------------------------------------------------------------------------
# Library:         lib_bejson_Lists_list_validator.sh
# Family:          Lists
# Module Purpose:  Validates list/hierarchy-shaped documents (id/parent_id) on 104 or 104a, plus array-field homogeneity; the caller supplies a file (often an MFDB entity file).
# Architecture:    Format-level layer on Core's structural validator, implemented with jq. Reports every error with a Lists code (480-499, lib_bejson_Lists_bejson_errors.sh). Does not orchestrate MFDB and is not specific to 104db.
# Format_Scope:    104 | 104a (list-shaped documents)
# Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
#                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
#                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
# Version:         2.0.0
# Release_Version: 300
# Date:            2026-10-13
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   34d3af19-d011-4aa2-bb31-f671df7db698
#
# Changelog:
#   2.0.0 (2026-10-13) - Moved from Core to the new Lists family (was lib_bejson_Core_bejson_list_validator.sh
#           1.1.2). bejson_list_validator_validate() -> bejson_lists_validate(); new bejson_lists_validate_field()
#           (array homogeneity, previously JS-only). FIXES: the old function ONLY checked Format_Version == 104a
#           (and returned 4 for a valid 104 list) and never read id/parent_id, so duplicate ids, orphans and
#           cycles all passed. Now implements the same checks as the PY/JS/TS validators: null id, duplicate id,
#           orphan, cycle, short rows, 104 AND 104a accepted, every error reported.
#           RETURN VALUE: shell exit status is 8-bit and Lists codes are 480-499, so both functions return 0 on
#           success and 1 on failure; the real codes are in BEJSON_LISTS_CODES, messages in
#           BEJSON_LISTS_ERRORS (and on stderr), and on success BEJSON_LISTS_STATS is a JSON string.
#   1.1.2 - Last Core version.
#
# Usage:  bejson_lists_validate <file.bejson>
#         bejson_lists_validate_field <file.bejson> <field> <string|number|integer|boolean|object>
#         (needs jq, same dependency as Core)
# -----------------------------------------------------------------------------

_LISTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib_bejson_Lists_bejson_errors.sh
source "$_LISTS_DIR/lib_bejson_Lists_bejson_errors.sh"
# shellcheck source=../Core/lib_bejson_Core_bejson_validator.sh
source "$_LISTS_DIR/../Core/lib_bejson_Core_bejson_validator.sh"

BEJSON_LISTS_SUPPORTED_VERSIONS="104 104a"
BEJSON_LISTS_FIELD_TYPES="string number integer boolean object"
BEJSON_LISTS_ERRORS=()
BEJSON_LISTS_CODES=()
BEJSON_LISTS_STATS=""

# jq program: emits "CODE<TAB>MESSAGE" per error, or "STATS<TAB>{json}" when clean.
_BEJSON_LISTS_JQ='
def up($m): if . == null then null else $m[tojson] end;
def chain($m; $n): . as $x | reduce range(0; $n) as $_ ([$x]; . + [(.[-1] | up($m))]);
def cyc_path($m; $n):
  . as $x | chain($m; $n) as $c
  | ($c[1:] | map(. == $x) | index(true)) as $k
  | if $k == null then null else $c[0:($k + 2)] end;
def isroot: . == null or . == "";
def scalar: (type != "object" and type != "array");

(.Fields | map(.name)) as $names
| ($names | index("id")) as $ii
| ($names | index("parent_id")) as $pi
| if $ii == null or $pi == null then
    [[$ec.missing, "Missing core list fields: id, parent_id"]]
  else
    (([$ii, $pi] | max) + 1) as $need
    | [.Values | to_entries[]] as $rows
    | [$rows[] | select(.value | length < $need)] as $short
    | [$rows[] | select(.value | length >= $need)] as $good
    | [$good[] | select(.value[$ii] == null)] as $nullid
    | [$good[] | select(.value[$ii] != null and ((.value[$ii] | scalar | not) or (.value[$pi] | scalar | not)))] as $nonscalar
    | [$good[] | select(.value[$ii] != null and (.value[$ii] | scalar) and (.value[$pi] | scalar))] as $ok
    | (reduce $ok[] as $r ({seen: {}, dups: [], uniq: []};
        ($r.value[$ii] | tojson) as $k
        | if .seen[$k] then .dups += [$r.value[$ii]]
          else .seen[$k] = true | .uniq += [$r] end)) as $d
    | ($d.uniq | map({key: (.value[$ii] | tojson), value: true}) | from_entries) as $idset
    | ($d.uniq | map(select(.value[$pi] | isroot | not))
        | map({key: (.value[$ii] | tojson), value: .value[$pi]}) | from_entries) as $pmap
    | ($d.uniq | length) as $n
    | [ $short[]    | [$ec.short,   "Row \(.key) too short (\(.value | length) cells, need \($need))."] ]
    + [ $nullid[]   | [$ec.nullid,  "Row \(.key) has null id."] ]
    + [ $nonscalar[]| [$ec.nullid,  "Row \(.key) has a non-scalar id or parent_id."] ]
    + [ $d.dups[]   | [$ec.dup,     "Duplicate ID detected: \(.)"] ]
    + [ $pmap | to_entries[] | select($idset[(.value | tojson)] | not)
        | [$ec.orphan, "Orphan detected: \(.key | fromjson) -> \(.value)"] ]
    + ( [ $d.uniq[] | .value[$ii] | cyc_path($pmap; $n) | select(. != null) ]
        | map({k: (.[0:-1] | map(tojson) | min), p: .}) | group_by(.k) | map(.[0].p)
        | map([$ec.cycle, "Circular dependency: " + (map(tostring) | join(" -> "))]) )
    | if length == 0 then
        [["STATS", ({
            item_count: $n,
            root_count: ($n - ($pmap | length)),
            max_depth: ([$d.uniq[] | .value[$ii] | chain($pmap; $n) | (map(select(. != null)) | length) - 1] | max // 0)
          } | tojson)]]
      else . end
  end
| .[] | "\(.[0])\t\(.[1])"
'

# jq program for array-field homogeneity.
_BEJSON_LISTS_FIELD_JQ='
def tok($t): if $t == "integer" then (type == "number" and . == floor)
             elif $t == "number" then type == "number"
             else type == $t end;
(.Fields | map(.name) | index($f)) as $i
| if $i == null then "\($ec.fnf)\tField \u0027\($f)\u0027 not found in document."
  else
    (.Values | to_entries[]) as $e
    | $e.key as $r | $e.value as $row
    | if ($row | length) <= $i then "\($ec.short)\tRow \($r) too short for field \u0027\($f)\u0027."
      elif $row[$i] == null then empty
      elif ($row[$i] | type) != "array" then "\($ec.notarr)\tRow \($r): field \u0027\($f)\u0027 must be an array."
      else ($row[$i] | to_entries[]) as $it
           | select($it.value | tok($t) | not)
           | "\($ec.item)\tRow \($r) list item \($it.key) type mismatch: expected \u0027\($t)\u0027, got \u0027\($it.value | type)\u0027."
      end
  end
'

_lists_reset() {
    BEJSON_LISTS_ERRORS=()
    BEJSON_LISTS_CODES=()
    BEJSON_LISTS_STATS=""
}

_lists_fail() {  # code message
    BEJSON_LISTS_CODES+=("$1")
    BEJSON_LISTS_ERRORS+=("$2")
    echo "ERROR: $2" >&2
}

_lists_ec_json() {
    printf '{"structure":%s,"version":%s,"missing":%s,"short":%s,"nullid":%s,"dup":%s,"orphan":%s,"cycle":%s,"fnf":%s,"notarr":%s,"item":%s}' \
        "$E_LISTS_STRUCTURE_INVALID" "$E_LISTS_INVALID_VERSION" "$E_LISTS_MISSING_FIELDS" "$E_LISTS_SHORT_ROW" \
        "$E_LISTS_NULL_ID" "$E_LISTS_DUPLICATE_ID" "$E_LISTS_ORPHAN" "$E_LISTS_CYCLE" \
        "$E_LISTS_FIELD_NOT_FOUND" "$E_LISTS_FIELD_NOT_ARRAY" "$E_LISTS_ITEM_TYPE_MISMATCH"
}

_lists_consume() {  # reads "CODE<TAB>MSG" lines from $1
    local code msg
    while IFS=$'\t' read -r code msg; do
        [[ -z "$code" ]] && continue
        if [[ "$code" == "STATS" ]]; then BEJSON_LISTS_STATS="$msg"; continue; fi
        _lists_fail "$code" "$msg"
    done <<< "$1"
}

bejson_lists_validate() {
    local file="$1"
    _lists_reset

    # 1. Structural validation (Core)
    local rc=0
    bejson_validator_validate_file "$file" || rc=$?
    if [[ $rc -ne 0 ]]; then
        _lists_fail "$E_LISTS_STRUCTURE_INVALID" "Structural validation failed (Core code $rc) for: $file"
        return 1
    fi

    # 2. Format version
    local ver
    ver=$(jq -r '.Format_Version' "$file")
    if [[ " $BEJSON_LISTS_SUPPORTED_VERSIONS " != *" $ver "* ]]; then
        _lists_fail "$E_LISTS_INVALID_VERSION" "Lists require Format_Version 104 or 104a; got $ver."
        return 1
    fi

    # 3-6. Fields, rows, duplicates, orphans, cycles (single jq pass)
    local out
    out=$(jq -r --argjson ec "$(_lists_ec_json)" "$_BEJSON_LISTS_JQ" "$file" 2>&1) \
        || { _lists_fail "$E_LISTS_STRUCTURE_INVALID" "jq failed: $out"; return 1; }
    _lists_consume "$out"

    [[ ${#BEJSON_LISTS_CODES[@]} -eq 0 ]] && return 0
    return 1
}

bejson_lists_validate_field() {
    local file="$1" field="$2" ftype="$3"
    _lists_reset

    if [[ " $BEJSON_LISTS_FIELD_TYPES " != *" $ftype "* ]]; then
        _lists_fail "$E_LISTS_STRUCTURE_INVALID" "allowed type must be one of ${BEJSON_LISTS_FIELD_TYPES// /, }; got '$ftype'."
        return 1
    fi
    local rc=0
    bejson_validator_validate_file "$file" || rc=$?
    if [[ $rc -ne 0 ]]; then
        _lists_fail "$E_LISTS_STRUCTURE_INVALID" "Structural validation failed (Core code $rc) for: $file"
        return 1
    fi
    local out
    out=$(jq -r --arg f "$field" --arg t "$ftype" --argjson ec "$(_lists_ec_json)" "$_BEJSON_LISTS_FIELD_JQ" "$file" 2>&1) \
        || { _lists_fail "$E_LISTS_STRUCTURE_INVALID" "jq failed: $out"; return 1; }
    _lists_consume "$out"

    [[ ${#BEJSON_LISTS_CODES[@]} -eq 0 ]] && return 0
    return 1
}
