/**
 * Library:         lib_bejson_Diagrams_diagrams_validator.js
 * Family:          Diagrams
 * Module Purpose:  JavaScript runtime diagram validator and auto-remediator for the Diagrams family.
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         1.2.0
 * Release_Version: 300
 * Date:            2026-10-30
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   5c8d3e2a-1f7b-40a9-b6c8-2e9f1a7d4b60
 */

'use strict';

const _isNode = (typeof require !== 'undefined');
const _core = _isNode ? require('../Core/lib_bejson_Core_bejson_core.js') : (window.BEJSON || {});
const _validator = _isNode ? require('../Core/lib_bejson_Core_bejson_validator.js') : (window.BEJSON_VALIDATOR || {});
const _mfdbValidator = _isNode ? require('../Core/lib_bejson_Core_mfdb_validator.js') : (window.MFDB_VALIDATOR || {});
const { DIAGRAMS_ERROR_CODES: E } = _isNode
  ? require('./lib_bejson_Diagrams_bejson_errors.js')
  : (window.DIAGRAMS_ERRORS || {});

function _makeResult() {
  return { valid: true, errors: [], warnings: [] };
}

function _emitError(r, code, message, field, recordIndex) {
  r.valid = false;
  const e = { code, message };
  if (field !== undefined) e.field = field;
  if (recordIndex !== undefined) e.recordIndex = recordIndex;
  r.errors.push(e);
}

function _emitWarning(r, code, message, field, recordIndex) {
  const w = { code, message };
  if (field !== undefined) w.field = field;
  if (recordIndex !== undefined) w.recordIndex = recordIndex;
  r.warnings.push(w);
}

function _validateBejsonDoc(doc, label, r) {
  if (!doc || typeof doc !== 'object') {
    _emitError(r, E.E_DIAGRAMS_MISSING_ENTITY, `${label} is missing.`);
    return false;
  }
  const clean = {};
  for (const [k, v] of Object.entries(doc)) {
    if (!String(k).startsWith('_')) clean[k] = v;
  }
  if (_validator && typeof _validator.bejson_validator_validate_string === 'function') {
    const ok = _validator.bejson_validator_validate_string(JSON.stringify(clean));
    if (!ok) {
      const errs = typeof _validator.bejson_validator_get_errors === 'function'
        ? _validator.bejson_validator_get_errors()
        : [`${label} failed BEJSON structural validation.`];
      for (const msg of errs) {
        _emitError(r, E.E_DIAGRAMS_VALIDATION_FAILED, `[${label}] ${msg}`);
      }
      return false;
    }
  }
  return true;
}

function validateDiagramModel(model) {
  const r = _makeResult();
  if (!model || typeof model !== 'object') {
    _emitError(r, E.E_DIAGRAMS_VALIDATION_FAILED, 'DiagramModel must be an object.');
    return r;
  }

  _validateBejsonDoc(model.manifest, 'Manifest', r);
  _validateBejsonDoc(model.boardDoc, 'Board Entity', r);
  if (model.connectorDoc) _validateBejsonDoc(model.connectorDoc, 'Connector Entity', r);
  if (model.territoryDoc) _validateBejsonDoc(model.territoryDoc, 'Territory Entity', r);

  const boardDoc = model.boardDoc;
  if (!boardDoc) return r;
  const bFm = _core.bejson_core_get_field_map(boardDoc);
  const shapeIdIdx = bFm['shape_id'];
  const parentFkIdx = bFm['shape_parent_fk'];
  const entityNameIdx = bFm['shape_entity_name'];
  const sizeClassIdx = bFm['shape_size_class'];

  if (shapeIdIdx === undefined || entityNameIdx === undefined) {
    _emitError(r, E.E_DIAGRAMS_MISSING_FIELD, 'Board entity missing required shape_id or shape_entity_name field.');
    return r;
  }

  const shapeIds = new Set();
  const parentMap = new Map();
  const knownSizes = new Set(['small', 'medium', 'large', 'huge']);
  const shapeDocs = model.shapeDocs || {};

  for (let i = 0; i < (boardDoc.Values || []).length; i++) {
    const row = boardDoc.Values[i];
    const sid = String(row[shapeIdIdx]);
    const pid = parentFkIdx !== undefined && row[parentFkIdx] ? String(row[parentFkIdx]) : null;
    const ename = String(row[entityNameIdx]);
    const sc = sizeClassIdx !== undefined && row[sizeClassIdx] ? String(row[sizeClassIdx]) : null;

    if (shapeIds.has(sid)) {
      _emitError(r, E.E_DIAGRAMS_DUPLICATE_ID, `Duplicate shape_id '${sid}' in Board registry.`, 'shape_id', i);
    }
    shapeIds.add(sid);

    if (sc && !knownSizes.has(sc)) {
      _emitWarning(r, E.E_DIAGRAMS_INVALID_SIZE_CLASS, `shape_size_class '${sc}' not in known set.`, 'shape_size_class', i);
    }

    if (pid) {
      parentMap.set(sid, pid);
    }

    const shapeDoc = typeof shapeDocs.get === 'function' ? shapeDocs.get(ename) : shapeDocs[ename];
    if (!shapeDoc) {
      _emitError(r, E.E_DIAGRAMS_SHAPE_NOT_FOUND, `Shape entity '${ename}' for shape_id '${sid}' is missing.`, 'shape_entity_name', i);
    } else {
      const sFm = _core.bejson_core_get_field_map(shapeDoc);
      const bmfkIdx = sFm['board_membership_fk'];
      if (bmfkIdx === undefined) {
        _emitError(r, E.E_DIAGRAMS_MISSING_FIELD, `Shape entity '${ename}' missing required board_membership_fk.`);
      } else if (!shapeDoc.Values || !shapeDoc.Values[0] || shapeDoc.Values[0][bmfkIdx] !== sid) {
        _emitError(r, E.E_DIAGRAMS_FK_UNRESOLVED, `Shape entity '${ename}' board_membership_fk does not match Board shape_id '${sid}'.`);
      }
    }
  }

  for (const [sid, pid] of parentMap.entries()) {
    if (!shapeIds.has(pid)) {
      _emitError(r, E.E_DIAGRAMS_FK_UNRESOLVED, `Shape '${sid}' references non-existent parent shape '${pid}'.`);
    }
  }

  for (const startId of parentMap.keys()) {
    let curr = startId;
    const visited = new Set([curr]);
    while (parentMap.has(curr)) {
      curr = parentMap.get(curr);
      if (visited.has(curr)) {
        _emitError(r, E.E_DIAGRAMS_CIRCULAR_HIERARCHY, `Circular parent hierarchy detected involving shape '${curr}'.`);
        break;
      }
      visited.add(curr);
    }
  }

  const connDoc = model.connectorDoc;
  if (connDoc) {
    const cFm = _core.bejson_core_get_field_map(connDoc);
    const fromIdx = cFm['conn_from_fk'];
    const toIdx = cFm['conn_to_fk'];

    for (let i = 0; i < (connDoc.Values || []).length; i++) {
      const row = connDoc.Values[i];
      const fromFk = String(row[fromIdx]);
      const toFk = String(row[toIdx]);

      if (!shapeIds.has(fromFk)) {
        _emitError(r, E.E_DIAGRAMS_FK_UNRESOLVED, `Connector from_fk '${fromFk}' does not exist on the board.`, 'conn_from_fk', i);
      }
      if (!shapeIds.has(toFk)) {
        _emitError(r, E.E_DIAGRAMS_FK_UNRESOLVED, `Connector to_fk '${toFk}' does not exist on the board.`, 'conn_to_fk', i);
      }
    }
  }

  return r;
}

function remediateDiagramModel(model) {
  if (!model || !model.boardDoc || !model.boardDoc.Values) return model;

  const bFm = _core.bejson_core_get_field_map(model.boardDoc);
  const shapeIdIdx = bFm['shape_id'];
  const parentFkIdx = bFm['shape_parent_fk'];

  if (shapeIdIdx === undefined) return model;

  const validShapeIds = new Set();
  const seenShapeIds = new Set();
  const filteredBoardRows = [];

  for (const row of model.boardDoc.Values) {
    const sid = String(row[shapeIdIdx]);
    if (!sid || seenShapeIds.has(sid)) continue;
    seenShapeIds.add(sid);
    validShapeIds.add(sid);
    filteredBoardRows.push(row);
  }
  model.boardDoc.Values = filteredBoardRows;

  if (parentFkIdx !== undefined) {
    for (const row of model.boardDoc.Values) {
      const pid = row[parentFkIdx] ? String(row[parentFkIdx]) : null;
      if (pid && !validShapeIds.has(pid)) {
        row[parentFkIdx] = null;
      }
    }
  }

  if (model.connectorDoc && model.connectorDoc.Values) {
    const cFm = _core.bejson_core_get_field_map(model.connectorDoc);
    const fromIdx = cFm['conn_from_fk'];
    const toIdx = cFm['conn_to_fk'];
    if (fromIdx !== undefined && toIdx !== undefined) {
      model.connectorDoc.Values = model.connectorDoc.Values.filter((row) => {
        const fromFk = String(row[fromIdx]);
        const toFk = String(row[toIdx]);
        return validShapeIds.has(fromFk) && validShapeIds.has(toFk);
      });
    }
  }

  return model;
}

function diagrams_validator_validate_package(doc) {
  const r = _makeResult();
  if (_mfdbValidator && typeof _mfdbValidator.mfdb_validator_is_mfdb132_package === 'function') {
    if (!_mfdbValidator.mfdb_validator_is_mfdb132_package(doc)) {
      _emitError(r, E.E_DIAGRAMS_NOT_MFDB132_PACKAGE, 'Document is not a recognized MFDB-132 package.');
      return r;
    }
    const pkgCheck = _mfdbValidator.mfdb_validator_validate_mfdb132_package(doc);
    if (!pkgCheck.valid) {
      for (const err of pkgCheck.errors) {
        _emitError(r, E.E_DIAGRAMS_MFDB132_INVALID, err);
      }
      return r;
    }
  }
  const diagramsCore = _isNode
    ? require('./lib_bejson_Diagrams_diagrams_core.js')
    : (window.DIAGRAMS_CORE || {});
  if (doc.Diagram_Schema && doc.Diagram_Schema !== diagramsCore.DIAGRAM_SCHEMA_TAG) {
    _emitError(r, E.E_DIAGRAMS_NOT_A_DIAGRAM_PACKAGE, `Package Diagram_Schema != '${diagramsCore.DIAGRAM_SCHEMA_TAG}'.`);
    return r;
  }
  try {
    diagramsCore.extractDiagramModelFromMfdb132(doc);
  } catch (err) {
    _emitError(r, (err && err.code) || E.E_DIAGRAMS_VALIDATION_FAILED, (err && err.message) || String(err));
  }
  return r;
}

const exports_ = {
  validateDiagramModel,
  remediateDiagramModel,
  validate_diagram_model: validateDiagramModel,
  remediate_diagram_model: remediateDiagramModel,
  diagrams_validator_validate_package,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exports_;
}
if (typeof window !== 'undefined') {
  window.DIAGRAMS_VALIDATOR = exports_;
}
