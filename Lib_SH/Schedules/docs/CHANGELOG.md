# Schedules — Changelog

## v1.0.0 — 2026-07-17
- Initial creation of the Schedules family (new — first Bash-family library
  besides the existing Lib_JS/Lib_PY families).
- `lib_bejson_Schedules_scheduler_core.sh` — job DB CRUD (BEJSON 104) + daemon
  config CRUD (BEJSON 104a).
- `lib_bejson_Schedules_scheduler_runner.sh` — due-check logic and job
  launching for `recurring`, `interval`, and `once` schedule types.
- `lib_bejson_Schedules_scheduler_daemon.sh` — tick loop (default 60s)
  standing in for a cron daemon; start/stop/status; debug-switch logging.
- `lib_bejson_Schedules_scheduler_cli.sh` — terminal commands for managing
  jobs without hand-editing JSON.
- Tested end-to-end: DB init, add-recurring/interval/once, list, enable/
  disable, remove, run-now, tick due-detection + dedupe, once auto-disable,
  daemon start/stop/status with SIGTERM handling.
