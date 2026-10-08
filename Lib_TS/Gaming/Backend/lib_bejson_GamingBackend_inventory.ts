/**
 * Library:         lib_bejson_GamingBackend_inventory.ts
 * Family:          Backend
 * Module Purpose:  Equipment slot and item management for the Gaming backend. Handles default equipment initialization and safe slot assignment with registry deduplication. Fully stateless. RELATIONAL_ID: c3d4e5f6-a7b8-9012-cdef-123456789012
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         1.0.0
 * Release_Version: 300
 * Date:            2026-06-18
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   c3d4e5f6-a7b8-9012-cdef-123456789012
 */

import { ActorState, Equipment, Item } from "./lib_bejson_GamingBackend_types";

// ---------------------------------------------------------------------------
// BEJSONGamingInventory
// ---------------------------------------------------------------------------

export class BEJSONGamingInventory {
  /**
   * Initializes a blank equipment set for a player actor.
   *
   * @returns A zeroed Equipment object with empty slot arrays.
   */
  static createDefaultEquipment(): Equipment {
    return {
      sword:  null,
      tool:   null,
      armor:  null,
      swords: [],
      armors: [],
    };
  }

  /**
   * Assigns an item to the correct equipment slot on an actor.
   *
   * - "sword" → actor.equipment.sword; deduplicates into actor.equipment.swords[]
   * - "armor" → actor.equipment.armor; deduplicates into actor.equipment.armors[]
   * - "tool"  → actor.equipment.tool
   *
   * Deduplication is keyed on item.item_id.
   *
   * @param actor  Actor whose equipment is mutated in place.
   * @param item   Item to equip.
   */
  static equipItem(actor: ActorState, item: Item): void {
    if (item.type === "sword") {
      actor.equipment.sword = item;
      if (!actor.equipment.swords.some((i) => i.item_id === item.item_id)) {
        actor.equipment.swords.push(item);
      }
    } else if (item.type === "armor") {
      actor.equipment.armor = item;
      if (!actor.equipment.armors.some((i) => i.item_id === item.item_id)) {
        actor.equipment.armors.push(item);
      }
    } else if (item.type === "tool") {
      actor.equipment.tool = item;
    }
  }
}