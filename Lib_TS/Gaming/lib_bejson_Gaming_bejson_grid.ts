/**
 * Library:         lib_bejson_Gaming_bejson_grid.ts
 * Family:          Gaming
 * Module Purpose:  Universal grid-based data layout manager.
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         2.1.0
 * Release_Version: 300
 * Date:            2026-06-04
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   bb15da1d-56ac-48a2-883a-31fae154223a
 */

// bejson_grid.ts
import { BEJSONDocument, createEmpty104, bejson_core_get_field_map } from "../index";

const GRID_LEGACY = {
  layer_name: 0, data: 1
} as const;

export class BEJSONGrid {
  public width: number;
  public height: number;
  public bejson: BEJSONDocument;

  constructor(name: string, width: number, height: number) {
    this.width = width;
    this.height = height;
    this.bejson = createEmpty104(name, [
      { name: "layer_name", type: "string" },
      { name: "data", type: "array" }
    ]);
  }

  createLayer(name: string, initialValue: number = 0) {
    const data = new Array(this.width * this.height).fill(initialValue);
    this.bejson.Values.push([name, data]);
  }

  getTile(layerName: string, x: number, y: number): number | null {
    const fm = bejson_core_get_field_map(this.bejson);
    const lnIdx = fm["layer_name"] ?? GRID_LEGACY.layer_name;
    const dataIdx = fm["data"] ?? GRID_LEGACY.data;

    const layer = this.bejson.Values.find(v => v[lnIdx] === layerName);
    if (!layer || x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return (layer[dataIdx] as number[])[y * this.width + x];
  }

  setTile(layerName: string, x: number, y: number, val: number) {
    const fm = bejson_core_get_field_map(this.bejson);
    const lnIdx = fm["layer_name"] ?? GRID_LEGACY.layer_name;
    const dataIdx = fm["data"] ?? GRID_LEGACY.data;

    const layer = this.bejson.Values.find(v => v[lnIdx] === layerName);
    if (!layer || x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    (layer[dataIdx] as number[])[y * this.width + x] = val;
  }
}