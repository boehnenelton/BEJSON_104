/**
 * Library:         bejson_cache.test.js
 * Family:          Core
 * Module Purpose:  Tests for the field-map cache (lookup and collision behavior).
 * Architecture:    Format-level BEJSON layer that works on any BEJSON document (104, 104a, 104db) through positional Fields/Values and the field-map cache. It does not orchestrate MFDB and is not specific to 104db.
 * Format_Scope:    104 | 104a | 104db (generic)
 * Glossary:        BEJSON 104, 104a and 104db are the three file formats (Format_Version). 104db = ONE file holding 2+ entity types
 *                  (Record_Type_Parent discriminator, null-padding). MFDB is NOT a format and NOT 104db: it is a layer made of one 104a manifest
 *                  (104a.mfdb.bejson) plus dense 104 entity files linked by Parent_Hierarchy. MFDB-132 = an MFDB packed into one Chunked-104a document.
 * Version:         2.0.6
 * Release_Version: 300
 * Date:            2026-10-08
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   4519ac3a-db41-479d-a1a1-548dde619243
 */

const assert = require('assert');
const BEJSON = require('./lib_bejson_Core_bejson_core.js');

/**
 * Test: field-map lookups return the right column indices for a document.
 */
function test_cache_lookup() {
    console.log("Running test_cache_lookup...");
    const doc = {
        Format_Version: "104",
        Fields: [{name: "id"}, {name: "name"}, {name: "value"}],
        Values: []
    };
    
    assert.ok(BEJSON.bejson_core_get_field_index(doc, "name") === 1, "Field 'name' index should be 1");
    assert.ok(BEJSON.bejson_core_get_field_index(doc, "value") === 2, "Field 'value' index should be 2");
    assert.ok(BEJSON.bejson_core_get_field_index(doc, "missing") === -1, "Missing field index should be -1");
}

/**
 * Test: two documents with different Fields never share one cached field map.
 */
function test_cache_collision() {
    console.log("Running test_cache_collision...");
    const doc1 = {Format_Version: "104", Fields: [{name: "a"}, {name: "b"}]};
    const doc2 = {Format_Version: "104", Fields: [{name: "b"}, {name: "a"}]};
    
    assert.ok(BEJSON.bejson_core_get_field_index(doc1, "a") === 0, "Doc1 'a' index should be 0");
    assert.ok(BEJSON.bejson_core_get_field_index(doc2, "a") === 1, "Doc2 'a' index should be 1");
}

try {
    test_cache_lookup();
    test_cache_collision();
    console.log("JS Tests Passed!");
} catch (e) {
    console.error("JS Tests Failed:", e);
    process.exit(1);
}