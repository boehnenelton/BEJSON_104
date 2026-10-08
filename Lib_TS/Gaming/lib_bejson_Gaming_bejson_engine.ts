/**
 * Library:         lib_bejson_Gaming_bejson_engine.ts
 * Family:          Gaming
 * Module Purpose:  State-machine driven game engine utilizing BEJSON for entity state.
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         2.1.0
 * Release_Version: 300
 * Date:            2026-06-04
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   4f7ba347-60d2-468f-a718-1a4f50c8410d
 */

// bejson_engine.ts
export class BEJSONEngine {
  public systems: Map<string, any>;
  public state: string;

  constructor() {
    this.systems = new Map();
    this.state = 'BOOT';
  }

  registerSystem(name: string, system: any) {
    this.systems.set(name, system);
  }

  getSystem(name: string): any {
    return this.systems.get(name);
  }

  loop(dt: number) {
    this.systems.forEach(s => {
      if (s.step) s.step(dt);
      if (s.update) s.update(dt);
    });
  }
}