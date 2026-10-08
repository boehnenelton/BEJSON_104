"""
Library:         lib_bejson_Gaming_bejson_physics.py
Family:          Gaming
Module Purpose:  Implements runtime functionality and logic for lib_bejson_Gaming_bejson_physics.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         2.2.0
Release_Version: 300
Date:            2026-05-22
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   df3a86b1-8df7-4082-b2ab-c79ed10cd189
"""

import math

class BEJSONPhysics:
    """
    Mirror of lib_bejson_Gaming_bejson_physics.js
    Python/Flask-compatible 2D physics engine using BEJSON 104.
    """
    def __init__(self, world_name="PhysicsWorld"):
        self.bejson = {
            "Format": "BEJSON",
            "Format_Creator": "Elton Boehnen",
            "Format_Version": "104",
            "Records_Type": ["Body"],
            "Fields": [
                { "name": "id", "type": "string" },
                { "name": "x", "type": "number" },
                { "name": "y", "type": "number" },
                { "name": "width", "type": "number" },
                { "name": "height", "type": "number" },
                { "name": "vx", "type": "number" },
                { "name": "vy", "type": "number" },
                { "name": "mass", "type": "number" },
                { "name": "isStatic", "type": "boolean" },
                { "name": "groups", "type": "array" }
            ],
            "Values": []
        }
        self.gravity = {"x": 0, "y": 9.8}
        self.friction = 0.9  # Parity with bejson_physics.ts
        self.restitution = 0.8 # Energy loss on collision

    def add_body(self, body_id, x, y, width, height, **options):
        vx = options.get("vx", 0)
        vy = options.get("vy", 0)
        mass = options.get("mass", 1)
        is_static = options.get("isStatic", False)
        groups = options.get("groups", ["default"])
        
        self.bejson["Values"].append([
            body_id, x, y, width, height, vx, vy, mass, is_static, groups
        ])

    def _get_fm(self):
        """R10: Build field map once, cache on instance."""
        if not hasattr(self, '_fm'):
            self._fm = {f["name"]: i for i, f in enumerate(self.bejson["Fields"])}
        return self._fm

    def step(self, dt):
        fm = self._get_fm()
        fx, fy = fm["x"], fm["y"]
        fvx, fvy = fm["vx"], fm["vy"]
        fis, fmass = fm["isStatic"], fm["mass"]
        values = self.bejson["Values"]

        for row in values:
            if row[fis]: continue
            row[fvx] *= self.friction;         row[fvy] *= self.friction
            row[fvx] += self.gravity["x"] * dt; row[fvy] += self.gravity["y"] * dt
            row[fx]  += row[fvx] * dt;          row[fy]  += row[fvy] * dt

        for i in range(len(values)):
            for j in range(i + 1, len(values)):
                if self._check_aabb(values[i], values[j], fm):
                    self._resolve_collision(values[i], values[j], fm)

    def _check_aabb(self, a, b, fm=None):
        if fm is None: fm = self._get_fm()
        fx, fy, fw, fh = fm["x"], fm["y"], fm["width"], fm["height"]
        return (a[fx] < b[fx] + b[fw] and a[fx] + a[fw] > b[fx] and
                a[fy] < b[fy] + b[fh] and a[fy] + a[fh] > b[fy])

    def _resolve_collision(self, a, b, fm=None):
        if fm is None: fm = self._get_fm()
        fvx, fvy = fm["vx"], fm["vy"]
        fis, fmass = fm["isStatic"], fm["mass"]
        if a[fis] and b[fis]: return
        if a[fis]:
            b[fvx] *= -self.restitution; b[fvy] *= -self.restitution; return
        if b[fis]:
            a[fvx] *= -self.restitution; a[fvy] *= -self.restitution; return
        m_a, m_b = a[fmass], b[fmass]
        tvx_a, tvy_a = a[fvx], a[fvy]
        a[fvx] = (tvx_a*(m_a-m_b) + 2*m_b*b[fvx]) / (m_a+m_b) * self.restitution
        a[fvy] = (tvy_a*(m_a-m_b) + 2*m_b*b[fvy]) / (m_a+m_b) * self.restitution
        b[fvx] = (b[fvx]*(m_b-m_a) + 2*m_a*tvx_a) / (m_a+m_b) * self.restitution
        b[fvy] = (b[fvy]*(m_b-m_a) + 2*m_a*tvy_a) / (m_a+m_b) * self.restitution

    def export_bejson(self):
        import json
        return json.dumps(self.bejson, indent=2)