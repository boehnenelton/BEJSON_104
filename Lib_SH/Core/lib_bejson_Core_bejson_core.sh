# -----------------------------------------------------------------------------
# Library:         lib_bejson_Core_bejson_core.sh
# Family:          Core
# Module Purpose:  Format-level primitives: atomic write with backup/restore, resilient PID lock, file loading, field-index lookup.
# Architecture:    Format-level BEJSON layer that works on any BEJSON document (104, 104a, 104db) through positional Fields/Values and the field-map cache. It does not orchestrate MFDB and is not specific to 104db.
# Format_Scope:    104 | 104a | 104db (generic)
# Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
#                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
#                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
# Version:         2.0.9
# Release_Version: 300
# Date:            2026-10-02
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   f542d896-9f3e-4452-b29b-2a2588cb3d1e
# -----------------------------------------------------------------------------

set -o pipefail

# Universal library release line. Only this file --
# the Core BEJSON file -- defines RELEASE_VERSION as a real variable;
# all other library files declare it in the header comment only.
readonly RELEASE_VERSION=300

# Source the validator library and error registry (assumes same directory)
_CORE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$_CORE_DIR/lib_bejson_Core_bejson_errors.sh" ]]; then
    # shellcheck source=./lib_bejson_Core_bejson_errors.sh
    source "$_CORE_DIR/lib_bejson_Core_bejson_errors.sh"
fi

if [[ -f "$_CORE_DIR/lib_bejson_Core_bejson_validator.sh" ]]; then
    # shellcheck source=./lib_bejson_Core_bejson_validator.sh
    source "$_CORE_DIR/lib_bejson_Core_bejson_validator.sh"
fi

#-------------------------------------------------------------------------------
# ATOMIC FILE OPERATIONS
#-------------------------------------------------------------------------------

# Copies a file to <file>.backup.<timestamp>.<pid> and echoes the backup path (nothing to back up -> returns 0). Used by atomic_write for rollback.
__bejson_core_atomic_backup() {
    local file_path="$1"
    [[ ! -f "$file_path" ]] && return 0
    local backup_path="${file_path}.backup.$(date +%Y%m%d_%H%M%S).$$"
    cp -p "$file_path" "$backup_path" 2>/dev/null || return $E_CORE_BACKUP_FAILED
    echo "$backup_path"
    return 0
}

# Moves a backup file back over the original (rollback after a failed write).
__bejson_core_restore_backup() {
    local file_path="$1"
    local backup_path="$2"
    [[ -f "$backup_path" ]] && mv "$backup_path" "$file_path" 2>/dev/null
}

# Writes a BEJSON document (stdin/arg content) to a file atomically: lock, backup, temp file, rename; restores the backup on failure. Format-agnostic (104, 104a, 104db, MFDB manifest/entity files).
bejson_core_atomic_write() {
    local file_path="$1"
    local content="$2"
    local create_backup="${3:-true}"
    local backup_path=""

    if [[ "$create_backup" == "true" ]]; then
        backup_path=$(__bejson_core_atomic_backup "$file_path") || return $?
    fi

    local target_dir=$(dirname "$file_path")
    mkdir -p "$target_dir"
    local temp_file="${target_dir}/.bejson_$$.tmp"

    printf '%s' "$content" > "$temp_file" 2>/dev/null || {
        [[ -n "$backup_path" ]] && __bejson_core_restore_backup "$file_path" "$backup_path"
        return $E_CORE_WRITE_FAILED
    }

    # NOTE SH6: On Android exFAT SD card paths (/storage/<UUID>/...), sync(1) may be a
    # no-op or unavailable. The || true swallow is intentional — writes to SD have
    # weaker durability guarantees than internal storage on Android.
    sync "$temp_file" 2>/dev/null || true
    mv "$temp_file" "$file_path" 2>/dev/null || {
        cp -p "$temp_file" "$file_path" 2>/dev/null && rm -f "$temp_file" || {
            [[ -n "$backup_path" ]] && __bejson_core_restore_backup "$file_path" "$backup_path"
            return $E_CORE_WRITE_FAILED
        }
    }
    sync "$(dirname "$file_path")" 2>/dev/null || true
    return 0
}

#-------------------------------------------------------------------------------
# MUTEX LOCKING (Policy Sec. 47)
#-------------------------------------------------------------------------------

# Takes a directory lock with PID metadata; reclaims it when the owning PID is dead. Waits up to a timeout; non-zero on failure.
resilient_lock_acquire() {
    local target="$1"
    local lock_dir="${target}.lockdir"
    local meta="${lock_dir}/lock_meta.json"
    local timeout="${2:-10}"
    local start
    start=$(date +%s)
    
    while true; do
        if mkdir "$lock_dir" 2>/dev/null; then
            # Lock acquired — write PID metadata
            printf '{"pid": %d, "timestamp": %d}\n' "$$" "$(date +%s)" > "$meta"
            return 0
        fi
        
        # Check for dead-process orphan
        if [[ -f "$meta" ]]; then
            local pid
            pid=$(jq -r '.pid // empty' "$meta" 2>/dev/null)
            if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
                # Safe reclamation: owner process is dead
                rm -rf "$lock_dir" 2>/dev/null
                continue
            fi
        fi
        
        if [[ $(($(date +%s) - start)) -ge $timeout ]]; then
            return 53  # E_MFDB_CORE_LOCK_FAILED
        fi
        sleep 0.2
    done
}

# Releases the lock directory taken by resilient_lock_acquire.
resilient_lock_release() {
    local target="$1"
    local lock_dir="${target}.lockdir"
    [[ -d "$lock_dir" ]] && rm -rf "$lock_dir" 2>/dev/null
    return 0
}

# Prints a BEJSON file's text (any version) to stdout; returns E_CORE_FIELD_NOT_FOUND-style non-zero when the file is missing. No validation.
bejson_core_load_file() {
    local file_path="$1"
    if [[ ! -f "$file_path" ]]; then
        return $E_CORE_FIELD_NOT_FOUND
    fi
    cat "$file_path"
}

#-------------------------------------------------------------------------------
# FIELD & RECORD OPERATIONS
#-------------------------------------------------------------------------------

# Echoes the column index of a field name in the document JSON (arg 1), or -1 when absent. Computed with jq on each call.
bejson_core_get_field_index() {
    local doc="$1"
    local field_name="$2"
    echo "$doc" | jq --arg fn "$field_name" '.Fields | map(.name) | index($fn) // -1'
}

# Echoes the number of rows in Values.
bejson_core_get_record_count() {
    local doc="$1"
    echo "$doc" | jq '.Values | length'
}

# Echoes the document with one row appended (arg 2 is the row as a JSON array). No length or type check; for 104db the caller supplies Record_Type_Parent in column 0 and null-pads.
bejson_core_add_record() {
    local doc="$1"
    local values_json="$2"
    echo "$doc" | jq --argjson row "$values_json" '.Values += [$row]'
}

# Echoes the document with the row at the given index removed.
bejson_core_remove_record() {
    local doc="$1"
    local index="$2"
    echo "$doc" | jq --argjson idx "$index" 'del(.Values[$idx])'
}

# Echoes the document with one cell changed (row index, field name, JSON value), resolved through the field index.
bejson_core_update_field() {
    # --arg always writes a JSON string. Inspect declared field type and use
    # --argjson when the field is not a string so integers/booleans/numbers round-trip
    # correctly. Falls back to --arg only for string-typed fields.
    local doc="$1"
    local rec_idx="$2"
    local field_name="$3"
    local new_val="$4"
    local f_idx
    f_idx=$(bejson_core_get_field_index "$doc" "$field_name")
    if [[ "$f_idx" == "-1" ]]; then return $E_CORE_FIELD_NOT_FOUND; fi

    local field_type
    field_type=$(echo "$doc" | jq -r --argjson fi "$f_idx" '.Fields[$fi].type // "string"')

    if [[ "$field_type" == "string" ]]; then
        echo "$doc" | jq --argjson ri "$rec_idx" --argjson fi "$f_idx" --arg nv "$new_val" '(.Values[$ri][$fi]) = $nv'
    else
        # Use --argjson so the value is written as the correct JSON type (number, boolean, etc.)
        echo "$doc" | jq --argjson ri "$rec_idx" --argjson fi "$f_idx" --argjson nv "$new_val" '(.Values[$ri][$fi]) = $nv'
    fi
}

#-------------------------------------------------------------------------------
# QUERY & SORT
#-------------------------------------------------------------------------------

# Echoes the rows where a field equals a value (JSON array).
bejson_core_filter_rows() {
    local doc="$1"
    local field_name="$2"
    local value="$3"
    local f_idx=$(bejson_core_get_field_index "$doc" "$field_name")
    if [[ "$f_idx" == "-1" ]]; then return $E_CORE_FIELD_NOT_FOUND; fi
    echo "$doc" | jq --argjson fi "$f_idx" --arg val "$value" '.Values | map(select(.[$fi] == $val))'
}

# Echoes the document with Values sorted by one field.
bejson_core_sort_by_field() {
    local doc="$1"
    local field_name="$2"
    local ascending="${3:-true}"
    local f_idx=$(bejson_core_get_field_index "$doc" "$field_name")
    if [[ "$f_idx" == "-1" ]]; then return $E_CORE_FIELD_NOT_FOUND; fi
    if [[ "$ascending" == "true" ]]; then
        echo "$doc" | jq --argjson fi "$f_idx" '.Values |= sort_by(.[$fi])'
    else
        echo "$doc" | jq --argjson fi "$f_idx" '.Values |= (sort_by(.[$fi]) | reverse)'
    fi
}

# Export functions
export -f bejson_core_atomic_write
export -f bejson_core_load_file
export -f bejson_core_get_field_index
export -f bejson_core_get_record_count
export -f bejson_core_add_record
export -f bejson_core_remove_record
export -f bejson_core_update_field
export -f bejson_core_filter_rows
export -f bejson_core_sort_by_field
export -f resilient_lock_acquire
export -f resilient_lock_release