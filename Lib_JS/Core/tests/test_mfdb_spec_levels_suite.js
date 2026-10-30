/**
 * Library:        test_mfdb_spec_levels_suite.js
 * Family:         Core (tests)
 * Description:    Pins the MFDB spec Level 1/2/3 validation rules (104 crash course)
 *                 for 104 entity files in JavaScript: entity Records_Type
 *                 match (34), bidirectional manifest<->entity (38), orphan (37),
 *                 missing Parent_Hierarchy (36), duplicates (35), missing field (40),
 *                 nulls (41), Network_Role validation (30), _fk optional convention (warning only),
 *                 and record_count drift = warning only.
 * Version:        1.0.0
 * Date:           2026-10-30
 * Author:         Elton Boehnen
 * Format_Creator: Elton Boehnen
 * RELATIONAL_ID:  a1b2c3d4-94b8-4d5c-8a12-6e7f8b9c0d1e
 * Release_Version: 300
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const M = require('../lib_bejson_Core_mfdb_core.js');
const MV = require('../lib_bejson_Core_mfdb_validator.js');

const S = n => ({ name: n, type: "string" });
const jl = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const jd = (doc, p) => fs.writeFileSync(p, JSON.stringify(doc));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}: ${e.message}`);
    throw e;
  }
}

function makeDb(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `mfdbspec_104_${prefix}_`));
  const m = path.join(tmp, "104a.mfdb.bejson");
  jd(M.mfdb_core_create_manifest("Shop"), m);
  M.mfdb_core_init_entity_file(m, "Customer", [S("cust_name")], "data/customer.bejson", { primary_key: "cust_name" });
  M.mfdb_core_init_entity_file(m, "Order", [S("code")], "data/order.bejson");

  const custPath = path.join(tmp, "data", "customer.bejson");
  const cDoc = jl(custPath);
  cDoc.Values.push(["ann"]);
  jd(cDoc, custPath);

  const ent = path.join(tmp, "data", "order.bejson");
  const oDoc = jl(ent);
  oDoc.Values.push(["O1"]);
  jd(oDoc, ent);

  M.mfdb_core_sync_all_counts(m);
  return { tmp, m, ent };
}

function cleanup(tmp) {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

test(`Spec_104: clean database valid with no warnings`, () => {
  const { tmp, m } = makeDb("clean");
  try {
    const r = MV.validate_mfdb_database(m);
    assert.strictEqual(r.valid, true, JSON.stringify(r.errors));
    assert.strictEqual(r.warnings.length, 0);
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: Network_Role Master/Slave/Standalone valid, invalid role rejected (30)`, () => {
  const { tmp, m } = makeDb("net_role");
  try {
    for (const role of ["Master", "Slave", "Standalone"]) {
      const mf = jl(m);
      mf.Network_Role = role;
      jd(mf, m);
      const r = MV.validate_mfdb_database(m);
      assert.strictEqual(r.valid, true, `role ${role} should be valid: ${JSON.stringify(r.errors)}`);
    }
    const mf = jl(m);
    mf.Network_Role = "RogueNode";
    jd(mf, m);
    const r = MV.validate_mfdb_database(m);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.join(' ').includes("[30]"));
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: _fk suffix is optional convention in 104 (warning only in strict mode, never fails)`, () => {
  const { tmp, m, ent } = makeDb("fk_conv");
  try {
    const d = jl(ent);
    d.Fields.push({ name: "unmatched_id_fk", type: "string" });
    d.Values[0].push("ghost");
    jd(d, ent);
    const r = MV.validate_mfdb_database(m, true);
    assert.strictEqual(r.valid, true, `_fk convention must never invalidate 104 DB: ${JSON.stringify(r.errors)}`);
    assert.ok(r.warnings.length > 0);
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: records_type must match entity_name (34)`, () => {
  const { tmp, m, ent } = makeDb("rt_name");
  try {
    const d = jl(ent);
    d.Records_Type = ["WrongName"];
    jd(d, ent);
    const r = MV.validate_mfdb_database(m);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.join(' ').includes("[34]"));
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: records_type case sensitive (34)`, () => {
  const { tmp, m, ent } = makeDb("rt_case");
  try {
    const d = jl(ent);
    d.Records_Type = ["order"];
    jd(d, ent);
    const r = MV.validate_mfdb_database(m);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.join(' ').includes("[34]"));
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: records_type exactly one`, () => {
  const { tmp, m, ent } = makeDb("rt_count");
  try {
    const d = jl(ent);
    d.Records_Type = ["Order", "Extra"];
    jd(d, ent);
    const r = MV.validate_mfdb_database(m);
    assert.strictEqual(r.valid, false);
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: parent_hierarchy missing (36)`, () => {
  const { tmp, m, ent } = makeDb("ph_missing");
  try {
    const d = jl(ent);
    delete d.Parent_Hierarchy;
    jd(d, ent);
    const r = MV.validate_mfdb_database(m);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.join(' ').includes("Parent_Hierarchy") || r.errors.join(' ').includes("[36]"));
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: orphan parent_hierarchy nonexistent manifest (37)`, () => {
  const { tmp, m, ent } = makeDb("ph_orphan");
  try {
    const d = jl(ent);
    d.Parent_Hierarchy = "../nope.mfdb.bejson";
    jd(d, ent);
    const r = MV.validate_mfdb_database(m);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.join(' ').includes("[37]"));
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: bidirectional entity points to other manifest (38)`, () => {
  const { tmp, m, ent } = makeDb("ph_bidi");
  try {
    const other = makeDb("other");
    const d = jl(ent);
    d.Parent_Hierarchy = path.relative(path.dirname(ent), other.m).split(path.sep).join('/');
    jd(d, ent);
    const r = MV.validate_mfdb_database(m);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.join(' ').includes("[38]"));
    cleanup(other.tmp);
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: bidirectional standalone entity not listed (38)`, () => {
  const { tmp, ent } = makeDb("bidi_stray");
  try {
    const stray = path.join(path.dirname(ent), "stray.bejson");
    fs.copyFileSync(ent, stray);
    const rStray = MV.validate_mfdb_entity_file(stray);
    assert.strictEqual(rStray.valid, false);
    assert.ok(rStray.errors.join(' ').includes("[38]"));
    const rEnt = MV.validate_mfdb_entity_file(ent);
    assert.strictEqual(rEnt.valid, true);
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: entity standalone name check uses manifest row (34)`, () => {
  const { tmp, ent } = makeDb("standalone_name");
  try {
    const d = jl(ent);
    d.Records_Type = ["Nope"];
    jd(d, ent);
    const r = MV.validate_mfdb_entity_file(ent);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.join(' ').includes("[34]"));
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: entity format must be 104 (31)`, () => {
  const { tmp, m, ent } = makeDb("format_104a");
  try {
    const d = jl(ent);
    d.Format_Version = "104a";
    jd(d, ent);
    const r = MV.validate_mfdb_database(m);
    assert.strictEqual(r.valid, false);
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: record_count drift is warning only`, () => {
  const { tmp, m } = makeDb("count_drift");
  try {
    const mf = jl(m);
    const names = mf.Fields.map(f => f.name);
    const idx = names.indexOf("record_count");
    mf.Values[1][idx] = 99;
    jd(mf, m);
    const r = MV.validate_mfdb_database(m);
    assert.strictEqual(r.valid, true, JSON.stringify(r.errors));
    assert.ok(r.warnings.some(w => w.includes("record_count")));
  } finally {
    cleanup(tmp);
  }
});

test(`Spec_104: manifest level 1 codes (35, 41, 33, Records_Type)`, () => {
  const { tmp, m } = makeDb("manifest_l1");
  try {
    const mf = jl(m);
    const names = mf.Fields.map(f => f.name);
    const enIdx = names.indexOf("entity_name");
    const fpIdx = names.indexOf("file_path");

    // duplicate entity_name (35)
    let bad = JSON.parse(JSON.stringify(mf));
    bad.Values[1][enIdx] = bad.Values[0][enIdx];
    jd(bad, m);
    let r = MV.validate_mfdb_database(m);
    assert.ok(r.errors.join(' ').includes("[35]"));

    // null entity_name (41)
    bad = JSON.parse(JSON.stringify(mf));
    bad.Values[0][enIdx] = null;
    jd(bad, m);
    r = MV.validate_mfdb_database(m);
    assert.ok(r.errors.join(' ').includes("[41]"));

    // missing entity file (33)
    bad = JSON.parse(JSON.stringify(mf));
    bad.Values[0][fpIdx] = "data/missing.bejson";
    jd(bad, m);
    r = MV.validate_mfdb_database(m);
    assert.ok(r.errors.join(' ').includes("[33]"));

    // Records_Type not ['mfdb']
    bad = JSON.parse(JSON.stringify(mf));
    bad.Records_Type = ["other"];
    jd(bad, m);
    r = MV.validate_mfdb_database(m);
    assert.strictEqual(r.valid, false);
  } finally {
    cleanup(tmp);
  }
});

console.log(`\nAll ${passed} MFDB spec level tests passed!`);
