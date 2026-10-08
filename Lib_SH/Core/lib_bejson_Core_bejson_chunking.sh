#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Library:         lib_bejson_Core_bejson_chunking.sh
# Family:          Core
# Module Purpose:  Chunked-104a project packaging (directory <-> one 104a document).
# Architecture:    Chunked-104a packaging: a directory tree stored as one BEJSON 104a document, and MFDB-132, which packs an entire MFDB (manifest + entity files) into one Chunked-104a document. Neither is BEJSON 104db.
# Format_Scope:    Chunked-104a and MFDB-132 packaging (NOT 104db)
# Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
#                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
#                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
# Version:         1.8.4
# Release_Version: 300
# Date:            2026-10-02
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   07c48763-f51b-452e-98b2-e73f3f885169
# -----------------------------------------------------------------------------

_BEJSON_CHUNKING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! declare -f mfdb_validator_is_mfdb132_package > /dev/null 2>&1; then
    # shellcheck source=./lib_bejson_Core_mfdb_validator.sh
    source "${_BEJSON_CHUNKING_DIR}/lib_bejson_Core_mfdb_validator.sh"
fi

BEJSON_CHUNKING_DEFAULT_EXTENSIONS=(".py" ".js" ".ts" ".html" ".css" ".md" ".json" ".sh" ".txt" ".bejson" ".tsx" ".jsx")
BEJSON_CHUNKING_DEFAULT_EXCLUDES=(".git" "__pycache__" "node_modules" "lib" "output" ".mfdb_lock" "dist" "build")

BEJSON_CHUNKING_MFDB_MANIFEST_FILENAME="104a.mfdb.bejson"
# Fixed packaging-format identifier for the MFDB-132 spec itself — NOT the
# database's own MFDB_Version (which lives inside the wrapped manifest and
# increments normally). This constant intentionally never changes; "1.32" is
# what makes it "MFDB-132." Do not bump this to track DB schema changes.
BEJSON_CHUNKING_MFDB_CHUNK_SCHEMA_VERSION="1.32"

# ── Helpers ─────────────────────────────────────────────────────────────────

# Echoes an ISO-8601 UTC timestamp.
bejson_core_chunking_get_timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Returns 0 when a file should be stored as binary (base64) when chunking.
# bejson_core_chunking_is_binary <file_path>
# Echoes "true" or "false". Mirrors CLI_Chunker.py's strict-UTF-8-decode check
# (approximated here via `file`'s mime encoding, since bash has no native
# UTF-8 validator).
bejson_core_chunking_is_binary() {
    local file_path="$1"
    local mime
    mime=$(file -b --mime-encoding -- "$file_path" 2>/dev/null)
    if [[ "$mime" == "binary" ]]; then
        echo "true"
    else
        echo "false"
    fi
}

# Echoes the SHA-256 hex digest of a file's bytes (File_Hash; change/corruption detection, not a signature).
# bejson_core_chunking_hash_file_bytes <file_path>
# Echoes the SHA-256 hex digest of the file's bytes.
bejson_core_chunking_hash_file_bytes() {
    local file_path="$1"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum -- "$file_path" | awk '{print $1}'
    else
        shasum -a 256 -- "$file_path" | awk '{print $1}'
    fi
}

# Echoes the next Package_Version (numeric-string bump; missing or non-numeric -> '1'). Unrelated to Format_Version.
# bejson_core_chunking_bump_package_version [prior_doc_json]
# Package_Version tracking, mirroring the project schema tracker's
# Project_Version / Package_Version split -- see PY sibling file's docstring
# for full rationale. Numeric-string bump; non-numeric/missing/absent -> "1".
bejson_core_chunking_bump_package_version() {
    local prior_doc_json="$1"
    if [[ -z "$prior_doc_json" ]]; then
        echo "1"
        return
    fi
    local prior
    prior=$(printf '%s' "$prior_doc_json" | jq -r '.Package_Version // "0"')
    if [[ "$prior" =~ ^[0-9]+$ ]]; then
        echo "$((prior + 1))"
    else
        echo "1"
    fi
}

# Joins a bash array into a JSON array string, quoting each element.
# Join a bash array with commas, JSON-quoting each element.
_bejson_chunking_json_array() {
    local arr=("$@")
    local out="["
    local i
    for i in "${!arr[@]}"; do
        [[ $i -gt 0 ]] && out+=","
        out+=$(printf '%s' "${arr[$i]}" | jq -R .)
    done
    out+="]"
    printf '%s' "$out"
}

# Packs a directory into one Chunked-104a document (one row per file) and prints it. Chunked-104a = a directory stored in ONE BEJSON 104a document (one row per file). Not 104db, not MFDB.
# bejson_core_chunking_create_chunked_104 <target_dir> [version] [extensions_csv] [excludes_csv] [package_version]
# Prints the Chunked-104a BEJSON document as JSON to stdout.
bejson_core_chunking_create_chunked_104() {
    local target_dir version extensions_csv excludes_csv package_version
    target_dir="$1"
    version="${2:-latest}"
    extensions_csv="$3"
    excludes_csv="$4"
    package_version="${5:-1}"

    local target_path
    target_path=$(cd "$target_dir" && pwd)

    local -a exts excl
    if [[ -n "$extensions_csv" ]]; then
        IFS=',' read -r -a exts <<< "$extensions_csv"
    else
        exts=("${BEJSON_CHUNKING_DEFAULT_EXTENSIONS[@]}")
    fi
    if [[ -n "$excludes_csv" ]]; then
        IFS=',' read -r -a excl <<< "$excludes_csv"
    else
        excl=("${BEJSON_CHUNKING_DEFAULT_EXCLUDES[@]}")
    fi

    # Build a find prune expression for excluded directory names
    local -a prune_expr=()
    local d
    for d in "${excl[@]}"; do
        prune_expr+=(-o -name "$d" -type d -prune)
    done

    local values_json="[]"
    local first=1
    local file_path
    while IFS= read -r -d '' file_path; do
        local ext="${file_path##*.}"
        ext=".${ext,,}"
        local matched=0
        local e
        for e in "${exts[@]}"; do
            [[ "$ext" == "${e,,}" ]] && matched=1 && break
        done
        [[ $matched -eq 0 ]] && continue

        local rel_path="${file_path#"$target_path"/}"
        local is_bin
        is_bin=$(bejson_core_chunking_is_binary "$file_path")
        local content=""
        if [[ "$is_bin" == "false" ]]; then
            # Command substitution normally strips ALL trailing newlines, not
            # cat's output so the newlines become "internal" and survive the
            # substitution, then strip the sentinel back off. This makes the
            # Bash port byte-identical to the PY/JS/TS content capture.
            content=$(cat -- "$file_path"; printf '\003')
            content="${content%$'\003'}"
        else
            # Base64 alphabet has no embedded newlines to worry about once
            # line-wrapping is stripped, so no sentinel trick is needed here.
            # `tr -d '\n'` collapses whatever line-wrap width the local
            # `base64` implementation defaults to (portable across GNU/BSD).
            content=$(base64 -- "$file_path" | tr -d '\n')
        fi
        local file_hash
        file_hash=$(bejson_core_chunking_hash_file_bytes "$file_path")
        local file_name
        file_name=$(basename -- "$file_path")

        local row
        row=$(jq -n \
            --arg name "$file_name" \
            --arg ext "$ext" \
            --arg content "$content" \
            --arg version "$version" \
            --arg hash "$file_hash" \
            --arg rel "$rel_path" \
            --argjson is_bin "$is_bin" \
            '[$name, $ext, $content, $version, $hash, $rel, $is_bin, false]')

        if [[ $first -eq 1 ]]; then
            values_json="[$row]"
            first=0
        else
            values_json=$(printf '%s' "$values_json" | jq --argjson row "$row" '. + [$row]')
        fi
    done < <(find "$target_path" \( "${prune_expr[@]:1}" \) -o -type f -print0 2>/dev/null)

    jq -n \
        --argjson fields '[
            {"name":"File_Name","type":"string"},
            {"name":"File_Extension","type":"string"},
            {"name":"File_Content","type":"string"},
            {"name":"File_Version","type":"string"},
            {"name":"File_Hash","type":"string"},
            {"name":"Relative_Path","type":"string"},
            {"name":"Is_Binary","type":"boolean"},
            {"name":"Is_Mounted","type":"boolean"}
        ]' \
        --argjson values "$values_json" \
        --arg date "$(bejson_core_chunking_get_timestamp | cut -c1-10)" \
        --arg package_version "$package_version" \
        '{
            "Format": "BEJSON",
            "Format_Version": "104a",
            "Format_Creator": "Elton Boehnen",
            "Schema_Name": "Chunked-104a",
            "Schema_Version": "1.0.1",
            "Schema_Description": "Standard schema for chunking single projects.",
            "Chunk_Date": $date,
            "Session_Is_Mounted": false,
            "Mount_Path": "",
            "Package_Version": $package_version,
            "Records_Type": ["Chunked"],
            "Fields": $fields,
            "Values": $values
        }'
}

# Restores the files of a Chunked-104a document to a directory; echoes how many were restored.
# bejson_core_chunking_unchunk_chunked_104 <doc_json> <output_dir>
# Restores files from a Chunked-104a JSON document. Echoes the count restored.
bejson_core_chunking_unchunk_chunked_104() {
    local doc_json="$1"
    local output_dir="$2"
    mkdir -p "$output_dir"
    local out_root
    out_root=$(cd "$output_dir" && pwd)

    local count=0
    local n
    n=$(printf '%s' "$doc_json" | jq '.Values | length')
    local i
    for (( i=0; i<n; i++ )); do
        local rel_path is_binary content
        rel_path=$(printf '%s' "$doc_json" | jq -r ".Values[$i][5]")
        is_binary=$(printf '%s' "$doc_json" | jq -r ".Values[$i][6]")
        # jq -j (no auto-appended trailing newline) + sentinel byte, so any
        # trailing newline(s) that are part of the actual file content survive
        # the command substitution instead of being stripped (same technique as in
        # bejson_core_chunking_create_chunked_104).
        content=$(printf '%s' "$doc_json" | jq -j ".Values[$i][2]"; printf '\003')
        content="${content%$'\003'}"

        [[ -z "$rel_path" || "$rel_path" == "null" ]] && continue

        local target_file="$out_root/$rel_path"
        mkdir -p "$(dirname -- "$target_file")"
        if [[ "$is_binary" == "true" ]]; then
            printf '%s' "$content" | base64 -d > "$target_file"
        else
            printf '%s' "$content" > "$target_file"
        fi
        count=$((count + 1))
    done

    echo "$count"
}

# ── MFDB 1.32 packaging extension ──────────────────────────────────────────
# 1.31 stays fully valid and unchanged (manifest + entity files, optionally
# zipped). 1.32 adds a second, optional container: the entire MFDB directory
# (manifest + every entity file) chunked into ONE Chunked-104a document. This
# is purely additive — nothing about the 1.31 disk layout or validation rules
# changes.

# MFDB-132 packaging: stores an MFDB directory (104a manifest 104a.mfdb.bejson + 104 entity files) in ONE Chunked-104a document. A packaging wrapper around an ordinary MFDB; not a new format and not 104db.
# bejson_core_chunking_create_mfdb132_package <mfdb_root_dir> <db_name> [extensions_csv] [excludes_csv] [package_version] [prior_package_doc_json]
bejson_core_chunking_create_mfdb132_package() {
    local mfdb_root_dir="$1"
    local db_name="$2"
    local extensions_csv="$3"
    local excludes_csv="$4"
    local package_version="$5"
    local prior_package_doc_json="$6"

    local root_path
    root_path=$(cd "$mfdb_root_dir" && pwd)

    if [[ ! -f "$root_path/$BEJSON_CHUNKING_MFDB_MANIFEST_FILENAME" ]]; then
        echo "ERROR: No $BEJSON_CHUNKING_MFDB_MANIFEST_FILENAME found at root of $root_path — cannot package a directory that isn't a valid MFDB layout." >&2
        return 1
    fi

    if [[ -z "$package_version" ]]; then
        package_version=$(bejson_core_chunking_bump_package_version "$prior_package_doc_json")
    fi

    local doc
    doc=$(bejson_core_chunking_create_chunked_104 "$root_path" "$BEJSON_CHUNKING_MFDB_CHUNK_SCHEMA_VERSION" "$extensions_csv" "$excludes_csv" "$package_version")

    # Overwrite the inherited Chunked-104a schema identity — see the PY
    # counterpart for rationale (Package_Format alone isn't authoritative for
    # discovery; Schema_Name/Records_Type must say MFDB-132 too).
    printf '%s' "$doc" | jq \
        --arg mfdb_version "$BEJSON_CHUNKING_MFDB_CHUNK_SCHEMA_VERSION" \
        --arg db_name "$db_name" \
        '. + {"Schema_Name": "MFDB-132", "Records_Type": ["MFDB-132"], "MFDB_Version": $mfdb_version, "DB_Name": $db_name, "Package_Format": "MFDB-Chunked-104a"}'
}

# Echoes true/false (delegates to mfdb_validator_is_mfdb132_package).
# bejson_core_chunking_is_mfdb132_package <doc_json>
# Echoes "true" or "false".
# Thin wrapper — validation logic lives in
# lib_bejson_Core_mfdb_validator.sh: mfdb_validator_is_mfdb132_package().
bejson_core_chunking_is_mfdb132_package() {
    mfdb_validator_is_mfdb132_package "$1"
}

# Level-1 validation of an MFDB-132 package (delegates to mfdb_validator).
# bejson_core_chunking_validate_mfdb132_package <doc_json>
# Prints {"valid":bool,"errors":[...],"warnings":[...]} as JSON.
# Thin wrapper — validation logic lives in
# lib_bejson_Core_mfdb_validator.sh: mfdb_validator_validate_mfdb132_package().
bejson_core_chunking_validate_mfdb132_package() {
    mfdb_validator_validate_mfdb132_package "$1"
}

# Unpacks an MFDB-132 package into a normal MFDB directory (104a manifest + 104 entity files); prints the validation JSON after the file count.
# bejson_core_chunking_unchunk_mfdb132_package <doc_json> <output_dir>
# Prints "<count> <validation_json>" separated by a newline: first line count,
# remaining lines the validation JSON.
bejson_core_chunking_unchunk_mfdb132_package() {
    local doc_json="$1"
    local output_dir="$2"

    local validation
    validation=$(bejson_core_chunking_validate_mfdb132_package "$doc_json")
    local count
    count=$(bejson_core_chunking_unchunk_chunked_104 "$doc_json" "$output_dir")

    local out_root
    out_root=$(cd "$output_dir" && pwd)
    if [[ ! -f "$out_root/$BEJSON_CHUNKING_MFDB_MANIFEST_FILENAME" ]]; then
        validation=$(printf '%s' "$validation" | jq --arg m "$BEJSON_CHUNKING_MFDB_MANIFEST_FILENAME" \
            '.valid = false | .errors += ["Manifest \($m) was not found on disk after unchunking."]')
    fi

    echo "$count"
    echo "$validation"
}

# ── MFDB-in-chunk deep detection (validator extension) ──────────────────────
# Thin wrapper over lib_bejson_Core_mfdb_validator.sh, exposed through the chunking library.

# Finds an embedded MFDB in a Chunked-104a document (delegates to mfdb_validator).
# bejson_core_chunking_detect_mfdb_in_chunk <doc_json>
# Prints a JSON object: {mfdb_detected, valid, db_name, mfdb_version,
# entities: [...], errors: [...], warnings: [...]}
# Thin wrapper — validation logic lives in
# lib_bejson_Core_mfdb_validator.sh: mfdb_validator_detect_mfdb_in_chunk().
bejson_core_chunking_detect_mfdb_in_chunk() {
    mfdb_validator_detect_mfdb_in_chunk "$1"
}
export -f bejson_core_chunking_detect_mfdb_in_chunk

# ── MFDB 1.32 session-based mount ─────────────────────────────────────────────
# Mirrors MFDBArchive (1.31) bash functions exactly, substituting unchunk/
# rechunk for unzip/rezip. Lock file is .mfdb132_lock in the workspace.
# Is_Mounted and Mount_Path top-level headers in the chunk doc JSON file are
# live mount-state markers updated via jq.

BEJSON_132_LOCK_FILE=".mfdb132_lock"
BEJSON_MFDB_MANIFEST="104a.mfdb.bejson"

# SHA-256 of a file, for chunk integrity checks.
_mfdb132_calc_hash() {
    sha256sum "$1" | awk '{print $1}'
}

# Writes Session_Is_Mounted and Mount_Path headers into a chunk document.
_mfdb132_set_chunk_doc_headers() {
    local chunk_doc_path="$1"
    local is_mounted="$2"   # "true" or "false"
    local mount_path="$3"
    if [[ -f "$chunk_doc_path" ]]; then
        local tmp
        tmp=$(mktemp)
        jq --argjson m "$is_mounted" --arg p "$mount_path" \
            'del(.Is_Mounted) | .Session_Is_Mounted = $m | .Mount_Path = $p' \
            "$chunk_doc_path" > "$tmp" && mv "$tmp" "$chunk_doc_path" || rm -f "$tmp"
    fi
}

# Extracts a chunk document into a workspace and takes a '132' session lock. A packaged MFDB becomes an ordinary MFDB directory.
# mfdb132_archive_mount <chunk_doc_path> <target_dir> [force=0] [sticky=1]
# Unchunks an MFDB132 chunk doc to a workspace and creates a session lock.
# Prints the absolute path to the restored manifest on success, error on fail.
# Returns 0 on success, 1 on error.
mfdb132_archive_mount() {
    local chunk_doc_path="$1"
    local target_dir="$2"
    local force="${3:-0}"
    local sticky="${4:-1}"

    local chunk_abs
    chunk_abs=$(realpath "$chunk_doc_path" 2>/dev/null) || {
        echo "[MFDB132] ERROR: chunk doc not found: $chunk_doc_path" >&2; return 1
    }

    local lock_file="$target_dir/$BEJSON_132_LOCK_FILE"
    local manifest_out="$target_dir/$BEJSON_MFDB_MANIFEST"
    local current_hash
    current_hash=$(_mfdb132_calc_hash "$chunk_abs")

    # Sticky reuse
    if [[ "$sticky" -eq 1 && -f "$lock_file" && -f "$manifest_out" ]]; then
        local stored_hash
        stored_hash=$(jq -r '.original_hash // ""' "$lock_file" 2>/dev/null)
        if [[ "$stored_hash" == "$current_hash" ]]; then
            if mfdb_validator_validate_database "$manifest_out" >/dev/null 2>&1; then
                echo "$(realpath "$manifest_out")"
                return 0
            fi
        fi
    fi

    # Ownership check
    if [[ -f "$lock_file" && "$force" -ne 1 ]]; then
        local lock_pid
        lock_pid=$(jq -r '.pid // ""' "$lock_file" 2>/dev/null)
        if [[ "$lock_pid" != "$$" ]]; then
            echo "[MFDB132] ERROR: workspace locked by PID $lock_pid. Pass force=1 to override." >&2
            return 1
        fi
    fi

    # Clear workspace, unchunk
    [[ -d "$target_dir" ]] && rm -rf "$target_dir"
    mkdir -p "$target_dir"

    local count
    count=$(bejson_core_chunking_unchunk_chunked_104 "$(cat "$chunk_abs")" "$target_dir")
    if [[ "${count:-0}" -eq 0 ]]; then
        rm -rf "$target_dir"
        echo "[MFDB132] ERROR: unchunk produced zero files." >&2; return 1
    fi
    if [[ ! -f "$manifest_out" ]]; then
        rm -rf "$target_dir"
        echo "[MFDB132] ERROR: $BEJSON_MFDB_MANIFEST missing after unchunk." >&2; return 1
    fi

    # Write session lock
    local workspace_abs
    workspace_abs=$(realpath "$target_dir")
    jq -n \
        --argjson pid "$$" \
        --arg mt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg oh "$current_hash" \
        --arg cdp "$chunk_abs" \
        --arg wd "$workspace_abs" \
        '{pid:$pid, mounted_at:$mt, original_hash:$oh, chunk_doc_path:$cdp, workspace_dir:$wd}' \
        > "$lock_file"

    _mfdb132_set_chunk_doc_headers "$chunk_abs" true "$workspace_abs"
    echo "$manifest_out"
    return 0
}
export -f mfdb132_archive_mount

# Re-chunks the mounted workspace into the chunk document atomically; prints the output path.
# mfdb132_archive_commit <mount_dir> [output_path] [validate=1]
# Pre-validates the workspace, rechunks atomically, updates the lock hash.
# Prints the output chunk doc path. Returns 0 on success, 1 on error.
mfdb132_archive_commit() {
    local mount_dir="$1"
    local output_path="${2:-}"
    local validate="${3:-1}"

    local lock_file="$mount_dir/$BEJSON_132_LOCK_FILE"
    local manifest_out="$mount_dir/$BEJSON_MFDB_MANIFEST"

    if [[ ! -f "$lock_file" ]]; then
        echo "[MFDB132] ERROR: no active 132 mount session in $mount_dir." >&2; return 1
    fi

    local dest_path chunk_doc_path
    chunk_doc_path=$(jq -r '.chunk_doc_path // ""' "$lock_file")
    dest_path="${output_path:-$chunk_doc_path}"
    [[ -z "$dest_path" ]] && { echo "[MFDB132] ERROR: destination path unknown." >&2; return 1; }

    # Pre-write validation gate
    if [[ "$validate" -eq 1 ]]; then
        [[ ! -f "$manifest_out" ]] && {
            echo "[MFDB132] ERROR: commit rejected — manifest missing." >&2; return 1
        }
        if ! mfdb_validator_validate_database "$manifest_out" >/dev/null 2>&1; then
            echo "[MFDB132] ERROR: commit rejected — validation failed." >&2; return 1
        fi
    fi

    local db_name
    db_name=$(jq -r '.DB_Name // ""' "$manifest_out" 2>/dev/null)

    # Rechunk to temp, atomic swap
    local temp_chunk="$dest_path.tmp.$$"
    local new_doc
    new_doc=$(bejson_core_chunking_create_mfdb132_package "$mount_dir" "$db_name") || {
        echo "[MFDB132] ERROR: rechunk failed." >&2; return 1
    }
    echo "$new_doc" > "$temp_chunk"
    mv "$temp_chunk" "$dest_path" || {
        rm -f "$temp_chunk"
        echo "[MFDB132] ERROR: atomic swap failed." >&2; return 1
    }

    # Update lock hash
    local new_hash
    new_hash=$(_mfdb132_calc_hash "$dest_path")
    local tmp
    tmp=$(mktemp)
    jq --arg h "$new_hash" '.original_hash = $h' "$lock_file" > "$tmp" && mv "$tmp" "$lock_file"

    _mfdb132_set_chunk_doc_headers "$dest_path" true "$(realpath "$mount_dir")"
    echo "$dest_path"
    return 0
}
export -f mfdb132_archive_commit

# Re-extracts one file from the chunk document into the workspace (recovery).
# mfdb132_archive_resurrect_file <mount_dir> <relative_path>
# Re-unchunks a single file from the chunk doc without a full re-unchunk.
# Returns 0 on success, 1 if not found or on error.
mfdb132_archive_resurrect_file() {
    local mount_dir="$1"
    local relative_path="$2"
    local lock_file="$mount_dir/$BEJSON_132_LOCK_FILE"

    [[ ! -f "$lock_file" ]] && return 1

    local chunk_doc_path
    chunk_doc_path=$(jq -r '.chunk_doc_path // ""' "$lock_file")
    [[ -z "$chunk_doc_path" || ! -f "$chunk_doc_path" ]] && return 1

    local doc
    doc=$(cat "$chunk_doc_path")

    # Find the matching row by Relative_Path and extract + write it
    local content is_binary target_file
    target_file="$mount_dir/$relative_path"

    is_binary=$(echo "$doc" | jq -r \
        --arg rp "$relative_path" \
        '[.Fields | to_entries | .[] | select(.value.name=="Is_Binary") | .key][0] as $ib |
         [.Fields | to_entries | .[] | select(.value.name=="Relative_Path") | .key][0] as $rp_idx |
         [.Fields | to_entries | .[] | select(.value.name=="File_Content") | .key][0] as $fc |
         (.Values[] | select(.[$rp_idx]==$rp) | {bin: .[$ib], fc: .[$fc]}) |
         .bin' 2>/dev/null | head -1)

    content=$(echo "$doc" | jq -r \
        --arg rp "$relative_path" \
        '[.Fields | to_entries | .[] | select(.value.name=="Relative_Path") | .key][0] as $rp_idx |
         [.Fields | to_entries | .[] | select(.value.name=="File_Content") | .key][0] as $fc |
         (.Values[] | select(.[$rp_idx]==$rp) | .[$fc])' 2>/dev/null | head -1)

    [[ -z "$content" ]] && return 1

    mkdir -p "$(dirname "$target_file")"
    if [[ "$is_binary" == "true" ]]; then
        echo "$content" | base64 -d > "$target_file"
    else
        printf '%s' "$content" > "$target_file"
    fi
    return 0
}
export -f mfdb132_archive_resurrect_file

# Releases the session lock and clears the mount headers; cleanup=1 deletes the workspace.
# mfdb132_archive_unmount <mount_dir> [cleanup=1]
# Releases the 132 session lock and clears Is_Mounted/Mount_Path headers.
# If cleanup=1, deletes the workspace directory.
mfdb132_archive_unmount() {
    local mount_dir="$1"
    local cleanup="${2:-1}"
    local lock_file="$mount_dir/$BEJSON_132_LOCK_FILE"

    if [[ -f "$lock_file" ]]; then
        local chunk_doc_path
        chunk_doc_path=$(jq -r '.chunk_doc_path // ""' "$lock_file" 2>/dev/null)
        [[ -n "$chunk_doc_path" && -f "$chunk_doc_path" ]] && \
            _mfdb132_set_chunk_doc_headers "$chunk_doc_path" false ""
        rm -f "$lock_file"
    fi

    [[ "$cleanup" -eq 1 && -d "$mount_dir" ]] && rm -rf "$mount_dir"
    return 0
}
export -f mfdb132_archive_unmount

# ── MFDB rolling multi-version schema (unify layer) ─────────────────────────
# Everything above (bejson_core_chunking_*) is the Chunked-104a / MFDB-132
# flat one-shot schema. Everything below (bejson_core_chunking_mfdb_*) is a
# distinct function set, same file/family, for mfdb_chunker.py's rolling
# multi-version layout (manifest + entity split, one entity file holds ALL
# versions as rows). See the PY sibling file's comment block for the full
# description; the function set is identical across languages.

BEJSON_CORE_CHUNKING_MFDB_SCHEMA_MANIFEST="mfdb_manifest"
BEJSON_CORE_CHUNKING_MFDB_SCHEMA_ENTITY="mfdb_entity"
BEJSON_CORE_CHUNKING_MFDB_SCHEMA_ENTITY_LEGACY="mfdb_entity_legacy"
BEJSON_CORE_CHUNKING_MFDB_SCHEMA_CHUNKED_104A="chunked_104a"
BEJSON_CORE_CHUNKING_MFDB_SCHEMA_UNKNOWN="unknown"

# Sorted, comma-joined field-name signatures for each known schema.
_MFDB_ENTITY_SIG="File_Content,File_Extension,File_Hash,File_Name,Is_Binary,Is_Mounted,Relative_Path,version"
_MFDB_ENTITY_LEGACY_SIG="content,file_name,file_path,is_base64,is_binary,version"
_CHUNKED_104A_SIG="File_Content,File_Extension,File_Hash,File_Name,File_Version,Is_Binary,Is_Mounted,Relative_Path"

# Echoes the column index of a field name in a chunk document (empty if absent).
# bejson_core_chunking_mfdb_field_index <doc_json> <field_name>
# Prints the array index of a field by name, or empty if not found.
bejson_core_chunking_mfdb_field_index() {
    local doc_json="$1"
    local field_name="$2"
    printf '%s' "$doc_json" | jq -r --arg name "$field_name" \
        '(.Fields // []) | map(.name) | index($name) // empty'
}

# Prints which known chunk field layout the document uses (Chunked-104a file rows, MFDB entity rows, MFDB manifest rows, lowercase variants). Pure structure check.
# bejson_core_chunking_mfdb_detect_schema <doc_json>
# Structural detection -- prints one of the five schema identifiers above.
bejson_core_chunking_mfdb_detect_schema() {
    local doc_json="$1"
    local records_type schema_name field_sig

    records_type=$(printf '%s' "$doc_json" | jq -r '(.Records_Type // []) | join(",")')
    schema_name=$(printf '%s' "$doc_json" | jq -r '.Schema_Name // ""')
    field_sig=$(printf '%s' "$doc_json" | jq -r '(.Fields // []) | map(.name) | sort | join(",")')

    if [[ "$records_type" == "MFDB-132" || "$schema_name" == "MFDB-132" ]]; then
        echo "$BEJSON_CORE_CHUNKING_MFDB_SCHEMA_CHUNKED_104A"
        return
    fi
    if [[ "$records_type" == "Chunked" && "$field_sig" == "$_CHUNKED_104A_SIG" ]]; then
        echo "$BEJSON_CORE_CHUNKING_MFDB_SCHEMA_CHUNKED_104A"
        return
    fi
    if [[ "$field_sig" == "$_MFDB_ENTITY_SIG" ]]; then
        echo "$BEJSON_CORE_CHUNKING_MFDB_SCHEMA_ENTITY"
        return
    fi
    if [[ "$field_sig" == "$_MFDB_ENTITY_LEGACY_SIG" ]]; then
        echo "$BEJSON_CORE_CHUNKING_MFDB_SCHEMA_ENTITY_LEGACY"
        return
    fi
    if [[ "$records_type" == "mfdb" ]]; then
        local has_entity_name has_file_path
        has_entity_name=$(printf '%s' "$doc_json" | jq -r '(.Fields // []) | map(.name) | index("entity_name") // empty')
        has_file_path=$(printf '%s' "$doc_json" | jq -r '(.Fields // []) | map(.name) | index("file_path") // empty')
        if [[ -n "$has_entity_name" && -n "$has_file_path" ]]; then
            echo "$BEJSON_CORE_CHUNKING_MFDB_SCHEMA_MANIFEST"
            return
        fi
    fi
    echo "$BEJSON_CORE_CHUNKING_MFDB_SCHEMA_UNKNOWN"
}

# Prints a warning if the MFDB package version is not a known one (1.31, 1.32, 1.38); nothing when OK. This is the MFDB package version, not a BEJSON Format_Version.
# bejson_core_chunking_mfdb_check_version <doc_json> [known_versions_csv]
# Lenient version check -- prints a warning string, or nothing if OK/absent.
bejson_core_chunking_mfdb_check_version() {
    local doc_json="$1"
    local known_versions_csv="${2:-1.31,1.32,1.38}"
    local mfdb_version
    mfdb_version=$(printf '%s' "$doc_json" | jq -r '.MFDB_Version // empty')
    [[ -z "$mfdb_version" ]] && return

    local IFS=','
    local known
    for known in $known_versions_csv; do
        if [[ "$known" == "$mfdb_version" ]]; then
            return
        fi
    done
    echo "MFDB_Version '$mfdb_version' not in known set ($known_versions_csv) -- proceeding on structural detection anyway, but this is worth a look."
}

# Restores a rolling multi-version MFDB chunk to a directory; prints a result object {ok, message, schema, file_count}.
# bejson_core_chunking_mfdb_unchunk <doc_json> <output_dir> [version] [manifest_dir]
# Single entry point restoring any of the four known schemas. Prints a JSON
# result object to stdout: {"ok":..., "message":..., "schema":..., "file_count":...}
bejson_core_chunking_mfdb_unchunk() {
    local doc_json="$1"
    local output_dir="$2"
    local version="$3"
    local manifest_dir="$4"

    local schema warning
    schema=$(bejson_core_chunking_mfdb_detect_schema "$doc_json")
    warning=$(bejson_core_chunking_mfdb_check_version "$doc_json")

    if [[ "$schema" == "$BEJSON_CORE_CHUNKING_MFDB_SCHEMA_CHUNKED_104A" ]]; then
        local count
        count=$(bejson_core_chunking_unchunk_chunked_104 "$doc_json" "$output_dir")
        jq -n --arg msg "Restored $count file(s) from Chunked-104a/MFDB-132 bundle." \
            --arg schema "$schema" --arg warning "$warning" --arg out_dir "$output_dir" \
            --argjson count "$count" \
            '{ok:true, message:$msg, schema:$schema, warning:(if $warning=="" then null else $warning end), out_dir:$out_dir, file_count:$count}'
        return
    fi

    if [[ "$schema" == "$BEJSON_CORE_CHUNKING_MFDB_SCHEMA_MANIFEST" ]]; then
        if [[ -z "$manifest_dir" || -z "$version" ]]; then
            jq -n --arg schema "$schema" '{ok:false, message:"MFDB manifest requires manifest_dir and version.", schema:$schema, warning:null}'
            return
        fi
        local en_idx fp_idx row_json entity_rel entity_path entity_doc
        en_idx=$(bejson_core_chunking_mfdb_field_index "$doc_json" "entity_name")
        fp_idx=$(bejson_core_chunking_mfdb_field_index "$doc_json" "file_path")
        row_json=$(printf '%s' "$doc_json" | jq -c --argjson idx "$en_idx" --arg v "$version" \
            '(.Values // []) | map(select(.[$idx] == $v)) | .[0] // empty')
        if [[ -z "$row_json" ]]; then
            jq -n --arg v "$version" --arg schema "$schema" '{ok:false, message:("Version \($v) not found in manifest."), schema:$schema, warning:null}'
            return
        fi
        entity_rel=$(printf '%s' "$row_json" | jq -r --argjson idx "$fp_idx" '.[$idx]')
        entity_path="$manifest_dir/$entity_rel"
        if [[ ! -f "$entity_path" ]]; then
            jq -n --arg p "$entity_path" --arg schema "$schema" '{ok:false, message:("Entity file missing: \($p)"), schema:$schema, warning:null}'
            return
        fi
        entity_doc=$(cat "$entity_path")
        bejson_core_chunking_mfdb_unchunk "$entity_doc" "$output_dir" "$version" ""
        return
    fi

    if [[ "$schema" == "$BEJSON_CORE_CHUNKING_MFDB_SCHEMA_ENTITY" ]]; then
        if [[ -z "$version" ]]; then
            jq -n --arg schema "$schema" '{ok:false, message:"MFDB entity requires version.", schema:$schema, warning:null}'
            return
        fi
        local v_idx rp_idx ib_idx fc_idx n i count out_root
        v_idx=$(bejson_core_chunking_mfdb_field_index "$doc_json" "version")
        rp_idx=$(bejson_core_chunking_mfdb_field_index "$doc_json" "Relative_Path")
        ib_idx=$(bejson_core_chunking_mfdb_field_index "$doc_json" "Is_Binary")
        fc_idx=$(bejson_core_chunking_mfdb_field_index "$doc_json" "File_Content")
        mkdir -p "$output_dir"
        out_root=$(cd "$output_dir" && pwd)
        n=$(printf '%s' "$doc_json" | jq --argjson idx "$v_idx" --arg v "$version" '[.Values[] | select(.[$idx]==$v)] | length')
        if [[ "$n" -eq 0 ]]; then
            jq -n --arg v "$version" --arg schema "$schema" '{ok:false, message:("No rows for version \($v)."), schema:$schema, warning:null}'
            return
        fi
        count=0
        for (( i=0; i<n; i++ )); do
            local rel_path is_binary content target_file
            rel_path=$(printf '%s' "$doc_json" | jq -r --argjson vidx "$v_idx" --arg v "$version" --argjson ridx "$rp_idx" \
                "[.Values[] | select(.[\$vidx]==\$v)][$i][\$ridx]")
            is_binary=$(printf '%s' "$doc_json" | jq -r --argjson vidx "$v_idx" --arg v "$version" --argjson iidx "$ib_idx" \
                "[.Values[] | select(.[\$vidx]==\$v)][$i][\$iidx]")
            content=$(printf '%s' "$doc_json" | jq -j --argjson vidx "$v_idx" --arg v "$version" --argjson cidx "$fc_idx" \
                "[.Values[] | select(.[\$vidx]==\$v)][$i][\$cidx]"; printf '\003')
            content="${content%$'\003'}"
            [[ -z "$rel_path" || "$rel_path" == "null" ]] && continue
            target_file="$out_root/$rel_path"
            mkdir -p "$(dirname -- "$target_file")"
            if [[ "$is_binary" == "true" ]]; then
                printf '%s' "$content" | base64 -d > "$target_file"
            else
                printf '%s' "$content" > "$target_file"
            fi
            count=$((count + 1))
        done
        jq -n --arg v "$version" --argjson count "$count" --arg schema "$schema" --arg out_dir "$output_dir" \
            '{ok:true, message:("Restored \($count) file(s) for version \($v)."), schema:$schema, warning:null, out_dir:$out_dir, file_count:$count}'
        return
    fi

    if [[ "$schema" == "$BEJSON_CORE_CHUNKING_MFDB_SCHEMA_ENTITY_LEGACY" ]]; then
        jq -n --arg schema "$schema" '{ok:false, message:"Legacy MFDB entity schema -- no migration path by design. Re-chunk the source project with current tooling first.", schema:$schema, warning:null}'
        return
    fi

    jq -n '{ok:false, message:"Could not identify chunk schema (structural detection failed).", schema:"unknown", warning:null}'
}
export -f bejson_core_chunking_mfdb_field_index
export -f bejson_core_chunking_mfdb_detect_schema
export -f bejson_core_chunking_mfdb_check_version
export -f bejson_core_chunking_mfdb_unchunk