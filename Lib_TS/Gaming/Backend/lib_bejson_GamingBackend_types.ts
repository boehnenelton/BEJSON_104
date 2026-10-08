/**
 * Library:         lib_bejson_GamingBackend_types.ts
 * Family:          Backend
 * Module Purpose:  Shared type definitions for the Gaming/Backend library family. Covers actor stats, biome configuration, item/equipment contracts, and actor state interfaces consumed by AI, Combat, Inventory, Physics, Registry, and Terrain libraries. RELATIONAL_ID: f3a1b7c2-9d4e-4f80-a561-2b3c5d6e7f89
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         1.0.0
 * Release_Version: 300
 * Date:            2026-06-18
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   f3a1b7c2-9d4e-4f80-a561-2b3c5d6e7f89
 */

// ---------------------------------------------------------------------------
// Biome / Terrain types
// ---------------------------------------------------------------------------

export enum GenerationMode {
  ORGANIC    = "organic",
  STRUCTURED = "structured",
}

export interface BiomeCluster {
  type:       string;
  frequency?: number;
  size?:      number;
  threshold?: number;
}

export interface BiomeScatter {
  type:        string;
  probability: number;
}

export interface BiomeConfig {
  id:             string;
  generationMode: GenerationMode;
  base:           string;
  clusters:       BiomeCluster[];
  scatter:        BiomeScatter[];
}

// ---------------------------------------------------------------------------
// Actor / Stats types
// ---------------------------------------------------------------------------

export interface ActorStats {
  actor_type:          string;
  max_health:          number;
  atk:                 number;
  def:                 number;
  speed:               number;
  xp_reward:           number;
  fallback_color:      string;
  start_potions?:      number;
  level_up_hp?:        number;
  level_up_atk?:       number;
  level_up_def?:       number;
  knockback_force?:    number;
  potion_heal_amount?: number;
  is_victory_target?:  boolean;
}

// ---------------------------------------------------------------------------
// Item / Equipment types
// ---------------------------------------------------------------------------

export interface Item {
  item_id:        string;
  name:           string;
  type:           string;
  description?:   string;
  attack_bonus?:  number;
  defense_bonus?: number;
  value?:         number;
}

export interface Equipment {
  sword:  Item | null;
  tool:   Item | null;
  armor:  Item | null;
  swords: Item[];
  armors: Item[];
}

// ---------------------------------------------------------------------------
// Actor runtime state
// ---------------------------------------------------------------------------

export interface ActorState {
  id:          string;
  type:        string;
  x:           number;
  y:           number;
  vx:          number;
  vy:          number;
  health:      number;
  maxHealth:   number;
  level:       number;
  xp:          number;
  maxXp:       number;
  inventory:   Item[];
  equipment:   Equipment;
  isHibernated: boolean;
  aiState?:    string;
  stateTimer?: number;
  /** AI state machine velocity intention (set by AILibrary, consumed by physics) */
  pendingVx?:  number;
  pendingVy?:  number;
  /** Locked directional velocity during charge state */
  lockedVx?:   number;
  lockedVy?:   number;
  facing?:     { x: number; y: number };
  width?:      number;
  height?:     number;
  atk?:        number;
  def?:        number;
  speed?:      number;
}

// ---------------------------------------------------------------------------
// Sword attack volume (created by CombatLibrary)
// ---------------------------------------------------------------------------

export interface SwordAttack {
  x:            number;
  y:            number;
  width:        number;
  height:       number;
  damage:       number;
  life:         number;
  maxLife:      number;
  facingAngle:  number;
  isSpin:       boolean;
  isLeftToRight: boolean;
  isHeavySwing: boolean;
  reachOffset:  number;
  gapOffset:    number;
  extensionOffset: number;
  angleOffset:  number;
}