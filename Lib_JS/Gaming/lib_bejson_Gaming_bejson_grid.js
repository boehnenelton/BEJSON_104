/**
 * Library:         lib_bejson_Gaming_bejson_grid.js
 * Family:          Gaming
 * Module Purpose:  Universal grid-based data layout manager.
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         2.1.0
 * Release_Version: 300
 * Date:            2026-06-20
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   41e49fa9-468d-40db-8df6-9c8c8d2f08f9
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

class SwitchGrid {
    constructor(name, width, height) {
        this.width = width;
        this.height = height;
        this.bejson = BEJSON_Switch.BEJSON.create104(name, [
            { name: "layer_name", type: "string" },
            { name: "data", type: "array" }
        ], []);
        this._fm = { layer_name: 0, data: 1 };
        this._layerIndex = new Map();
    }

    createLayer(name, initialValue = 0) {
        const data = new Array(this.width * this.height).fill(initialValue);
        const row = [name, data];
        this.bejson.Values.push(row);
        this._layerIndex.set(name, row);
    }

    getTile(layerName, x, y) {
        const layer = this._layerIndex.get(layerName);
        if (!layer || x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
        return layer[this._fm.data][y * this.width + x];
    }

    setTile(layerName, x, y, val) {
        const layer = this._layerIndex.get(layerName);
        if (!layer || x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        layer[this._fm.data][y * this.width + x] = val;
    }
}

BEJSON_Switch.Grid = SwitchGrid;

/**
 * CollisionGrid: row/col indexed grid with per-cell tileType + solid flag.
 * Extension merged in from engine dump (2026-06-02) — complements SwitchGrid's
 * layer-based model with a dense collision/tile-type lookup grid.
 */
class CollisionGrid {
    constructor(rows, cols) {
        this.rows = rows;
        this.cols = cols;
        this.bejson = BEJSON_Switch.BEJSON.create104("Grid", [
            { name: "row", type: "integer" },
            { name: "col", type: "integer" },
            { name: "tileType", type: "string" },
            { name: "solid", type: "boolean" }
        ], []);
        this._init();
    }

    _init() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.bejson.Values.push([r, c, "empty", false]);
            }
        }
    }

    setTile(row, col, tileType, solid = false) {
        const cell = this.bejson.Values.find(v => v[0] === row && v[1] === col);
        if (cell) {
            cell[2] = tileType;
            cell[3] = solid;
        }
    }

    getTile(row, col) {
        const cell = this.bejson.Values.find(v => v[0] === row && v[1] === col);
        if (!cell) return null;
        return { tileType: cell[2], solid: cell[3] };
    }
}

BEJSON_Switch.CollisionGrid = CollisionGrid;
export default SwitchGrid;
export { SwitchGrid, CollisionGrid };