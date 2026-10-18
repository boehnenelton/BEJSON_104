# Core_Extension — family standard

Core_Extension is a new sibling family to `Core` (which now includes the former `Core_Nesting` modules). This
document is the standard every future Core_Extension module follows —
written once, here, rather than re-explained per module.

## What belongs here (vs. Core, vs. its own family)

- **Core** stays immutable and minimal: the BEJSON 104/104a document model
  and MFDB manifest/entity primitives. Nothing new gets added to Core
  itself.
- **Core_Extension** is for capabilities that are useful across *any*
  BEJSON/MFDB consumer, are built entirely on Core's **public** API
  (`lib_bejson_Core_bejson_core.py`, `lib_bejson_Core_mfdb_core.py`, etc.),
  and never reach into Core's internals. If it needs Core to change to
  work, it doesn't belong here — it's either a Core change (rare, deliberate)
  or its own family.
- **Its own family** (like `Cognition`) is for something
  substantial and domain-specific enough to deserve its own name and
  identity, not just "another thing Core-adjacent."

`bejson_pagecache` (streamed, memory-bounded MFDB entity pagination) is the
first module and the reference example: it calls `mfdb_core` functions to
resolve the manifest, reads entity files directly for the streaming walk,
and doesn't touch anything Core doesn't already expose publicly.

## Conventions (same pattern as every other family)

- **Folder**: `Lib_PY/Core_Extension/` (and later, at parity time,
  `Lib_JS/Core_Extension/`, `Lib_TS/Core_Extension/`, `Lib_SH/Core_Extension/`).
- **File naming**: `lib_bejson_CoreExtension_{module_name}.py` — family
  name in the filename is PascalCase-no-underscore (`CoreExtension`),
  matching `BEHTMLIDE`, etc.
- **Own error registry**: every family owns its own error codes in
  `lib_bejson_CoreExtension_bejson_errors.py`, never borrowed from Core's.
  Core_Extension's reserved range is **160-189** (claimed 2026-08-09,
  immediately after the nesting range's 130-159, keeping the Core-adjacent
  families clustered). Sub-allocate within that range per module as they're
  added — `bejson_pagecache` took 160-179, next module starts at 180.
- **Headers**: every file carries the same header block every other family
  file does — `Library`, `Family`, `Description`, `Version`,
  `Library_Version`, `Date`, `Author`, `Contact`, `Format_Creator`,
  `RELATIONAL_ID`, plus a `Changelog` section once there's history to
  record. `Library_Version` tracks the shared ecosystem-wide library epoch
  (currently `220`), same value across every family's files at any given
  time — it is not this family's own version number.
- **Package init**: a small `__init__.py` per the same template as
  `Core/__init__.py` — points at submodules, doesn't re-export everything.
- **No new third-party dependencies.** Every Core_Extension module is
  stdlib-only unless a dependency is explicitly approved first —
  `bejson_pagecache` uses `json.JSONDecoder.raw_decode()` fed incrementally
  rather than a third-party streaming JSON library, specifically to avoid
  introducing one.
- **Non-parity for now, parity later.** New Core_Extension modules land in
  Python first. Porting a given module to JS/TS/SH happens as a deliberate
  later pass across all four, same as any other family — not automatically
  alongside the Python version.

## Modules in this family

| Module | Error range | Status |
|---|---|---|
| `bejson_pagecache` | 160-179 | Python only (v1.0.0) |
