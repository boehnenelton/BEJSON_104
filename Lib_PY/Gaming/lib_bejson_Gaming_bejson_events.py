"""
Library:         lib_bejson_Gaming_bejson_events.py
Family:          Gaming
Module Purpose:  Implements runtime functionality and logic for lib_bejson_Gaming_bejson_events.py.
Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
Version:         2.1.0
Release_Version: 300
Date:            2026-05-18
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   bc979f09-b124-4067-bbaa-fa49c2ed0f02
"""

class BEJSONEvents:
    """
Version:      "2.0.1 OFFICIAL",
            Mirror of lib_bejson_Gaming_bejson_events.js
    Python/Flask-compatible MFDB 1.3 L2 Event System.
    """
    def __init__(self, state_manager):
        self.state = state_manager
        self.bejson = {
            "Format": "BEJSON",
            "Format_Version": "104",
            "Format_Creator": "Elton Boehnen",
            "Parent_Hierarchy": "../104a.mfdb.bejson",  # R10: fixed invalid path
            "Records_Type": ["Event"],
            "Fields": [
                { "name": "id", "type": "string" },
                { "name": "type", "type": "string" },
                { "name": "x", "type": "number" },
                { "name": "y", "type": "number" },
                { "name": "script", "type": "array" },
                { "name": "condition", "type": "string" }
            ],
            "Values": []
        }

    def _get_fm(self):
        """R10: Build field map once, cache on instance."""
        if not hasattr(self, '_fm'):
            self._fm = {f["name"]: i for i, f in enumerate(self.bejson["Fields"])}
            # R10: O(1) event index — dict<id, row>
            self._event_index = {row[self._fm["id"]]: row for row in self.bejson["Values"]}
        return self._fm

    def run_event(self, event_id):
        fm = self._get_fm()
        event = self._event_index.get(event_id)  # R10: O(1) lookup
        if event is None:
            return

        condition = event[fm["condition"]]  # R10: named index, not event[5]
        if condition and not self._check_condition(condition):
            return

        script = event[fm["script"]]        # R10: named index, not event[4]
        for cmd in script:
            self._execute_command(cmd)

    def _check_condition(self, condition):
        if condition.startswith("flag:"):
            flag_name = condition.split(":")[1]
            return self.state.get(flag_name) == True
        return True

    def _execute_command(self, cmd):
        action = cmd[0]
        args = cmd[1:]
        if action == "SET_FLAG":
            self.state.set(args[0], args[1])

    def export_bejson(self):
        import json
        return json.dumps(self.bejson, indent=2)