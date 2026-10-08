/**
 * Library:         lib_bejson_Gaming_bejson_events.ts
 * Family:          Gaming
 * Module Purpose:  Event-driven architecture for BEJSON entity interaction.
 * Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
 * Version:         2.1.2
 * Release_Version: 300
 * Date:            2026-06-30
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   f83e7c9a-e68b-4a9b-a13f-6c53d387e54a
 */

// bejson_events.ts
import { BEJSONDocument, createEmpty104, bejson_core_get_field_map } from "../index";

const EVENTS_LEGACY = {
  id: 0, type: 1, x: 2, y: 3, script: 4, condition: 5
} as const;

export class BEJSONEvents {
  public events: BEJSONDocument;
  private stateManager: any;
  public onExecute?: (action: string, args: any[]) => void | Promise<void>;

  constructor(stateManager: any) {
    this.stateManager = stateManager;
    this.events = createEmpty104("Events", [
      { name: "id", type: "string" },
      { name: "type", type: "string" },
      { name: "x", type: "number" },
      { name: "y", type: "number" },
      { name: "script", type: "array" },
      { name: "condition", type: "string" }
    ]);
    this.events.Parent_Hierarchy = "../104a.mfdb.bejson";  // was "Root/System/Events" — not a valid relative path
  }

  async run(eventId: string): Promise<void> {
    const fm = bejson_core_get_field_map(this.events);
    const idIdx = fm["id"] ?? EVENTS_LEGACY.id;
    const scriptIdx = fm["script"] ?? EVENTS_LEGACY.script;
    const condIdx = fm["condition"] ?? EVENTS_LEGACY.condition;

    const ev = this.events.Values.find(v => v[idIdx] === eventId);
    if (!ev) return;
    if (ev[condIdx] && !this._checkCondition(ev[condIdx] as string)) return;
    for (const cmd of ev[scriptIdx] as any[]) await this._execute(cmd);
  }

  private _checkCondition(c: string): boolean {
    if (c.startsWith("flag:")) return this.stateManager.state[c.split(":")[1]] === true;
    return true;
  }

  private async _execute(cmd: any[]): Promise<void> {
    if (!cmd || !Array.isArray(cmd) || cmd.length === 0) return;
    const [action, ...args] = cmd;

    // Core engine logic
    if (action === "SET_FLAG") {
      this.stateManager.state[args[0]] = args[1];
    }

    // External hook for cinematic and engine actions
    if (this.onExecute) {
      await this.onExecute(action, args);
    }
  }
}