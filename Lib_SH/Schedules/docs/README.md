# Schedules — Bash Library Family

Job scheduling for Termux, backed by a plain BEJSON `104` file. No real cron
daemon involved. Termux doesn't reliably ship one, so instead:

- **The job database** (`schedules.104.bejson`) is just data — one row per
  job. You manage jobs by editing this file (by hand, with `jq`, or with the
  CLI below). Nothing about *how* scheduling works lives in this file.
- **The runner** (`lib_bejson_Schedules_scheduler_runner.sh`) reads the file
  once and answers one question per job: "is this due right now?" If yes, it
  launches the job's script in the background and writes back `last_run` /
  `last_status`.
- **The daemon** (`lib_bejson_Schedules_scheduler_daemon.sh`) is the only
  part that stands in for cron: an infinite loop that calls the runner once
  per tick (default every 60 seconds), then sleeps. Start it once and leave
  it running — that's your entire scheduling system.

## Files

| File | Purpose |
|---|---|
| `lib_bejson_Schedules_scheduler_core.sh` | CRUD on the job DB + the daemon's config file. No scheduling logic. |
| `lib_bejson_Schedules_scheduler_runner.sh` | Due-check logic + launching a job's script. |
| `lib_bejson_Schedules_scheduler_daemon.sh` | The tick loop. Start/stop/status. This is "cron." |
| `lib_bejson_Schedules_scheduler_cli.sh` | Terminal commands for adding/removing/listing jobs. |

## Quick start

```bash
cd Lib_SH/Schedules

# Add a job that runs every day at 07:30
./lib_bejson_Schedules_scheduler_cli.sh add-recurring \
    data/schedules.104.bejson daily_backup /path/to/backup.sh 07:30 Everyday

# Add a job that runs every 15 minutes
./lib_bejson_Schedules_scheduler_cli.sh add-interval \
    data/schedules.104.bejson check_status /path/to/check.sh 15

# Add a job that fires once on a specific date/time, then disables itself
./lib_bejson_Schedules_scheduler_cli.sh add-once \
    data/schedules.104.bejson one_time_task /path/to/task.sh 2026-08-01 09:00

# See what's scheduled
./lib_bejson_Schedules_scheduler_cli.sh list data/schedules.104.bejson

# Start the daemon (this is what actually makes jobs fire — keep it running)
nohup ./lib_bejson_Schedules_scheduler_daemon.sh start \
    data/schedules.104.bejson data/schedules_config.104a.bejson &

# Check on it / stop it later
./lib_bejson_Schedules_scheduler_daemon.sh status data/schedules_config.104a.bejson
./lib_bejson_Schedules_scheduler_daemon.sh stop   data/schedules_config.104a.bejson
```

To have the daemon survive a phone reboot, call the `start` line above from
a Termux:Boot script (`~/.termux/boot/`). That's a device-setup step, not
something this library does for you.

## Job fields (what "editing the 104 file" means)

Each row in `schedules.104.bejson` is one job:

| Field | Used by | Meaning |
|---|---|---|
| `job_name` | all | unique name |
| `script_path` | all | absolute path to the script to launch |
| `schedule_type` | all | `recurring`, `interval`, or `once` |
| `run_time` | recurring, once | `"HH:MM"` 24-hour |
| `run_days` | recurring | `"Everyday"` or `"Mon,Wed,Fri"` |
| `interval_minutes` | interval | run again every N minutes |
| `run_date` | once | `"YYYY-MM-DD"` |
| `enabled` | all | `false` = skipped entirely |
| `last_run` | all | set automatically after each launch |
| `last_status` | all | `launched` or `error`, set automatically |
| `log_path` | all | where the job's stdout/stderr goes; `null` = auto (`data/logs/<job_name>.log`) |

A `once` job auto-disables itself the moment it fires, so it never runs
twice.

## Config file (the daemon's debug switch)

`schedules_config.104a.bejson` is created automatically on first `daemon
start`. Three keys:

- `db_path` — which job database this daemon instance watches
- `tick_interval_seconds` — how often it wakes up (default `60`)
- `debug` — `"true"` writes a timestamped line to `data/logs/schedules_daemon.log`
  on every tick; `"false"` stays silent except for errors. The daemon
  re-reads this file every cycle, so flipping `debug` to `"true"` takes
  effect on the next tick without a restart.

## Recommended directory layout

```
lib/Schedules/                          ← the four .sh files
data/schedules.104.bejson               ← job database
data/schedules_config.104a.bejson       ← daemon config
data/logs/schedules_daemon.log          ← daemon tick log (debug mode)
data/logs/<job_name>.log                ← per-job stdout/stderr
data/schedules_daemon.pid               ← written by `daemon start`, removed by `daemon stop`
```

## Dependency

`jq`. On Termux: `pkg install jq`.
