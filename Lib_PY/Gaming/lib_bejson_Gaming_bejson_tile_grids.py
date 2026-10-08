"""
Library:         lib_bejson_Gaming_bejson_tile_grids.py
Family:          Gaming
Module Purpose:  Implements runtime functionality and logic for lib_bejson_Gaming_bejson_tile_grids.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         2.1.0
Release_Version: 300
Date:            2026-05-18
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   ff28e444-c57b-4b00-841d-8dabd1890012
"""

class BEJSONTileGrid:
    """
    Mirror of lib_bejson_Gaming_bejson_tile_grids.js
    Python/Flask-compatible tile grid manager using BEJSON 104.
    """
    def __init__(self, grid_name="UntitledGrid", width=0, height=0):
        self.width = width
        self.height = height
        self.bejson = {
            "Format": "BEJSON",
            "Format_Creator": "Elton Boehnen",
            "Format_Version": "104",
            "Records_Type": ["Layer"],
            "Fields": [
                { "name": "layer_name", "type": "string" },
                { "name": "data", "type": "array" }
            ],
            "Values": []
        }

    def _get_fm(self):
        """R10: Build field map once, cache on instance."""
        if not hasattr(self, '_fm'):
            self._fm = {f["name"]: i for i, f in enumerate(self.bejson["Fields"])}
            self._layer_index: dict = {}  # R10: O(1) layer lookup
        return self._fm

    def create_layer(self, name, initial_value=0):
        fm = self._get_fm()
        data = [initial_value] * (self.width * self.height)
        row = [name, data]
        self.bejson["Values"].append(row)
        self._layer_index[name] = row  # R10: register in O(1) index

    def get_tile(self, layer_name, x, y):
        fm = self._get_fm()
        layer = self._layer_index.get(layer_name)  # R10: O(1)
        if not layer or x < 0 or x >= self.width or y < 0 or y >= self.height:
            return None
        return layer[fm["data"]][y * self.width + x]

    def set_tile(self, layer_name, x, y, value):
        fm = self._get_fm()
        layer = self._layer_index.get(layer_name)  # R10: O(1)
        if not layer or x < 0 or x >= self.width or y < 0 or y >= self.height:
            return
        layer[fm["data"]][y * self.width + x] = value

    def export_bejson(self):
        import json
        return json.dumps(self.bejson, indent=2)