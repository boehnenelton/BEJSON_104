"""
Library:         test_list_validator.py
Family:          Lists
Module Purpose:  Tests for lib_bejson_Lists_list_validator.py (bejson_lists_validate, bejson_lists_validate_field).
Architecture:    Standalone unittest; resolves Core and Lists from this file's location (no absolute paths).
Format_Scope:    104 | 104a (list-shaped documents)
Version:         1.0.0
Release_Version: 300
Date:            2026-10-13
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   6f1d3a8b-9c42-4e75-a0b6-d2e5c7f18a93
"""

import copy
import logging
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, ".."))
sys.path.insert(0, os.path.join(_HERE, "..", "..", "Core"))

import lib_bejson_Lists_list_validator as LV  # noqa: E402
import lib_bejson_Lists_bejson_errors as E  # noqa: E402

logging.getLogger().setLevel(logging.WARNING)


def make_doc(rows, version="104a", types=("string", "string", "string")):
    return {
        "Format": "BEJSON", "Format_Version": version, "Format_Creator": "Elton Boehnen",
        "Records_Type": ["Category"],
        "Fields": [{"name": "id", "type": types[0]}, {"name": "parent_id", "type": types[1]},
                   {"name": "label", "type": types[2]}],
        "Values": rows,
    }


TREE = [["a", None, "A"], ["b", "a", "B"], ["c", "b", "C"], ["d", "", "D"]]


class TestValidate(unittest.TestCase):
    def test_valid_tree_and_stats(self):
        r = LV.bejson_lists_validate(make_doc(TREE))
        self.assertTrue(r["is_valid"], r["errors"])
        self.assertEqual(r["stats"], {"item_count": 4, "root_count": 2, "max_depth": 2})

    def test_104_accepted_and_empty(self):
        self.assertTrue(LV.bejson_lists_validate(make_doc(TREE, "104"))["is_valid"])
        self.assertEqual(LV.bejson_lists_validate(make_doc([]))["stats"]["item_count"], 0)

    def test_duplicate_orphan_null(self):
        self.assertIn(E.E_LISTS_DUPLICATE_ID, LV.bejson_lists_validate(make_doc(TREE + [["a", None, "x"]]))["error_codes"])
        self.assertIn(E.E_LISTS_ORPHAN, LV.bejson_lists_validate(make_doc([["a", "zzz", "A"]]))["error_codes"])
        self.assertIn(E.E_LISTS_NULL_ID, LV.bejson_lists_validate(make_doc([[None, None, "x"]]))["error_codes"])

    def test_cycles(self):
        r = LV.bejson_lists_validate(make_doc([["a", "b", "A"], ["b", "a", "B"]]))
        self.assertEqual(r["error_codes"].count(E.E_LISTS_CYCLE), 1)
        self.assertIn(E.E_LISTS_CYCLE, LV.bejson_lists_validate(make_doc([["a", "a", "A"]]))["error_codes"])
        tail = [["a", "b", "A"], ["b", "a", "B"], ["c", "a", "C"], ["d", "c", "D"]]
        self.assertEqual(LV.bejson_lists_validate(make_doc(tail))["error_codes"].count(E.E_LISTS_CYCLE), 1)

    def test_all_errors_reported(self):
        r = LV.bejson_lists_validate(make_doc([["a", "zzz", "A"], ["a", None, "dup"], [None, None, "n"]]))
        self.assertGreaterEqual(len(set(r["error_codes"])), 3)

    def test_integer_zero_id(self):
        doc = make_doc([[0, None, "root"], [1, 0, "kid"]], types=("integer", "integer", "string"))
        r = LV.bejson_lists_validate(doc)
        self.assertTrue(r["is_valid"], r["errors"])
        self.assertEqual(r["stats"]["max_depth"], 1)

    def test_missing_fields_and_versions(self):
        doc = make_doc([["a", "x"]])
        doc["Fields"] = [{"name": "id", "type": "string"}, {"name": "label", "type": "string"}]
        self.assertIn(E.E_LISTS_MISSING_FIELDS, LV.bejson_lists_validate(doc)["error_codes"])
        db = make_doc([])
        db["Format_Version"], db["Records_Type"] = "104db", ["A", "B"]
        self.assertFalse(LV.bejson_lists_validate(db)["is_valid"])

    def test_structure_and_input(self):
        bad = make_doc(TREE)
        del bad["Format_Creator"]
        r = LV.bejson_lists_validate(bad)
        self.assertFalse(r["is_valid"])
        self.assertEqual(set(r["error_codes"]), {E.E_LISTS_STRUCTURE_INVALID})
        self.assertFalse(LV.bejson_lists_validate("nope")["is_valid"])

    def test_not_mutated(self):
        doc = make_doc(TREE)
        snap = copy.deepcopy(doc)
        LV.bejson_lists_validate(doc)
        self.assertEqual({k: v for k, v in doc.items() if not k.startswith("_")}, snap)


class TestValidateField(unittest.TestCase):
    def doc(self, rows):
        return {"Format": "BEJSON", "Format_Version": "104a", "Format_Creator": "Elton Boehnen",
                "Records_Type": ["T"], "Fields": [{"name": "tags", "type": "array"}], "Values": rows}

    def test_ok_and_null_cells(self):
        self.assertTrue(LV.bejson_lists_validate_field(self.doc([[["x", "y"]], [None]]), "tags", "string")["is_valid"])

    def test_wrong_item_type_and_bool_is_not_number(self):
        r = LV.bejson_lists_validate_field(self.doc([[["x", 1]]]), "tags", "string")
        self.assertIn(E.E_LISTS_ITEM_TYPE_MISMATCH, r["error_codes"])
        r2 = LV.bejson_lists_validate_field(self.doc([[[True]]]), "tags", "number")
        self.assertIn(E.E_LISTS_ITEM_TYPE_MISMATCH, r2["error_codes"])
        self.assertTrue(LV.bejson_lists_validate_field(self.doc([[[1, 2]]]), "tags", "integer")["is_valid"])

    def test_not_array_missing_field_bad_type(self):
        self.assertIn(E.E_LISTS_FIELD_NOT_ARRAY, LV.bejson_lists_validate_field(self.doc([["x"]]), "tags", "string")["error_codes"])
        self.assertIn(E.E_LISTS_FIELD_NOT_FOUND, LV.bejson_lists_validate_field(self.doc([]), "nope", "string")["error_codes"])
        self.assertFalse(LV.bejson_lists_validate_field(self.doc([]), "tags", "banana")["is_valid"])


if __name__ == "__main__":
    unittest.main()
