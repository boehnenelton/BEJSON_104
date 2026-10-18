# BEJSON & MFDB Library Ecosystem (Version 4.0.0)
*Author: Elton Boehnen (boehnenelton2024@gmail.com)*

---

## 1. Executive Summary & Core Philosophy

BEJSON (**Boehnen Elton JSON**) is a specialized, human-readable yet machine-native structured data architecture designed specifically to solve the fundamental inefficiencies and hallucination vectors of Large Language Models (LLMs) when processing traditional nested JSON or unstructured SQL databases.

Traditional JSON relies heavily on deeply nested brackets, arbitrary object structures, and inline keys repeated across thousands of records. This creates a massive token overhead, confuses context windows, and increases probabilistic hallucination rates in AI models. BEJSON addresses this by decoupling the **schema definition** (field names and types) from the **data rows** (values). 

### Why BEJSON Over Standard JSON?
1. **Zero Hallucination Vector**: By explicitly defining fields at the head of the file in strict tabular arrays, the LLM does not need to guess object nesting or key locations. Every value has a mathematically guaranteed positional index.
2. **Context Window & Token Economy**: Eliminating repeating inline keys saves up to 40-70% on token counts for tabular datasets, directly enhancing the LLM's effective memory bubble.
3. **O(1) Memory Access**: Data parsing and positional lookup occur in constant time, independent of file size.
4. **Serverless Relational Engine (MFDB)**: Paired with the Multi-File Database orchestration layer, BEJSON forms a complete, portable, git-friendly relational database requiring no backend server, no black-box SQL drivers, and zero cloud hosting overhead.

---

## 2. BEJSON Specifications & The Three Formats

BEJSON is strictly gated by a rigorous set of validators. Every file must declare its format version and comply with exact structural constraints.

### 2.1 BEJSON 104 (Standard Relational Table)
The core table specification. Keys and types are listed in `Fields`, and raw values are stored as a 2D array in `Values`.

```json
{
  "Format": "BEJSON",
  "Format_Version": "104",
  "Format_Creator": "Elton Boehnen",
  "Records_Type": ["User"],
  "Fields": [
    {"name": "id", "type": "string"},
    {"name": "name", "type": "string"},
    {"name": "age", "type": "integer"},
    {"name": "active", "type": "boolean"}
  ],
  "Values": [
    ["u_001", "Alice Smith", 28, true],
    ["u_002", "Bob Jones", 34, false]
  ]
}
```

### 2.2 BEJSON 104a (Optimized Single Table)
Optimized for smaller configuration files, metadata trackers, and flat caches. It disallows complex array/object types and enforces strict primitive mapping.

```json
{
  "Format": "BEJSON",
  "Format_Version": "104a",
  "Format_Creator": "Elton Boehnen",
  "Project_Name": "libraries_104",
  "Session_Id": "7373a686-6f7d-43f3-a8e2-0656c510ae37",
  "Records_Type": ["ConfigSetting"],
  "Fields": [
    {"name": "key", "type": "string"},
    {"name": "value", "type": "string"}
  ],
  "Values": [
    ["theme", "dark"],
    ["timeout_sec", "30"]
  ]
}
```

### 2.3 BEJSON 104db (Multi-Table Multiplexing)
Allows several *different* tables to be stapled into a single sheet. Field 0 **must** be named `Record_Type_Parent` (type string). Every subsequent field must carry a `Record_Type_Parent` attribute mapping it to its owning table entity. Unapplied columns are padded with `null`.

```json
{
  "Format": "BEJSON",
  "Format_Version": "104db",
  "Format_Creator": "Elton Boehnen",
  "Records_Type": ["User", "Item"],
  "Fields": [
    {"name": "Record_Type_Parent", "type": "string"},
    {"name": "username", "type": "string", "Record_Type_Parent": "User"},
    {"name": "email", "type": "string", "Record_Type_Parent": "User"},
    {"name": "item_name", "type": "string", "Record_Type_Parent": "Item"},
    {"name": "owner_id_fk", "type": "string", "Record_Type_Parent": "Item"}
  ],
  "Values": [
    ["User", "alice", "alice@example.com", null, null],
    ["User", "bob", "bob@example.com", null, null],
    ["Item", null, null, "Project Report Alpha", "alice"],
    ["Item", null, null, "Configuration Schema", "bob"]
  ]
}
```

### 2.4 Field Map Cache and the reserved `_` prefix

`_bejson_field_map` gives O(1) name-to-column lookup. It is an in-memory artifact and is never trusted from disk.

- **Provenance guard:** a map is used only if this library built it (Python `_FieldMap`, JS/TS `WeakMap`) and it is still fresh against `Fields`. Anything else, including a forged or stale map, is rebuilt. Lookup cost stays flat in the field count.
- **Per-document copy:** each document gets its own map; the shared internal cache is never exposed, so mutating one document's map cannot affect another.
- **Persisted input:** a file or JSON string containing *any* top-level key that starts with `_` is rejected (`E_RESERVED_KEY_COLLISION`, 10) by every validator (CLI, PY, JS, TS, Bash), in all three formats. `load_file` and `atomic_write` strip `_bejson_field_map`.
- **In-memory objects:** only `_bejson_field_map` (must equal the map derived from `Fields`), `_nesting_field_map` (PY) and `_nestingFieldMap` (JS/TS) are accepted. Any other `_` key is rejected.
- **Duplicate field names** are rejected (`E_INVALID_FIELDS`, 6): the map keeps one index per name.

Tests: `Lib_PY/Core/tests/test_field_map_integrity.py`, `Lib_JS/Core/tests/test_field_map_integrity.js`, `Lib_TS/Core/tests/test_field_map_integrity.ts`, `Lib_SH/Core/tests/test_field_map_integrity.sh`.

MFDB core/validator tests: `Lib_PY/Core/tests/test_mfdb.py`, `Lib_JS/Core/tests/test_mfdb.js`, `Lib_TS/Core/tests/test_mfdb.ts`, `Lib_SH/Core/tests/test_mfdb.sh`.

Run from `libraries_104/`: `python3 -m unittest Lib_PY/Core/tests/test_mfdb.py`, `node Lib_JS/Core/tests/test_mfdb.js`, `bash Lib_SH/Core/tests/test_mfdb.sh` (needs `jq`). TypeScript needs `@types/node`: `cd Lib_TS && npm i -D typescript @types/node && npx tsc -p tsconfig.json` type-checks all libraries (0 errors); the TS tests compile with the command in each test file's header.

---

## 3. MFDB (Multi-File Database) Specification & Architecture

The **Multi-File Database (MFDB)** is the orchestration layer that brings relational database capabilities to flat BEJSON files. Instead of relying on a centralized database engine (SQLite, PostgreSQL, MySQL), an MFDB database is a structured directory of BEJSON tables linked by foreign keys (`_fk`).

### Architecture Versions (v1.31 & v1.32)
* **MFDB v1.31**: Standard multi-table directory mapping where each table is an independent `.104.bejson` file within a database root folder, governed by an `mfdb_manifest.json` or schema index.
* **MFDB v1.32 (Project Chunker)**: Advanced macro-orchestration layer capable of bundling an entire software project's source code, directory trees, commit logs, and multi-version history into a single compressed or unified MFDB file. This allows an LLM to load an entire repository into context instantly without traversing dozens of nested file paths.

```
[MFDB Root Directory]
 ├── mfdb_manifest.bejson
 ├── tables/
 │    ├── users.104.bejson
 │    ├── posts.104.bejson
 │    └── comments.104.bejson
 └── index/
      └── foreign_key_index.104.bejson
```

---

## 4. Library Families Ecosystem

The libraries_104 bundle provides full parity across four major programming environments, ensuring identical validation logic, list manipulation, core parsing, and AI integration.

### 4.1 Python (`Lib_PY`)
The reference implementation. Highly optimized, featuring complete unit test suites and comprehensive modules.
* **Core**: `bejson_validator`, `bejson_parser`, `bejson_cache`, `bejson_env`.
* **Lists**: Advanced tree validation, parent-child cycle detection, orphan checking, graph traversal.
* **Modules**: AI dispatchers, BEHTML engines, Bookmaker, Chunker, CMS, Cognition, Diagrams.

### 4.2 JavaScript (`Lib_JS`)
Node.js and browser-compatible utilities for rapid web integration and lightweight client-side caching.
* **Core**: Caching wrappers, streaming parser, validation middleware.
* **Lists**: Tree validation, relational querying.
* **Gaming & Utility**: High-performance state persistence.

### 4.3 TypeScript (`Lib_TS`)
Strongly-typed interface definitions and runtime validators ensuring type safety when building enterprise BEJSON applications.
* **Core**: Strict interface models for 104, 104a, and 104db structures.
* **Lists & Gaming**: Generic tree structures with strict compiler checks.

### 4.4 Shell (`Lib_SH`)
POSIX-compliant Bash scripts enabling terminal-native database queries, automated linting, and CI/CD validation pipelines without external dependencies.
* **Core**: Native string processing, table slicing, and validator scripts.
* **Schedules & Terminal Menus**: Interactive TUI system management.

---

## 5. Specialized Modules & Extensions

libraries_104 includes a rich suite of specialized vertical modules built on top of the BEJSON/MFDB core:

1. **AI Integration (`Lib_PY/AI`)**: Multi-provider LLM dispatchers (OpenAI, Anthropic, TokenRouter, Ollama) with robust key rotation, error handling (TTS/Retry codes 230-235), and standardized prompt profiles.
2. **BEHTML & BEHTML IDE (`Lib_PY/BEHTML`)**: Structured, token-efficient HTML generation and templating language mirroring BEJSON's tabular philosophy.
3. **Diagrams (`Lib_PY/Diagrams`)**: Semantic flowchart and architecture diagram generators with AI plan validation (`diagrams_ai_validate_plan_semantics`).
4. **CMS & ExpCMS (`Lib_PY/CMS`)**: Headless content management systems driven entirely by MFDB directories.
5. **Bookmaker (`Lib_PY/Bookmaker`)**: Automated document compilation and multi-format report generation tools.
6. **Chunker (`Lib_PY/Chunker`)**: Repository analysis and macro-file segmentation utilities for LLM context optimization.

---

## 6. Code Examples & Usage Guides

### Python: Validating and Querying a BEJSON Table
```python
from Lib_PY.Core.bejson_validator import validate_bejson_file
from Lib_PY.Lists.list_validator import validate_list_structure

# Validate a 104 file
is_valid, error_msg = validate_bejson_file("path/to/users.104.bejson")
if not is_valid:
    raise ValueError(f"Invalid BEJSON: {error_msg}")

# Validate parent-child tree hierarchy
tree_result = validate_list_structure("path/to/org_chart.104.bejson")
if tree_result["has_cycles"]:
    print("Cycles detected in organization tree!")
```

### JavaScript: High-Speed Cache Lookup
```javascript
const { BejsonCache } = require('./Lib_JS/Core/bejson_cache');

const cache = new BejsonCache();
cache.loadTable('users', './tables/users.104.bejson');

const user = cache.lookup('users', 'id', 'u_001');
console.log("Found User:", user);
```

---

## 7. Conclusion & Contribution

BEJSON and MFDB redefine how data is stored, queried, and comprehended by both human engineers and artificial intelligence. By removing ambiguity, enforcing strict validation, and eliminating server overhead, libraries_104 provides a robust foundation for next-generation AI-native software engineering.

*Maintained by Elton Boehnen.*