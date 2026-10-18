/**
 * Library:         test_list_validator.js
 * Family:          Lists
 * Module Purpose:  Tests for lib_bejson_Lists_list_validator.js (bejson_lists_validate, bejson_lists_validate_field).
 * Architecture:    Standalone node script; resolves Lists from this file's location (no absolute paths).
 * Format_Scope:    104 | 104a (list-shaped documents)
 * Version:         1.0.0
 * Release_Version: 300
 * Date:            2026-10-13
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   cad74d5d-2dc0-45b5-afed-465bf765794e
 */
'use strict';
const assert = require('assert');
const path = require('path');
const L = require(path.join(__dirname, '..', 'lib_bejson_Lists_list_validator.js'));
const E = require(path.join(__dirname, '..', 'lib_bejson_Lists_bejson_errors.js'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok   - ${name}`); }
  catch (e) { failed++; console.log(`FAIL - ${name}\n       ${e.message}`); }
}
const mk = (rows, version = '104a', types = ['string', 'string', 'string']) => ({
  Format: 'BEJSON', Format_Version: version, Format_Creator: 'Elton Boehnen', Records_Type: ['Category'],
  Fields: [{ name: 'id', type: types[0] }, { name: 'parent_id', type: types[1] }, { name: 'label', type: types[2] }],
  Values: rows,
});
const TREE = [['a', null, 'A'], ['b', 'a', 'B'], ['c', 'b', 'C'], ['d', '', 'D']];
const fdoc = rows => ({ Format: 'BEJSON', Format_Version: '104a', Format_Creator: 'Elton Boehnen', Records_Type: ['T'],
  Fields: [{ name: 'tags', type: 'array' }], Values: rows });

test('valid tree + stats', () => {
  const r = L.bejson_lists_validate(mk(TREE));
  assert.ok(r.is_valid, r.errors.join('; '));
  assert.deepStrictEqual(r.stats, { item_count: 4, root_count: 2, max_depth: 2 });
});
test('JSON string input, 104, empty Values', () => {
  assert.ok(L.bejson_lists_validate(JSON.stringify(mk(TREE))).is_valid);
  assert.ok(L.bejson_lists_validate(mk(TREE, '104')).is_valid);
  assert.strictEqual(L.bejson_lists_validate(mk([])).stats.item_count, 0);
});
test('duplicate / orphan / null id', () => {
  assert.ok(L.bejson_lists_validate(mk(TREE.concat([['a', null, 'x']]))).error_codes.includes(E.E_LISTS_DUPLICATE_ID));
  assert.ok(L.bejson_lists_validate(mk([['a', 'zzz', 'A']])).error_codes.includes(E.E_LISTS_ORPHAN));
  assert.ok(L.bejson_lists_validate(mk([[null, null, 'x']])).error_codes.includes(E.E_LISTS_NULL_ID));
});
test('cycles reported once; self-parent; tail off a cycle', () => {
  const n = r => r.error_codes.filter(c => c === E.E_LISTS_CYCLE).length;
  assert.strictEqual(n(L.bejson_lists_validate(mk([['a', 'b', 'A'], ['b', 'a', 'B']]))), 1);
  assert.strictEqual(n(L.bejson_lists_validate(mk([['a', 'a', 'A']]))), 1);
  assert.strictEqual(n(L.bejson_lists_validate(mk([['a', 'b', 'A'], ['b', 'a', 'B'], ['c', 'a', 'C'], ['d', 'c', 'D']]))), 1);
});
test('all errors reported', () => {
  const r = L.bejson_lists_validate(mk([['a', 'zzz', 'A'], ['a', null, 'dup'], [null, null, 'n']]));
  assert.ok(new Set(r.error_codes).size >= 3);
});
test('integer 0 id valid + parentable', () => {
  const r = L.bejson_lists_validate(mk([[0, null, 'root'], [1, 0, 'kid']], '104a', ['integer', 'integer', 'string']));
  assert.ok(r.is_valid, r.errors.join('; '));
  assert.strictEqual(r.stats.max_depth, 1);
});
test('missing fields; 104db rejected', () => {
  const d = mk([['a', 'x']]); d.Fields = [{ name: 'id', type: 'string' }, { name: 'label', type: 'string' }];
  assert.ok(L.bejson_lists_validate(d).error_codes.includes(E.E_LISTS_MISSING_FIELDS));
  const db = mk([]); db.Format_Version = '104db'; db.Records_Type = ['A', 'B'];
  assert.ok(!L.bejson_lists_validate(db).is_valid);
});
test('structural failure / bad input returns a result and never throws', () => {
  const d = mk(TREE); delete d.Format_Creator;
  const r = L.bejson_lists_validate(d);
  assert.ok(!r.is_valid && r.error_codes.every(c => c === E.E_LISTS_STRUCTURE_INVALID));
  assert.ok(!L.bejson_lists_validate('{nope').is_valid);
  assert.ok(!L.bejson_lists_validate(42).is_valid);
  assert.ok(!L.bejson_lists_validate('null').is_valid);
  const short = mk([['a', null]]); // row shorter than Fields
  assert.ok(!L.bejson_lists_validate(short).is_valid);
});
test('validate_field ok / null cells / integer / bool is not number', () => {
  assert.ok(L.bejson_lists_validate_field(fdoc([[['x', 'y']], [null]]), 'tags', 'string').is_valid);
  assert.ok(L.bejson_lists_validate_field(fdoc([[[1, 2]]]), 'tags', 'integer').is_valid);
  assert.ok(!L.bejson_lists_validate_field(fdoc([[[1.5]]]), 'tags', 'integer').is_valid);
  assert.ok(!L.bejson_lists_validate_field(fdoc([[[true]]]), 'tags', 'number').is_valid);
});
test('validate_field errors: item type / not array / missing field / bad type', () => {
  assert.ok(L.bejson_lists_validate_field(fdoc([[['x', 1]]]), 'tags', 'string').error_codes.includes(E.E_LISTS_ITEM_TYPE_MISMATCH));
  assert.ok(L.bejson_lists_validate_field(fdoc([['x']]), 'tags', 'string').error_codes.includes(E.E_LISTS_FIELD_NOT_ARRAY));
  assert.ok(L.bejson_lists_validate_field(fdoc([]), 'nope', 'string').error_codes.includes(E.E_LISTS_FIELD_NOT_FOUND));
  assert.ok(!L.bejson_lists_validate_field(fdoc([]), 'tags', 'banana').is_valid);
});
test('Core JS validator exports its API (fallback no longer needed for structural validation)', () => {
  const v = require(path.join(__dirname, '..', '..', 'Core', 'lib_bejson_Core_bejson_validator.js'));
  assert.strictEqual(typeof v.bejson_validator_validate_string, 'function');
  assert.strictEqual(typeof v.bejson_validator_validate_file, 'function');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
