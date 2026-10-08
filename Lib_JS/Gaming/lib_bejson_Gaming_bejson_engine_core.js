/**
 * Library:         lib_bejson_Gaming_bejson_engine_core.js
 * Family:          Gaming
 * Module Purpose:  State-machine driven game engine utilizing BEJSON for entity state.
 * Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
 * Version:         2.0.2
 * Release_Version: 300
 * Date:            2026-06-20
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   6bbac273-4fc2-48a4-9a6f-035d8c071587
 */

window.Core = window.Core || {};

class BEJSONEngine {
    constructor() {
        this.systems = new Map();
        this.state = 'BOOT';
    }
    registerSystem(name, system) { this.systems.set(name, system); }
    getSystem(name) { return this.systems.get(name); }
    loop(dt) {
        this.systems.forEach(s => {
            if (s.step) s.step(dt);
            if (s.update) s.update(dt);
        });
    }
}

class ChunkManager {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.chunkSize = options.chunkSize || 256; // Pixels
        this.loadRadius = options.loadRadius || 1; // 1 = 3x3 grid
        this.activeChunks = new Map(); // key -> bejson
        this.loadingChunks = new Set();
        this.basePath = options.basePath || 'data/chunks/';
    }

    getChunkKey(x, y) {
        const cx = Math.floor(x / this.chunkSize);
        const cy = Math.floor(y / this.chunkSize);
        return "" + cx + "_" + cy;
    }

    async update(camera) {
        const centerCX = Math.floor((camera.x + camera.width / 2) / this.chunkSize);
        const centerCY = Math.floor((camera.y + camera.height / 2) / this.chunkSize);

        const needed = new Set();
        for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++) {
            for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) {
                const cx = centerCX + dx;
                const cy = centerCY + dy;
                needed.add("" + cx + "_" + cy);
            }
        }

        // 1. Unload distant chunks
        for (const key of this.activeChunks.keys()) {
            if (!needed.has(key)) {
                this.activeChunks.delete(key);
                console.log("[ChunkManager] Deallocated: " + key);
            }
        }

        // 2. Load new chunks
        for (const key of needed) {
            if (!this.activeChunks.has(key) && !this.loadingChunks.has(key)) {
                this.loadChunk(key);
            }
        }
    }

    async loadChunk(key) {
        this.loadingChunks.add(key);
        const url = this.basePath + "tile_chunk_" + key + ".bejson";
        try {
            console.log("[ChunkManager] Asynchronously fetching: " + url);
            const response = await fetch(url);
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            this.activeChunks.set(key, data);
        } catch (e) {
            console.warn("[ChunkManager] Failed to load chunk " + key + ": " + e.message);
        } finally {
            this.loadingChunks.delete(key);
        }
    }

    getNearbyTiles() {
        const tiles = [];
        this.activeChunks.forEach(doc => {
            if (doc.Values) {
                // Assuming Tile entity in 104/104a format
                tiles.push(...doc.Values);
            }
        });
        return tiles;
    }
}

class CoreEngine {
    constructor(options = {}) {
        this.systems = new Map();
        this.state = 'BOOT';
        this.dependencies = ['ObjectRules', 'ActorStats'];
        this.chunkManager = null;
    }

    initChunking(options) {
        this.chunkManager = new ChunkManager(this, options);
    }

    checkDependencies(mfdb) {
        // Enforce inclusion order: Rules must be present before world execution
        for (const dep of this.dependencies) {
            const manifest = mfdb["104a.mfdb.bejson"];
            const entry = manifest && manifest.Values ? manifest.Values.find(v => v[0] === dep) : null;
            const path = entry ? entry[1] : null;
            if (!path || !mfdb[path]) {
                console.error("[CoreEngine] Dependency Violation: " + dep + " not loaded.");
                return false;
            }
        }
        return true;
    }

    registerSystem(name, system) {
        this.systems.set(name, system);
    }

    loop(dt) {
        if (this.state !== 'PLAYING') return;

        // 1. Gather Input & Impulse stage
        this.systems.forEach(s => {
            if (s.handleInput) s.handleInput(dt);
            if (s.gatherImpulses) s.gatherImpulses(dt);
        });

        // 2. Physics Step (with independent axis resolution)
        const physics = this.systems.get('physics');
        if (physics) {
            const colliders = this.chunkManager ? this.chunkManager.getNearbyTiles() : [];
            physics.step(dt, colliders);
        }

        // 3. General Update
        this.systems.forEach((s, name) => {
            if (name !== 'physics' && s.update) s.update(dt);
        });
    }
}

Core.Engine = CoreEngine;
Core.ChunkManager = ChunkManager;
export { CoreEngine, ChunkManager };