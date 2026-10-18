/**
 * Library:         test_list_validator.ts
 * Family:          Lists
 * Module Purpose:  Tests for lib_bejson_Lists_list_validator.ts (bejsonListsValidate, bejsonListsValidateField).
 * Architecture:    Standalone script compiled with tsc --strict; resolves Lists relative to this file.
 * Format_Scope:    104 | 104a (list-shaped documents)
 * Version:         1.0.0
 * Release_Version: 300
 * Date:            2026-10-13
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   79733e50-6b10-490b-9116-6cf6134357b6
 */
import * as assert from "assert";
import { bejsonListsValidate, bejsonListsValidateField } from "../lib_bejson_Lists_list_validator";
import { LISTS_ERRORS as C } from "../lib_bejson_Lists_bejson_errors";

let n = 0;
const t = (name: string, fn: () => void): void => { fn(); n++; console.log("  ok - " + name); };

const mk = (rows: unknown[][], version = "104a", types = ["string", "string", "string"]): any => ({
  Format: "BEJSON", Format_Version: version, Format_Creator: "Elton Boehnen", Records_Type: ["Category"],
  Fields: [{ name: "id", type: types[0] }, { name: "parent_id", type: types[1] }, { name: "label", type: types[2] }],
  Values: rows,
});
const fdoc = (rows: unknown[][]): any => ({ Format: "BEJSON", Format_Version: "104a", Format_Creator: "Elton Boehnen",
  Records_Type: ["T"], Fields: [{ name: "tags", type: "array" }], Values: rows });
const TREE: unknown[][] = [["a", null, "A"], ["b", "a", "B"], ["c", "b", "C"], ["d", "", "D"]];
const codes = (r: { errors: { code: number }[] }): number[] => r.errors.map((e) => e.code);
const count = (r: { errors: { code: number }[] }, c: number): number => codes(r).filter((x) => x === c).length;

t("valid tree + stats", () => {
  const r = bejsonListsValidate(mk(TREE));
  assert.ok(r.valid, JSON.stringify(r.errors));
  assert.deepStrictEqual(r.stats, { item_count: 4, root_count: 2, max_depth: 2 });
});
t("JSON string input, 104, empty Values", () => {
  assert.ok(bejsonListsValidate(JSON.stringify(mk(TREE))).valid);
  assert.ok(bejsonListsValidate(mk(TREE, "104")).valid);
  assert.strictEqual(bejsonListsValidate(mk([])).stats?.item_count, 0);
});
t("duplicate / orphan / null id use Lists codes (not Core aliases 6 / 4 / 8)", () => {
  const d = bejsonListsValidate(mk(TREE.concat([["a", null, "x"]])));
  assert.ok(codes(d).includes(C.E_LISTS_DUPLICATE_ID) && !codes(d).includes(6));
  assert.ok(codes(bejsonListsValidate(mk([["a", "zzz", "A"]]))).includes(C.E_LISTS_ORPHAN));
  assert.ok(codes(bejsonListsValidate(mk([[null, null, "x"]]))).includes(C.E_LISTS_NULL_ID));
});
t("cycles reported once; self-parent; tail off a cycle", () => {
  assert.strictEqual(count(bejsonListsValidate(mk([["a", "b", "A"], ["b", "a", "B"]])), C.E_LISTS_CYCLE), 1);
  assert.strictEqual(count(bejsonListsValidate(mk([["a", "a", "A"]])), C.E_LISTS_CYCLE), 1);
  assert.strictEqual(count(bejsonListsValidate(mk([["a", "b", "A"], ["b", "a", "B"], ["c", "a", "C"], ["d", "c", "D"]])), C.E_LISTS_CYCLE), 1);
});
t("all errors reported", () => {
  const r = bejsonListsValidate(mk([["a", "zzz", "A"], ["a", null, "dup"], [null, null, "n"]]));
  assert.ok(new Set(codes(r)).size >= 3);
});
t("integer 0 id valid + parentable", () => {
  const r = bejsonListsValidate(mk([[0, null, "root"], [1, 0, "kid"]], "104a", ["integer", "integer", "string"]));
  assert.ok(r.valid, JSON.stringify(r.errors));
  assert.strictEqual(r.stats?.max_depth, 1);
});
t("missing fields; 104db rejected; structural failure; malformed JSON", () => {
  const d = mk([["a", "x"]]); d.Fields = [{ name: "id", type: "string" }, { name: "label", type: "string" }];
  assert.ok(codes(bejsonListsValidate(d)).includes(C.E_LISTS_MISSING_FIELDS));
  const db = mk([]); db.Format_Version = "104db"; db.Records_Type = ["A", "B"];
  assert.ok(!bejsonListsValidate(db).valid);
  const bad = mk(TREE); delete bad.Format_Creator;
  const r = bejsonListsValidate(bad);
  assert.ok(!r.valid && codes(r).every((c) => c === C.E_LISTS_STRUCTURE_INVALID));
  assert.ok(codes(bejsonListsValidate("{nope")).includes(C.E_LISTS_STRUCTURE_INVALID));
});
t("validateField ok / null / integer / bool is not number", () => {
  assert.ok(bejsonListsValidateField(fdoc([[["x", "y"]], [null]]), "tags", "string").valid);
  assert.ok(bejsonListsValidateField(fdoc([[[1, 2]]]), "tags", "integer").valid);
  assert.ok(!bejsonListsValidateField(fdoc([[[1.5]]]), "tags", "integer").valid);
  assert.ok(!bejsonListsValidateField(fdoc([[[true]]]), "tags", "number").valid);
});
t("validateField errors", () => {
  assert.ok(codes(bejsonListsValidateField(fdoc([[["x", 1]]]), "tags", "string")).includes(C.E_LISTS_ITEM_TYPE_MISMATCH));
  assert.ok(codes(bejsonListsValidateField(fdoc([["x"]]), "tags", "string")).includes(C.E_LISTS_FIELD_NOT_ARRAY));
  assert.ok(codes(bejsonListsValidateField(fdoc([]), "nope", "string")).includes(C.E_LISTS_FIELD_NOT_FOUND));
  assert.ok(!bejsonListsValidateField(fdoc([]), "tags", "banana" as any).valid);
});

console.log(`\n${n} passed`);
