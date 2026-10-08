#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Library:         lib_bejson_Schedules_scheduler_daemon.sh
# Family:          Schedules
# Module Purpose:  Termux has no reliable built-in cron. This is the
# Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
# Version:         1.0.0
# Release_Version: 300
# Date:            2026-07-17
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   a40589b4-6156-492c-b2f9-94ccd2100d8c
# -----------------------------------------------------------------------------

Schedules_Daemon_Script_Dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$Schedules_Daemon_Script_Dir/lib_bejson_Schedules_scheduler_core.sh"
source "$Schedules_Daemon_Script_Dir/lib_bejson_Schedules_scheduler_runner.sh"

# schedules_daemon_log <log_path> <debug_enabled> <message>
# Verbose logging when the debug switch is on; always logs errors regardless.
schedules_daemon_log() {
    local log_path="$1" debug_enabled="$2" message="$3"
    local timestamp
    timestamp=$(schedules_runner_now_iso8601)
    if [[ "$debug_enabled" == "true" ]]; then
        echo "[$timestamp] $message" >> "$log_path"
    fi
}

# schedules_daemon_start <db_path> <config_path>
# Runs in the foreground. To run in the background, launch it under nohup:
#   nohup ./lib_bejson_Schedules_scheduler_daemon.sh start <db> <cfg> &
schedules_daemon_start() {
    local db_path="$1" config_path="$2"

    schedules_core_init_db "$db_path"
    schedules_core_init_config "$config_path" "$db_path"

    local tick_seconds debug_enabled pid_file daemon_log
    tick_seconds=$(schedules_core_config_get "$config_path" "tick_interval_seconds" "60")
    debug_enabled=$(schedules_core_config_get "$config_path" "debug" "false")
    pid_file="$(dirname "$config_path")/schedules_daemon.pid"
    daemon_log="$(dirname "$db_path")/logs/schedules_daemon.log"
    mkdir -p "$(dirname "$daemon_log")"

    echo $$ > "$pid_file"
    schedules_daemon_log "$daemon_log" "$debug_enabled" "daemon started, pid=$$, tick=${tick_seconds}s, db=$db_path"

    trap 'schedules_daemon_log "'"$daemon_log"'" "'"$debug_enabled"'" "daemon stopped, pid=$$"; rm -f "'"$pid_file"'"; exit 0' SIGTERM SIGINT

    while true; do
        # Re-read config each cycle so debug/tick changes apply without a restart.
        tick_seconds=$(schedules_core_config_get "$config_path" "tick_interval_seconds" "60")
        debug_enabled=$(schedules_core_config_get "$config_path" "debug" "false")

        schedules_daemon_log "$daemon_log" "$debug_enabled" "tick"
        schedules_runner_tick "$db_path"

        sleep "$tick_seconds"
    done
}

# schedules_daemon_stop <config_path>
schedules_daemon_stop() {
    local config_path="$1"
    local pid_file="$(dirname "$config_path")/schedules_daemon.pid"

    if [[ ! -f "$pid_file" ]]; then
        echo "[schedules_daemon_stop] no pid file found, is the daemon running?" >&2
        return 1
    fi

    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
        kill -TERM "$pid"
        echo "[schedules_daemon_stop] sent stop signal to pid $pid" >&2
    else
        echo "[schedules_daemon_stop] pid $pid not running, cleaning up stale pid file" >&2
        rm -f "$pid_file"
    fi
}

# schedules_daemon_status <config_path>
schedules_daemon_status() {
    local config_path="$1"
    local pid_file="$(dirname "$config_path")/schedules_daemon.pid"

    if [[ ! -f "$pid_file" ]]; then
        echo "not running (no pid file)"
        return 1
    fi

    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
        echo "running (pid $pid)"
        return 0
    else
        echo "not running (stale pid file for $pid)"
        return 1
    fi
}

# --- Standalone CLI entry point ---
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    Schedules_Daemon_Command="${1:-}"
    case "$Schedules_Daemon_Command" in
        start)
            schedules_daemon_start "$2" "$3"
            ;;
        stop)
            schedules_daemon_stop "$2"
            ;;
        status)
            schedules_daemon_status "$2"
            ;;
        *)
            echo "Usage: $0 {start <db_path> <config_path>|stop <config_path>|status <config_path>}" >&2
            exit 1
            ;;
    esac
fi