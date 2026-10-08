/**
 * Library:         lib_bejson_GamingBackend_physics.ts
 * Family:          Backend
 * Module Purpose:  Tile-based and actor-based collision detection for the Gaming backend. Distinct from BEJSONPhysics (Lib_TS/Gaming/bejson_physics.ts) which manages a simulated rigid-body physics world. This library handles MFDB-driven tile grid lookups and AABB sweeps used by the game loop. Stateless and portable across environments. RELATIONAL_ID: d4e5f6a7-b8c9-0123-defa-234567890123
 * Architecture:    MFDB provides multi-file database federation coordinating a 104a central manifest (104a.mfdb.bejson) with dense 104 entity tables, supporting atomic transaction locks and cross-disk relational foreign keys.
 * Version:         1.0.0
 * Release_Version: 300
 * Date:            2026-06-18
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   d4e5f6a7-b8c9-0123-defa-234567890123
 */

import { ActorState } from "./lib_bejson_GamingBackend_types";

// ---------------------------------------------------------------------------
// BEJSONGamingPhysicsBackend
// ---------------------------------------------------------------------------

export class BEJSONGamingPhysicsBackend {
  /**
   * Checks whether an actor will collide with solid tiles at a projected velocity.
   *
   * Applies a 6px inner margin to the actor bounds before testing to allow
   * the actor to slide along walls without snagging on corners.
   *
   * Accepts an optional pre-built tileGrid Map<"x_y", tile> for O(1) lookups.
   * Falls back to a linear scan of the tiles array when tileGrid is absent.
   *
   * @param actor     Actor being moved.
   * @param vx        Horizontal velocity (px/s).
   * @param vy        Vertical velocity (px/s).
   * @param dt        Delta time in seconds.
   * @param tiles     Flat array of all tile objects in the scene.
   * @param assets    Asset registry keyed by terrain_type / object_type.
   * @param tileSize  Size of one tile in pixels.
   * @param tileGrid  Optional pre-built spatial index for O(1) tile lookups.
   * @returns         true if a solid tile is in the projected path.
   */
  static checkTileCollision(
    actor:     ActorState,
    vx:        number,
    vy:        number,
    dt:        number,
    tiles:     any[],
    assets:    Record<string, any>,
    tileSize:  number,
    tileGrid?: Map<string, any>
  ): boolean {
    const newX   = (actor.x ?? 0) + vx * dt;
    const newY   = (actor.y ?? 0) + vy * dt;
    const margin = 6;

    const actorLeft   = newX + margin;
    const actorRight  = newX + (actor.width  ?? 0) - margin;
    const actorTop    = newY + margin;
    const actorBottom = newY + (actor.height ?? 0) - margin;

    if (tileGrid) {
      const minTX = Math.floor(actorLeft   / tileSize);
      const maxTX = Math.floor(actorRight  / tileSize);
      const minTY = Math.floor(actorTop    / tileSize);
      const maxTY = Math.floor(actorBottom / tileSize);

      for (let tx = minTX; tx <= maxTX; tx++) {
        for (let ty = minTY; ty <= maxTY; ty++) {
          const tile  = tileGrid.get(`${tx}_${ty}`);
          if (!tile) continue;
          const rules = assets[tile.terrain_type ?? tile.object_type];
          if (rules?.is_solid) return true;
        }
      }
      return false;
    }

    // Linear fallback
    for (const tile of tiles) {
      const rules = assets[tile.terrain_type ?? tile.object_type];
      if (!rules?.is_solid) continue;

      const tileLeft   = tile.x * tileSize;
      const tileRight  = tileLeft + tileSize;
      const tileTop    = tile.y * tileSize;
      const tileBottom = tileTop + tileSize;

      if (
        actorLeft   < tileRight  &&
        actorRight  > tileLeft   &&
        actorTop    < tileBottom &&
        actorBottom > tileTop
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks whether an actor will collide with other actors at a projected velocity.
   *
   * Applies the same 6px inner margin as checkTileCollision.
   * Includes a broad-phase 100px distance gate to skip distant actors before
   * performing the full AABB test.
   * Hibernated actors are excluded from collision.
   *
   * @param actor   The moving actor.
   * @param vx      Horizontal velocity (px/s).
   * @param vy      Vertical velocity (px/s).
   * @param dt      Delta time in seconds.
   * @param actors  All actors in the scene (including actor itself — self is skipped).
   * @returns       true if a non-hibernated actor blocks the projected path.
   */
  static checkActorCollision(
    actor:  ActorState,
    vx:     number,
    vy:     number,
    dt:     number,
    actors: ActorState[]
  ): boolean {
    const newX   = (actor.x ?? 0) + vx * dt;
    const newY   = (actor.y ?? 0) + vy * dt;
    const margin = 6;

    const actorLeft   = newX + margin;
    const actorRight  = newX + (actor.width  ?? 0) - margin;
    const actorTop    = newY + margin;
    const actorBottom = newY + (actor.height ?? 0) - margin;

    for (const other of actors) {
      if (other === actor || other.isHibernated) continue;

      // Broad-phase distance gate
      if (Math.abs(other.x - newX) > 100 || Math.abs(other.y - newY) > 100) continue;

      const otherLeft   = other.x + margin;
      const otherRight  = other.x + (other.width  ?? 0) - margin;
      const otherTop    = other.y + margin;
      const otherBottom = other.y + (other.height ?? 0) - margin;

      if (
        actorLeft   < otherRight  &&
        actorRight  > otherLeft   &&
        actorTop    < otherBottom &&
        actorBottom > otherTop
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Standard AABB overlap test between two rectangular objects.
   *
   * @param a  Object with x, y, width, height.
   * @param b  Object with x, y, width, height.
   * @returns  true if the bounding boxes overlap.
   */
  static overlaps(a: any, b: any): boolean {
    return (
      a.x < b.x + b.width  &&
      a.x + a.width  > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }
}