#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Library:         lib_bejson_Schedules_scheduler_runner.sh
# Family:          Schedules
# Module Purpose:  Decides which jobs in the Schedules DB are due right now,
# Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
# Version:         1.0.0
# Release_Version: 300
# Date:            2026-07-17
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   228a1ecf-da8c-4fea-95a4-c5d464c53157
# -----------------------------------------------------------------------------

Schedules_Runner_Script_Dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$Schedules_Runner_Script_Dir/lib_bejson_Schedules_scheduler_core.sh"

# schedules_runner_day_abbrev
# Prints today's three-letter day abbreviation, e.g. "Mon".
schedules_runner_day_abbrev() {
    date +%a
}

# schedules_runner_now_hhmm
schedules_runner_now_hhmm() {
    date +%H:%M
}

# schedules_runner_now_iso8601
schedules_runner_now_iso8601() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# schedules_runner_minutes_since <iso8601_timestamp>
# Prints elapsed whole minutes since the given UTC timestamp. Prints a very
# large number if the timestamp is null/empty (treated as "never run").
schedules_runner_minutes_since() {
    local timestamp="$1"
    if [[ -z "$timestamp" || "$timestamp" == "null" ]]; then
        echo 999999999
        return 0
    fi
    local then_epoch now_epoch
    then_epoch=$(date -u -d "$timestamp" +%s 2>/dev/null) || { echo 999999999; return 0; }
    now_epoch=$(date -u +%s)
    echo $(( (now_epoch - then_epoch) / 60 ))
}

# schedules_runner_is_due <job_row_json>
# Returns 0 (due) or 1 (not due) for a single job row.
schedules_runner_is_due() {
    local job="$1"

    local enabled schedule_type run_time run_days interval_minutes run_date last_run
    enabled=$(echo "$job" | jq -r '.[7]')
    [[ "$enabled" != "true" ]] && return 1

    schedule_type=$(echo "$job" | jq -r '.[2]')
    run_time=$(echo "$job" | jq -r '.[3]')
    run_days=$(echo "$job" | jq -r '.[4]')
    interval_minutes=$(echo "$job" | jq -r '.[5]')
    run_date=$(echo "$job" | jq -r '.[6]')
    last_run=$(echo "$job" | jq -r '.[8]')

    local now_hhmm today_abbrev today_date
    now_hhmm=$(schedules_runner_now_hhmm)
    today_abbrev=$(schedules_runner_day_abbrev)
    today_date=$(date +%Y-%m-%d)

    case "$schedule_type" in
        interval)
            local elapsed
            elapsed=$(schedules_runner_minutes_since "$last_run")
            [[ "$elapsed" -ge "$interval_minutes" ]] && return 0
            return 1
            ;;
        recurring)
            [[ "$now_hhmm" != "$run_time" ]] && return 1
            if [[ "$run_days" != "Everyday" ]]; then
                [[ ",$run_days," != *",$today_abbrev,"* ]] && return 1
            fi
            # Dedupe: don't refire within the same day+minute slot.
            local last_run_hhmm last_run_date
            if [[ "$last_run" != "null" && -n "$last_run" ]]; then
                last_run_date=$(date -u -d "$last_run" +%Y-%m-%d 2>/dev/null)
                last_run_hhmm=$(date -u -d "$last_run" +%H:%M 2>/dev/null)
                if [[ "$last_run_date" == "$today_date" && "$last_run_hhmm" == "$now_hhmm" ]]; then
                    return 1
                fi
            fi
            return 0
            ;;
        once)
            [[ "$run_date" != "$today_date" ]] && return 1
            [[ "$now_hhmm" != "$run_time" ]] && return 1
            [[ "$last_run" != "null" && -n "$last_run" ]] && return 1
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# schedules_runner_launch_job <db_path> <job_row_json>
# Launches a job's script in the background (non-blocking) and records the
# attempt. Does not wait for the script to finish — a launch is considered
# successful if the process was started, not if it eventually exits 0.
schedules_runner_launch_job() {
    local db_path="$1" job="$2"

    local job_name script_path log_path
    job_name=$(echo "$job" | jq -r '.[0]')
    script_path=$(echo "$job" | jq -r '.[1]')
    log_path=$(echo "$job" | jq -r '.[10]')

    local timestamp
    timestamp=$(schedules_runner_now_iso8601)

    if [[ ! -f "$script_path" ]]; then
        echo "[schedules_runner_launch_job] ERROR: script not found for '$job_name': $script_path" >&2
        schedules_core_mark_run "$db_path" "$job_name" "error" "$timestamp"
        return 1
    fi

    if [[ "$log_path" == "null" || -z "$log_path" ]]; then
        log_path="$(dirname "$db_path")/logs/${job_name}.log"
    fi
    mkdir -p "$(dirname "$log_path")"

    nohup bash "$script_path" >> "$log_path" 2>&1 &
    disown

    schedules_core_mark_run "$db_path" "$job_name" "launched" "$timestamp"
    echo "[schedules_runner_launch_job] launched '$job_name' -> $script_path (log: $log_path)" >&2
}

# schedules_runner_tick <db_path>
# Single pass: check every job, launch every one that is due.
schedules_runner_tick() {
    local db_path="$1"
    local doc
    doc=$(schedules_core_load_db "$db_path") || return 1

    local job_count
    job_count=$(echo "$doc" | jq '.Values | length')

    local i
    for (( i = 0; i < job_count; i++ )); do
        local job
        job=$(echo "$doc" | jq -c ".Values[$i]")
        if schedules_runner_is_due "$job"; then
            schedules_runner_launch_job "$db_path" "$job"
        fi
    done
}