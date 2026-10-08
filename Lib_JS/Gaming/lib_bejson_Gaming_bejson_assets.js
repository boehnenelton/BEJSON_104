/**
 * Library:         lib_bejson_Gaming_bejson_assets.js
 * Family:          Gaming
 * Module Purpose:  Game asset loader and manager for BEJSON-defined resources.
 * Architecture:    BEJSON 104a provides fast primitive metadata and manifest configuration with O(1) field map caching.
 * Version:         2.0.2
 * Release_Version: 300
 * Date:            2026-06-20
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   6a8c9b25-8df3-4221-8043-3a8270133cb8
 */

// FIX (LIB-GAME-M1): this file reads/writes window.BEJSON_Switch as an
// ambient global (set by lib_bejson_Core_bejson_bejson.js), with no
// import establishing that dependency. Under real ES-module loading
// (this file's own consumers use `import ... from`, see cli/game.js)
// there is no guarantee that script ran first - a side-effect import
// forces it to execute before this module's own top-level code runs,
// while leaving the window.BEJSON_Switch assignment below intact for
// plain <script>-tag usage.
import '../Core/lib_bejson_Core_bejson_bejson.js';

window.Core = window.Core || {};

class SwitchAssets {
    constructor(name = "AssetRegistry") {
        this.bejson = BEJSON_Switch.BEJSON.create104a(name, [
            { name: "id", type: "string" },
            { name: "type", type: "string" },
            { name: "path", type: "string" },
            { name: "loaded", type: "boolean" }
        ], []);
        this.cache = new Map();
    }

    async load(id, type, path) {
        if (this.cache.has(id)) return this.cache.get(id);
        let asset;
        if (type === 'image') asset = await this._loadImage(path);
        else if (type === 'json') asset = await (await fetch(path)).json();
        this.cache.set(id, asset);
        // Registry sync (merged extension) — keeps the BEJSON Values table in sync
        // with what's actually loaded; previously only the in-memory cache was updated.
        this.bejson.Values.push([id, type, path, true]);
        return asset;
    }

    _loadImage(path) {
        return new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = path;
        });
    }

    get(id) { return this.cache.get(id); }
}

BEJSON_Switch.Assets = SwitchAssets;
export default SwitchAssets;