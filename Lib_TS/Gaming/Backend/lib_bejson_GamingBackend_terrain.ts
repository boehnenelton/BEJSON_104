/**
 * Library:         lib_bejson_GamingBackend_terrain.ts
 * Family:          Backend
 * Module Purpose:  Biome-driven procedural tile variant selection for the Gaming backend. Deterministic noise-based cluster, scatter, and corner-blend logic. Standalone and portable — no external runtime dependencies. RELATIONAL_ID: f6a7b8c9-d0e1-2345-fabc-456789012345
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         1.0.0
 * Release_Version: 300
 * Date:            2026-06-18
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   f6a7b8c9-d0e1-2345-fabc-456789012345
 */

import { BiomeConfig } from "./lib_bejson_GamingBackend_types";

// ---------------------------------------------------------------------------
// BEJSONGamingTerrain
// ---------------------------------------------------------------------------

export class BEJSONGamingTerrain {
  /**
   * Deterministically selects the tile variant to render at (x, y) given biome rules.
   *
   * Resolution order:
   *   1. If biome.generationMode === "structured" → return type unchanged.
   *   2. Check biome.clusters using bilinear interpolated hash noise.
   *      If noise exceeds cluster.threshold and the variant sprite exists → return cluster.type.
   *   3. Check biome.scatter by probability against a position hash.
   *      If probability passes and the scatter sprite exists → return scatter.type.
   *   4. Check for organic corner-blend variants (type_v5 through type_v8).
   *      Applied when detailHash % 6 === 0.
   *   5. Return original type.
   *
   * The hash function uses integer bit-mixing to achieve deterministic spatial
   * variation without requiring an external noise library.
   *
   * @param type     Base tile type identifier.
   * @param x        Tile grid X coordinate.
   * @param y        Tile grid Y coordinate.
   * @param biome    Biome configuration governing this tile's context.
   * @param levelId  Level identifier incorporated into the hash seed.
   * @param assets   Asset rule registry (keyed by type id); used for existence checks.
   * @param sprites  Sprite registry (keyed by type id); used for existence checks.
   * @returns        Resolved tile variant type string.
   */
  static getTileVariant(
    type:    string,
    x:       number,
    y:       number,
    biome:   BiomeConfig,
    levelId: string,
    assets:  Record<string, any>,
    sprites: Record<string, any>
  ): string {
    // Structured generation skips organic noise entirely
    if (biome.generationMode === "structured") {
      return type;
    }

    const detailHash = Math.abs(
      (x * 73856093) ^ (y * 19349663) ^ (levelId.length || 1)
    );

    // --- Cluster pass ---
    if (biome.clusters) {
      for (const cluster of biome.clusters) {
        const scale = cluster.size ?? 7;
        const nx    = x / scale;
        const ny    = y / scale;
        const ix    = Math.floor(nx);
        const iy    = Math.floor(ny);

        const h1 = Math.abs((ix       * 73856093) ^ (iy       * 19349663) ^ 11) % 1000 / 1000;
        const h2 = Math.abs(((ix + 1) * 73856093) ^ (iy       * 19349663) ^ 11) % 1000 / 1000;
        const h3 = Math.abs((ix       * 73856093) ^ ((iy + 1) * 19349663) ^ 11) % 1000 / 1000;
        const h4 = Math.abs(((ix + 1) * 73856093) ^ ((iy + 1) * 19349663) ^ 11) % 1000 / 1000;

        const wx    = nx - ix;
        const wy    = ny - iy;
        const noise = (h1 * (1 - wx) + h2 * wx) * (1 - wy) +
                      (h3 * (1 - wx) + h4 * wx) * wy;

        if (noise > (cluster.threshold ?? 0.7)) {
          if (sprites[cluster.type] || assets[cluster.type]) {
            return cluster.type;
          }
        }
      }
    }

    // --- Scatter pass ---
    if (biome.scatter) {
      for (const s of biome.scatter) {
        if ((detailHash % 100) / 100 < (s.probability ?? 0.01)) {
          if (sprites[s.type] || assets[s.type]) {
            return s.type;
          }
        }
      }
    }

    // --- Corner-blend pass (organic transitions) ---
    if (detailHash % 6 === 0) {
      const corners: string[] = [];
      for (let i = 5; i <= 8; i++) {
        const vId = `${type}_v${i}`;
        if (sprites[vId] || assets[vId]) corners.push(vId);
      }
      if (corners.length > 0) {
        return corners[detailHash % corners.length];
      }
    }

    return type;
  }
}