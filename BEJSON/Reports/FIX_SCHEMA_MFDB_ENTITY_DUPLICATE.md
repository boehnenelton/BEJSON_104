# Library Bug Fix: SCHEMA_MFDB_ENTITY Duplicate

**Date:** 2026-07-22
**Author:** Elton Boehnen (fix implemented by Claude, exemption invoked per Golden Rule)
**Affected library:** `Lib_PY/Utility/lib_bejson_Utility_bejson_utility.py`
**Version:** 2.3.2 -> 2.3.3
**RELATIONAL_ID (new):** 374393bb-559d-4444-959f-a679b80d95f7

## Problem

`Lib_PY/Utility/lib_bejson_Utility_bejson_utility.py` defined its own
`SCHEMA_MFDB_ENTITY` constant (6 fields: `version`, `file_path`,
`file_name`, `content`, `is_binary`, `is_base64`) that was a byte-for-byte
duplicate of `SCHEMA_MFDB_ENTITY_v5` already defined in
`Lib_PY/Core/lib_bejson_Core_bejson_schema.py`. Diffed field-by-field and
confirmed identical (name, type, and order) — this was flagged during the
MFDB expansion Task 3 schema inventory as a duplicate needing resolution.

Two independent copies of the same schema in two files is a drift risk: a
future edit to one (e.g. adding a field) would silently desync from the
other, and any code depending on `Utility.SCHEMA_MFDB_ENTITY` would then be
validating against a stale shape without either library raising an error.

## Fix

- `lib_bejson_Utility_bejson_utility.py` no longer defines its own
  `SCHEMA_MFDB_ENTITY`. It now imports `SCHEMA_MFDB_ENTITY_v5` from
  `lib_bejson_Core_bejson_schema` (via the existing sibling-path import
  pattern already used for `lib_bejson_Core_bejson_core`) and aliases it
  locally as `SCHEMA_MFDB_ENTITY`, so every existing call site
  (`bejson_utility_create_mfdb_version`, etc.) is unchanged.
- `Core/lib_bejson_Core_bejson_schema.py` is now the single source of truth
  for this schema. No changes were made to that file — it was already
  correct.
- A comment was left in place of the old definition pointing back to this
  report, so a future reader isn't confused about why the schema no longer
  appears locally.

## Verification

- `import lib_bejson_Utility_bejson_utility` succeeds cleanly.
- `Utility.SCHEMA_MFDB_ENTITY is Core.SCHEMA_MFDB_ENTITY_v5` -> `True`
  (same object, not just equal content — a future edit to one is now
  structurally impossible to diverge from the other).
- Ran `bejson_utility_create_mfdb_version()` against a test directory
  (before-fix and after-fix): output row shape unchanged, 6 fields,
  matching `len(SCHEMA_MFDB_ENTITY)`. Behavior is identical to before the
  fix; only the duplication is removed.

## Scope

Surgical — only `lib_bejson_Utility_bejson_utility.py` was modified (import
block + removal of the local constant + header version bump). No other
library file was touched. `SCHEMA_MODEL_REGISTRY` (Core vs AI) was diffed
in the same inventory pass and found to be a genuine name collision, not a
duplicate — that one is intentionally left alone; see
`docs/SCHEMAS_ENTITY_MIGRATION_DECISION.md` in the MFDB package.
