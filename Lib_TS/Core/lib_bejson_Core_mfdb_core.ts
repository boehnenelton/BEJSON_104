/**
 * Library:         lib_bejson_Core_mfdb_core.ts
 * Family:          Core
 * Module Purpose:  MFDB orchestrator: createManifest, register/unregisterEntity, syncRecordCount, plus federation (slave entity, config push, drop-zone polling).
 * Architecture:    MFDB (a database architecture layered on BEJSON, not a BEJSON format version): one BEJSON 104a manifest (104a.mfdb.bejson, Records_Type ["mfdb"]) registers many BEJSON 104 entity files, one entity per file, dense records, each with Parent_Hierarchy pointing back to the manifest. It is not 104db and uses no null-padding.
 * Format_Scope:    MFDB only (104a manifest + 104 entity files; NOT 104db)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         2.2.4
 * Release_Version: 300
 * Date:            2026-10-02
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   9185ec17-8a9a-4f59-85cd-a1b0e9f59ccf
 */

import {
  BEJSONDocument,
  BEJSONField,
  BEJSONValue,
  MFDBManifestRecord,
  MFDBDatabaseMeta,
  MFDBCoreError,
  MFDB_CORE_CODES as E,
} from "./lib_bejson_Core_bejson_types";
import { decodeManifestRecords } from "./lib_bejson_Core_mfdb_validators";
import {
  appendRecord,
  deleteRecord,
  getFieldIndex,
  setFieldValue,
  createEmpty104a,
  createEmpty104,
} from "./lib_bejson_Core_bejson_core";

// ---------------------------------------------------------------------------
// MFDBArchive Interface (v1.3
// ---------------------------------------------------------------------------

/**
 * Handles .mfdb.zip packaging and virtual mounting using File System Access API.
 */
export interface MFDBArchiveInterface {
  /**
   * Mounts a .mfdb.zip file into a FileSystemDirectoryHandle.
   */
  mount(zipFile: File | Blob, dirHandle: any): Promise<string>;

  /**
   * Repacks a FileSystemDirectoryHandle back into a .mfdb.zip Blob.
   */
  commit(dirHandle: any): Promise<Blob>;
}

// ---------------------------------------------------------------------------
// Manifest factory
// ---------------------------------------------------------------------------

export type NetworkRole = "Master" | "Slave" | "Standalone";

export interface CreateManifestOptions extends MFDBDatabaseMeta {
  includeOptionalFields?: boolean;
  network_role?: NetworkRole;   // "Master" | "Slave" | "Standalone" (default)
}

/**
 * Creates an MFDB manifest document: a BEJSON 104a document (Records_Type ["mfdb"]) with MFDB_Version, DB_Name, Network_Role and other 104a headers. MFDB is a layer of this 104a manifest + 104 entity files -- not a format version, not 104db.
 */
export function createManifest(opts: CreateManifestOptions): BEJSONDocument {
  if (!opts.db_name || opts.db_name.trim() === "") {
    throw new MFDBCoreError(E.MISSING_DB_NAME, "DB_Name is required when creating a manifest.");
  }

  const includeOptional = opts.includeOptionalFields !== false;
  const networkRole: NetworkRole = opts.network_role ?? "Standalone";

  const fields: BEJSONField[] = [
    { name: "entity_name", type: "string" },
    { name: "file_path", type: "string" },
  ];
  if (includeOptional) {
    fields.push(
      { name: "description", type: "string" },
      { name: "record_count", type: "integer" },
      { name: "schema_version", type: "string" },
      { name: "primary_key", type: "string" }
    );
  }

  const customHeaders: Record<string, string> = {
    MFDB_Version:  opts.mfdb_version ?? "1.31",
    Network_Role:  networkRole,
    DB_Name:       opts.db_name,
  };
  if (opts.db_description) customHeaders["DB_Description"] = opts.db_description;
  if (opts.schema_version) customHeaders["Schema_Version"] = opts.schema_version;
  if (opts.author)         customHeaders["Author"]         = opts.author;
  if (opts.created_at)     customHeaders["Created_At"]     = opts.created_at;

  return createEmpty104a("mfdb", fields, customHeaders);
}

// ---------------------------------------------------------------------------
// Entity registration
// ---------------------------------------------------------------------------

/**
 * Returns a manifest with an entity row added (entity_name, file_path, record_count, ...).
 */
export function registerEntity(
  manifest: BEJSONDocument,
  record: MFDBManifestRecord
): BEJSONDocument {
  _assertManifest(manifest);

  const existing = decodeManifestRecords(manifest);
  if (existing.some((r) => r.entity_name === record.entity_name)) {
    throw new MFDBCoreError(
      E.DUPLICATE_ENTITY_NAME,
      "Entity \"" + record.entity_name + "\" is already registered."
    );
  }

  const fieldNames = manifest.Fields.map((f) => f.name);
  const row: BEJSONValue[] = fieldNames.map((name) => {
    switch (name) {
      case "entity_name": return record.entity_name;
      case "file_path": return record.file_path;
      case "description": return record.description ?? null;
      case "record_count": return record.record_count ?? null;
      case "schema_version": return record.schema_version ?? null;
      case "primary_key": return record.primary_key ?? null;
      default: return null;
    }
  });

  return appendRecord(manifest, row);
}

/**
 * Returns a manifest with an entity row removed (does not delete the entity file).
 */
export function unregisterEntity(
  manifest: BEJSONDocument,
  entityName: string
): BEJSONDocument {
  _assertManifest(manifest);
  const idx = _findEntityIndex(manifest, entityName);
  return deleteRecord(manifest, idx);
}

/**
 * Returns a manifest whose record_count for one entity matches the supplied real row count.
 */
export function syncRecordCount(
  manifest: BEJSONDocument,
  entityName: string,
  count: number
): BEJSONDocument {
  _assertManifest(manifest);
  const idx = _findEntityIndex(manifest, entityName);

  try {
    getFieldIndex(manifest, "record_count");
  } catch {
    throw new MFDBCoreError(
      E.RECORD_COUNT_SYNC_FAILED,
      "Manifest lacks \"record_count\" field."
    );
  }

  return setFieldValue(manifest, idx, "record_count", count);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Throws if the document is not an MFDB manifest (104a, Records_Type ["mfdb"]).
 */
function _assertManifest(doc: BEJSONDocument): void {
  if (!doc) {
    throw new MFDBCoreError(E.NULL_MANIFEST, "Manifest is null or undefined.");
  }
}

/**
 * Row index of an entity in the manifest; -1 if absent.
 */
function _findEntityIndex(manifest: BEJSONDocument, entityName: string): number {
  const enIdx = getFieldIndex(manifest, "entity_name");
  for (let i = 0; i < manifest.Values.length; i++) {
    if (manifest.Values[i][enIdx] === entityName) return i;
  }
  throw new MFDBCoreError(
    E.ENTITY_NOT_IN_MANIFEST,
    "Entity \"" + entityName + "\" not found."
  );
}

// ---------------------------------------------------------------------------
// Federated Master / Slave node system
// ---------------------------------------------------------------------------
// Network_Role is emitted by createManifest. This block provides the full
// runtime federation protocol. Node.js I/O functions (push/poll/distill)
// require the fs module — they throw at call-time if run in a browser.

export interface ConnectedSlaveSchema {
  slave_id:           string;
  label:              string;
  url:                string;
  role:               string;
  status:             string;
  supported_entities: string[];
}

export const CONNECTED_SLAVE_SCHEMA: BEJSONField[] = [
  { name: "slave_id",           type: "string" },
  { name: "label",              type: "string" },
  { name: "url",                type: "string" },
  { name: "role",               type: "string" },
  { name: "status",             type: "string" },
  { name: "supported_entities", type: "array"  },
];

/**
 * Federation: on a Master manifest registers a ConnectedSlave entity; throws if the node is not a Master.
 */
/**
 * Register a ConnectedSlave entity in a Master manifest.
 * Throws if the manifest's Network_Role !== "Master".
 */
export function createConnectedSlaveEntity(manifest: BEJSONDocument): BEJSONDocument {
  const role = (manifest as any)["Network_Role"] ?? "";
  if (role !== "Master") {
    throw new MFDBCoreError(
      E.INVALID_OPERATION ?? "INVALID_OPERATION",
      `ConnectedSlave may only be created on a Master node. Got: '${role}'`
    );
  }
  return registerEntity(manifest, {
    entity_name:    "ConnectedSlave",
    file_path:      "data/connectedslave.bejson",
    description:    "Registry of Slave nodes connected to this Master.",
    primary_key:    "slave_id",
    record_count:   0,
    schema_version: "1.0",
  });
}

export interface FederationPushResult { success: boolean; error?: string; }
export interface FederationPollOptions { pollInterval?: number; timeout?: number; }
export interface FederationDistillOptions { maxRows?: number; }

/**
 * Federation: Master -> Slave config push; atomically drops a BEJSON 104a config document into the slave's drop-zone path (Node).
 */
/**
 * Master → Slave atomic drop-zone push (Node.js only).
 * Writes configDoc to slaveTargetPath via same-dir temp + rename.
 */
export function federationPushConfig(
  configDoc: Record<string, unknown>,
  slaveTargetPath: string
): FederationPushResult {
  const fs   = require("fs");
  const path = require("path");
  const dest    = path.resolve(slaveTargetPath);
  const destDir = path.dirname(dest);
  fs.mkdirSync(destDir, { recursive: true });
  const tempPath = `${dest}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(configDoc, null, 2), "utf8");
    fs.renameSync(tempPath, dest);
    return { success: true };
  } catch (err: any) {
    if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch (_) {}
    return { success: false, error: err.message };
  }
}

/**
 * Federation: polls a drop-zone directory and calls the callback for each new document.
 */
/**
 * Slave: poll a local dropzone for incoming Master config docs (Node.js only).
 * Each .bejson file found is parsed, passed to callback, then removed.
 * Returns a getter that returns the count of configs processed so far.
 */
export function federationPollDropzone(
  dropzoneDir: string,
  callback: (filePath: string, doc: Record<string, unknown>) => void,
  { pollInterval = 2000, timeout = 60000 }: FederationPollOptions = {}
): () => number {
  const fs   = require("fs");
  const path = require("path");
  fs.mkdirSync(dropzoneDir, { recursive: true });

  let processed = 0;
  const deadline = Date.now() + timeout;

  const tick = () => {
    if (Date.now() >= deadline) return;
    const files: string[] = fs.readdirSync(dropzoneDir)
      .filter((f: string) => f.endsWith(".bejson"))
      .sort()
      .map((f: string) => path.join(dropzoneDir, f));

    for (const fpath of files) {
      try {
        const doc = JSON.parse(fs.readFileSync(fpath, "utf8"));
        callback(fpath, doc);
        fs.unlinkSync(fpath);
        processed++;
      } catch (e: any) {
        console.warn(`[MFDB_FEDERATION] poll_dropzone skipped ${fpath}: ${e.message}`);
      }
    }
    setTimeout(tick, pollInterval);
  };

  tick();
  return () => processed;
}

/**
 * Federation: compacts a slave entity's log rows and delivers them to the master's poll directory.
 */
/**
 * Slave → Master one-way push (log distillation, Node.js only).
 * Overflow rows are pushed as a distilled summary to masterPollDir;
 * the local entity is truncated to maxRows.
 */
export function federationDistillLogs(
  slaveManifestPath: string,
  entityName: string,
  masterPollDir: string,
  { maxRows = 100 }: FederationDistillOptions = {}
): boolean {
  const fs   = require("fs");
  const path = require("path");

  const manifestDoc = JSON.parse(fs.readFileSync(slaveManifestPath, "utf8")) as BEJSONDocument;
  const records     = decodeManifestRecords(manifestDoc);
  const entry       = records.find(r => r.entity_name === entityName);
  if (!entry) {
    throw new MFDBCoreError(E.ENTITY_NOT_IN_MANIFEST, `Entity '${entityName}' not found.`);
  }

  const entityPath = path.resolve(path.dirname(slaveManifestPath), entry.file_path);
  const entityDoc  = JSON.parse(fs.readFileSync(entityPath, "utf8")) as BEJSONDocument;
  const rows       = entityDoc.Values ?? [];

  if (rows.length <= maxRows) return true;

  const overflow = rows.slice(0, rows.length - maxRows);
  const kept     = rows.slice(rows.length - maxRows);

  fs.mkdirSync(masterPollDir, { recursive: true });
  const ts   = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
  const dest = path.join(masterPollDir, `distilled_${entityName}_${ts}.bejson`);

  const summaryDoc = {
    Format: "BEJSON", Format_Version: "104a", Format_Creator: "Elton Boehnen",
    Distill_Source: entityName,
    Distill_Timestamp: new Date().toISOString(),
    Records_Type: ["DistilledLog"],
    Fields: entityDoc.Fields,
    Values: overflow,
  };

  const pushResult = federationPushConfig(summaryDoc, dest);
  if (!pushResult.success) return false;

  entityDoc.Values = kept;
  const tempEntity = entityPath + ".tmp." + Date.now();
  fs.writeFileSync(tempEntity, JSON.stringify(entityDoc, null, 2), "utf8");
  fs.renameSync(tempEntity, entityPath);

  const updatedManifest = syncRecordCount(manifestDoc, entityName, kept.length);
  const tempManifest    = slaveManifestPath + ".tmp." + Date.now();
  fs.writeFileSync(tempManifest, JSON.stringify(updatedManifest, null, 2), "utf8");
  fs.renameSync(tempManifest, slaveManifestPath);

  return true;
}

// ── Meta-GUID Debug Entity System (TypeScript) ─────────────────────────────────
// Full typed port of the Python/JS debug block. Node.js only — all functions
// that touch the filesystem silently no-op outside Node.

export const META_DEBUG_FIELDS: BEJSONField[] = [
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

export interface MetaDebugRow {
  timestamp:     string;
  operation:     string;
  target_entity: string;
  field_name:    string | null;
  field_exists:  boolean | null;
  row_index:     number | null;
  success:       boolean;
  duration_ms:   number;
  pid:           number;
  notes:         string;
}

export interface MetaLogOptions {
  fieldName?:  string | null;
  fieldExists?: boolean | null;
  rowIndex?:   number | null;
  success?:    boolean;
  durationMs?: number;
  notes?:      string;
  readsOnly?:  boolean;
}

export interface DebugSummary {
  total_ops:         number;
  unique_entities:   string[];
  failed_ops:        number;
  schema_drift_hits: number;
  top_3_slowest:     { op: string; entity: string; duration_ms: number }[];
  reads_logged:      number;
  writes_logged:     number;
  ops_by_type:       Record<string, number>;
}

export interface SchemaDriftEntry {
  added_fields:   string[];
  removed_fields: string[];
  drifted:        boolean;
}

export interface EnableDebugOptions {
  rowCap?:     number;
  debugReads?: boolean;
}

/**
 * True when manifest header Debug_Mode is 'true' (debug state lives in 104a manifest headers).
 */
function _debugIsEnabled(manifestPath: string): boolean {
  try {
    const doc = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return String(doc.Debug_Mode ?? "false").toLowerCase() === "true";
  } catch { return false; }
}

/**
 * True when Debug_Reads is also 'true'.
 */
function _debugReadsEnabled(manifestPath: string): boolean {
  try {
    const doc = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return String(doc.Debug_Reads ?? "false").toLowerCase() === "true";
  } catch { return false; }
}

/**
 * Name of the debug/meta entity from the manifest, or null.
 */
function _debugGetMetaName(manifestPath: string): string | null {
  try {
    const doc = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return doc.Debug_Meta_Entity || null;
  } catch { return null; }
}

/**
 * Absolute path of an entity file from its manifest row.
 */
function _debugGetEntityPath(manifestPath: string, entityName: string): string {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BEJSONDocument;
  const records  = decodeManifestRecords(manifest);
  const entry    = records.find(r => r.entity_name === entityName);
  if (!entry) throw new MFDBCoreError(E.ENTITY_NOT_IN_MANIFEST, `Entity '${entityName}' not found`);
  return path.resolve(path.dirname(manifestPath), entry.file_path);
}

/**
 * Atomic file write used by the debug helpers.
 */
function _debugAtomicWrite(filePath: string, doc: unknown): void {
  const temp = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(temp, JSON.stringify(doc, null, 2), "utf8");
  fs.renameSync(temp, filePath);
}

/**
 * Keeps the meta entity within Debug_Row_Cap rows, oldest deleted first.
 */
function _metaAutoTrim(manifestPath: string, metaName: string, metaPath: string): void {
  try {
    const cap  = parseInt(JSON.parse(fs.readFileSync(manifestPath, "utf8")).Debug_Row_Cap ?? "500", 10);
    const doc  = JSON.parse(fs.readFileSync(metaPath, "utf8")) as BEJSONDocument;
    if ((doc.Values ?? []).length > cap) {
      doc.Values = doc.Values!.slice(-cap);
      _debugAtomicWrite(metaPath, doc);
    }
  } catch { /* non-fatal */ }
}

/**
 * Logs a SCHEMA_SNAPSHOT row per entity (baseline for drift detection).
 */
function _metaSchemaSnapshot(manifestPath: string, metaName: string): void {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BEJSONDocument;
    const records  = decodeManifestRecords(manifest);
    for (const rec of records) {
      const ename = rec.entity_name;
      if (!ename || ename === metaName) continue;
      try {
        const edoc   = JSON.parse(fs.readFileSync(_debugGetEntityPath(manifestPath, ename), "utf8")) as BEJSONDocument;
        const fields = (edoc.Fields ?? []).map((f: BEJSONField) => f.name).join(",");
        _metaLog(manifestPath, "SCHEMA_SNAPSHOT", ename, {
          fieldName: fields, fieldExists: true, durationMs: 0,
          notes: `field_count=${(edoc.Fields ?? []).length}`,
        });
      } catch { /* skip unreadable entities */ }
    }
  } catch { /* non-fatal */ }
}

/**
 * Appends one operation record to the debug meta entity (itself a normal 104 entity file).
 */
export function _metaLog(
  manifestPath: string,
  operation:    string,
  targetEntity: string,
  opts: MetaLogOptions = {}
): void {
  const {
    fieldName = null, fieldExists = null, rowIndex = null,
    success = true, durationMs = 0, notes = "", readsOnly = false,
  } = opts;

  try {
    if (!_debugIsEnabled(manifestPath)) return;
    if (readsOnly && !_debugReadsEnabled(manifestPath)) return;

    const metaName = _debugGetMetaName(manifestPath);
    if (!metaName) return;

    const metaPath = _debugGetEntityPath(manifestPath, metaName);
    const doc      = JSON.parse(fs.readFileSync(metaPath, "utf8")) as BEJSONDocument;
    doc.Values     = doc.Values ?? [];
    doc.Values.push([
      new Date().toISOString(), operation, targetEntity,
      fieldName, fieldExists, rowIndex, success, durationMs,
      process.pid, notes ?? "",
    ]);
    _debugAtomicWrite(metaPath, doc);
    _metaAutoTrim(manifestPath, metaName, metaPath);
  } catch { /* debug must never break the caller */ }
}

// ── Public Debug API (TS) ──────────────────────────────────────────────────────

/**
 * Turns on Debug_Mode, creates the meta entity if needed and records the schema snapshot.
 */
export function enableDebug(
  manifestPath: string,
  { rowCap = 500, debugReads = false }: EnableDebugOptions = {}
): string {
  const crypto = require("crypto");
  const doc    = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BEJSONDocument;

  const metaName: string = (doc as any).Debug_Meta_Entity || `meta-${crypto.randomUUID()}`;
  (doc as any).Debug_Mode        = "true";
  (doc as any).Debug_Meta_Entity = metaName;
  (doc as any).Debug_Row_Cap     = String(rowCap);
  (doc as any).Debug_Reads       = debugReads ? "true" : "false";
  _debugAtomicWrite(manifestPath, doc);

  const metaFpRel = `data/${metaName}.bejson`;
  const metaAbs   = path.resolve(path.dirname(manifestPath), metaFpRel);

  if (!fs.existsSync(metaAbs)) {
    fs.mkdirSync(path.dirname(metaAbs), { recursive: true });
    const metaDoc = {
      Format: "BEJSON", Format_Version: "104", Format_Creator: "Elton Boehnen",
      Parent_Hierarchy: path.relative(path.dirname(metaAbs), manifestPath),
      Records_Type: [metaName],
      Fields: META_DEBUG_FIELDS, Values: [],
    };
    _debugAtomicWrite(metaAbs, metaDoc);

    const doc2    = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BEJSONDocument;
    const records = decodeManifestRecords(doc2);
    if (!records.find(r => r.entity_name === metaName)) {
      doc2.Values = doc2.Values ?? [];
      doc2.Values.push([metaName, metaFpRel, "Debug audit log (auto-generated)", 0, "1.0", null]);
      _debugAtomicWrite(manifestPath, doc2);
    }
  }

  _metaSchemaSnapshot(manifestPath, metaName);
  return metaName;
}

/**
 * Sets Debug_Mode to false; meta entity and rows are kept.
 */
export function disableDebug(manifestPath: string): void {
  const doc = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BEJSONDocument;
  (doc as any).Debug_Mode = "false";
  _debugAtomicWrite(manifestPath, doc);
}

/**
 * All meta-entity rows as typed objects (empty when debug is off).
 */
export function getDebugLog(manifestPath: string): MetaDebugRow[] {
  const metaName = _debugGetMetaName(manifestPath);
  if (!metaName) return [];
  try {
    const doc = JSON.parse(fs.readFileSync(_debugGetEntityPath(manifestPath, metaName), "utf8")) as BEJSONDocument;
    const fm: Record<string, number> = {};
    (doc.Fields ?? META_DEBUG_FIELDS).forEach((f: BEJSONField, i: number) => { fm[f.name] = i; });
    return (doc.Values ?? []).map((row: unknown[]) => {
      const out: Record<string, unknown> = {};
      for (const [k, i] of Object.entries(fm)) out[k] = row[i];
      return out as MetaDebugRow;
    });
  } catch { return []; }
}

/**
 * Only failed operations from the debug log.
 */
export function getFailedOps(manifestPath: string): MetaDebugRow[] {
  return getDebugLog(manifestPath)
    .filter(r => r.success === false)
    .sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
}

/**
 * Deletes all meta-entity rows; returns the number removed.
 */
export function clearDebugLog(manifestPath: string): number {
  const metaName = _debugGetMetaName(manifestPath);
  if (!metaName) return 0;
  try {
    const metaPath = _debugGetEntityPath(manifestPath, metaName);
    const doc      = JSON.parse(fs.readFileSync(metaPath, "utf8")) as BEJSONDocument;
    const deleted  = (doc.Values ?? []).length;
    doc.Values     = [];
    _debugAtomicWrite(metaPath, doc);
    return deleted;
  } catch { return 0; }
}

/**
 * Aggregates the debug log (total, failures, per-operation and per-entity counts).
 */
export function debugSummary(manifestPath: string): DebugSummary | Record<string, never> {
  if (!_debugIsEnabled(manifestPath)) return {};
  const rows = getDebugLog(manifestPath);
  if (!rows.length) return { total_ops: 0 } as unknown as DebugSummary;

  const writeOps  = new Set(["ADD", "REMOVE", "UPDATE", "UPDATE_BULK"]);
  const opsByType: Record<string, number> = {};
  for (const r of rows) opsByType[r.operation] = (opsByType[r.operation] ?? 0) + 1;

  return {
    total_ops:         rows.length,
    unique_entities:   [...new Set(rows.map(r => r.target_entity))].sort(),
    failed_ops:        rows.filter(r => r.success === false).length,
    schema_drift_hits: rows.filter(r => r.field_exists === false).length,
    top_3_slowest:     [...rows]
      .sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 3)
      .map(r => ({ op: r.operation, entity: r.target_entity, duration_ms: r.duration_ms })),
    reads_logged:  rows.filter(r => r.operation === "READ").length,
    writes_logged: rows.filter(r => writeOps.has(r.operation)).length,
    ops_by_type:   opsByType,
  };
}

/**
 * Compares each entity's current Fields with the SCHEMA_SNAPSHOT baseline and reports changed entities.
 */
export function detectSchemaDrift(manifestPath: string): Record<string, SchemaDriftEntry> {
  if (!_debugIsEnabled(manifestPath)) return {};
  const rows = getDebugLog(manifestPath);
  const snapshots: Record<string, Set<string>> = {};
  for (const r of rows) {
    if (r.operation === "SCHEMA_SNAPSHOT" && r.field_name) {
      snapshots[r.target_entity] = new Set(r.field_name.split(",").filter(Boolean));
    }
  }
  if (!Object.keys(snapshots).length) return {};

  const report: Record<string, SchemaDriftEntry> = {};
  for (const [ename, snapFields] of Object.entries(snapshots)) {
    try {
      const edoc       = JSON.parse(fs.readFileSync(_debugGetEntityPath(manifestPath, ename), "utf8")) as BEJSONDocument;
      const liveFields = new Set((edoc.Fields ?? []).map((f: BEJSONField) => f.name));
      const added      = [...liveFields].filter(f => !snapFields.has(f)).sort();
      const removed    = [...snapFields].filter(f => !liveFields.has(f)).sort();
      report[ename]    = { added_fields: added, removed_fields: removed, drifted: !!(added.length || removed.length) };
    } catch { /* skip */ }
  }
  return report;
}