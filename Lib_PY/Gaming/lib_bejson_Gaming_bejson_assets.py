"""
Library:         lib_bejson_Gaming_bejson_assets.py
Family:          Gaming
Module Purpose:  Implements runtime functionality and logic for lib_bejson_Gaming_bejson_assets.py.
Architecture:    BEJSON 104a provides fast primitive metadata and manifest configuration with O(1) field map caching.
Version:         2.0.1
Release_Version: 300
Date:            2026-05-18
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   f1a1c37a-4098-495a-ad69-df3dbaec93f1
"""

import json

class BEJSONAssetRegistry:
    """
    Mirror of lib_bejson_Gaming_bejson_assets.js
    Python-compatible BEJSON-Native Asset Registry (104a).
    """
    def __init__(self, name="AssetRegistry"):
        self.bejson = {
            "Format": "BEJSON",
            "Format_Creator": "Elton Boehnen",
            "Format_Version": "104a",
            "Schema_Name": name,
            "Records_Type": ["Asset"],
            "Fields": [
                { "name": "id", "type": "string" },
                { "name": "type", "type": "string" },
                { "name": "path", "type": "string" },
                { "name": "loaded", "type": "boolean" }
            ],
            "Values": []
        }
        self.cache = {}

    def register_asset(self, asset_id, asset_type, path):
        """Adds or updates an asset in the registry."""
        idx = next((i for i, v in enumerate(self.bejson["Values"]) if v[0] == asset_id), -1)
        if idx != -1:
            self.bejson["Values"][idx] = [asset_id, asset_type, path, False]
        else:
            self.bejson["Values"].append([asset_id, asset_type, path, False])

    def mark_loaded(self, asset_id, loaded=True):
        idx = next((i for i, v in enumerate(self.bejson["Values"]) if v[0] == asset_id), -1)
        if idx != -1:
            self.bejson["Values"][idx][3] = loaded

    def export_bejson(self):
        return json.dumps(self.bejson, indent=2)