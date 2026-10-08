/**
 * Library:         lib_bejson_Gaming_bejson_events.js
 * Family:          Gaming
 * Module Purpose:  Event-driven architecture for BEJSON entity interaction.
 * Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
 * Version:         2.0.3
 * Release_Version: 300
 * Date:            2026-06-20
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   ac96541c-b6f5-43f0-8226-5995dcc2f85e
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

class SwitchEvents {
    constructor(stateManager) {
        this.state = stateManager;
        this.events = BEJSON_Switch.BEJSON.create104("Events", [
            { name: "id", type: "string" },
            { name: "type", type: "string" },
            { name: "x", type: "number" },
            { name: "y", type: "number" },
            { name: "script", type: "array" },
            { name: "condition", type: "string" }
        ], []);
        // Enforce MFDB 1.3 L2 Mandatory Header
        this.events.Parent_Hierarchy = "../104a.mfdb.bejson";  // was "Root/System/Events" which is not a valid relative path.
        // Per MFDB spec §15.4, must point from entity file's directory back to
        // the manifest. Entity lives in Gaming/, so path is ../104a.mfdb.bejson.
        // NOTE: For in-memory-only use this is advisory; it matters on serialization.
    }

    async run(eventId) {
        const ev = this.events.Values.find(v => v[0] === eventId);
        if (!ev) return;
        if (ev[5] && !this._checkCondition(ev[5])) return;
        for (const cmd of ev[4]) await this._execute(cmd);
    }

    _checkCondition(c) {
        if (c.startsWith("flag:")) return this.state.state[c.split(":")[1]] === true;
        return true;
    }

    async _execute(cmd) {
        const [action, ...args] = cmd;
        if (action === "SET_FLAG") this.state.state[args[0]] = args[1];
    }
}

BEJSON_Switch.Events = SwitchEvents;

/**
 * SwitchEventEmitter: classic pub-sub event emitter (on/emit) with a BEJSON-backed
 * event log. Complements SwitchEvents above (scripted condition/action system tied
 * to a state manager) — this is a simpler decoupled publish-subscribe pattern,
 * merged in from engine dump because it serves a genuinely different use case
 * (e.g. UI/lifecycle events like "GameStarted", "BootstrapCompleted").
 */
class SwitchEventEmitter {
    constructor() {
        this.bejson = BEJSON_Switch.BEJSON.create104("EventRegistry", [
            { name: "event", type: "string" },
            { name: "timestamp", type: "integer" }
        ], []);
        this.listeners = new Map();
    }

    on(event, callback) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(callback);
    }

    emit(event, data) {
        this.bejson.Values.push([event, Date.now()]);
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => cb(data));
        }
    }
}

BEJSON_Switch.EventEmitter = SwitchEventEmitter;
export default SwitchEvents;
export { SwitchEvents, SwitchEventEmitter };