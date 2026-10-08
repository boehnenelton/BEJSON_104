# -----------------------------------------------------------------------------
# Library:         lib_bejson_Core_mfdb_core.sh
# Family:          Core
# Module Purpose:  MFDB orchestrator: discovery, entity access, and MFDB-132 archive mount/commit/unmount.
# Architecture:    MFDB (a database architecture layered on BEJSON, not a BEJSON format version): one BEJSON 104a manifest (104a.mfdb.bejson) registers many dense BEJSON 104 entity files linked by Parent_Hierarchy. MFDB-132 packs a whole MFDB into one Chunked-104a document and is handled here as a wrapper around the same manifest + entity structure. It is not 104db and uses no null-padding.
# Format_Scope:    MFDB only (104a manifest + 104 entity files; NOT 104db)
# Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
#                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
#                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
# Version:         2.2.4
# Release_Version: 300
# Date:            2026-10-02
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   4c4f58ce-b1ed-44fe-b5ed-03fee47e10cd
# -----------------------------------------------------------------------------

set -o pipefail

# Source dependencies if not already loaded.
_MFDB_CORE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! declare -f bejson_core_atomic_write > /dev/null 2>&1; then
    # shellcheck source=./lib_bejson_Core_bejson_core.sh
    source "${_MFDB_CORE_DIR}/lib_bejson_Core_bejson_core.sh"
fi

if ! declare -f mfdb_validator_validate_manifest > /dev/null 2>&1; then
    # shellcheck source=./lib_bejson_Core_mfdb_validator.sh
    source "${_MFDB_CORE_DIR}/lib_bejson_Core_mfdb_validator.sh"
fi

#-------------------------------------------------------------------------------
# Error codes (50–79)
#-------------------------------------------------------------------------------

# Error codes sourced from lib_bejson_Core_bejson_errors.sh (via bejson_core.sh chain).
# Local guards remain as fallback for scripts that source mfdb_core.sh directly.
[[ -v E_MFDB_CORE_MANIFEST_NOT_FOUND ]] || readonly E_MFDB_CORE_MANIFEST_NOT_FOUND=50
[[ -v E_MFDB_CORE_ENTITY_NOT_FOUND   ]] || readonly E_MFDB_CORE_ENTITY_NOT_FOUND=51
[[ -v E_MFDB_CORE_WRITE_FAILED       ]] || readonly E_MFDB_CORE_WRITE_FAILED=52
[[ -v E_MFDB_CORE_LOCK_FAILED        ]] || readonly E_MFDB_CORE_LOCK_FAILED=53
[[ -v E_MFDB_CORE_INVALID_OPERATION  ]] || readonly E_MFDB_CORE_INVALID_OPERATION=54
[[ -v E_MFDB_CORE_INDEX_OUT_OF_BOUNDS ]] || readonly E_MFDB_CORE_INDEX_OUT_OF_BOUNDS=55
[[ -v E_MFDB_CORE_ARCHIVE_ERROR      ]] || readonly E_MFDB_CORE_ARCHIVE_ERROR=70
[[ -v E_MFDB_CORE_MOUNT_CONFLICT     ]] || readonly E_MFDB_CORE_MOUNT_CONFLICT=71
[[ -v E_MFDB_CORE_CREATE_FAILED      ]] || readonly E_MFDB_CORE_CREATE_FAILED=72

#-------------------------------------------------------------------------------
# MFDBArchive (v1.2 Feature)
#-------------------------------------------------------------------------------

# MFDB archive step: extracts a .mfdb.zip (a whole MFDB -- 104a manifest + 104 entity files -- in one archive) into a workspace and creates a session lock (.mfdb_lock). The archive is only a container.
# mfdb_archive_mount <archive_path> <target_dir> [force]
# Extracts archive to workspace and creates session lock.
mfdb_archive_mount() {
    local archive_path="$1"
    local target_dir="$2"
    local force="${3:-false}"

    if [[ ! -f "$archive_path" ]]; then
        echo "ERROR: Archive not found: $archive_path" >&2
        return $E_MFDB_CORE_ARCHIVE_ERROR
    fi

    local lock_file="$target_dir/.mfdb_lock"
    if [[ -f "$lock_file" && "$force" != "true" ]]; then
        local old_pid
        old_pid=$(jq -r '.pid' "$lock_file")
        if kill -0 "$old_pid" 2>/dev/null; then
            echo "ERROR: Workspace $target_dir is locked by active PID $old_pid" >&2
            return $E_MFDB_CORE_MOUNT_CONFLICT
        fi
    fi

    mkdir -p "$target_dir"
    unzip -q -o "$archive_path" -d "$target_dir" || {
        echo "ERROR: Extraction failed for $archive_path" >&2
        return $E_MFDB_CORE_ARCHIVE_ERROR
    }

    if [[ ! -f "$target_dir/104a.mfdb.bejson" ]]; then
        echo "ERROR: Invalid MFDB Archive: manifest missing" >&2
        rm -rf "$target_dir"
        return $E_MFDB_CORE_ARCHIVE_ERROR
    fi

    local hash
    hash=$(sha256sum "$archive_path" | awk '{print $1}')
    
    jq -n \
        --arg pid "$$" \
        --arg path "$(realpath "$archive_path")" \
        --arg hash "$hash" \
        --arg time "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        '{pid: $pid|tonumber, archive_path: $path, original_hash: $hash, mounted_at: $time}' \
        > "$lock_file"

    echo "$(realpath "$target_dir/104a.mfdb.bejson")"
}

# Repacks the workspace into the .mfdb.zip atomically (optionally validating first).
# mfdb_archive_commit <mount_dir> [archive_path]
# Repacks workspace into .mfdb.zip atomically.
mfdb_archive_commit() {
    local mount_dir="$1"
    local archive_path="${2:-}"
    local lock_file="$mount_dir/.mfdb_lock"

    if [[ ! -f "$lock_file" ]]; then
        echo "ERROR: No active mount session in $mount_dir" >&2
        return $E_MFDB_CORE_INVALID_OPERATION
    fi

    local dest
    if [[ -n "$archive_path" ]]; then
        dest="$archive_path"
    else
        dest=$(jq -r '.archive_path' "$lock_file")
    fi

    local tmp_zip
    tmp_zip="${TMPDIR:-/tmp}/mfdb_commit_$$.zip"
    rm -f "$tmp_zip"

    (cd "$mount_dir" && zip -r -q "$tmp_zip" . -x ".mfdb_lock") || {
        rm -f "$tmp_zip"
        echo "ERROR: Repack failed for $mount_dir" >&2
        return $E_MFDB_CORE_WRITE_FAILED
    }

    mv "$tmp_zip" "$dest" || {
        rm -f "$tmp_zip"
        echo "ERROR: Atomic swap failed for $dest" >&2
        return $E_MFDB_CORE_WRITE_FAILED
    }

    local new_hash
    new_hash=$(sha256sum "$dest" | awk '{print $1}')
    local tmp_lock
    tmp_lock=$(mktemp)
    jq --arg h "$new_hash" '.original_hash = $h' "$lock_file" > "$tmp_lock" && mv "$tmp_lock" "$lock_file"

    echo "$(realpath "$dest")"
}

# Releases the session lock; with cleanup also deletes the workspace.
# mfdb_archive_unmount <mount_dir> [cleanup]
mfdb_archive_unmount() {
    local mount_dir="$1"
    local cleanup="${2:-true}"
    local lock_file="$mount_dir/.mfdb_lock"

    [[ -f "$lock_file" ]] && rm -f "$lock_file"
    [[ "$cleanup" == "true" && -d "$mount_dir" ]] && rm -rf "$mount_dir"
}

#-------------------------------------------------------------------------------
# Discovery
#-------------------------------------------------------------------------------

# Prints the MFDB role of a file: manifest (104a named *.mfdb.bejson), entity (104 with Parent_Hierarchy), archive (.mfdb.zip) or standalone (anything else, including a 104db file).
# mfdb_core_discover <file_path>
# Prints: 'manifest', 'entity', 'archive', or 'standalone'
mfdb_core_discover() {
    local file_path="$1"

    if [[ ! -f "$file_path" ]]; then
        echo "ERROR: File not found: $file_path" >&2
        return $E_MFDB_CORE_MANIFEST_NOT_FOUND
    fi

    if [[ "$file_path" == *".mfdb.zip" ]]; then
        echo "archive"
        return 0
    fi

    local version filename
    version="$(jq -r '.Format_Version // empty' "$file_path" 2>/dev/null)"
    filename="$(basename "$file_path")"

    if [[ "$version" == "104a" && "$filename" == *".mfdb.bejson" ]]; then
        echo "manifest"
    elif [[ "$version" == "104" ]]; then
        local ph
        ph="$(jq -r '.Parent_Hierarchy // empty' "$file_path" 2>/dev/null)"
        if [[ -n "$ph" ]]; then
            echo "entity"
        else
            echo "standalone"
        fi
    else
        echo "standalone"
    fi
}

#-------------------------------------------------------------------------------
# Internal helpers
#-------------------------------------------------------------------------------

# Resolves path placeholders to an absolute path through the environment layer.
__mfdb_core_resolve() {
    local manifest_path="$1"
    local file_path_rel="$2"
    local manifest_dir
    manifest_dir="$(cd "$(dirname "$manifest_path")" && pwd)"
    realpath -m "$manifest_dir/$file_path_rel" 2>/dev/null || echo "$manifest_dir/$file_path_rel"
}

# Echoes the column index of a field name in a document (jq).
__mfdb_field_index() {
    local file_path="$1"
    local field_name="$2"
    local doc
    doc=$(cat "$file_path")
    bejson_core_get_field_index "$doc" "$field_name"
}

# Echoes the column index of entity_name in the manifest.
__mfdb_core_en_idx() {
    __mfdb_field_index "$1" "entity_name"
}

# Echoes the column index of file_path in the manifest.
__mfdb_core_fp_idx() {
    __mfdb_field_index "$1" "file_path"
}

# Echoes an entity's file_path from the manifest.
__mfdb_core_get_file_path() {
    local manifest_path="$1"
    local entity_name="$2"
    local en_idx fp_idx
    en_idx="$(__mfdb_core_en_idx "$manifest_path")"
    fp_idx="$(__mfdb_core_fp_idx "$manifest_path")"
    jq -r --argjson ei "$en_idx" --argjson fi "$fp_idx" --arg en "$entity_name" \
        '.Values[] | select(.[$ei] == $en) | .[$fi] // empty' \
        "$manifest_path" 2>/dev/null | head -n1
}

#-------------------------------------------------------------------------------
# Dependency check
#-------------------------------------------------------------------------------

# Checks the required tools (jq, zip/unzip) are installed.
mfdb_core_check_dependencies() {
    mfdb_validator_check_dependencies || return $?
    if ! declare -f bejson_core_atomic_write > /dev/null 2>&1; then
        echo "ERROR: lib_bejson_Core_bejson_core.sh must be sourced before lib_bejson_Core_mfdb_core.sh" >&2
        return 1
    fi
    for cmd in unzip zip sha256sum; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            echo "ERROR: Required command '$cmd' not found" >&2
            return 1
        fi
    done
    return 0
}

#-------------------------------------------------------------------------------
# Read operations
#-------------------------------------------------------------------------------

# Validates the manifest, then prints it (a 104a document named *.mfdb.bejson).
mfdb_core_load_manifest() {
    local manifest_path="$1"
    if ! mfdb_validator_validate_manifest "$manifest_path"; then
        echo "ERROR: Manifest validation failed: $manifest_path" >&2
        return $E_MFDB_CORE_MANIFEST_NOT_FOUND
    fi
    jq -r '.Values[] | @tsv' "$manifest_path" 2>/dev/null
}

# Prints the registered entity names from the manifest.
mfdb_core_list_entities() {
    local manifest_path="$1"
    local en_idx
    en_idx="$(__mfdb_core_en_idx "$manifest_path")"
    jq -r --argjson ei "$en_idx" '.Values[] | .[$ei] // empty' "$manifest_path" 2>/dev/null
}

# Prints one entity's records (a dense BEJSON 104 entity file; no null-padding, no Record_Type_Parent).
mfdb_core_load_entity() {
    local manifest_path="$1"
    local entity_name="$2"
    local file_path_rel
    file_path_rel="$(__mfdb_core_get_file_path "$manifest_path" "$entity_name")"
    if [[ -z "$file_path_rel" ]]; then
        echo "ERROR: Entity '$entity_name' not found in manifest" >&2
        return $E_MFDB_CORE_ENTITY_NOT_FOUND
    fi
    local resolved
    resolved="$(__mfdb_core_resolve "$manifest_path" "$file_path_rel")"
    if [[ ! -f "$resolved" ]]; then
        echo "ERROR: Entity file not found: $resolved" >&2
        return $E_MFDB_CORE_ENTITY_NOT_FOUND
    fi
    jq -r '[.Fields[].name] | @tsv' "$resolved" 2>/dev/null
    jq -r '.Values[] | @tsv' "$resolved" 2>/dev/null
}

# Echoes the absolute path of an entity file.
mfdb_core_get_entity_path() {
    local manifest_path="$1"
    local entity_name="$2"
    local file_path_rel
    file_path_rel="$(__mfdb_core_get_file_path "$manifest_path" "$entity_name")"
    if [[ -z "$file_path_rel" ]]; then
        echo "ERROR: Entity '$entity_name' not found in manifest" >&2
        return $E_MFDB_CORE_ENTITY_NOT_FOUND
    fi
    __mfdb_core_resolve "$manifest_path" "$file_path_rel"
}

# Prints summary statistics for the MFDB (entity count, record counts).
mfdb_core_get_stats() {
    local manifest_path="$1"
    local db_name schema_version
    db_name="$(jq -r '.DB_Name // "N/A"' "$manifest_path" 2>/dev/null)"
    schema_version="$(jq -r '.Schema_Version // "N/A"' "$manifest_path" 2>/dev/null)"
    echo "=== MFDB Stats ==="
    echo "DB Name        : $db_name"
    echo "Schema Version : $schema_version"
    echo "Manifest       : $manifest_path"
    echo ""
    local en_idx fp_idx
    en_idx="$(__mfdb_core_en_idx "$manifest_path")"
    fp_idx="$(__mfdb_core_fp_idx "$manifest_path")"
    local entity_count=0
    while IFS=$'\t' read -r entity_name file_path_rel; do
        entity_count=$((entity_count + 1))
        local resolved
        resolved="$(__mfdb_core_resolve "$manifest_path" "$file_path_rel")"
        local rec_count="?"
        if [[ -f "$resolved" ]]; then
            rec_count="$(jq -r '.Values | length' "$resolved" 2>/dev/null)"
        fi
        printf "  %-24s  %-36s  records: %s\n" "$entity_name" "$file_path_rel" "$rec_count"
    done < <(jq -r --argjson ei "$en_idx" --argjson fi "$fp_idx" \
        '.Values[] | [.[$ei] // "null", .[$fi] // "null"] | @tsv' \
        "$manifest_path" 2>/dev/null)
    echo ""
    echo "Total entities : $entity_count"
}

#-------------------------------------------------------------------------------
# Write operations
#-------------------------------------------------------------------------------

# Appends a row to an entity file, then syncs the manifest record_count.
mfdb_core_add_entity_record() {
    local manifest_path="$1"
    local entity_name="$2"
    local json_values_array="$3"
    local file_path_rel
    file_path_rel="$(__mfdb_core_get_file_path "$manifest_path" "$entity_name")"
    if [[ -z "$file_path_rel" ]]; then
        echo "ERROR: Entity '$entity_name' not found in manifest" >&2
        return $E_MFDB_CORE_ENTITY_NOT_FOUND
    fi
    local resolved
    resolved="$(__mfdb_core_resolve "$manifest_path" "$file_path_rel")"
    if [[ ! -f "$resolved" ]]; then
        echo "ERROR: Entity file not found: $resolved" >&2
        return $E_MFDB_CORE_ENTITY_NOT_FOUND
    fi
    if ! echo "$json_values_array" | jq -e 'if type == "array" then true else error end' > /dev/null 2>&1; then
        echo "ERROR: json_values_array must be a JSON array string" >&2
        return $E_MFDB_CORE_INVALID_OPERATION
    fi
    local tmp_file
    tmp_file="$(mktemp "${resolved}.tmp.XXXXXX")"
    if ! jq --argjson row "$json_values_array" '.Values += [$row]' "$resolved" > "$tmp_file" 2>/dev/null; then
        rm -f "$tmp_file"
        echo "ERROR: Failed to append record to $resolved" >&2
        return $E_MFDB_CORE_WRITE_FAILED
    fi
    mv "$tmp_file" "$resolved"
    mfdb_core_sync_manifest_count "$manifest_path" "$entity_name"
}

# Removes a row from an entity file, then syncs the manifest record_count.
mfdb_core_remove_entity_record() {
    local manifest_path="$1"
    local entity_name="$2"
    local record_index="$3"
    local file_path_rel
    file_path_rel="$(__mfdb_core_get_file_path "$manifest_path" "$entity_name")"
    if [[ -z "$file_path_rel" ]]; then
        echo "ERROR: Entity '$entity_name' not found in manifest" >&2
        return $E_MFDB_CORE_ENTITY_NOT_FOUND
    fi
    local resolved
    resolved="$(__mfdb_core_resolve "$manifest_path" "$file_path_rel")"
    if [[ ! -f "$resolved" ]]; then
        echo "ERROR: Entity file not found: $resolved" >&2
        return $E_MFDB_CORE_ENTITY_NOT_FOUND
    fi
    local rec_count
    rec_count="$(jq -r '.Values | length' "$resolved" 2>/dev/null)"
    if [[ "$record_index" -lt 0 || "$record_index" -ge "$rec_count" ]]; then
        echo "ERROR: Record index $record_index is out of bounds (count: $rec_count)" >&2
        return $E_MFDB_CORE_INDEX_OUT_OF_BOUNDS
    fi
    local tmp_file
    tmp_file="$(mktemp "${resolved}.tmp.XXXXXX")"
    if ! jq --argjson ri "$record_index" 'del(.Values[$ri])' "$resolved" > "$tmp_file" 2>/dev/null; then
        rm -f "$tmp_file"
        echo "ERROR: Failed to remove record $record_index from $resolved" >&2
        return $E_MFDB_CORE_WRITE_FAILED
    fi
    mv "$tmp_file" "$resolved"
    mfdb_core_sync_manifest_count "$manifest_path" "$entity_name"
}

#-------------------------------------------------------------------------------
# Manifest sync
#-------------------------------------------------------------------------------

# Writes one entity's real row count into the manifest.
mfdb_core_sync_manifest_count() {
    local manifest_path="$1"
    local entity_name="$2"
    local file_path_rel
    file_path_rel="$(__mfdb_core_get_file_path "$manifest_path" "$entity_name")"
    [[ -z "$file_path_rel" ]] && return $E_MFDB_CORE_ENTITY_NOT_FOUND
    local resolved
    resolved="$(__mfdb_core_resolve "$manifest_path" "$file_path_rel")"
    [[ ! -f "$resolved" ]] && return $E_MFDB_CORE_ENTITY_NOT_FOUND
    local actual_count
    actual_count="$(jq -r '.Values | length' "$resolved" 2>/dev/null)"
    local en_idx rc_idx
    en_idx="$(__mfdb_core_en_idx "$manifest_path")"
    rc_idx="$(__mfdb_field_index "$manifest_path" "record_count")"
    [[ "$rc_idx" == "-1" ]] && return 0
    local tmp_file
    tmp_file="$(mktemp "${manifest_path}.tmp.XXXXXX")"
    if ! jq --argjson ei "$en_idx" --argjson ri "$rc_idx" \
            --arg en "$entity_name" --argjson count "$actual_count" \
            '(.Values[] | select(.[$ei] == $en) | .[$ri]) = $count' \
            "$manifest_path" > "$tmp_file" 2>/dev/null; then
        rm -f "$tmp_file"
        return $E_MFDB_CORE_WRITE_FAILED
    fi
    mv "$tmp_file" "$manifest_path"
    echo "$actual_count"
}

# Runs the count sync for every entity.
mfdb_core_sync_all_counts() {
    local manifest_path="$1"
    while IFS= read -r entity_name; do
        local count
        count="$(mfdb_core_sync_manifest_count "$manifest_path" "$entity_name")"
        printf "%-24s  %s records\n" "$entity_name" "$count"
    done < <(mfdb_core_list_entities "$manifest_path")
}

#-------------------------------------------------------------------------------
# Database creation
#-------------------------------------------------------------------------------

# Creates a new empty entity file (BEJSON 104, one Records_Type, Parent_Hierarchy back to the manifest) and registers it in the manifest.
mfdb_core_create_entity_file() {
    local manifest_path="$1"
    local entity_name="$2"
    local fields_json="$3"
    local description="${4:-}"
    local primary_key="${5:-}"
    local schema_version="${6:-1.0}"
    local file_path_rel="${7:-}"
    if [[ -z "$file_path_rel" ]]; then
        file_path_rel="data/$(echo "$entity_name" | tr '[:upper:]' '[:lower:]').bejson"
    fi
    local manifest_dir resolved entity_dir rel_to_manifest
    manifest_dir="$(cd "$(dirname "$manifest_path")" && pwd)"
    resolved="$(realpath -m "$manifest_dir/$file_path_rel" 2>/dev/null || echo "$manifest_dir/$file_path_rel")"
    entity_dir="$(dirname "$resolved")"
    mkdir -p "$entity_dir"
    rel_to_manifest="$(realpath --relative-to="$entity_dir" "$manifest_path" 2>/dev/null || echo "../$(basename "$manifest_path")")"
    local tmp_entity
    tmp_entity="$(mktemp "${resolved}.tmp.XXXXXX")"
    jq -n \
        --arg en "$entity_name" \
        --arg ph "$rel_to_manifest" \
        --argjson fields "$fields_json" \
        '{
            "Format":           "BEJSON",
            "Format_Version":   "104",
            "Format_Creator":   "Elton Boehnen",
            "Parent_Hierarchy": $ph,
            "Records_Type":     [$en],
            "Fields":           $fields,
            "Values":           []
        }' > "$tmp_entity" 2>/dev/null && mv "$tmp_entity" "$resolved"
    local en_idx fp_idx
    en_idx="$(__mfdb_core_en_idx "$manifest_path")"
    fp_idx="$(__mfdb_core_fp_idx "$manifest_path")"
    local new_row_json
    new_row_json="$(jq -r \
        --arg en "$entity_name" \
        --arg fp "$file_path_rel" \
        --arg desc "${description:-null}" \
        --arg pk "${primary_key:-null}" \
        --arg sv "$schema_version" \
        '[.Fields[].name] | map(
            if . == "entity_name"    then $en
            elif . == "file_path"    then $fp
            elif . == "description"  then (if $desc == "null" then null else $desc end)
            elif . == "record_count" then 0
            elif . == "schema_version" then $sv
            elif . == "primary_key"  then (if $pk == "null" then null else $pk end)
            else null
            end
        )' "$manifest_path" 2>/dev/null)"
    local tmp_manifest
    tmp_manifest="$(mktemp "${manifest_path}.tmp.XXXXXX")"
    jq --argjson row "$new_row_json" '.Values += [$row]' "$manifest_path" > "$tmp_manifest" && mv "$tmp_manifest" "$manifest_path"
    echo "$resolved"
}

# Creates a new MFDB on disk: the 104a manifest (104a.mfdb.bejson) plus one 104 entity file per entity. Result is ordinary 104a + 104 files; no new Format_Version, not 104db.
mfdb_core_create_database() {
    local root_dir="$1"
    local db_name="$2"
    local db_description="${3:-}"
    local entities_json="$4"
    local schema_version="${5:-1.0.0}"
    local author="${6:-Elton Boehnen}"
    local network_role="${7:-Standalone}"   # "Master" | "Slave" | "Standalone"
    mkdir -p "$root_dir"
    local manifest_path="$root_dir/104a.mfdb.bejson"
    local created_at
    created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")"
    # Build manifest Values from entities_json.
    local manifest_values_json
    manifest_values_json="$(echo "$entities_json" | jq -c \
        '[.[] | [
            .name,
            (.file_path // ("data/" + (.name | ascii_downcase) + ".bejson")),
            (.description // null),
            0,
            (.schema_version // "1.0"),
            (.primary_key // null)
        ]]')"

    local tmp_manifest
    tmp_manifest="$(mktemp "${manifest_path}.tmp.XXXXXX")"

    if ! jq -n \
        --arg db_name "$db_name" \
        --arg db_desc "$db_description" \
        --arg sv "$schema_version" \
        --arg author "$author" \
        --arg created_at "$created_at" \
        --arg network_role "$network_role" \
        --argjson values "$manifest_values_json" \
        '{
            "Format":          "BEJSON",
            "Format_Version":  "104a",
            "Format_Creator":  "Elton Boehnen",
            "MFDB_Version":    "1.31",
            "Network_Role":    $network_role,
            "DB_Name":         $db_name,
            "DB_Description":  $db_desc,
            "Schema_Version":  $sv,
            "Author":          $author,
            "Created_At":      $created_at,
            "Records_Type":    ["mfdb"],
            "Fields": [
                {"name":"entity_name",    "type":"string"},
                {"name":"file_path",      "type":"string"},
                {"name":"description",    "type":"string"},
                {"name":"record_count",   "type":"integer"},
                {"name":"schema_version", "type":"string"},
                {"name":"primary_key",    "type":"string"}
            ],
            "Values": $values
        }' > "$tmp_manifest"; then
        rm -f "$tmp_manifest"
        echo "ERROR: Failed to generate manifest JSON" >&2
        return $E_MFDB_CORE_CREATE_FAILED
    fi

    mv "$tmp_manifest" "$manifest_path"

    local entity_count
    entity_count="$(echo "$entities_json" | jq -r 'length')"
    for (( i=0; i<entity_count; i++ )); do
        local ename fp_rel efields
        ename="$(echo "$entities_json" | jq -r ".[$i].name" 2>/dev/null)"
        fp_rel="$(echo "$entities_json" | jq -r ".[$i].file_path // (\"data/\" + (.[$i].name | ascii_downcase) + \".bejson\")" 2>/dev/null)"
        efields="$(echo "$entities_json" | jq -c ".[$i].fields" 2>/dev/null)"
        local resolved entity_dir rel_to_manifest
        resolved="$(realpath -m "$root_dir/$fp_rel" 2>/dev/null || echo "$root_dir/$fp_rel")"
        entity_dir="$(dirname "$resolved")"
        mkdir -p "$entity_dir"
        rel_to_manifest="$(realpath --relative-to="$entity_dir" "$manifest_path" 2>/dev/null || echo "../$(basename "$manifest_path")")"
        local tmp_entity
        tmp_entity="$(mktemp "${resolved}.tmp.XXXXXX")"
        jq -n \
            --arg en "$ename" \
            --arg ph "$rel_to_manifest" \
            --argjson fields "$efields" \
            '{
                "Format":           "BEJSON",
                "Format_Version":   "104",
                "Format_Creator":   "Elton Boehnen",
                "Parent_Hierarchy": $ph,
                "Records_Type":     [$en],
                "Fields":           $fields,
                "Values":           []
            }' > "$tmp_entity" 2>/dev/null && mv "$tmp_entity" "$resolved"
    done
    echo "$manifest_path"
}

# Export functions
export -f mfdb_archive_mount
export -f mfdb_archive_commit
export -f mfdb_archive_unmount
export -f mfdb_core_check_dependencies
export -f mfdb_core_discover
export -f mfdb_core_load_manifest
export -f mfdb_core_list_entities
export -f mfdb_core_load_entity
export -f mfdb_core_get_entity_path
export -f mfdb_core_get_stats
export -f mfdb_core_add_entity_record
export -f mfdb_core_remove_entity_record
export -f mfdb_core_sync_manifest_count
export -f mfdb_core_sync_all_counts
export -f mfdb_core_create_entity_file
export -f mfdb_core_create_database

# ── Federated Master / Slave node system ───────────────────────────────────────
# Network_Role ("Master"|"Slave"|"Standalone") is emitted by
# mfdb_core_create_database. This block wires the full runtime federation
# protocol: ConnectedSlave entity creator, Master→Slave atomic push,
# Slave dropzone poller, and Slave→Master log distillation.

# Federation: registers a ConnectedSlave entity on a Master manifest; fails if Network_Role is not Master.
# mfdb_core_create_connected_slave_entity <manifest_path>
# Creates the ConnectedSlave entity file and registers it in the manifest.
# Fails if Network_Role != "Master".
mfdb_core_create_connected_slave_entity() {
    local manifest_path="$1"
    local role
    role=$(jq -r '.Network_Role // ""' "$manifest_path" 2>/dev/null)
    if [[ "$role" != "Master" ]]; then
        echo "[MFDB_FEDERATION] ERROR: ConnectedSlave may only be created on a Master node. Got: '$role'" >&2
        return 1
    fi

    local fields_json='[
        {"name":"slave_id",           "type":"string"},
        {"name":"label",              "type":"string"},
        {"name":"url",                "type":"string"},
        {"name":"role",               "type":"string"},
        {"name":"status",             "type":"string"},
        {"name":"supported_entities", "type":"array"}
    ]'
    mfdb_core_create_entity_file \
        "$manifest_path" "ConnectedSlave" "$fields_json" \
        "Registry of Slave nodes connected to this Master." "slave_id"
}
export -f mfdb_core_create_connected_slave_entity

# Federation: Master -> Slave config push; atomically drops a BEJSON 104a config document into the slave's drop-zone. Returns 0 on success.
# mfdb_federation_push_config <config_json_string> <slave_target_path>
# Master → Slave atomic drop-zone push. Writes config via same-dir temp + mv.
# Returns 0 on success, 1 on error.
mfdb_federation_push_config() {
    local config_json="$1"
    local slave_target_path="$2"
    local dest_dir
    dest_dir="$(dirname "$slave_target_path")"
    mkdir -p "$dest_dir"
    local temp_path="$slave_target_path.tmp.$$"
    if echo "$config_json" > "$temp_path" && mv "$temp_path" "$slave_target_path"; then
        return 0
    else
        rm -f "$temp_path"
        echo "[MFDB_FEDERATION] ERROR: push_config failed for $slave_target_path" >&2
        return 1
    fi
}
export -f mfdb_federation_push_config

# Federation: processes new documents in a drop-zone directory; prints how many configs were handled.
# mfdb_federation_poll_dropzone <dropzone_dir> <handler_function> [poll_interval_sec=2] [timeout_sec=60]
# Slave: polls dropzone_dir for incoming .bejson files from Master.
# Each file is passed to handler_function <file_path> then removed.
# handler_function must be exported with export -f.
# Returns count of configs processed on stdout.
mfdb_federation_poll_dropzone() {
    local dropzone_dir="$1"
    local handler_fn="$2"
    local poll_interval="${3:-2}"
    local timeout="${4:-60}"
    mkdir -p "$dropzone_dir"

    local processed=0
    local deadline=$(( $(date +%s) + timeout ))

    while [[ "$(date +%s)" -lt "$deadline" ]]; do
        for fpath in "$dropzone_dir"/*.bejson; do
            [[ -f "$fpath" ]] || continue
            if "$handler_fn" "$fpath"; then
                rm -f "$fpath"
                (( processed++ )) || true
            else
                echo "[MFDB_FEDERATION] poll_dropzone: handler failed for $fpath" >&2
            fi
        done
        sleep "$poll_interval"
    done

    echo "$processed"
}
export -f mfdb_federation_poll_dropzone

# Federation: truncates a slave's local log entity to max_rows and delivers the rows to the master poll directory.
# mfdb_federation_distill_logs <slave_manifest_path> <entity_name> <master_poll_dir> [max_rows=100]
# Slave → Master one-way log push. Overflow rows pushed as distilled summary,
# local entity truncated to max_rows. Returns 0 on success, 1 on error.
mfdb_federation_distill_logs() {
    local slave_manifest="$1"
    local entity_name="$2"
    local master_poll_dir="$3"
    local max_rows="${4:-100}"

    # Resolve entity file path
    local entity_path
    entity_path=$(mfdb_core_get_entity_path "$slave_manifest" "$entity_name" 2>/dev/null)
    [[ -z "$entity_path" || ! -f "$entity_path" ]] && {
        echo "[MFDB_FEDERATION] ERROR: entity '$entity_name' not found." >&2; return 1
    }

    local total_rows
    total_rows=$(jq '.Values | length' "$entity_path" 2>/dev/null)
    [[ "$total_rows" -le "$max_rows" ]] && return 0  # Nothing to distill

    # Build overflow and kept arrays
    local overflow_json kept_json
    overflow_json=$(jq --argjson mr "$max_rows" '.Values[0:(.Values|length)-$mr]' "$entity_path")
    kept_json=$(jq --argjson mr "$max_rows" '.Values[(.Values|length)-$mr:]' "$entity_path")

    # Push distilled summary to Master poll dir
    mkdir -p "$master_poll_dir"
    local ts dest summary_json fields_json
    ts=$(date -u +"%Y%m%dT%H%M%SZ")
    dest="$master_poll_dir/distilled_${entity_name}_${ts}.bejson"
    fields_json=$(jq -c '.Fields' "$entity_path")

    summary_json=$(jq -n \
        --arg src "$entity_name" \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --argjson fields "$fields_json" \
        --argjson values "$overflow_json" \
        '{
            "Format":"BEJSON","Format_Version":"104a","Format_Creator":"Elton Boehnen",
            "Distill_Source":$src,"Distill_Timestamp":$ts,
            "Records_Type":["DistilledLog"],"Fields":$fields,"Values":$values
        }')

    mfdb_federation_push_config "$summary_json" "$dest" || return 1

    # Truncate local entity
    local tmp_entity
    tmp_entity="$(mktemp "${entity_path}.tmp.XXXXXX")"
    jq --argjson kept "$kept_json" '.Values = $kept' "$entity_path" > "$tmp_entity" \
        && mv "$tmp_entity" "$entity_path" \
        || { rm -f "$tmp_entity"; return 1; }

    # Update manifest record count
    mfdb_core_sync_manifest_count "$slave_manifest" "$entity_name"
    return 0
}
export -f mfdb_federation_distill_logs

# ── Meta-GUID Debug Entity System (Bash) ───────────────────────────────────────
# All functions gate on Debug_Mode manifest header. _mfdb_meta_log is a direct
# jq-based writer — bypasses mfdb_core_add_entity_record to prevent recursion.
# Requires jq >= 1.6.

# True when manifest header Debug_Mode is 'true'.
_mfdb_debug_is_enabled() {
    local manifest_path="$1"
    local mode
    mode=$(jq -r '.Debug_Mode // "false"' "$manifest_path" 2>/dev/null)
    [[ "${mode,,}" == "true" ]]
}

# True when Debug_Reads is also 'true'.
_mfdb_debug_reads_enabled() {
    local manifest_path="$1"
    local flag
    flag=$(jq -r '.Debug_Reads // "false"' "$manifest_path" 2>/dev/null)
    [[ "${flag,,}" == "true" ]]
}

# Echoes the debug/meta entity name from the manifest.
_mfdb_debug_get_meta_name() {
    jq -r '.Debug_Meta_Entity // ""' "$1" 2>/dev/null
}

# Echoes the path of an entity file for the debug helpers.
_mfdb_debug_get_entity_path() {
    local manifest_path="$1"
    local entity_name="$2"
    local rel_path
    rel_path=$(jq -r --arg e "$entity_name" \
        '[.Fields | to_entries | .[] | select(.value.name=="entity_name") | .key][0] as $ei |
         [.Fields | to_entries | .[] | select(.value.name=="file_path") | .key][0] as $fi |
         .Values[] | select(.[$ei]==$e) | .[$fi]' \
        "$manifest_path" 2>/dev/null | head -1)
    [[ -z "$rel_path" ]] && return 1
    echo "$(dirname "$(realpath "$manifest_path")")/$rel_path"
}

# Appends one operation record to the debug meta entity (a normal 104 entity file).
# _mfdb_meta_log <manifest> <operation> <target_entity> <field_name|-> <field_exists|-> <row_index|-> <success:0|1> <duration_ms> <notes> [reads_only:0|1]
_mfdb_meta_log() {
    local manifest_path="$1"
    local operation="$2"
    local target_entity="$3"
    local field_name="${4:--}"
    local field_exists="${5:--}"    # "true", "false", or "-" (null)
    local row_index="${6:--}"       # integer or "-" (null)
    local success="${7:-1}"         # 1=true 0=false
    local duration_ms="${8:-0}"
    local notes="${9:-}"
    local reads_only="${10:-0}"

    _mfdb_debug_is_enabled "$manifest_path" || return 0
    if [[ "$reads_only" -eq 1 ]]; then
        _mfdb_debug_reads_enabled "$manifest_path" || return 0
    fi

    local meta_name
    meta_name=$(_mfdb_debug_get_meta_name "$manifest_path")
    [[ -z "$meta_name" ]] && return 0

    local meta_path
    meta_path=$(_mfdb_debug_get_entity_path "$manifest_path" "$meta_name") || return 0

    local ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

    # Build null-safe values for optional fields
    local jq_field_name jq_field_exists jq_row_index
    [[ "$field_name"   == "-" ]] && jq_field_name="null"   || jq_field_name="\"$field_name\""
    [[ "$field_exists" == "-" ]] && jq_field_exists="null" || jq_field_exists="$field_exists"
    [[ "$row_index"    == "-" ]] && jq_row_index="null"    || jq_row_index="$row_index"
    local jq_success
    [[ "$success" -eq 1 ]] && jq_success="true" || jq_success="false"

    local tmp
    tmp=$(mktemp "${meta_path}.tmp.XXXXXX")
    jq --argjson ts "\"$ts\"" \
       --argjson op "\"$operation\"" \
       --argjson te "\"$target_entity\"" \
       --argjson fn "$jq_field_name" \
       --argjson fe "$jq_field_exists" \
       --argjson ri "$jq_row_index" \
       --argjson sc "$jq_success" \
       --argjson dm "$duration_ms" \
       --argjson pid "$$" \
       --argjson nt "\"$notes\"" \
       '.Values += [[$ts,$op,$te,$fn,$fe,$ri,$sc,$dm,$pid,$nt]]' \
       "$meta_path" > "$tmp" && mv "$tmp" "$meta_path" || rm -f "$tmp"

    # Auto-trim
    local cap
    cap=$(jq -r '.Debug_Row_Cap // "500"' "$manifest_path" 2>/dev/null)
    local count
    count=$(jq '.Values | length' "$meta_path" 2>/dev/null)
    if [[ "$count" -gt "$cap" ]]; then
        local keep_from=$(( count - cap ))
        local tmp2
        tmp2=$(mktemp "${meta_path}.tmp.XXXXXX")
        jq --argjson kf "$keep_from" '.Values = .Values[$kf:]' "$meta_path" > "$tmp2" \
            && mv "$tmp2" "$meta_path" || rm -f "$tmp2"
    fi
}
export -f _mfdb_meta_log

# Logs a SCHEMA_SNAPSHOT row per entity (baseline for drift detection).
_mfdb_debug_schema_snapshot() {
    local manifest_path="$1"
    local meta_name="$2"

    local entities_json
    entities_json=$(mfdb_core_list_entities "$manifest_path" 2>/dev/null)

    echo "$entities_json" | jq -r '.[]' 2>/dev/null | while IFS= read -r ename; do
        [[ -z "$ename" || "$ename" == "$meta_name" ]] && continue
        local entity_path
        entity_path=$(_mfdb_debug_get_entity_path "$manifest_path" "$ename") || continue
        [[ -f "$entity_path" ]] || continue
        local fields
        fields=$(jq -r '[.Fields[].name] | join(",")' "$entity_path" 2>/dev/null)
        local fc
        fc=$(jq '.Fields | length' "$entity_path" 2>/dev/null)
        _mfdb_meta_log "$manifest_path" "SCHEMA_SNAPSHOT" "$ename" \
            "$fields" "true" "-" 1 0 "field_count=$fc"
    done
}
export -f _mfdb_debug_schema_snapshot

# Turns on Debug_Mode, creates the meta entity and records the schema snapshot; prints the meta entity name.
# mfdb_core_enable_debug <manifest_path> [row_cap=500] [debug_reads=0]
# Creates meta-{uuid} entity, sets debug headers, logs initial SCHEMA_SNAPSHOT.
# Prints meta entity name. Returns 0 on success.
mfdb_core_enable_debug() {
    local manifest_path="$1"
    local row_cap="${2:-500}"
    local debug_reads="${3:-0}"
    local debug_reads_str="false"
    [[ "$debug_reads" -eq 1 ]] && debug_reads_str="true"

    local existing_meta
    existing_meta=$(_mfdb_debug_get_meta_name "$manifest_path")

    local meta_name
    if [[ -n "$existing_meta" ]]; then
        meta_name="$existing_meta"
    else
        meta_name="meta-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || date +%s%N)"
    fi

    # Update manifest headers
    local tmp
    tmp=$(mktemp "${manifest_path}.tmp.XXXXXX")
    jq --arg mn "$meta_name" --arg rc "$row_cap" --arg dr "$debug_reads_str" \
        '.Debug_Mode="true" | .Debug_Meta_Entity=$mn | .Debug_Row_Cap=$rc | .Debug_Reads=$dr' \
        "$manifest_path" > "$tmp" && mv "$tmp" "$manifest_path" || { rm -f "$tmp"; return 1; }

    # Create meta entity file if it doesn't exist
    local manifest_dir
    manifest_dir="$(dirname "$(realpath "$manifest_path")")"
    local meta_fp_rel="data/${meta_name}.bejson"
    local meta_abs="$manifest_dir/$meta_fp_rel"

    if [[ ! -f "$meta_abs" ]]; then
        mkdir -p "$(dirname "$meta_abs")"
        local rel_to_manifest
        rel_to_manifest=$(realpath --relative-to="$(dirname "$meta_abs")" "$manifest_path")
        jq -n \
            --arg ph "$rel_to_manifest" \
            --arg rt "$meta_name" \
            '{
                "Format":"BEJSON","Format_Version":"104","Format_Creator":"Elton Boehnen",
                "Parent_Hierarchy":$ph,"Records_Type":[$rt],
                "Fields":[
                    {"name":"timestamp","type":"string"},
                    {"name":"operation","type":"string"},
                    {"name":"target_entity","type":"string"},
                    {"name":"field_name","type":"string"},
                    {"name":"field_exists","type":"boolean"},
                    {"name":"row_index","type":"integer"},
                    {"name":"success","type":"boolean"},
                    {"name":"duration_ms","type":"integer"},
                    {"name":"pid","type":"integer"},
                    {"name":"notes","type":"string"}
                ],
                "Values":[]
            }' > "$meta_abs"

        # Register entity in manifest
        local already
        already=$(jq -r --arg e "$meta_name" \
            '[.Fields | to_entries | .[] | select(.value.name=="entity_name") | .key][0] as $ei |
             .Values[] | select(.[$ei]==$e) | .[$ei]' \
            "$manifest_path" 2>/dev/null | head -1)
        if [[ -z "$already" ]]; then
            local tmp2
            tmp2=$(mktemp "${manifest_path}.tmp.XXXXXX")
            jq --arg mn "$meta_name" --arg fp "$meta_fp_rel" \
                '.Values += [[$mn,$fp,"Debug audit log (auto-generated)",0,"1.0",null]]' \
                "$manifest_path" > "$tmp2" && mv "$tmp2" "$manifest_path" || rm -f "$tmp2"
        fi
    fi

    _mfdb_debug_schema_snapshot "$manifest_path" "$meta_name"
    echo "$meta_name"
    return 0
}
export -f mfdb_core_enable_debug

# Sets Debug_Mode to false; meta entity and rows are kept.
# mfdb_core_disable_debug <manifest_path>
mfdb_core_disable_debug() {
    local tmp
    tmp=$(mktemp "${1}.tmp.XXXXXX")
    jq '.Debug_Mode="false"' "$1" > "$tmp" && mv "$tmp" "$1" || rm -f "$tmp"
}
export -f mfdb_core_disable_debug

# Prints the meta entity rows as a JSON array of objects.
# mfdb_core_get_debug_log <manifest_path>
# Outputs the meta entity Values array as a JSON array of objects.
mfdb_core_get_debug_log() {
    local manifest_path="$1"
    local meta_name
    meta_name=$(_mfdb_debug_get_meta_name "$manifest_path")
    [[ -z "$meta_name" ]] && echo "[]" && return 0
    local meta_path
    meta_path=$(_mfdb_debug_get_entity_path "$manifest_path" "$meta_name") || { echo "[]"; return 0; }
    [[ -f "$meta_path" ]] || { echo "[]"; return 0; }
    jq '[.Fields as $f | .Values[] |
         . as $row |
         reduce range($f | length) as $i ({};
           . + {($f[$i].name): $row[$i]})]' "$meta_path" 2>/dev/null || echo "[]"
}
export -f mfdb_core_get_debug_log

# Prints only failed (success=false) rows, sorted by timestamp.
# mfdb_core_get_failed_ops <manifest_path>
# Outputs failed (success=false) rows sorted by timestamp.
mfdb_core_get_failed_ops() {
    mfdb_core_get_debug_log "$1" | \
        jq '[.[] | select(.success==false)] | sort_by(.timestamp)' 2>/dev/null || echo "[]"
}
export -f mfdb_core_get_failed_ops

# Deletes all meta-entity rows and prints how many.
# mfdb_core_clear_debug_log <manifest_path>
# Wipes all Values from meta entity. Prints rows deleted.
mfdb_core_clear_debug_log() {
    local manifest_path="$1"
    local meta_name
    meta_name=$(_mfdb_debug_get_meta_name "$manifest_path")
    [[ -z "$meta_name" ]] && echo "0" && return 0
    local meta_path
    meta_path=$(_mfdb_debug_get_entity_path "$manifest_path" "$meta_name") || { echo "0"; return 0; }
    local deleted
    deleted=$(jq '.Values | length' "$meta_path" 2>/dev/null || echo 0)
    local tmp
    tmp=$(mktemp "${meta_path}.tmp.XXXXXX")
    jq '.Values=[]' "$meta_path" > "$tmp" && mv "$tmp" "$meta_path" || rm -f "$tmp"
    mfdb_core_sync_manifest_count "$manifest_path" "$meta_name" 2>/dev/null
    echo "$deleted"
}
export -f mfdb_core_clear_debug_log

# Prints a JSON summary of the debug log.
# mfdb_core_debug_summary <manifest_path>
# Outputs a JSON summary object with aggregated debug stats.
mfdb_core_debug_summary() {
    local manifest_path="$1"
    _mfdb_debug_is_enabled "$manifest_path" || { echo "{}"; return 0; }
    local log
    log=$(mfdb_core_get_debug_log "$manifest_path")
    echo "$log" | jq '
        if length == 0 then {total_ops:0}
        else
          . as $rows |
          ($rows | length) as $total |
          ($rows | map(select(.success==false)) | length) as $failed |
          ($rows | map(select(.field_exists==false)) | length) as $drift |
          ($rows | map(select(.operation=="READ")) | length) as $reads |
          ($rows | map(select(.operation|IN("ADD","REMOVE","UPDATE","UPDATE_BULK"))) | length) as $writes |
          ($rows | group_by(.operation) | map({key:.[0].operation,value:length}) | from_entries) as $by_type |
          ($rows | unique_by(.target_entity) | map(.target_entity) | sort) as $entities |
          ($rows | sort_by(-.duration_ms) | .[0:3] |
           map({op:.operation,entity:.target_entity,duration_ms:.duration_ms})) as $slowest |
          {
            total_ops:$total, unique_entities:$entities,
            failed_ops:$failed, schema_drift_hits:$drift,
            top_3_slowest:$slowest, reads_logged:$reads,
            writes_logged:$writes, ops_by_type:$by_type
          }
        end
    ' 2>/dev/null || echo "{}"
}
export -f mfdb_core_debug_summary

# Prints a JSON object, keyed by entity_name, for entities whose Fields changed since the snapshot.
# mfdb_core_detect_schema_drift <manifest_path>
# Diffs live Fields[] against SCHEMA_SNAPSHOT baseline in the debug log.
# Outputs a JSON object keyed by entity_name.
mfdb_core_detect_schema_drift() {
    local manifest_path="$1"
    _mfdb_debug_is_enabled "$manifest_path" || { echo "{}"; return 0; }
    local log
    log=$(mfdb_core_get_debug_log "$manifest_path")

    # Extract most-recent SCHEMA_SNAPSHOT per entity
    local snapshots
    snapshots=$(echo "$log" | jq '
        [ .[] | select(.operation=="SCHEMA_SNAPSHOT" and .field_name!=null) ] |
        group_by(.target_entity) | map(last) |
        map({key:.target_entity, value:(.field_name|split(","))}) |
        from_entries
    ' 2>/dev/null)

    [[ -z "$snapshots" || "$snapshots" == "null" || "$snapshots" == "{}" ]] && { echo "{}"; return 0; }

    local manifest_dir
    manifest_dir="$(dirname "$(realpath "$manifest_path")")"

    # For each entity in snapshots, load live fields and diff
    echo "$snapshots" | jq -r 'keys[]' | while IFS= read -r ename; do
        local entity_path
        entity_path=$(_mfdb_debug_get_entity_path "$manifest_path" "$ename") 2>/dev/null || continue
        [[ -f "$entity_path" ]] || continue
        local live_fields snap_fields added removed drifted
        live_fields=$(jq '[.Fields[].name]' "$entity_path" 2>/dev/null)
        snap_fields=$(echo "$snapshots" | jq --arg e "$ename" '.[$e]')
        added=$(jq -n --argjson l "$live_fields" --argjson s "$snap_fields" \
            '[$l[] | select(. as $f | $s | index($f) | not)] | sort')
        removed=$(jq -n --argjson l "$live_fields" --argjson s "$snap_fields" \
            '[$s[] | select(. as $f | $l | index($f) | not)] | sort')
        drifted=$(jq -n --argjson a "$added" --argjson r "$removed" \
            '($a | length > 0) or ($r | length > 0)')
        printf '"%s":{"added_fields":%s,"removed_fields":%s,"drifted":%s}\n' \
            "$ename" "$added" "$removed" "$drifted"
    done | jq -s 'map(split(":") | {key:.[0][1:-1], value:(.[1:] | join(":") | fromjson)}) | from_entries' \
        2>/dev/null || echo "{}"
}
export -f mfdb_core_detect_schema_drift