#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Library:         lib_bejson_Schedules_scheduler_cli.sh
# Family:          Schedules
# Module Purpose:  Terminal frontend for managing jobs in the Schedules BEJSON
# Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
# Version:         1.0.0
# Release_Version: 300
# Date:            2026-07-17
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   209a7755-e2e9-434b-a5a8-0684e4c7ca4c
# -----------------------------------------------------------------------------

Schedules_CLI_Script_Dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$Schedules_CLI_Script_Dir/lib_bejson_Schedules_scheduler_core.sh"
source "$Schedules_CLI_Script_Dir/lib_bejson_Schedules_scheduler_runner.sh"

schedules_cli_usage() {
    cat >&2 <<'USAGE'
Usage:
  schedules_cli.sh add-recurring  <db> <job_name> <script_path> <HH:MM> <days|Everyday> [log_path]
  schedules_cli.sh add-interval   <db> <job_name> <script_path> <minutes> [log_path]
  schedules_cli.sh add-once       <db> <job_name> <script_path> <YYYY-MM-DD> <HH:MM> [log_path]
  schedules_cli.sh remove         <db> <job_name>
  schedules_cli.sh enable         <db> <job_name>
  schedules_cli.sh disable        <db> <job_name>
  schedules_cli.sh list           <db>
  schedules_cli.sh show           <db> <job_name>
  schedules_cli.sh run-now        <db> <job_name>
USAGE
}

# schedules_cli_main <args...>
schedules_cli_main() {
    local command="${1:-}"
    [[ -z "$command" ]] && { schedules_cli_usage; return 1; }
    shift

    case "$command" in
        add-recurring)
            local db="$1" job_name="$2" script_path="$3" run_time="$4" run_days="$5" log_path="${6:-null}"
            schedules_core_init_db "$db"
            schedules_core_add_job "$db" "$job_name" "$script_path" "recurring" "$run_time" "$run_days" "null" "null" "$log_path"
            ;;
        add-interval)
            local db="$1" job_name="$2" script_path="$3" interval_minutes="$4" log_path="${5:-null}"
            schedules_core_init_db "$db"
            schedules_core_add_job "$db" "$job_name" "$script_path" "interval" "null" "null" "$interval_minutes" "null" "$log_path"
            ;;
        add-once)
            local db="$1" job_name="$2" script_path="$3" run_date="$4" run_time="$5" log_path="${6:-null}"
            schedules_core_init_db "$db"
            schedules_core_add_job "$db" "$job_name" "$script_path" "once" "$run_time" "null" "null" "$run_date" "$log_path"
            ;;
        remove)
            schedules_core_remove_job "$1" "$2"
            ;;
        enable)
            schedules_core_set_enabled "$1" "$2" "true"
            ;;
        disable)
            schedules_core_set_enabled "$1" "$2" "false"
            ;;
        list)
            schedules_core_list_jobs "$1"
            ;;
        show)
            schedules_core_get_job "$1" "$2"
            ;;
        run-now)
            local db="$1" job_name="$2"
            local job
            job=$(schedules_core_get_job "$db" "$job_name")
            if [[ "$job" == "null" || -z "$job" ]]; then
                echo "[schedules_cli] ERROR: no such job: $job_name" >&2
                return 1
            fi
            schedules_runner_launch_job "$db" "$job"
            ;;
        *)
            schedules_cli_usage
            return 1
            ;;
    esac
}

# --- Standalone CLI entry point ---
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    schedules_cli_main "$@"
fi