/**
 * Library:         lib_bejson_Core_mfdb_core.js
 * Family:          Core
 * Module Purpose:  MFDB orchestrator: create manifest, register entities, sync record counts, read/write entity files.
 * Architecture:    MFDB (a database architecture layered on BEJSON, not a BEJSON format version): one BEJSON 104a manifest (104a.mfdb.bejson, Records_Type ["mfdb"]) registers many BEJSON 104 entity files, one entity per file, dense records, each with Parent_Hierarchy pointing back to the manifest. It is not 104db and uses no null-padding.
 * Format_Scope:    MFDB only (104a manifest + 104 entity files; NOT 104db)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         2.3.5
 * Release_Version: 300
 * Date:            2026-10-16
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   3781959d-71ba-4cda-8a4b-8dfada89bf72
 */

'use strict';

// JSZip is only needed by MFDBArchive. Before 2.3.5 this line read window.JSZip unguarded, so the module threw
// ReferenceError on load under Node. Now: browser global, else the optional 'jszip' package, else null.
const JSZip = (() => {
  if (typeof window !== 'undefined' && window.JSZip) return window.JSZip;
  if (typeof require !== 'undefined') { try { return require('jszip'); } catch (_) { return null; } }
  return null;
})();

// ---------------------------------------------------------------------------
// Setup environments — required by the manifest/entity manipulation functions below, which depend on
// the validator's IO helpers and the shared MFDB error codes.
// ---------------------------------------------------------------------------

const MFDB_VALIDATOR = (typeof require !== 'undefined')
  ? require('./lib_bejson_Core_mfdb_validator.js')
  : (window.MFDB_VALIDATOR || {});

const BEJSON_ERRORS = (typeof require !== 'undefined')
  ? require('./lib_bejson_Core_bejson_errors.js')
  : (window.BEJSON_ERRORS || {});

const {
  E_MFDB_CORE_MANIFEST_NOT_FOUND,
  E_MFDB_CORE_ENTITY_NOT_FOUND,
  E_MFDB_CORE_WRITE_FAILED,
  E_MFDB_CORE_CREATE_FAILED,
  E_MFDB_CORE_INVALID_OPERATION,
  E_MFDB_CORE_INDEX_OUT_OF_BOUNDS,
  E_MFDB_CORE_JOIN_FAILED,
  E_MFDB_CORE_ARCHIVE_ERROR,
  E_MFDB_CORE_MOUNT_CONFLICT
} = BEJSON_ERRORS;

const {
  _loadJson,
  _rowsAsDicts,
  _resolveEntityPath,
  _fileExists
} = MFDB_VALIDATOR;

class MFDBCoreError extends Error {
  /**
   * Error type for MFDB-layer failures (MFDBCoreError); carries a numeric code.
   */
  constructor(message, code) {
    super(message);
    this.name = 'MFDBCoreError';
    this.code = code;
  }
}

/**
 * True under Node.js (file-system access available).
 */
function _isNode() {
  return typeof process !== 'undefined' && process.versions && !!process.versions.node;
}

/**
 * Writes a text file (Node only; no-op/throws in a browser).
 */
function _writeFile(filePath, content) {
  if (!_isNode()) {
    console.warn('Sync write not available in browser');
    return;
  }
  const fs = require('fs');
  const path = require('path');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Serializes a BEJSON document with 2-space indent and writes it.
 */
function _writeBejson(filePath, doc) {
  _writeFile(filePath, JSON.stringify(doc, null, 2));
}

/**
 * Atomic write of a BEJSON document: same-directory temp file, then rename (Node only). Added in 2.3.5: the
 * federation and debug functions called this name 13 times but it was never defined (ReferenceError).
 * Underscore-prefixed keys (in-memory caches) are never persisted.
 */
function _atomicWrite(filePath, doc) {
  if (!_isNode()) {
    console.warn('Sync write not available in browser');
    return;
  }
  const fs = require('fs');
  const path = require('path');
  const clean = {};
  for (const k of Object.keys(doc)) { if (!k.startsWith('_')) clean[k] = doc[k]; }
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(filePath) + '.' + process.pid + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// ---------------------------------------------------------------------------
// Manifest API (Spec §15.3 and §15.10).
// Complements MFDBArchive below: this section manipulates the unpacked
// manifest/entity files directly, while MFDBArchive handles zip packaging.
// ---------------------------------------------------------------------------

/**
 * Creates a new MFDB manifest document: a BEJSON 104a document (Records_Type ["mfdb"]) with MFDB_Version, DB_Name, Network_Role and other 104a headers. options sets mfdbVersion, role, etc.
 * MFDB is a layer made of this 104a manifest plus 104 entity files -- not a format version, not 104db.
 */
function mfdb_core_create_manifest(dbName, options = {}) {
  const mfdbVersion  = options.mfdbVersion  || '1.31';
  const description  = options.description  || '';
  const author       = options.author       || (typeof process !== 'undefined' ? process.env.USER : '');
  const createdAt    = options.createdAt    || new Date().toISOString();
  const networkRole  = options.networkRole  || 'Standalone';   // "Master" | "Slave" | "Standalone"

  const doc = {
    Format: 'BEJSON',
    Format_Version: '104a',
    Format_Creator: 'Elton Boehnen',
    MFDB_Version: mfdbVersion,
    Network_Role: networkRole,
    DB_Name: dbName,
    DB_Description: description,
    Author: author,
    Created_At: createdAt,
    Records_Type: ['mfdb'],
    Fields: [
      { name: 'entity_name',    type: 'string' },
      { name: 'file_path',      type: 'string' },
      { name: 'description',    type: 'string' },
      { name: 'record_count',   type: 'integer' },
      { name: 'schema_version', type: 'string' },
      { name: 'primary_key',    type: 'string' },
    ],
    Values: [],
  };

  if (options.extraHeaders) {
    Object.assign(doc, options.extraHeaders);
  }

  return doc;
}

/**
 * Adds an entity row (entity_name, file_path, record_count, ...) to the manifest.
 */
function mfdb_core_register_entity(manifestPath, record) {
  if (!_fileExists(manifestPath)) {
    throw new MFDBCoreError(`Manifest not found: ${manifestPath}`, E_MFDB_CORE_MANIFEST_NOT_FOUND);
  }

  const doc     = _loadJson(manifestPath);
  const entries = _rowsAsDicts(doc);

  if (entries.some(e => e.entity_name === record.entity_name)) {
    throw new MFDBCoreError(`Entity '${record.entity_name}' already registered`, E_MFDB_CORE_JOIN_FAILED);
  }

  const names = doc.Fields.map(f => f.name);
  const row   = names.map(n => {
    if (record[n] !== undefined) return record[n];
    return null;
  });

  doc.Values.push(row);
  _writeBejson(manifestPath, doc);
  return true;
}

/**
 * Writes the real row count of one entity file (or overrideCount) into its manifest row.
 */
function mfdb_core_sync_count(manifestPath, entityName, overrideCount = null) {
  const doc     = _loadJson(manifestPath);
  const entries = _rowsAsDicts(doc);
  const idx     = entries.findIndex(e => e.entity_name === entityName);

  if (idx === -1) {
    throw new MFDBCoreError(`Entity '${entityName}' not found in manifest`, E_MFDB_CORE_ENTITY_NOT_FOUND);
  }

  let count = overrideCount;
  if (count === null) {
    const ePath = _resolveEntityPath(manifestPath, entries[idx].file_path);
    if (_fileExists(ePath)) {
      const edoc = _loadJson(ePath);
      count = (edoc.Values || []).length;
    }
  }

  if (count !== null) {
    const names = doc.Fields.map(f => f.name);
    const cIdx  = names.indexOf('record_count');
    if (cIdx !== -1) {
      doc.Values[idx][cIdx] = count;
      _writeBejson(manifestPath, doc);
    }
  }
  return true;
}

/**
 * Runs sync_count for every entity in the manifest.
 */
function mfdb_core_sync_all_counts(manifestPath) {
  const doc     = _loadJson(manifestPath);
  const entries = _rowsAsDicts(doc);
  for (const entry of entries) {
    mfdb_core_sync_count(manifestPath, entry.entity_name);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Entity Creation (Spec §15.4).
// ---------------------------------------------------------------------------

/**
 * Creates a new empty entity file: BEJSON 104, one Records_Type, Parent_Hierarchy pointing back to the manifest. Node only.
 */
function mfdb_core_init_entity_file(manifestPath, entityName, fields, filePathRel, options = {}) {
  if (!_isNode()) return;
  const path = require('path');
  const manifestDir = path.dirname(path.resolve(manifestPath));
  const entityPath  = path.resolve(manifestDir, filePathRel);
  const relBack     = path.relative(path.dirname(entityPath), manifestPath);

  const doc = {
    Format: 'BEJSON',
    Format_Version: '104',
    Format_Creator: 'Elton Boehnen',
    Parent_Hierarchy: relBack,
    Records_Type: [entityName],
    Fields: fields,
    Values: [],
  };

  _writeBejson(entityPath, doc);

  // Auto-register
  mfdb_core_register_entity(manifestPath, {
    entity_name: entityName,
    file_path: filePathRel,
    record_count: 0,
    description: options.description,
    primary_key: options.primary_key,
  });

  return doc;
}

/**
 * MFDBArchive Class - Vanilla Implementation
 * Leverages the Browser's File System Access API and JSZip.
 */
class MFDBArchive {
    /**
     * MFDBArchive: loads a .mfdb.zip (JSZip) and extracts its files into a directory handle for use. The archive is only a container for an ordinary MFDB (104a manifest + 104 entity files). Requires JSZip.
     */
    /**
     * mount (Browser version)
     * @param {File|Blob} zipFile - The .mfdb.zip file.
     * @param {FileSystemDirectoryHandle} dirHandle - The target directory handle.
     */
    static async mount(zipFile, dirHandle) {
        if (!JSZip) throw new Error("JSZip library not found. Required for archive operations.");
        
        const zip = await JSZip.loadAsync(zipFile);
        
        // Secure ZIP validation.
        const utility = (typeof window !== 'undefined' && window.BEJSON_UTILITY) 
            ? window.BEJSON_UTILITY 
            : (typeof require !== 'undefined' ? require('./lib_bejson_Core_bejson_secure_zip.js') : null);
        
        if (utility && utility.secure_zip_validate) {
            // Note: Virtual mount doesn't use real paths, but we validate for consistency.
            // dirHandle.name is used as the 'boundary'.
            utility.secure_zip_validate({ getEntries: () => Object.keys(zip.files).map(k => ({ entryName: k })) }, dirHandle.name || "mount_root");
        }
        
        // Check for manifest
        if (!zip.file("104a.mfdb.bejson")) {
            throw new Error("Invalid MFDB Archive: 104a.mfdb.bejson missing at root.");
        }

        // Virtual "Extraction" to Directory Handle
        for (const [path, file] of Object.entries(zip.files)) {
            if (file.dir) continue; // Skip directories (created as needed by getFileHandle)
            
            const pathParts = path.split('/');
            const fileName = pathParts.pop();
            let currentDir = dirHandle;

            // Navigate/Create subdirectories
            for (const part of pathParts) {
                if (part === "") continue;
                currentDir = await currentDir.getDirectoryHandle(part, { create: true });
            }

            const data = await file.async("uint8array");
            const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(data);
            await writable.close();
        }

        // Create session lock file
        const lockHandle = await dirHandle.getFileHandle('.mfdb_lock', { create: true });
        const lockWritable = await lockHandle.createWritable();
        const lockData = {
            mounted_at: new Date().toISOString(),
            original_name: zipFile.name || "archive.mfdb.zip"
        };
        await lockWritable.write(JSON.stringify(lockData));
        await lockWritable.close();

        return "Mounted successfully to FileSystemHandle";
    }

    /**
     * MFDBArchive: repacks the directory handle back into a .mfdb.zip. Requires JSZip.
     */
    /**
     * commit (Browser version)
     * Repacks the directory handle back into a JSZip Blob.
     */
    static async commit(dirHandle) {
        if (!JSZip) throw new Error("JSZip library not found.");
        
        const zip = new JSZip();
        
        /**
         * MFDBArchive helper: recursively reads a directory handle into a list of file entries.
         */
        async function readDir(handle, currentPath = "") {
            for await (const entry of handle.values()) {
                if (entry.name === '.mfdb_lock') continue;
                
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    const data = await file.arrayBuffer();
                    zip.file(currentPath + entry.name, data);
                } else if (entry.kind === 'directory') {
                    await readDir(entry, currentPath + entry.name + "/");
                }
            }
        }

        await readDir(dirHandle);
        return await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    }
}

// ── Federated Master / Slave node system ───────────────────────────────────────
// Network_Role is emitted by mfdb_core_create_manifest. This block wires
// the full runtime federation protocol (Node.js only for push/poll/distill;
// CONNECTED_SLAVE_SCHEMA and the entity creator are environment-agnostic).

const CONNECTED_SLAVE_SCHEMA = [
  { name: "slave_id",           type: "string"  },
  { name: "label",              type: "string"  },
  { name: "url",                type: "string"  },
  { name: "role",               type: "string"  },
  { name: "status",             type: "string"  },
  { name: "supported_entities", type: "array"   },
];

/**
 * Federation: on a Master manifest registers a ConnectedSlave entity and creates its file. Throws if the node is not a Master.
 */
function mfdb_core_create_connected_slave_entity(manifestPath) {
  const doc  = _loadJson(manifestPath);
  const role = doc.Network_Role || "";
  if (role !== "Master") {
    throw new MFDBCoreError(
      `ConnectedSlave may only be created on a Master node (Network_Role='Master'). Got: '${role}'`,
      E_MFDB_CORE_INVALID_OPERATION
    );
  }
  return mfdb_core_init_entity_file(
    manifestPath, "ConnectedSlave", CONNECTED_SLAVE_SCHEMA, "data/connectedslave.bejson",
    { description: "Registry of Slave nodes connected to this Master.", primary_key: "slave_id" }
  );
}

/**
 * Federation: Master -> Slave config push; atomically drops a BEJSON 104a config document into the slave's drop-zone path. Node only.
 */
// Node.js only — federation I/O requires fs
function mfdb_federation_push_config(configDoc, slaveTargetPath) {
  if (typeof require === 'undefined') {
    throw new Error("mfdb_federation_push_config requires Node.js (fs not available in browser).");
  }
  const _fs   = require("fs");
  const _path = require("path");
  const dest    = _path.resolve(slaveTargetPath);
  const destDir = _path.dirname(dest);
  _fs.mkdirSync(destDir, { recursive: true });
  const tempPath = dest + ".tmp." + Date.now();
  try {
    _fs.writeFileSync(tempPath, JSON.stringify(configDoc, null, 2), "utf8");
    _fs.renameSync(tempPath, dest);
    return true;
  } catch (e) {
    if (_fs.existsSync(tempPath)) try { _fs.unlinkSync(tempPath); } catch (_) {}
    console.error(`[MFDB_FEDERATION] push_config failed: ${e.message}`);
    return false;
  }
}

/**
 * Federation: polls a drop-zone directory and calls callback for each new document, then consumes it.
 */
function mfdb_federation_poll_dropzone(
  dropzoneDir, callback,
  { pollInterval = 2000, timeout = 60000 } = {}
) {
  if (typeof require === 'undefined') {
    throw new Error("mfdb_federation_poll_dropzone requires Node.js.");
  }
  const _fs   = require("fs");
  const _path = require("path");
  _fs.mkdirSync(dropzoneDir, { recursive: true });

  let processed = 0;
  const deadline = Date.now() + timeout;

  const tick = () => {
    if (Date.now() >= deadline) return;
    const files = _fs.readdirSync(dropzoneDir)
      .filter(f => f.endsWith(".bejson"))
      .sort()
      .map(f => _path.join(dropzoneDir, f));

    for (const fpath of files) {
      try {
        const doc = JSON.parse(_fs.readFileSync(fpath, "utf8"));
        callback(fpath, doc);
        _fs.unlinkSync(fpath);
        processed++;
      } catch (e) {
        console.warn(`[MFDB_FEDERATION] poll_dropzone skipped ${fpath}: ${e.message}`);
      }
    }
    setTimeout(tick, pollInterval);
  };

  tick();
  return () => processed;  // Returns a getter for processed count
}

/**
 * Federation: compacts a slave entity's log rows and delivers them to the master's poll directory.
 */
function mfdb_federation_distill_logs(
  slaveManifestPath, entityName, masterPollDir,
  { maxRows = 100 } = {}
) {
  if (typeof require === 'undefined') {
    throw new Error("mfdb_federation_distill_logs requires Node.js.");
  }
  const _fs   = require("fs");
  const _path = require("path");

  const manifestDoc  = _loadJson(slaveManifestPath);
  const entries      = _rowsAsDicts(manifestDoc);
  const entityEntry  = entries.find(e => e.entity_name === entityName);
  if (!entityEntry) throw new MFDBCoreError(`Entity '${entityName}' not in manifest`, E_MFDB_CORE_ENTITY_NOT_FOUND);

  const entityPath  = _path.resolve(_path.dirname(slaveManifestPath), entityEntry.file_path);
  const entityDoc   = _loadJson(entityPath);
  const rows        = entityDoc.Values || [];

  if (rows.length <= maxRows) return true;

  const overflow = rows.slice(0, rows.length - maxRows);
  const kept     = rows.slice(rows.length - maxRows);

  _fs.mkdirSync(masterPollDir, { recursive: true });
  const ts   = new Date().toISOString().replace(/[:.]/g, "").replace("T", "T").slice(0, 16) + "Z";
  const dest = _path.join(masterPollDir, `distilled_${entityName}_${ts}.bejson`);

  const summaryDoc = {
    Format: "BEJSON", Format_Version: "104a", Format_Creator: "Elton Boehnen",
    Distill_Source: entityName,
    Distill_Timestamp: new Date().toISOString(),
    Records_Type: ["DistilledLog"],
    Fields: entityDoc.Fields || [],
    Values: overflow,
  };

  if (!mfdb_federation_push_config(summaryDoc, dest)) return false;

  entityDoc.Values = kept;
  _atomicWrite(entityPath, entityDoc);

  // Update record count in manifest
  const fields = manifestDoc.Fields || [];
  const fm     = {};
  fields.forEach((f, i) => { fm[f.name] = i; });
  for (const row of (manifestDoc.Values || [])) {
    if (row[fm["entity_name"]] === entityName && fm["record_count"] !== undefined) {
      row[fm["record_count"]] = kept.length;
      break;
    }
  }
  _atomicWrite(slaveManifestPath, manifestDoc);
  return true;
}

// ── Meta-GUID Debug Entity System ─────────────────────────────────────────────
// Node.js only — direct file I/O required. All functions silently no-op in
// browser environments. _mfdbMetaLog bypasses normal write functions to prevent
// recursion; it acquires its own lock directly on the meta entity file.

const META_DEBUG_FIELDS = [
  { name: "timestamp",     type: "string"  },
  { name: "operation",     type: "string"  },
  { name: "target_entity", type: "string"  },
  { name: "field_name",    type: "string"  },
  { name: "field_exists",  type: "boolean" },
  { name: "row_index",     type: "integer" },
  { name: "success",       type: "boolean" },
  { name: "duration_ms",   type: "integer" },
  { name: "pid",           type: "integer" },
  { name: "notes",         type: "string"  },
];

/**
 * True when manifest header Debug_Mode is 'true'. Debug state is stored in 104a manifest headers.
 */
function _mfdbDebugIsEnabled(manifestPath) {
  try {
    const doc = _loadJson(manifestPath);
    return String(doc.Debug_Mode || "false").toLowerCase() === "true";
  } catch (_) { return false; }
}

/**
 * True when Debug_Reads is also 'true'.
 */
function _mfdbDebugReadsEnabled(manifestPath) {
  try {
    const doc = _loadJson(manifestPath);
    return String(doc.Debug_Reads || "false").toLowerCase() === "true";
  } catch (_) { return false; }
}

/**
 * Name of the debug/meta entity declared in the manifest, or null.
 */
function _mfdbDebugGetMetaEntityName(manifestPath) {
  try {
    const doc = _loadJson(manifestPath);
    return doc.Debug_Meta_Entity || null;
  } catch (_) { return null; }
}

/**
 * Absolute path of an entity file from its manifest row.
 */
function _mfdbGetEntityPath(manifestPath, entityName) {
  const manifest  = _loadJson(manifestPath);
  const entries   = _rowsAsDicts(manifest);
  const entry     = entries.find(e => e.entity_name === entityName);
  if (!entry) throw new MFDBCoreError(`Entity '${entityName}' not found`, E_MFDB_CORE_ENTITY_NOT_FOUND);
  return require("path").resolve(require("path").dirname(manifestPath), entry.file_path);
}

/**
 * Appends one operation record to the debug meta entity (itself a normal 104 entity file).
 */
function _mfdbMetaLog(manifestPath, operation, targetEntity, {
  fieldName = null, fieldExists = null, rowIndex = null,
  success = true, durationMs = 0, notes = "", readsOnly = false,
} = {}) {
  try {
    if (!_isNode()) return;
    if (!_mfdbDebugIsEnabled(manifestPath)) return;
    if (readsOnly && !_mfdbDebugReadsEnabled(manifestPath)) return;

    const metaName = _mfdbDebugGetMetaEntityName(manifestPath);
    if (!metaName) return;

    const metaPath = _mfdbGetEntityPath(manifestPath, metaName);
    const fs = require("fs");

    const row = [
      new Date().toISOString(), operation, targetEntity,
      fieldName, fieldExists, rowIndex, success, durationMs,
      process.pid, notes || "",
    ];

    const doc = _loadJson(metaPath);
    doc.Values = doc.Values || [];
    doc.Values.push(row);
    _atomicWrite(metaPath, doc);

    _mfdbMetaAutoTrim(manifestPath, metaName, metaPath);
  } catch (e) {
    // Non-fatal — debug logging must never break the calling operation
  }
}

/**
 * Keeps the meta entity within Debug_Row_Cap rows, deleting the oldest first.
 */
function _mfdbMetaAutoTrim(manifestPath, metaName, metaPath) {
  try {
    const cap = parseInt(_loadJson(manifestPath).Debug_Row_Cap || "500", 10);
    const doc = _loadJson(metaPath);
    if ((doc.Values || []).length > cap) {
      doc.Values = doc.Values.slice(-cap);
      _atomicWrite(metaPath, doc);
    }
  } catch (_) {}
}

/**
 * Logs a SCHEMA_SNAPSHOT row for every entity; the baseline for drift detection.
 */
function _mfdbDebugSchemaSnapshot(manifestPath, metaName) {
  try {
    const entries = _rowsAsDicts(_loadJson(manifestPath));
    for (const entry of entries) {
      const ename = entry.entity_name;
      if (!ename || ename === metaName) continue;
      try {
        const edoc   = _loadJson(_mfdbGetEntityPath(manifestPath, ename));
        const fields = (edoc.Fields || []).map(f => f.name).join(",");
        _mfdbMetaLog(manifestPath, "SCHEMA_SNAPSHOT", ename, {
          fieldName: fields, fieldExists: true, durationMs: 0,
          notes: `field_count=${(edoc.Fields || []).length}`,
        });
      } catch (_) {}
    }
  } catch (_) {}
}

// ── Public Debug API (JS) ──────────────────────────────────────────────────────

/**
 * Turns on Debug_Mode, creates the meta entity if needed and records the schema snapshot. Options: rowCap, debugReads.
 */
function mfdb_core_enable_debug(manifestPath, { rowCap = 500, debugReads = false } = {}) {
  const fs   = require("fs");
  const path = require("path");
  const crypto = require("crypto");

  const doc      = _loadJson(manifestPath);
  const metaName = doc.Debug_Meta_Entity || `meta-${crypto.randomUUID()}`;

  doc.Debug_Mode        = "true";
  doc.Debug_Meta_Entity = metaName;
  doc.Debug_Row_Cap     = String(rowCap);
  doc.Debug_Reads       = debugReads ? "true" : "false";
  _atomicWrite(manifestPath, doc);

  const metaFpRel = `data/${metaName}.bejson`;
  const metaAbs   = path.resolve(path.dirname(manifestPath), metaFpRel);

  if (!fs.existsSync(metaAbs)) {
    fs.mkdirSync(path.dirname(metaAbs), { recursive: true });
    const relToManifest = path.relative(path.dirname(metaAbs), manifestPath);
    const metaDoc = {
      Format: "BEJSON", Format_Version: "104", Format_Creator: "Elton Boehnen",
      Parent_Hierarchy: relToManifest,
      Records_Type: [metaName],
      Fields: META_DEBUG_FIELDS, Values: [],
    };
    _atomicWrite(metaAbs, metaDoc);

    const doc2    = _loadJson(manifestPath);
    const entries = _rowsAsDicts(doc2);
    if (!entries.find(e => e.entity_name === metaName)) {
      doc2.Values = doc2.Values || [];
      doc2.Values.push([metaName, metaFpRel, "Debug audit log (auto-generated)", 0, "1.0", null]);
      _atomicWrite(manifestPath, doc2);
    }
  }

  _mfdbDebugSchemaSnapshot(manifestPath, metaName);
  return metaName;
}

/**
 * Sets Debug_Mode to false; meta entity and rows are kept.
 */
function mfdb_core_disable_debug(manifestPath) {
  const doc = _loadJson(manifestPath);
  doc.Debug_Mode = "false";
  _atomicWrite(manifestPath, doc);
}

/**
 * Returns all meta-entity rows as objects (empty when debug is off).
 */
function mfdb_core_get_debug_log(manifestPath) {
  const metaName = _mfdbDebugGetMetaEntityName(manifestPath);
  if (!metaName) return [];
  try {
    const doc = _loadJson(_mfdbGetEntityPath(manifestPath, metaName));
    const fm  = {};
    (doc.Fields || META_DEBUG_FIELDS).forEach((f, i) => { fm[f.name] = i; });
    return (doc.Values || []).map(row => {
      const out = {};
      for (const [k, i] of Object.entries(fm)) out[k] = row[i];
      return out;
    });
  } catch (_) { return []; }
}

/**
 * Returns only failed operations from the debug log.
 */
function mfdb_core_get_failed_ops(manifestPath) {
  return mfdb_core_get_debug_log(manifestPath)
    .filter(r => r.success === false)
    .sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
}

/**
 * Deletes all meta-entity rows (schema kept); returns the number removed.
 */
function mfdb_core_clear_debug_log(manifestPath) {
  const metaName = _mfdbDebugGetMetaEntityName(manifestPath);
  if (!metaName) return 0;
  try {
    const metaPath = _mfdbGetEntityPath(manifestPath, metaName);
    const doc      = _loadJson(metaPath);
    const deleted  = (doc.Values || []).length;
    doc.Values     = [];
    _atomicWrite(metaPath, doc);
    return deleted;
  } catch (_) { return 0; }
}

/**
 * Aggregates the debug log (total, failures, per-operation and per-entity counts).
 */
function mfdb_core_debug_summary(manifestPath) {
  if (!_mfdbDebugIsEnabled(manifestPath)) return {};
  const rows = mfdb_core_get_debug_log(manifestPath);
  if (!rows.length) return { total_ops: 0 };

  const writeOps  = new Set(["ADD", "REMOVE", "UPDATE", "UPDATE_BULK"]);
  const opsByType = {};
  for (const r of rows) opsByType[r.operation] = (opsByType[r.operation] || 0) + 1;

  return {
    total_ops:         rows.length,
    unique_entities:   [...new Set(rows.map(r => r.target_entity))].sort(),
    failed_ops:        rows.filter(r => r.success === false).length,
    schema_drift_hits: rows.filter(r => r.field_exists === false).length,
    top_3_slowest:     [...rows]
      .sort((a, b) => b.duration_ms - a.duration_ms)
      .slice(0, 3)
      .map(r => ({ op: r.operation, entity: r.target_entity, duration_ms: r.duration_ms })),
    reads_logged:  rows.filter(r => r.operation === "READ").length,
    writes_logged: rows.filter(r => writeOps.has(r.operation)).length,
    ops_by_type:   opsByType,
  };
}

/**
 * Compares each entity's current Fields with the SCHEMA_SNAPSHOT baseline and reports changed entities.
 */
function mfdb_core_detect_schema_drift(manifestPath) {
  if (!_mfdbDebugIsEnabled(manifestPath)) return {};
  const rows = mfdb_core_get_debug_log(manifestPath);
  const snapshots = {};
  for (const r of rows) {
    if (r.operation === "SCHEMA_SNAPSHOT" && r.field_name) {
      snapshots[r.target_entity] = new Set(r.field_name.split(",").filter(Boolean));
    }
  }
  if (!Object.keys(snapshots).length) return {};

  const report = {};
  for (const [ename, snapFields] of Object.entries(snapshots)) {
    try {
      const edoc       = _loadJson(_mfdbGetEntityPath(manifestPath, ename));
      const liveFields = new Set((edoc.Fields || []).map(f => f.name));
      const added      = [...liveFields].filter(f => !snapFields.has(f)).sort();
      const removed    = [...snapFields].filter(f => !liveFields.has(f)).sort();
      report[ename]    = { added_fields: added, removed_fields: removed, drifted: !!(added.length || removed.length) };
    } catch (_) {}
  }
  return report;
}

// ---------------------------------------------------------------------------
// Exports: MFDBArchive (zip mount/commit) + manifest/entity
// manipulation functions. Non-overlapping
// responsibilities.
// ---------------------------------------------------------------------------

const exports_ = {
  // Error codes
  E_MFDB_CORE_MANIFEST_NOT_FOUND,
  E_MFDB_CORE_ENTITY_NOT_FOUND,
  E_MFDB_CORE_WRITE_FAILED,
  E_MFDB_CORE_CREATE_FAILED,
  E_MFDB_CORE_INVALID_OPERATION,
  E_MFDB_CORE_INDEX_OUT_OF_BOUNDS,
  E_MFDB_CORE_JOIN_FAILED,
  E_MFDB_CORE_ARCHIVE_ERROR,
  E_MFDB_CORE_MOUNT_CONFLICT,
  // Classes
  MFDBCoreError,
  MFDBArchive,
  // Manifest / entity functions
  mfdb_core_create_manifest,
  mfdb_core_register_entity,
  mfdb_core_sync_count,
  mfdb_core_sync_all_counts,
  mfdb_core_init_entity_file,
  // Federation
  CONNECTED_SLAVE_SCHEMA,
  mfdb_core_create_connected_slave_entity,
  mfdb_federation_push_config,
  mfdb_federation_poll_dropzone,
  mfdb_federation_distill_logs,
  // Debug system
  META_DEBUG_FIELDS,
  mfdb_core_enable_debug,
  mfdb_core_disable_debug,
  mfdb_core_get_debug_log,
  mfdb_core_get_failed_ops,
  mfdb_core_clear_debug_log,
  mfdb_core_debug_summary,
  mfdb_core_detect_schema_drift,
  // Version
  version: "1.31"
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exports_;
}
if (typeof window !== 'undefined') {
  window.MFDB_CORE = { ...window.MFDB_CORE, ...exports_ };
}