/**
 * Library:         lib_bejson_Gaming_bejson_physics.js
 * Family:          Gaming
 * Module Purpose:  2D/3D physics calculation engine for BEJSON-based simulations.
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         2.1.0
 * Release_Version: 300
 * Date:            2026-05-18
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   73439f9f-3684-408d-9f20-37bcf2f7e106
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

class SwitchPhysics {
    constructor(options = {}) {
        this.gravity = options.gravity || { x: 0, y: 0 };
        this.friction = options.friction || 0.9;
        const fields = [
            { name: "id",       type: "string"  },
            { name: "x",        type: "number"  },
            { name: "y",        type: "number"  },
            { name: "w",        type: "number"  },
            { name: "h",        type: "number"  },
            { name: "vx",       type: "number"  },
            { name: "vy",       type: "number"  },
            { name: "isStatic", type: "boolean" },
            { name: "mass",     type: "number"  }
        ];
        this.bodies = BEJSON_Switch.BEJSON.create104("PhysicsWorld", fields, []);
        // R9: field map computed once from schema — eliminates all b[N] hardcoding
        this._fm = {};
        fields.forEach((f, i) => { this._fm[f.name] = i; });
        // R9: O(1) body index — Map<id, row[]>. Eliminates Values.find() per op.
        this._bodyIndex = new Map();
        this.impulses = new Map();
    }

    addBody(id, x, y, w, h, options = {}) {
        const { id: fi, x: fx, y: fy, w: fw, h: fh, vx: fvx, vy: fvy,
                isStatic: fis, mass: fmass } = this._fm;
        const row = [];
        row[fi]   = id;
        row[fx]   = x;         row[fy]   = y;
        row[fw]   = w;         row[fh]   = h;
        row[fvx]  = options.vx       || 0;
        row[fvy]  = options.vy       || 0;
        row[fis]  = options.isStatic || false;
        row[fmass]= options.mass     || 1;
        this.bodies.Values.push(row);
        this._bodyIndex.set(id, row);  // R9: O(1) registration
    }

    moveBody(id, dx, dy, staticColliders = []) {
        const b = this._bodyIndex.get(id);  // R9: O(1)
        if (!b) return;
        const { x: fx, y: fy } = this._fm;
        const oldX = b[fx]; b[fx] += dx;
        if (this._checkStaticCollisions(b, staticColliders)) b[fx] = oldX;
        const oldY = b[fy]; b[fy] += dy;
        if (this._checkStaticCollisions(b, staticColliders)) b[fy] = oldY;
    }

    applyImpulse(id, ix, iy) {
        const b = this._bodyIndex.get(id);  // R9: O(1)
        if (!b) return;
        const mass = b[this._fm.mass] || 1;
        if (!this.impulses.has(id)) this.impulses.set(id, { x: 0, y: 0 });
        const imp = this.impulses.get(id);
        imp.x += ix / mass;
        imp.y += iy / mass;
    }

    step(dt, staticColliders = []) {
        const { id: fi, x: fx, y: fy, w: fw, h: fh, vx: fvx, vy: fvy,
                isStatic: fis, mass: fmass } = this._fm;
        const values = this.bodies.Values;

        for (let i = 0; i < values.length; i++) {
            const b = values[i];
            if (b[fis]) continue;

            if (this.impulses.has(b[fi])) {
                const imp = this.impulses.get(b[fi]);
                b[fvx] += imp.x; b[fvy] += imp.y;
                this.impulses.delete(b[fi]);
            }

            b[fvx] += this.gravity.x * dt; b[fvy] += this.gravity.y * dt;
            b[fvx] *= this.friction;        b[fvy] *= this.friction;

            const oldX = b[fx]; b[fx] += b[fvx] * dt;
            if (this._checkStaticCollisions(b, staticColliders)) { b[fx] = oldX; b[fvx] = 0; }

            const oldY = b[fy]; b[fy] += b[fvy] * dt;
            if (this._checkStaticCollisions(b, staticColliders)) { b[fy] = oldY; b[fvy] = 0; }
        }

        for (let i = 0; i < values.length; i++) {
            for (let j = i + 1; j < values.length; j++) {
                if (this._checkAABB(values[i], values[j]))
                    this._resolveCollision(values[i], values[j]);
            }
        }
    }

    _checkStaticCollisions(b, colliders) {
        const { x: fx, y: fy, w: fw, h: fh } = this._fm;
        for (const c of colliders) {
            const cx = Array.isArray(c) ? c[0] : c.x;
            const cy = Array.isArray(c) ? c[1] : c.y;
            const cw = Array.isArray(c) ? c[2] : (c.w || c.width);
            const ch = Array.isArray(c) ? c[3] : (c.h || c.height);
            if (b[fx] < cx + cw && b[fx] + b[fw] > cx &&
                b[fy] < cy + ch && b[fy] + b[fh] > cy) return true;
        }
        return false;
    }

    _checkAABB(a, b) {
        const { x: fx, y: fy, w: fw, h: fh } = this._fm;
        return (a[fx] < b[fx] + b[fw] && a[fx] + a[fw] > b[fx] &&
                a[fy] < b[fy] + b[fh] && a[fy] + a[fh] > b[fy]);
    }

    _resolveCollision(a, b) {
        const { vx: fvx, vy: fvy, isStatic: fis, mass: fmass } = this._fm;
        if (a[fis] && b[fis]) return;
        const m1 = a[fmass] || 1, m2 = b[fmass] || 1, totalMass = m1 + m2;
        const v1x = a[fvx], v1y = a[fvy], v2x = b[fvx], v2y = b[fvy];
        if (a[fis]) { b[fvx] = -v2x; b[fvy] = -v2y; return; }
        if (b[fis]) { a[fvx] = -v1x; a[fvy] = -v1y; return; }
        a[fvx] = ((v1x * (m1-m2)) + (2*m2*v2x)) / totalMass;
        b[fvx] = ((v2x * (m2-m1)) + (2*m1*v1x)) / totalMass;
        a[fvy] = ((v1y * (m1-m2)) + (2*m2*v2y)) / totalMass;
        b[fvy] = ((v2y * (m2-m1)) + (2*m1*v1y)) / totalMass;
    }
}

BEJSON_Switch.Physics = SwitchPhysics;
export default SwitchPhysics;