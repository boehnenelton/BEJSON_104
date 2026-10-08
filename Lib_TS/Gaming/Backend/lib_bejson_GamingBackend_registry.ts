/**
 * Library:         lib_bejson_GamingBackend_registry.ts
 * Family:          Backend
 * Module Purpose:  MFDB record parsing into unified engine registries for the Gaming backend. Abstracts the BEJSON positional value layer from the game loop. Converts raw Values[][] arrays from entity files into typed registry maps. RELATIONAL_ID: e5f6a7b8-c9d0-1234-efab-345678901234
 * Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
 * Version:         1.0.0
 * Release_Version: 300
 * Date:            2026-06-18
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   e5f6a7b8-c9d0-1234-efab-345678901234
 */

import { ActorStats, BiomeConfig } from "./lib_bejson_GamingBackend_types";

// ---------------------------------------------------------------------------
// BEJSONGamingRegistry
// ---------------------------------------------------------------------------

export class BEJSONGamingRegistry {
  /**
   * Parses actor stat records from an MFDB entity file's Values array
   * into a keyed ActorStats registry.
   *
   * Expected positional layout per record:
   *   [0] actor_type, [1] max_health, [2] atk, [3] def, [4] speed,
   *   [5] xp_reward, [6] fallback_color, [7] start_potions, [8] level_up_hp,
   *   [9] level_up_atk, [10] level_up_def, [11] knockback_force,
   *   [12] potion_heal_amount, [13] is_victory_target
   *
   * @param values  Raw Values array from a BEJSON 104 actor-stats entity file.
   * @returns       Map keyed by actor_type string.
   */
  static parseActorStats(values: any[][]): Record<string, ActorStats> {
    const stats: Record<string, ActorStats> = {};
    for (const s of values) {
      stats[s[0]] = {
        actor_type:          s[0],
        max_health:          s[1],
        atk:                 s[2],
        def:                 s[3],
        speed:               s[4],
        xp_reward:           s[5],
        fallback_color:      s[6],
        start_potions:       s[7]  ?? 0,
        level_up_hp:         s[8]  ?? 0,
        level_up_atk:        s[9]  ?? 0,
        level_up_def:        s[10] ?? 0,
        knockback_force:     s[11] ?? 0,
        potion_heal_amount:  s[12] ?? 0,
        is_victory_target:   s[13] ?? false,
      };
    }
    return stats;
  }

  /**
   * Parses biome records from an MFDB entity file's Values array
   * into a keyed BiomeConfig registry.
   *
   * Expected positional layout per record:
   *   [0] id, [1] generationMode, [2] base,
   *   [3] clusters (JSON string), [4] scatter (JSON string)
   *
   * @param values  Raw Values array from a BEJSON 104 biome entity file.
   * @returns       Map keyed by biome id string.
   */
  static parseBiomes(values: any[][]): Record<string, BiomeConfig> {
    const biomes: Record<string, BiomeConfig> = {};
    for (const b of values) {
      biomes[b[0]] = {
        id:             b[0],
        generationMode: b[1],
        base:           b[2],
        clusters:       JSON.parse(b[3] ?? "[]"),
        scatter:        JSON.parse(b[4] ?? "[]"),
      };
    }
    return biomes;
  }

  /**
   * Parses object/asset rule records from an MFDB entity file's Values array
   * into a keyed asset registry.
   *
   * Expected positional layout per record:
   *   [0] asset_id, [1] is_solid, [2] interactable, [3] damage,
   *   [4] description, [5] fallback_color, [6] speed_mult,
   *   [7] knockback_force, [8] hitbox_width, [9] hitbox_height, [10] lifespan
   *
   * @param values  Raw Values array from a BEJSON 104 object-rules entity file.
   * @returns       Map keyed by asset_id string.
   */
  static parseObjectRules(values: any[][]): Record<string, any> {
    const assets: Record<string, any> = {};
    for (const a of values) {
      assets[a[0]] = {
        asset_id:        a[0],
        is_solid:        a[1],
        interactable:    a[2],
        damage:          a[3],
        description:     a[4],
        fallback_color:  a[5],
        speed_mult:      a[6],
        knockback_force: a[7],
        hitbox_width:    a[8],
        hitbox_height:   a[9],
        lifespan:        a[10],
      };
    }
    return assets;
  }

  /**
   * Parses portal records from an MFDB entity file's Values array
   * into a flat portal array.
   *
   * Expected positional layout per record:
   *   [0] id, [1] sourceLevelId, [2] x, [3] y,
   *   [4] targetLevelId, [5] targetX, [6] targetY
   *
   * @param values  Raw Values array from a BEJSON 104 portal entity file.
   * @returns       Array of portal objects.
   */
  static parsePortals(values: any[][]): any[] {
    return values.map((p) => ({
      id:            p[0],
      sourceLevelId: p[1],
      x:             p[2],
      y:             p[3],
      targetLevelId: p[4],
      targetX:       p[5],
      targetY:       p[6],
    }));
  }
}