/**
 * Library:         lib_bejson_GamingBackend_ai.ts
 * Family:          Backend
 * Module Purpose:  Actor behavior and decision state machine for the Gaming backend. Encapsulates idle → alert → windup → charge → cooldown AI cycle. Stateless per call; all state is stored on the actor object. RELATIONAL_ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         1.0.0
 * Release_Version: 300
 * Date:            2026-06-18
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   a1b2c3d4-e5f6-7890-abcd-ef1234567890
 */

import { ActorState } from "./lib_bejson_GamingBackend_types";

// ---------------------------------------------------------------------------
// BEJSONGamingAI
// ---------------------------------------------------------------------------

export class BEJSONGamingAI {
  /**
   * Updates enemy velocity (pendingVx, pendingVy) based on current AI state.
   *
   * State machine: idle → alert (0.5s) → windup (0.6s) → charge (0.8s) → cooldown (0.5s) → idle
   *
   * @param actor  The enemy actor whose AI state and pending velocity are mutated in place.
   * @param player The player actor used as the pursuit target.
   * @param dt     Delta time in seconds.
   */
  static updateEnemyAI(actor: ActorState, player: ActorState, dt: number): void {
    const dx   = player.x - actor.x;
    const dy   = player.y - actor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Lazy-init AI state
    if (!actor.aiState) {
      actor.aiState    = "idle";
      actor.stateTimer = 0;
    }

    switch (actor.aiState) {
      case "idle": {
        actor.pendingVx = 0;
        actor.pendingVy = 0;
        if (dist > 0 && dist < 200) {
          actor.aiState    = "alert";
          actor.stateTimer = 0.5;
        }
        break;
      }

      case "alert": {
        actor.pendingVx  = 0;
        actor.pendingVy  = 0;
        actor.stateTimer = (actor.stateTimer ?? 0) - dt;
        if ((actor.stateTimer ?? 0) <= 0) {
          actor.aiState    = "windup";
          actor.stateTimer = 0.6;
        }
        break;
      }

      case "windup": {
        actor.pendingVx  = 0;
        actor.pendingVy  = 0;
        actor.stateTimer = (actor.stateTimer ?? 0) - dt;
        if ((actor.stateTimer ?? 0) <= 0) {
          actor.aiState    = "charge";
          actor.stateTimer = 0.8;
          const magnitude  = (actor.speed ?? 1) * 1.5;
          actor.lockedVx   = (dx / dist) * magnitude;
          actor.lockedVy   = (dy / dist) * magnitude;
        }
        break;
      }

      case "charge": {
        actor.pendingVx  = actor.lockedVx ?? 0;
        actor.pendingVy  = actor.lockedVy ?? 0;
        actor.stateTimer = (actor.stateTimer ?? 0) - dt;
        if ((actor.stateTimer ?? 0) <= 0) {
          actor.aiState    = "cooldown";
          actor.stateTimer = 0.5;
        }
        break;
      }

      case "cooldown": {
        actor.pendingVx  = 0;
        actor.pendingVy  = 0;
        actor.stateTimer = (actor.stateTimer ?? 0) - dt;
        if ((actor.stateTimer ?? 0) <= 0) {
          actor.aiState = "idle";
        }
        break;
      }

      default: {
        actor.aiState    = "idle";
        actor.pendingVx  = 0;
        actor.pendingVy  = 0;
        break;
      }
    }
  }

  /**
   * Calculates a solid-safe path using A* pathfinding on the tile grid.
   * Returns an array of waypoints (excluding the start tile) or null if no
   * path is found. Ported from the game engine's gaming_ai.ts findPath.
   *
   * @param startX   Starting tile X.
   * @param startY   Starting tile Y.
   * @param targetX  Target tile X.
   * @param targetY  Target tile Y.
   * @param tileGrid Map of "x_y" tile-key to tile data.
   * @param assets   Asset rule lookup, keyed by terrain_type/object_type, used for is_solid checks.
   * @param maxSteps Safety ceiling on search iterations (default 1000).
   */
  static findPath(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    tileGrid: Map<string, any>,
    assets: Record<string, any>,
    maxSteps: number = 1000
  ): { x: number; y: number }[] | null {
    const isSolid = (x: number, y: number): boolean => {
      const tile = tileGrid.get(`${x}_${y}`);
      if (!tile) return false;
      const rules = assets[tile.terrain_type || tile.object_type];
      return !!(rules && rules.is_solid);
    };

    if (isSolid(targetX, targetY)) return null;

    interface PathNode { x: number; y: number; f: number; g: number; parent: PathNode | null; }

    const openList: PathNode[] = [];
    const closedSet = new Set<string>();

    openList.push({ x: startX, y: startY, f: 0, g: 0, parent: null });

    let steps = 0;
    while (openList.length > 0 && steps < maxSteps) {
      steps++;
      openList.sort((a, b) => a.f - b.f);
      const current = openList.shift()!;

      if (current.x === targetX && current.y === targetY) {
        const path: { x: number; y: number }[] = [];
        let cursor: PathNode | null = current;
        while (cursor && cursor.parent) {
          path.push({ x: cursor.x, y: cursor.y });
          cursor = cursor.parent;
        }
        return path.reverse();
      }

      const key = `${current.x}_${current.y}`;
      closedSet.add(key);

      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x,     y: current.y + 1 },
        { x: current.x,     y: current.y - 1 },
      ];

      for (const n of neighbors) {
        const nKey = `${n.x}_${n.y}`;
        if (closedSet.has(nKey) || isSolid(n.x, n.y)) continue;

        const g = current.g + 1;
        const h = Math.abs(n.x - targetX) + Math.abs(n.y - targetY);
        const f = g + h;

        const existing = openList.find((item) => item.x === n.x && item.y === n.y);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = f;
            existing.parent = current;
          }
        } else {
          openList.push({ x: n.x, y: n.y, f, g, parent: current });
        }
      }
    }
    return null;
  }
}