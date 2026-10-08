# -----------------------------------------------------------------------------
# Library:         lib_bejson_CoreNesting_bejson_core_nesting.sh
# Family:          Core_Nesting
# Module Purpose:  Nested-104 detection, validation, field-map cache and safe mutation (append-only schema, null-padding).
# Architecture:    Nested BEJSON 104: a cell of a parent 104 document holds a complete embedded 104 document; the physical cell coordinate (NestAddress) is the implicit foreign key. It is neither 104db nor MFDB.
# Format_Scope:    Nested 104 (NOT 104db, NOT MFDB)
# Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
#                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
#                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
# Version:         0.4.5
# Release_Version: 300
# Date:            2026-10-02
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   dced85be-3e7a-4632-a5de-0c86822baffb
# -----------------------------------------------------------------------------

set -o pipefail
[[ -n "${_LIB_BEJSON_CORE_NESTING_LOADED:-}" ]] && return 0
readonly _LIB_BEJSON_CORE_NESTING_LOADED=1

_NESTING_SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Fail loudly if the adjacent errors file is missing, so E_* codes are never silently undefined.
if [[ ! -f "$_NESTING_SH_DIR/lib_bejson_CoreNesting_bejson_errors.sh" ]]; then
    echo "ERROR: required dependency not found: $_NESTING_SH_DIR/lib_bejson_CoreNesting_bejson_errors.sh" >&2
    return 1 2>/dev/null || exit 1
fi
source "$_NESTING_SH_DIR/lib_bejson_CoreNesting_bejson_errors.sh"

readonly NESTING_MAX_DEPTH=16
readonly _NESTING_VALID_VERSION="104"

# ===========================================================================
# NEST MAP CACHE
# Key:   "<parentFingerprint>:<row>:<col>:<depth>"
# Value: JSON blob (NestedCell)
# col_schema map: "<parentFingerprint>:colschema:<col>"  →  Fields JSON string
# ===========================================================================
declare -gA _BEJSON_NEST_MAP=()
declare -gA _BEJSON_COL_SCHEMAS=()

# Prints the cached NestedCell for a NestAddress, or nothing.
bejson_nesting_cache_get() {
    local parent_fingerprint="$1" row="$2" col="$3" depth="$4"
    local cache_key="${parent_fingerprint}:${row}:${col}:${depth}"
    [[ -n "${_BEJSON_NEST_MAP[$cache_key]+_}" ]] && { echo "${_BEJSON_NEST_MAP[$cache_key]}"; return 0; }
    return $E_NESTING_CACHE_MISS
}

# Stores a NestedCell under its NestAddress.
bejson_nesting_cache_put() {
    local parent_fingerprint="$1" row="$2" col="$3" depth="$4" cell_json="$5"
    _BEJSON_NEST_MAP["${parent_fingerprint}:${row}:${col}:${depth}"]="$cell_json"
}

# Clears the NestMap cache (all, or one parent fingerprint).
bejson_nesting_cache_clear() {
    local parent_fingerprint="${1:-}"
    if [[ -z "$parent_fingerprint" ]]; then _BEJSON_NEST_MAP=(); _BEJSON_COL_SCHEMAS=(); return 0; fi
    local cache_key
    for cache_key in "${!_BEJSON_NEST_MAP[@]}";   do [[ "$cache_key" == "${parent_fingerprint}:"* ]] && unset '_BEJSON_NEST_MAP[$cache_key]';   done
    for cache_key in "${!_BEJSON_COL_SCHEMAS[@]}"; do [[ "$cache_key" == "${parent_fingerprint}:"* ]] && unset '_BEJSON_COL_SCHEMAS[$cache_key]'; done
}

# Prints diagnostic counts for the cache.
bejson_nesting_cache_stats() {
    local total_entries="${#_BEJSON_NEST_MAP[@]}"
    local -A fingerprint_set=() depth_set=()
    local cache_key
    for cache_key in "${!_BEJSON_NEST_MAP[@]}"; do
        local key_fingerprint="${cache_key%%:*}"
        fingerprint_set[$key_fingerprint]=1
        local key_depth="${cache_key##*:}"
        depth_set[$key_depth]=1
    done
    local depth_list
    depth_list=$(printf '%s\n' "${!depth_set[@]}" | sort -n | tr '\n' ',' | sed 's/,$//')
    echo "total_entries=${total_entries} unique_parents=${#fingerprint_set[@]} depth_spread=[${depth_list}]"
}

# Prints every cached NestedCell for one parent document and column.
bejson_nesting_cache_lookup_col() {
    local parent_fingerprint="$1" col="$2"
    local cache_key
    for cache_key in "${!_BEJSON_NEST_MAP[@]}"; do
        # key format: parentFingerprint:row:col:depth — extract col field (index 2 after first split on fingerprint)
        local remaining_key="${cache_key#"${parent_fingerprint}:"}"
        local extracted_col
        extracted_col=$(echo "$remaining_key" | cut -d: -f2)
        [[ "$extracted_col" == "$col" ]] && echo "${_BEJSON_NEST_MAP[$cache_key]}"
    done
}

# ===========================================================================
# INTERNAL HELPERS
# ===========================================================================

# Stable identity of a parent document: RELATIONAL_ID, else a hash of its Fields.
_nesting_doc_fingerprint() {
    local doc_json="$1"
    local relational_id_value
    relational_id_value=$(echo "$doc_json" | jq -r '.RELATIONAL_ID // .relational_id // empty' 2>/dev/null)
    if [[ -n "$relational_id_value" && "$relational_id_value" != "null" ]]; then echo "$relational_id_value"; return 0; fi
    local hash_value
    hash_value=$(echo "$doc_json" | jq -c '.Fields // []' 2>/dev/null | sha256sum | cut -d' ' -f1)
    echo "hash:${hash_value:0:16}"
}

# Returns 0 when a cell looks like an embedded object (starts with { and ends with }).
_nesting_is_candidate() {
    local value_text="$1"
    [[ "$value_text" == "{"* && "$value_text" == *"}" ]] && return 0
    return 1
}

# Canonical string form of a Fields array.
_nesting_fields_signature() {
    echo "$1" | jq -c '.Fields // []' 2>/dev/null
}

# Prints 'valid' or 'invalid|<reason>': nested cells must be BEJSON 104 (not 104a, 104db or an MFDB manifest). Empty reason = not 104, skip silently.
# Returns "valid" or "invalid|<reason>". Empty reason = not 104, skip silently.
_nesting_quick_validate_104() {
    local doc_json="$1"
    local validation_error_code=$E_NESTING_VALIDATION_FAILED

    echo "$doc_json" | jq -e 'type == "object"' > /dev/null 2>&1 || {
        echo "invalid|E${E_NESTING_NOT_BEJSON}: not an object"; return 1; }

    # Missing mandatory keys → not BEJSON, skip silently
    local has_all_mandatory_keys
    has_all_mandatory_keys=$(echo "$doc_json" | jq -r '
        ["Format","Format_Version","Format_Creator","Records_Type","Fields","Values"]
        | map(. as $k | ($k | IN(keys[])) | if . then empty else $k end)
        | length == 0' 2>/dev/null)
    [[ "$has_all_mandatory_keys" != "true" ]] && { echo "invalid|"; return 1; }

    local format_value version_value
    format_value=$(echo "$doc_json" | jq -r '.Format')
    version_value=$(echo "$doc_json" | jq -r '.Format_Version')
    [[ "$format_value" != "BEJSON" ]]                  && { echo "invalid|"; return 1; }
    [[ "$version_value" != "$_NESTING_VALID_VERSION" ]] && { echo "invalid|"; return 1; }

    local validation_errors=""
    local format_creator_value records_type_check
    format_creator_value=$(echo "$doc_json" | jq -r '.Format_Creator')
    [[ "$format_creator_value" != "Elton Boehnen" ]] && \
        validation_errors+="E${validation_error_code}: Format_Creator must be 'Elton Boehnen';"

    records_type_check=$(echo "$doc_json" | jq '.Records_Type | if type=="array" and length==1 and (.[0]|type)=="string" then 1 else 0 end')
    [[ "$records_type_check" != "1" ]] && \
        validation_errors+="E${validation_error_code}: Records_Type must be a single-string array;"

    # Positional integrity
    local field_count
    field_count=$(echo "$doc_json" | jq '.Fields | length')
    local bad_rows
    bad_rows=$(echo "$doc_json" | jq -r --argjson fc "$field_count" '
        .Values | to_entries[] | select(.value | length != $fc) |
        "E'$validation_error_code': row \(.key) has \(.value|length) values, Fields has \($fc)"')
    [[ -n "$bad_rows" ]] && validation_errors+="${bad_rows};"

    if [[ -z "$validation_errors" ]]; then echo "valid"; else echo "invalid|${validation_errors%;}"; fi
}

# Convention check relating the nested Records_Type name to the parent field name; prints a warning or nothing.
_nesting_check_records_type_convention() {
    local doc_json="$1" parent_field="$2"
    local records_type_value
    records_type_value=$(echo "$doc_json" | jq -r '.Records_Type[0] // empty')
    [[ -z "$records_type_value" ]] && return 0
    local expected_records_type="${parent_field^}"   # bash parameter expansion: capitalize first char
    [[ "$records_type_value" != "$expected_records_type" ]] && \
        echo "W: Records_Type '${records_type_value}' should be '${expected_records_type}' by convention"
}

# ===========================================================================
# CORE WALK
# ===========================================================================

# Recursive scan of one cell; echoes a NestedCell JSON blob when an embedded 104 document is found (returns 1 to skip).
# _nesting_walk_cell <cell_value> <row> <col> <field_name> <depth>
#                   <colon_delimited_seen_fingerprints> <parent_fingerprint> <parent_fingerprint_for_col_schema>
# Echoes a JSON NestedCell blob. Returns 0 on find, 1 on skip.
_nesting_walk_cell() {
    local cell_value="$1" row="$2" col="$3" field_name="$4"
    local depth="$5" seen_fingerprints="$6" parent_fingerprint="$7"

    (( depth > NESTING_MAX_DEPTH )) && {
        echo "[NESTING] WARN: depth cap at row=${row} col=${col}" >&2; return 1; }

    _nesting_is_candidate "$cell_value" || return 1

    local cached_blob
    cached_blob=$(bejson_nesting_cache_get "$parent_fingerprint" "$row" "$col" "$depth" 2>/dev/null) && {
        echo "$cached_blob"; return 0; }

    # Parse — cell_value is a JSON string; try direct parse first
    local parsed_doc
    parsed_doc=$(echo "$cell_value" | jq '.' 2>/dev/null) || return 1
    echo "$parsed_doc" | jq -e 'type == "object"' > /dev/null 2>&1 || return 1

    local validation_result is_valid validation_detail
    validation_result=$(_nesting_quick_validate_104 "$parsed_doc")
    is_valid="${validation_result%%|*}"
    validation_detail="${validation_result#*|}"

    [[ "$is_valid" == "invalid" && -z "$validation_detail" ]] && return 1  # not 104 — skip

    local warnings="" errors=""
    [[ "$is_valid" == "invalid" ]] && errors="$validation_detail"

    # Column schema uniformity
    if [[ "$is_valid" == "valid" ]]; then
        local fields_signature schema_key
        fields_signature=$(_nesting_fields_signature "$parsed_doc")
        schema_key="${parent_fingerprint}:colschema:${col}"
        if [[ -z "${_BEJSON_COL_SCHEMAS[$schema_key]+_}" ]]; then
            _BEJSON_COL_SCHEMAS[$schema_key]="$fields_signature"
        elif [[ "${_BEJSON_COL_SCHEMAS[$schema_key]}" != "$fields_signature" ]]; then
            errors="E${E_NESTING_SCHEMA_MISMATCH}: col ${col} row ${row} Fields schema differs from column contract"
            is_valid="invalid"
        fi
    fi

    # Records_Type convention check
    if [[ "$is_valid" == "valid" ]]; then
        local convention_warning
        convention_warning=$(_nesting_check_records_type_convention "$parsed_doc" "$field_name")
        [[ -n "$convention_warning" ]] && warnings="$convention_warning"
    fi

    local nested_fingerprint
    nested_fingerprint=$(_nesting_doc_fingerprint "$parsed_doc")

    # Circular reference guard
    if [[ ":${seen_fingerprints}:" == *":${nested_fingerprint}:"* ]]; then
        local cell_json
        cell_json=$(jq -nc \
            --argjson row "$row" --argjson col "$col" \
            --arg field_name "$field_name" --argjson depth "$depth" \
            --argjson is_valid false \
            --argjson errors "[\"E${E_NESTING_CIRCULAR_REF}: circular reference at depth ${depth}\"]" \
            --argjson warnings "[]" --argjson children "[]" \
            '{row:$row,col:$col,fieldName:$field_name,depth:$depth,isValid:$is_valid,errors:$errors,warnings:$warnings,children:$children}')
        bejson_nesting_cache_put "$parent_fingerprint" "$row" "$col" "$depth" "$cell_json"
        echo "$cell_json"; return 0
    fi

    # Recurse into nested doc's own Values
    local children_json="[]"
    if [[ "$is_valid" == "valid" ]]; then
        local new_seen_fingerprints="${seen_fingerprints}:${nested_fingerprint}"
        local fields_json values_json row_count col_count
        fields_json=$(echo "$parsed_doc" | jq -c '.Fields // []')
        values_json=$(echo "$parsed_doc" | jq -c '.Values // []')
        row_count=$(echo "$values_json" | jq 'length')
        # Pre-compute field names as a bash array — single jq call, O(1) per cell
        local field_names_json
        field_names_json=$(echo "$fields_json" | jq -r '[.[].name] | @json')
        local -a _child_field_names=()
        while IFS= read -r field_name_item; do
            _child_field_names+=("$field_name_item")
        done < <(echo "$field_names_json" | jq -r '.[]')
        local child_results=()
        local row_index col_index child_cell_value child_field_name child_result
        for (( row_index=0; row_index<row_count; row_index++ )); do
            col_count=$(echo "$values_json" | jq ".[${row_index}] | length")
            for (( col_index=0; col_index<col_count; col_index++ )); do
                child_cell_value=$(echo "$values_json" | jq -r ".[${row_index}][${col_index}]")
                # O(1) bash array lookup vs per-cell jq call (R2-SH)
                child_field_name="${_child_field_names[$col_index]:-col_${col_index}}"
                child_result=$(_nesting_walk_cell \
                    "$child_cell_value" "$row_index" "$col_index" "$child_field_name" \
                    "$(( depth + 1 ))" "$new_seen_fingerprints" "$nested_fingerprint") && \
                    child_results+=("$child_result")
            done
        done
        (( ${#child_results[@]} > 0 )) && \
            children_json=$(printf '%s\n' "${child_results[@]}" | jq -sc '.')
    fi

    local is_valid_bool errors_arr warnings_arr
    [[ "$is_valid" == "valid" ]] && is_valid_bool=true || is_valid_bool=false
    errors_arr=$(  [[ -n "$errors"   ]] && jq -nc --arg e "$errors"   '[$e]' || echo "[]")
    warnings_arr=$([[ -n "$warnings" ]] && jq -nc --arg w "$warnings" '[$w]' || echo "[]")

    local cell_json
    cell_json=$(jq -nc \
        --argjson row "$row" --argjson col "$col" \
        --arg field_name "$field_name" --argjson depth "$depth" \
        --argjson is_valid "$is_valid_bool" \
        --argjson errors "$errors_arr" \
        --argjson warnings "$warnings_arr" \
        --argjson children "$children_json" \
        '{row:$row,col:$col,fieldName:$field_name,depth:$depth,isValid:$is_valid,errors:$errors,warnings:$warnings,children:$children}')
    bejson_nesting_cache_put "$parent_fingerprint" "$row" "$col" "$depth" "$cell_json"
    echo "$cell_json"; return 0
}

# ===========================================================================
# PUBLIC API
# ===========================================================================

# Entry point: scans a parent 104 document for embedded 104 documents and prints a NestingResult JSON. Nested BEJSON is 104-inside-104 through a cell; it is not 104db and not MFDB.
# bejson_nesting_scan <bejson_file_path> [use_cache:1|0]
# Echoes a JSON NestingResult to stdout.
bejson_nesting_scan() {
    local file_path="$1" use_cache="${2:-1}"

    [[ ! -f "$file_path" ]] && {
        echo "{\"error\":\"E${E_FILE_NOT_FOUND}: file not found: ${file_path}\"}" >&2
        return $E_FILE_NOT_FOUND; }

    local doc_json
    doc_json=$(jq '.' "$file_path" 2>/dev/null) || {
        echo "{\"error\":\"E${E_INVALID_JSON}: invalid JSON\"}" >&2
        return $E_INVALID_JSON; }

    local document_fingerprint
    document_fingerprint=$(_nesting_doc_fingerprint "$doc_json")

    local fields_json values_json row_count
    fields_json=$(echo "$doc_json" | jq -c '.Fields // []')
    values_json=$(echo "$doc_json" | jq -c '.Values // []')
    row_count=$(echo "$values_json" | jq 'length')

    local scanned=0 found=0 valid=0 invalid=0 max_depth=0 schema_errors=0
    local collected=()

    local row_index col_index col_count cell_value resolved_field_name nested_result
    for (( row_index=0; row_index<row_count; row_index++ )); do
        col_count=$(echo "$values_json" | jq ".[${row_index}] | length")
        for (( col_index=0; col_index<col_count; col_index++ )); do
            (( scanned++ ))
            cell_value=$(echo "$values_json" | jq -r ".[${row_index}][${col_index}]")
            _nesting_is_candidate "$cell_value" || continue
            resolved_field_name=$(echo "$fields_json" | jq -r ".[${col_index}].name // \"col_${col_index}\"")

            if (( use_cache )); then
                local cached_hit
                if cached_hit=$(bejson_nesting_cache_get "$document_fingerprint" "$row_index" "$col_index" 1 2>/dev/null); then
                    (( found++ ))
                    local cached_is_valid; cached_is_valid=$(echo "$cached_hit" | jq '.isValid')
                    [[ "$cached_is_valid" == "true" ]] && (( valid++ )) || (( invalid++ ))
                    local cached_depth; cached_depth=$(echo "$cached_hit" | jq '.depth')
                    (( cached_depth > max_depth )) && max_depth=$cached_depth
                    collected+=("$cached_hit"); continue
                fi
            fi

            nested_result=$(_nesting_walk_cell \
                "$cell_value" "$row_index" "$col_index" "$resolved_field_name" 1 "$document_fingerprint" "$document_fingerprint") || continue
            (( found++ ))
            local nested_is_valid; nested_is_valid=$(echo "$nested_result" | jq '.isValid')
            [[ "$nested_is_valid" == "true" ]] && (( valid++ )) || (( invalid++ ))
            local nested_depth; nested_depth=$(echo "$nested_result" | jq '.depth')
            (( nested_depth > max_depth )) && max_depth=$nested_depth
            # Count schema errors
            local schema_error_count; schema_error_count=$(echo "$nested_result" | jq \
                '[.errors[]? | select(contains("E'$E_NESTING_SCHEMA_MISMATCH'"))] | length')
            (( schema_errors += schema_error_count ))
            collected+=("$nested_result")
        done
    done

    local cells_array="[]"
    (( ${#collected[@]} > 0 )) && \
        cells_array=$(printf '%s\n' "${collected[@]}" | jq -sc '.')

    jq -nc \
        --argjson scanned "$scanned" --argjson found "$found" \
        --argjson valid "$valid" --argjson invalid "$invalid" \
        --argjson max_depth "$max_depth" --argjson schema_errors "$schema_errors" \
        --argjson cells "$cells_array" \
        '{scannedCells:$scanned,nestedFound:$found,nestedValid:$valid,nestedInvalid:$invalid,maxDepthSeen:$max_depth,schemaErrors:$schema_errors,cells:$cells,errors:[],warnings:[]}'
}

# Applies a mutation to a nested document and writes the result back into the parent file atomically.
# bejson_nesting_mutate <parent_file> <row> <col> <jq_mutation_expr>
# jq_mutation_expr: a jq filter applied to the nested doc object, e.g.
#   '.Fields += [{"name":"new_field","type":"string"}]'
# Writes the mutated result back into the parent file atomically.
bejson_nesting_mutate() {
    local parent_file="$1" row="$2" col="$3" jq_mutation_expr="$4"

    [[ ! -f "$parent_file" ]] && return $E_FILE_NOT_FOUND

    local parent_json
    parent_json=$(jq '.' "$parent_file") || return $E_INVALID_JSON

    # Extract nested cell string
    local nested_str
    nested_str=$(echo "$parent_json" | jq -r ".Values[${row}][${col}]")
    local nested_doc
    nested_doc=$(echo "$nested_str" | jq '.') || {
        echo "[NESTING] E${E_NESTING_INVALID_CELL}: cell is not valid JSON" >&2
        return $E_NESTING_INVALID_CELL; }

    local fields_before fields_count_before
    fields_before=$(echo "$nested_doc" | jq -c '.Fields // []')
    fields_count_before=$(echo "$fields_before" | jq 'length')

    # Apply mutation
    local mutated_doc
    mutated_doc=$(echo "$nested_doc" | jq "$jq_mutation_expr") || {
        echo "[NESTING] mutation jq expression failed" >&2; return 1; }

    local fields_count_after
    fields_count_after=$(echo "$mutated_doc" | jq '.Fields | length')

    # Guard: no removals
    (( fields_count_after < fields_count_before )) && {
        echo "[NESTING] E${E_NESTING_SCHEMA_MISMATCH}: mutation removed fields — not permitted" >&2
        return $E_NESTING_SCHEMA_MISMATCH; }

    # Guard: no reorders — first fields_count_before fields must match
    local reorder_check
    reorder_check=$(jq -n \
        --argjson before "$fields_before" \
        --argjson after "$(echo "$mutated_doc" | jq -c '.Fields')" \
        --argjson nb "$fields_count_before" \
        '[$before, $after | .[:$nb]] | .[0] == .[1]')
    [[ "$reorder_check" != "true" ]] && {
        echo "[NESTING] E${E_NESTING_SCHEMA_MISMATCH}: mutation reordered/retyped fields — not permitted" >&2
        return $E_NESTING_SCHEMA_MISMATCH; }

    # Auto null-pad if Fields grew
    if (( fields_count_after > fields_count_before )); then
        local fields_added_count=$(( fields_count_after - fields_count_before ))
        mutated_doc=$(echo "$mutated_doc" | jq --argjson delta "$fields_added_count" \
            '.Values = [.Values[] | . + ([null] * $delta)]')
    fi

    # Serialize mutated doc back into parent, write atomically
    local new_parent tmp_file
    tmp_file="${parent_file}.nesting.tmp"
    new_parent=$(echo "$parent_json" | jq \
        --argjson row "$row" --argjson col "$col" \
        --arg nested_str "$(echo "$mutated_doc" | jq -c '.')" \
        '.Values[$row][$col] = $nested_str')
    echo "$new_parent" > "$tmp_file" && mv "$tmp_file" "$parent_file"
}

# Prints a human-readable summary of a NestingResult.
# bejson_nesting_summary <nesting_result_json>
bejson_nesting_summary() {
    local result_json="$1"
    echo "BEJSON Core_Nesting Scan Summary"
    echo "$result_json" | jq -r '
        "  Cells scanned    : \(.scannedCells)",
        "  Nested found     : \(.nestedFound)",
        "  Valid nested     : \(.nestedValid)",
        "  Invalid nested   : \(.nestedInvalid)",
        "  Max depth seen   : \(.maxDepthSeen)",
        "  Schema errors    : \(.schemaErrors)"
    '
    local error_count warning_count
    error_count=$(echo "$result_json" | jq '.errors | length')
    warning_count=$(echo "$result_json" | jq '.warnings | length')
    (( error_count > 0 )) && {
        echo "  Scan errors:"
        echo "$result_json" | jq -r '.errors[] | "    - \(.)"'
    }
    (( warning_count > 0 )) && {
        echo "  Warnings:"
        echo "$result_json" | jq -r '.warnings[] | "    ~ \(.)"'
    }
    local cell_count
    cell_count=$(echo "$result_json" | jq '[.. | objects | select(has("fieldName"))] | length')
    (( cell_count > 0 )) && {
        echo "  Nested cells:"
        echo "$result_json" | jq -r '
            [.. | objects | select(has("fieldName"))] | .[] |
            "    [\(if .isValid then "VALID" else "INVALID" end)] row=\(.row) col=\(.col) field='"'"'\(.fieldName)'"'"' depth=\(.depth)",
            (.errors[] | "      ! \(.)"),
            (.warnings[] | "      ~ \(.)")
        '
    }
}