/**
 * Library:         lib_bejson_Utility_bejson_utility.js
 * Family:          Utility
 * Module Purpose:  Cross-compatible chunking utilities for CLI_CHUNKER and MFDB_V5. Strictly non-regex, standard string-based implementation.
 * Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
 * Version:         2.2.2
 * Release_Version: 300
 * Date:            2026-06-20
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   1b91b21c-1f1e-4589-8904-3e60f7f8bcda
 */

'use strict';

(function() {
    const Utility = {
        DEFAULT_EXTENSIONS: [".py", ".js", ".ts", ".html", ".css", ".md", ".json", ".sh", ".txt", ".bejson", ".tsx", ".jsx"],
        DEFAULT_EXCLUDES: [".git", "__pycache__", "node_modules", "lib", "output", ".mfdb_lock", "dist", "build"],

        SCHEMA_CLI_CHUNKER: [
            {"name": "Record_Type_Parent", "type": "string"},
            {"name": "project_name", "type": "string", "Record_Type_Parent": "ProjectMeta"},
            {"name": "version", "type": "string", "Record_Type_Parent": "ProjectMeta"},
            {"name": "root_path", "type": "string", "Record_Type_Parent": "ProjectMeta"},
            {"name": "file_path", "type": "string", "Record_Type_Parent": "FileContent"},
            {"name": "file_name", "type": "string", "Record_Type_Parent": "FileContent"},
            {"name": "content", "type": "string", "Record_Type_Parent": "FileContent"},
            {"name": "is_binary", "type": "boolean", "Record_Type_Parent": "FileContent"}
        ],

        SCHEMA_MFDB_ENTITY: [
            {"name": "version",   "type": "string"},
            {"name": "file_path", "type": "string"},
            {"name": "file_name", "type": "string"},
            {"name": "content",   "type": "string"},
            {"name": "is_binary", "type": "boolean"},
            {"name": "is_base64", "type": "boolean"},
        ],

        sanitizeName: function(name) {
            const invalid = '<>:"/\\|?*';
            let res = name;
            for (let i = 0; i < invalid.length; i++) {
                res = res.split(invalid[i]).join('_');
            }
            return res;
        },

        getTimestamp: function() {
            const iso = new Date().toISOString();
            // String manipulation instead of regex
            return iso.split('.')[0].split(':').join('').split('-').join('').replace('T', '_');
        },

        downloadBase64: function(base64, fileName) {
            const link = document.createElement('a');
            link.href = 'data:application/octet-stream;base64,' + base64;
            link.download = fileName;
            link.click();
        },

        // Merged from engine dump — short random ID generator (not previously present).
        randomId: function() {
            return Math.random().toString(36).substr(2, 9);
        },

        // Merged from engine dump — SHA-256 hash via Web Crypto (not previously present).
        hash: async function(text) {
            const msgUint8 = new TextEncoder().encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
            return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Utility;
    }
    if (typeof window !== 'undefined') {
        window.BEJSON = window.BEJSON || {};
        window.BEJSON.Utility = Utility;
    }
})();