/**
 * Library:         lib_bejson_Gaming_bejson_engine.js
 * Family:          Gaming
 * Module Purpose:  Self-driving requestAnimationFrame game loop with delta-time tracking. Complements lib_bejson_Gaming_bejson_engine_core.js's CoreEngine (externally-driven loop) with a standalone, self-scheduling alternative.
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         2.0.1
 * Release_Version: 300
 * Date:            2026-06-20
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   8e1cff50-0ff5-49c1-a789-d41d29f342c7
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

'use strict';

(function () {
    const Engine = {
        boot: function (config) {
            console.log("BEJSON.Engine: Booting...");
            this.systems = [];
            this.state = 'BOOT';
            this.config = config || {};
        },

        register: function (system) {
            this.systems.push(system);
            if (system.init) system.init(this.config);
        },

        start: function () {
            this.state = 'RUNNING';
            this._lastTime = performance.now();
            this._loop();
        },

        _loop: function () {
            if (this.state !== 'RUNNING') return;
            const now = performance.now();
            const dt = (now - this._lastTime) / 1000;
            this._lastTime = now;

            this.systems.forEach(s => {
                if (s.update) s.update(dt);
                if (s.render) s.render();
            });

            requestAnimationFrame(() => this._loop());
        }
    };

    if (typeof window !== 'undefined') {
        window.BEJSON_Switch = window.BEJSON_Switch || {};
        window.BEJSON_Switch.Engine = Engine;
    }
})();