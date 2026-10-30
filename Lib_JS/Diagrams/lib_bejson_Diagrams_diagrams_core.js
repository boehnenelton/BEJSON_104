/**
 * Library:         lib_bejson_Diagrams_diagrams_core.js
 * Family:          Diagrams
 * Module Purpose:  JavaScript runtime core packaging, model serialization, and schema constants for the Diagrams family.
 * Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
 * Version:         1.2.0
 * Release_Version: 300
 * Date:            2026-10-30
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   4d9e2a1c-8b7f-4c56-9a0d-3f8e1b2a7c50
 */

'use strict';

const _isNode = (typeof require !== 'undefined');
const _core = _isNode ? require('../Core/lib_bejson_Core_bejson_core.js') : (window.BEJSON || {});
const _chunking = _isNode ? require('../Core/lib_bejson_Core_bejson_chunking.js') : (window.BEJSON_CHUNKING || {});
const { DiagramsError, DIAGRAMS_ERROR_CODES: E } = _isNode
  ? require('./lib_bejson_Diagrams_bejson_errors.js')
  : (window.DIAGRAMS_ERRORS || {});

const BOARD_BASE_FIELDS = [
  { name: 'shape_id',          type: 'string' },
  { name: 'shape_entity_name', type: 'string' },
  { name: 'shape_cx',          type: 'number' },
  { name: 'shape_cy',          type: 'number' },
  { name: 'shape_size_class',  type: 'string' },
  { name: 'shape_kind',        type: 'string' },
  { name: 'shape_parent_fk',   type: 'string' },
  { name: 'shape_collapsed',   type: 'boolean' },
];

const CONNECTOR_BASE_FIELDS = [
  { name: 'conn_id',      type: 'string' },
  { name: 'conn_from_fk', type: 'string' },
  { name: 'conn_to_fk',   type: 'string' },
  { name: 'conn_flow',    type: 'string' },
];

const TERRITORY_BASE_FIELDS = [
  { name: 'terr_id',    type: 'string' },
  { name: 'terr_kind',  type: 'string' },
  { name: 'terr_cx',    type: 'number' },
  { name: 'terr_cy',    type: 'number' },
  { name: 'terr_size',  type: 'number' },
  { name: 'terr_label', type: 'string' },
  { name: 'terr_color', type: 'string' },
];

const SHAPE_BASE_FIELDS = [
  { name: 'board_membership_fk', type: 'string' },
  { name: 'shape_label',         type: 'string' },
  { name: 'shape_color',         type: 'string' },
  { name: 'shape_font_color',    type: 'string' },
  { name: 'shape_text',          type: 'string' },
];

const KNOWN_SIZE_CLASSES = ['small', 'medium', 'large', 'huge'];
const KNOWN_SHAPE_KINDS = ['rect', 'circle'];
const KNOWN_FLOW_VALUES = ['forward', 'backward', 'bidirectional', 'none'];

const DIAGRAM_SCHEMA_TAG = 'BEJSON-Diagram-1';

const CHUNKED_104_FIELDS = [
  { name: 'File_Name',      type: 'string' },
  { name: 'File_Extension', type: 'string' },
  { name: 'File_Content',   type: 'string' },
  { name: 'File_Version',   type: 'string' },
  { name: 'File_Hash',      type: 'string' },
  { name: 'Relative_Path',  type: 'string' },
  { name: 'Is_Binary',      type: 'boolean' },
  { name: 'Is_Mounted',     type: 'boolean' },
];

function _cleanDocForJson(doc, ensureParentHierarchy = false) {
  const cleaned = {};
  for (const [k, v] of Object.entries(doc || {})) {
    if (!String(k).startsWith('_')) {
      cleaned[k] = v;
    }
  }
  if (ensureParentHierarchy && !('Parent_Hierarchy' in cleaned)) {
    cleaned.Parent_Hierarchy = '../104a.mfdb.bejson';
  }
  return cleaned;
}

function _hashContent(content) {
  if (_chunking && typeof _chunking.bejson_core_chunking_hash_file_bytes === 'function' && typeof Buffer !== 'undefined') {
    return _chunking.bejson_core_chunking_hash_file_bytes(Buffer.from(content, 'utf-8'));
  }
  return '';
}

function _makeChunkRow(fileName, relPath, doc, fileVersion = '1.0.0', isEntity = true) {
  const cleanDoc = _cleanDocForJson(doc, isEntity);
  const content = JSON.stringify(cleanDoc, null, 2);
  return [
    fileName,
    '.bejson',
    content,
    fileVersion,
    _hashContent(content),
    relPath,
    false,
    false,
  ];
}

function createMfdb132PackageFromModel(model, dbName) {
  const validator = _isNode
    ? require('./lib_bejson_Diagrams_diagrams_validator.js')
    : (window.DIAGRAMS_VALIDATOR || {});
  const valResult = validator.validateDiagramModel(model);
  if (!valResult.valid) {
    const msgs = valResult.errors.map(e => (typeof e === 'string' ? e : e.message)).join('; ');
    throw new DiagramsError(`Diagram validation failed: ${msgs}`, E.E_DIAGRAMS_VALIDATION_FAILED, valResult.errors);
  }

  const values = [
    _makeChunkRow('104a.mfdb.bejson', '104a.mfdb.bejson', model.manifest, '1.32', false),
    _makeChunkRow('board.bejson', 'data/board.bejson', model.boardDoc),
    _makeChunkRow('connector.bejson', 'data/connector.bejson', model.connectorDoc || {
      Format: 'BEJSON', Format_Version: '104', Format_Creator: 'Elton Boehnen',
      Parent_Hierarchy: '../104a.mfdb.bejson',
      Records_Type: ['Connector'], Fields: CONNECTOR_BASE_FIELDS, Values: [],
    }),
    _makeChunkRow('territory.bejson', 'data/territory.bejson', model.territoryDoc || {
      Format: 'BEJSON', Format_Version: '104', Format_Creator: 'Elton Boehnen',
      Parent_Hierarchy: '../104a.mfdb.bejson',
      Records_Type: ['Territory'], Fields: TERRITORY_BASE_FIELDS, Values: [],
    }),
  ];

  const shapeDocs = model.shapeDocs || {};
  const shapeDocsEntries = typeof shapeDocs.entries === 'function'
    ? Array.from(shapeDocs.entries())
    : Object.entries(shapeDocs);

  for (const [entityName, shapeDoc] of shapeDocsEntries) {
    const fname = `${String(entityName).toLowerCase()}.bejson`;
    values.push(_makeChunkRow(fname, `data/${fname}`, shapeDoc));
  }

  return {
    Format: 'BEJSON',
    Format_Version: '104a',
    Format_Creator: 'Elton Boehnen',
    Schema_Name: 'MFDB-132',
    Schema_Version: '1.32',
    Schema_Description: 'MFDB 1.32 single-file diagram package.',
    Chunk_Date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Session_Is_Mounted: false,
    Mount_Path: '',
    Package_Version: '1',
    MFDB_Version: String((model.manifest && model.manifest.MFDB_Version) || '1.32'),
    DB_Name: dbName,
    Package_Format: 'MFDB-Chunked-104a',
    Diagram_Schema: DIAGRAM_SCHEMA_TAG,
    Records_Type: ['MFDB-132'],
    Fields: CHUNKED_104_FIELDS,
    Values: values,
  };
}

function extractDiagramModelFromMfdb132(chunkDoc) {
  const fm = _core.bejson_core_get_field_map(chunkDoc);
  const relIdx = fm['Relative_Path'];
  const contentIdx = fm['File_Content'];
  if (relIdx === undefined || contentIdx === undefined) {
    throw new DiagramsError(
      'Corrupted MFDB-132 diagram package: missing Relative_Path or File_Content field.',
      E.E_DIAGRAMS_IMPORT_FAILED
    );
  }

  let manifest = null;
  let boardDoc = null;
  let connectorDoc = null;
  let territoryDoc = null;
  const shapeDocs = new Map();

  for (const row of chunkDoc.Values || []) {
    const relPath = row[relIdx];
    const content = row[contentIdx];
    if (!relPath || !content) continue;

    const doc = JSON.parse(content);
    if (relPath === '104a.mfdb.bejson') {
      manifest = doc;
    } else if (relPath.includes('board.bejson')) {
      boardDoc = doc;
    } else if (relPath.includes('connector.bejson')) {
      connectorDoc = doc;
    } else if (relPath.includes('territory.bejson')) {
      territoryDoc = doc;
    } else if (doc.Records_Type && doc.Records_Type[0] && String(doc.Records_Type[0]).startsWith('Shape_')) {
      shapeDocs.set(doc.Records_Type[0], doc);
    }
  }

  if (!manifest || !boardDoc) {
    throw new DiagramsError(
      'Corrupted or incomplete MFDB-132 diagram package: manifest or board missing.',
      E.E_DIAGRAMS_IMPORT_FAILED
    );
  }

  const model = {
    manifest,
    boardDoc,
    connectorDoc: connectorDoc || {
      Format: 'BEJSON', Format_Version: '104', Format_Creator: 'Elton Boehnen',
      Parent_Hierarchy: '../104a.mfdb.bejson',
      Records_Type: ['Connector'], Fields: CONNECTOR_BASE_FIELDS, Values: [],
    },
    territoryDoc: territoryDoc || {
      Format: 'BEJSON', Format_Version: '104', Format_Creator: 'Elton Boehnen',
      Parent_Hierarchy: '../104a.mfdb.bejson',
      Records_Type: ['Territory'], Fields: TERRITORY_BASE_FIELDS, Values: [],
    },
    shapeDocs,
  };

  const validator = _isNode
    ? require('./lib_bejson_Diagrams_diagrams_validator.js')
    : (window.DIAGRAMS_VALIDATOR || {});
  const valResult = validator.validateDiagramModel(model);
  if (!valResult.valid) {
    const msgs = valResult.errors.map(e => (typeof e === 'string' ? e : e.message)).join('; ');
    throw new DiagramsError(`Imported package validation failed: ${msgs}`, E.E_DIAGRAMS_VALIDATION_FAILED, valResult.errors);
  }

  return model;
}

function diagrams_core_find_row_by_field(doc, fieldName, value) {
  const idx = _core.bejson_core_get_field_index(doc, fieldName);
  if (idx < 0) return null;
  for (const row of doc.Values || []) {
    if (row[idx] === value) return row;
  }
  return null;
}

const exports_ = {
  BOARD_BASE_FIELDS,
  CONNECTOR_BASE_FIELDS,
  TERRITORY_BASE_FIELDS,
  SHAPE_BASE_FIELDS,
  KNOWN_SIZE_CLASSES,
  KNOWN_SHAPE_KINDS,
  KNOWN_FLOW_VALUES,
  DIAGRAM_SCHEMA_TAG,
  CHUNKED_104_FIELDS,
  createMfdb132PackageFromModel,
  extractDiagramModelFromMfdb132,
  diagrams_core_create_mfdb132_package_from_model: createMfdb132PackageFromModel,
  diagrams_core_extract_diagram_model_from_mfdb132: extractDiagramModelFromMfdb132,
  diagrams_core_find_row_by_field,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exports_;
}
if (typeof window !== 'undefined') {
  window.DIAGRAMS_CORE = exports_;
}
