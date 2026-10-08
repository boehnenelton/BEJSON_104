# -----------------------------------------------------------------------------
# Library:         lib_bejson_CoreNesting_bejson_nesting_query.sh
# Family:          Core_Nesting
# Module Purpose:  Dotted-path queries over nested 104 documents (e.g. player_inventory[*].item_id).
# Architecture:    Nested BEJSON 104: a cell of a parent 104 document holds a complete embedded 104 document; the physical cell coordinate (NestAddress) is the implicit foreign key. It is neither 104db nor MFDB.
# Format_Scope:    Nested 104 (NOT 104db, NOT MFDB)
# Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
#                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
#                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
# Version:         0.1.5
# Release_Version: 300
# Date:            2026-10-02
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   f2b27982-a102-437b-a542-57b7bba1a0f3
# -----------------------------------------------------------------------------

set -o pipefail
[[ -n "${_LIB_BEJSON_CORE_NESTING_QUERY_LOADED:-}" ]] && return 0
readonly _LIB_BEJSON_CORE_NESTING_QUERY_LOADED=1

_NESTING_QUERY_SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Fail loudly if the adjacent errors file is missing, so E_* codes are never silently undefined.
if [[ ! -f "$_NESTING_QUERY_SH_DIR/lib_bejson_CoreNesting_bejson_errors.sh" ]]; then
    echo "ERROR: required dependency not found: $_NESTING_QUERY_SH_DIR/lib_bejson_CoreNesting_bejson_errors.sh" >&2
    return 1 2>/dev/null || exit 1
fi
source "$_NESTING_QUERY_SH_DIR/lib_bejson_CoreNesting_bejson_errors.sh"

readonly NESTING_QUERY_VERSION="0.1.1"

# _nesting_is_candidate in lib_bejson_CoreNesting_bejson_core_nesting.sh is a plain function and is reused when
# that file has been sourced first. To stay independently loadable, a local copy is defined here only if the
# core lib has not already provided one.
if ! declare -F _nesting_is_candidate > /dev/null 2>&1; then
    # Local copy of the candidate pre-filter, defined only when the core nesting lib has not been sourced.
    _nesting_is_candidate() {
        local value_text="$1"
        [[ "$value_text" == "{"* && "$value_text" == *"}" ]] && return 0
        return 1
    }
fi

# ===========================================================================
# PATH PARSING
# Segments are encoded as a single string: "name1|sel1;name2|sel2;..."
# sel is "*", an integer, or empty (treated as "*").
# ===========================================================================

# Parses a dotted path such as player_inventory[*].item_id; error on stderr for bad grammar.
# _nesting_query_parse_path <path_string>
# Echoes the encoded segment string, or returns non-zero with an E138/E139
# message on stderr for bad grammar.
_nesting_query_parse_path() {
    local path="$1"
    local trimmed_path="${path#"${path%%[![:space:]]*}"}"
    trimmed_path="${trimmed_path%"${trimmed_path##*[![:space:]]}"}"

    if [[ -z "$trimmed_path" ]]; then
        echo "E${E_NESTING_QUERY_EMPTY_PATH}: path is empty" >&2
        return 1
    fi

    local IFS='.'
    local -a raw_segments=($trimmed_path)
    unset IFS

    local encoded_segments="" raw_segment segment_field_name segment_selector
    for raw_segment in "${raw_segments[@]}"; do
        if [[ "$raw_segment" =~ ^([A-Za-z_][A-Za-z0-9_]*)(\[(\*|[0-9]+)\])?$ ]]; then
            segment_field_name="${BASH_REMATCH[1]}"
            segment_selector="${BASH_REMATCH[3]}"
            [[ -z "$segment_selector" ]] && segment_selector="*"
            encoded_segments+="${segment_field_name}|${segment_selector};"
        else
            echo "E${E_NESTING_QUERY_INVALID_PATH}: bad segment '${raw_segment}' in path '${path}'" >&2
            return 1
        fi
    done
    echo "$encoded_segments"
    return 0
}

# ===========================================================================
# CORE WALK
# ===========================================================================

# Recursive walk of a nested-104 document along the parsed path; prints one QueryMatch JSON per line.
# _nesting_query_walk <doc_json> <encoded_segments> <segment_index> <full_path>
#                      <field_chain_csv> <row_chain_csv> <col_chain_csv>
#                      <match_value_or_empty> <has_match_value:1|0>
# Echoes zero or more JSON QueryMatch blobs, one per line, to stdout.
_nesting_query_walk() {
    local doc_json="$1" encoded_segments="$2" segment_index="$3" full_path="$4"
    local field_chain="$5" row_chain="$6" col_chain="$7"
    local match_value="$8" has_match_value="$9"

    local -a segments
    IFS=';' read -ra segments <<< "$encoded_segments"
    local total_segment_count="${#segments[@]}"
    (( segment_index >= total_segment_count )) && return 0

    local current_segment="${segments[$segment_index]}"
    local field_name="${current_segment%%|*}"
    local selector="${current_segment##*|}"
    local is_last_segment=0
    (( segment_index == total_segment_count - 1 )) && is_last_segment=1

    local col
    col=$(echo "$doc_json" | jq -r --arg fn "$field_name" \
        '(.Fields // []) | to_entries[] | select(.value.name == $fn) | .key' 2>/dev/null | head -n1)
    [[ -z "$col" ]] && return 0   # dead branch — field not present here, not an error

    local row_count
    row_count=$(echo "$doc_json" | jq '(.Values // []) | length' 2>/dev/null)
    [[ -z "$row_count" ]] && row_count=0

    local -a row_indices
    if [[ "$selector" == "*" ]]; then
        local index_counter=0
        row_indices=()
        while (( index_counter < row_count )); do row_indices+=("$index_counter"); ((index_counter++)); done
    else
        row_indices=("$selector")
    fi

    local row_index cell_value nested_doc new_field_chain new_row_chain new_col_chain
    for row_index in "${row_indices[@]}"; do
        (( row_index < 0 || row_index >= row_count )) && continue
        cell_value=$(echo "$doc_json" | jq -r --argjson r "$row_index" --argjson c "$col" \
            '.Values[$r][$c] // empty' 2>/dev/null)
        [[ -z "$cell_value" ]] && continue

        new_field_chain="${field_chain}${field_chain:+,}${field_name}"
        new_row_chain="${row_chain}${row_chain:+,}${row_index}"
        new_col_chain="${col_chain}${col_chain:+,}${col}"

        if (( is_last_segment )); then
            if (( has_match_value == 0 )) || [[ "$cell_value" == "$match_value" ]]; then
                jq -nc \
                    --arg path "$full_path" --arg value "$cell_value" \
                    --arg fchain "$new_field_chain" --arg rchain "$new_row_chain" --arg cchain "$new_col_chain" \
                    '{path:$path, value:$value,
                      fieldChain:($fchain|split(",")),
                      rowChain:($rchain|split(",")|map(tonumber)),
                      colChain:($cchain|split(",")|map(tonumber))}'
            fi
            continue
        fi

        _nesting_is_candidate "$cell_value" || continue
        nested_doc=$(echo "$cell_value" | jq '.' 2>/dev/null) || continue
        [[ -z "$nested_doc" || "$nested_doc" == "null" ]] && continue

        _nesting_query_walk "$nested_doc" "$encoded_segments" "$((segment_index + 1))" "$full_path" \
            "$new_field_chain" "$new_row_chain" "$new_col_chain" "$match_value" "$has_match_value"
    done
}

# ===========================================================================
# PUBLIC API
# ===========================================================================

# Finds values in a nested 104 document by dotted path. Non-zero only for malformed paths or a missing/invalid file.
# bejson_nesting_query <bejson_file_path> <path_string> [match_value]
# Echoes a JSON array of QueryMatch blobs to stdout.
# Returns non-zero only on malformed path syntax or missing/invalid file.
bejson_nesting_query() {
    local file_path="$1" path="$2" match_value="${3-}"
    local has_match_value=0
    (( $# >= 3 )) && has_match_value=1

    [[ ! -f "$file_path" ]] && {
        echo "E${E_FILE_NOT_FOUND:-1}: file not found: ${file_path}" >&2
        return 1; }

    local doc_json
    doc_json=$(jq '.' "$file_path" 2>/dev/null) || {
        echo "E${E_INVALID_JSON:-2}: invalid JSON in ${file_path}" >&2
        return 1; }

    local encoded_segments
    encoded_segments=$(_nesting_query_parse_path "$path") || return 1

    local matches
    matches=$(_nesting_query_walk "$doc_json" "$encoded_segments" 0 "$path" "" "" "" "$match_value" "$has_match_value")

    if [[ -z "$matches" ]]; then
        echo "[]"
    else
        printf '%s\n' "$matches" | jq -sc '.'
    fi
}

# Safe-get: prints the first value at a path; never aborts the caller's script.
# bejson_nesting_get_path <bejson_file_path> <path_string> [default_value]
# Safe-Get convenience wrapper (Section 9 standard): echoes the value of the
# FIRST match, or default_value if the path resolves to nothing or the file/
# path is invalid. Never aborts the caller's script (no propagated error).
bejson_nesting_get_path() {
    local file_path="$1" path="$2" default_value="${3-}"
    local query_result
    query_result=$(bejson_nesting_query "$file_path" "$path" 2>/dev/null) || { echo "$default_value"; return 0; }
    local first_value
    first_value=$(echo "$query_result" | jq -r '.[0].value // empty' 2>/dev/null)
    if [[ -z "$first_value" ]]; then echo "$default_value"; else echo "$first_value"; fi
}

# Prints a human-readable summary of query matches.
# bejson_nesting_query_summary <matches_json_array>
bejson_nesting_query_summary() {
    local matches_json="$1"
    local match_count
    match_count=$(echo "$matches_json" | jq 'length' 2>/dev/null)
    [[ -z "$match_count" ]] && match_count=0
    if (( match_count == 0 )); then
        echo "BEJSON Core_Nesting Query Summary"
        echo "  0 matches"
        return 0
    fi
    echo "BEJSON Core_Nesting Query Summary — ${match_count} match(es)"
    echo "$matches_json" | jq -r '
        .[] | . as $query_match |
        ( [range(0; $query_match.fieldChain|length)]
          | map("\($query_match.fieldChain[.])[row=\($query_match.rowChain[.]),col=\($query_match.colChain[.])]")
          | join(" -> ")
        ) as $chain_text |
        "  \($chain_text) = \($query_match.value)"
    '
}