#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Library:         lib_bejson_Schedules_scheduler_core.sh
# Family:          Schedules
# Module Purpose:  Core CRUD operations for the Schedules job database. Stores
# Architecture:    BEJSON 104a provides fast primitive metadata and manifest configuration with O(1) field map caching.
# Version:         1.0.0
# Release_Version: 300
# Date:            2026-07-17
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   9669a9bb-b26c-4bfa-8138-26e7e4f3cd69
# -----------------------------------------------------------------------------

Schedules_Core_Script_Dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Field order (positional integrity — must match Fields array in every DB) ---
Schedules_Core_Field_Names=(
    "job_name" "script_path" "schedule_type" "run_time" "run_days"
    "interval_minutes" "run_date" "enabled" "last_run" "last_status" "log_path"
)

# schedules_core_get_field_index <field_name>
# Prints the positional index of a field name. Prints -1 if not found.
schedules_core_get_field_index() {
    local field_name="$1"
    local i=0
    for name in "${Schedules_Core_Field_Names[@]}"; do
        if [[ "$name" == "$field_name" ]]; then
            echo "$i"
            return 0
        fi
        i=$((i + 1))
    done
    echo -1
    return 1
}

# schedules_core_init_db <db_path>
# Creates a new empty Schedules job database at db_path if one does not
# already exist. Never overwrites an existing file.
schedules_core_init_db() {
    local db_path="$1"

    if [[ -f "$db_path" ]]; then
        echo "[schedules_core_init_db] already exists, leaving untouched: $db_path" >&2
        return 0
    fi

    mkdir -p "$(dirname "$db_path")"

    local doc
    doc=$(jq -n '{
        "Format": "BEJSON",
        "Format_Version": "104",
        "Format_Creator": "Elton Boehnen",
        "Records_Type": ["ScheduledJob"],
        "Fields": [
            {"name": "job_name", "type": "string"},
            {"name": "script_path", "type": "string"},
            {"name": "schedule_type", "type": "string"},
            {"name": "run_time", "type": "string"},
            {"name": "run_days", "type": "string"},
            {"name": "interval_minutes", "type": "integer"},
            {"name": "run_date", "type": "string"},
            {"name": "enabled", "type": "boolean"},
            {"name": "last_run", "type": "string"},
            {"name": "last_status", "type": "string"},
            {"name": "log_path", "type": "string"}
        ],
        "Values": []
    }')

    schedules_core_atomic_write "$db_path" "$doc"
    echo "[schedules_core_init_db] created: $db_path" >&2
}

# schedules_core_atomic_write <db_path> <json_content>
# Writes JSON to a temp file in the same directory, then renames it into
# place. Guarantees the DB file is never left half-written.
schedules_core_atomic_write() {
    local db_path="$1"
    local json_content="$2"
    local tmp_path
    tmp_path="$(dirname "$db_path")/.$(basename "$db_path").tmp.$$"

    if ! printf '%s' "$json_content" | jq '.' > "$tmp_path" 2>/dev/null; then
        echo "[schedules_core_atomic_write] ERROR: invalid JSON, write aborted" >&2
        rm -f "$tmp_path"
        return 1
    fi

    mv "$tmp_path" "$db_path"
}

# schedules_core_load_db <db_path>
# Prints the full DB JSON to stdout. Fails loudly if the file is missing.
schedules_core_load_db() {
    local db_path="$1"
    if [[ ! -f "$db_path" ]]; then
        echo "[schedules_core_load_db] ERROR: no such file: $db_path" >&2
        return 1
    fi
    cat "$db_path"
}

# schedules_core_job_exists <db_path> <job_name>
# Returns 0 if a job with that name exists, 1 otherwise.
schedules_core_job_exists() {
    local db_path="$1"
    local job_name="$2"
    local doc
    doc=$(schedules_core_load_db "$db_path") || return 1
    local count
    count=$(echo "$doc" | jq --arg n "$job_name" '[.Values[] | select(.[0] == $n)] | length')
    [[ "$count" -gt 0 ]]
}

# schedules_core_add_job <db_path> <job_name> <script_path> <schedule_type> \
#                         <run_time> <run_days> <interval_minutes> <run_date> <log_path>
# Pass the literal string "null" for any field that does not apply to the
# chosen schedule_type. enabled defaults to true on creation.
schedules_core_add_job() {
    local db_path="$1" job_name="$2" script_path="$3" schedule_type="$4"
    local run_time="$5" run_days="$6" interval_minutes="$7" run_date="$8" log_path="$9"

    case "$schedule_type" in
        recurring|interval|once) ;;
        *)
            echo "[schedules_core_add_job] ERROR: schedule_type must be recurring, interval, or once (got: $schedule_type)" >&2
            return 1
            ;;
    esac

    if schedules_core_job_exists "$db_path" "$job_name"; then
        echo "[schedules_core_add_job] ERROR: job_name already exists: $job_name" >&2
        return 1
    fi

    local doc
    doc=$(schedules_core_load_db "$db_path") || return 1

    local interval_json run_time_json run_days_json run_date_json log_path_json
    [[ "$interval_minutes" == "null" ]] && interval_json="null" || interval_json="$interval_minutes"
    [[ "$run_time" == "null" ]] && run_time_json="null" || run_time_json="\"$run_time\""
    [[ "$run_days" == "null" ]] && run_days_json="null" || run_days_json="\"$run_days\""
    [[ "$run_date" == "null" ]] && run_date_json="null" || run_date_json="\"$run_date\""
    [[ "$log_path" == "null" ]] && log_path_json="null" || log_path_json="\"$log_path\""

    local new_row
    new_row=$(jq -n \
        --arg job_name "$job_name" \
        --arg script_path "$script_path" \
        --arg schedule_type "$schedule_type" \
        --argjson run_time "$run_time_json" \
        --argjson run_days "$run_days_json" \
        --argjson interval_minutes "$interval_json" \
        --argjson run_date "$run_date_json" \
        --argjson log_path "$log_path_json" \
        '[$job_name, $script_path, $schedule_type, $run_time, $run_days, $interval_minutes, $run_date, true, null, null, $log_path]')

    doc=$(echo "$doc" | jq --argjson row "$new_row" '.Values += [$row]')
    schedules_core_atomic_write "$db_path" "$doc"
    echo "[schedules_core_add_job] added: $job_name" >&2
}

# schedules_core_remove_job <db_path> <job_name>
schedules_core_remove_job() {
    local db_path="$1" job_name="$2"
    local doc
    doc=$(schedules_core_load_db "$db_path") || return 1

    if ! schedules_core_job_exists "$db_path" "$job_name"; then
        echo "[schedules_core_remove_job] ERROR: no such job: $job_name" >&2
        return 1
    fi

    doc=$(echo "$doc" | jq --arg n "$job_name" '.Values |= map(select(.[0] != $n))')
    schedules_core_atomic_write "$db_path" "$doc"
    echo "[schedules_core_remove_job] removed: $job_name" >&2
}

# schedules_core_set_enabled <db_path> <job_name> <true|false>
schedules_core_set_enabled() {
    local db_path="$1" job_name="$2" enabled_value="$3"
    local doc
    doc=$(schedules_core_load_db "$db_path") || return 1

    if ! schedules_core_job_exists "$db_path" "$job_name"; then
        echo "[schedules_core_set_enabled] ERROR: no such job: $job_name" >&2
        return 1
    fi

    doc=$(echo "$doc" | jq --arg n "$job_name" --argjson e "$enabled_value" \
        '.Values |= map(if .[0] == $n then .[7] = $e else . end)')
    schedules_core_atomic_write "$db_path" "$doc"
    echo "[schedules_core_set_enabled] $job_name enabled=$enabled_value" >&2
}

# schedules_core_mark_run <db_path> <job_name> <status> <timestamp_iso8601>
# Updates last_run / last_status after a launch attempt. If the job's
# schedule_type is "once", it is auto-disabled so it never fires again.
schedules_core_mark_run() {
    local db_path="$1" job_name="$2" status="$3" timestamp="$4"
    local doc
    doc=$(schedules_core_load_db "$db_path") || return 1

    doc=$(echo "$doc" | jq --arg n "$job_name" --arg s "$status" --arg t "$timestamp" '
        .Values |= map(
            if .[0] == $n then
                .[8] = $t | .[9] = $s | (if .[2] == "once" then .[7] = false else . end)
            else . end
        )
    ')
    schedules_core_atomic_write "$db_path" "$doc"
}

# schedules_core_get_job <db_path> <job_name>
# Prints the raw job row (JSON array) to stdout.
schedules_core_get_job() {
    local db_path="$1" job_name="$2"
    local doc
    doc=$(schedules_core_load_db "$db_path") || return 1
    echo "$doc" | jq --arg n "$job_name" '[.Values[] | select(.[0] == $n)][0]'
}

# schedules_core_init_config <config_path> <db_path>
# Creates a BEJSON 104a config file for the daemon if one does not already
# exist. Holds the debug switch required by the persistent-config debug
# switch policy, plus the tick interval and which DB the daemon should watch.
schedules_core_init_config() {
    local config_path="$1"
    local db_path="$2"

    if [[ -f "$config_path" ]]; then
        echo "[schedules_core_init_config] already exists, leaving untouched: $config_path" >&2
        return 0
    fi

    mkdir -p "$(dirname "$config_path")"

    local doc
    doc=$(jq -n --arg db_path "$db_path" '{
        "Format": "BEJSON",
        "Format_Version": "104a",
        "Format_Creator": "Elton Boehnen",
        "Records_Type": ["SchedulesDaemonConfig"],
        "Fields": [
            {"name": "key", "type": "string"},
            {"name": "value", "type": "string"}
        ],
        "Values": [
            ["db_path", $db_path],
            ["tick_interval_seconds", "60"],
            ["debug", "false"]
        ]
    }')

    schedules_core_atomic_write "$config_path" "$doc"
    echo "[schedules_core_init_config] created: $config_path" >&2
}

# schedules_core_config_get <config_path> <key> [default]
schedules_core_config_get() {
    local config_path="$1" key="$2" default_value="${3:-}"
    if [[ ! -f "$config_path" ]]; then
        echo "$default_value"
        return 0
    fi
    local value
    value=$(jq -r --arg k "$key" '[.Values[] | select(.[0] == $k)][0][1] // empty' "$config_path")
    [[ -z "$value" ]] && value="$default_value"
    echo "$value"
}

# schedules_core_list_jobs <db_path>
# Prints a human-readable table of every job.
schedules_core_list_jobs() {
    local db_path="$1"
    local doc
    doc=$(schedules_core_load_db "$db_path") || return 1

    printf '%-20s %-9s %-11s %-8s %-9s %-6s\n' "JOB_NAME" "ENABLED" "TYPE" "TIME" "DAYS" "LAST_STATUS"
    echo "$doc" | jq -r '.Values[] | [.[0], (.[7]|tostring), .[2], (.[3]//"-"), (.[4]//"-"), (.[9]//"never")] | @tsv' |
        while IFS=$'\t' read -r name enabled type time days status; do
            printf '%-20s %-9s %-11s %-8s %-9s %-6s\n' "$name" "$enabled" "$type" "$time" "$days" "$status"
        done
}