/**
 * Library:         lib_bejson_GamingBackend_state.ts
 * Family:          Backend
 * Module Purpose:  Quest, player class, and world-flag state management for the Gaming backend.
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         1.0.0
 * Release_Version: 300
 * Date:            2026-06-30
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   9a8b7c6d-5e4f-3210-1234-567890abcdef
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuestState {
  questId: string;
  status: "inactive" | "active" | "completed" | "failed";
  currentObjectiveIndex: number;
  milestonesReached: string[];
}

export interface PlayerClass {
  classId: string;
  level: number;
  unlockedAbilities: string[];
}

export interface GameState {
  quests: Record<string, QuestState>;
  playerClass: PlayerClass;
  worldFlags: Record<string, boolean | string | number>;
}

// ---------------------------------------------------------------------------
// BEJSONGamingState
// ---------------------------------------------------------------------------

export class BEJSONGamingState {
  /**
   * Returns a fresh GameState with no active quests, a default novice class,
   * and no world flags set.
   */
  static initGameState(): GameState {
    return {
      quests: {},
      playerClass: { classId: "novice", level: 1, unlockedAbilities: [] },
      worldFlags: {},
    };
  }

  /**
   * Begins tracking a quest if it is not already present. No-op if the quest
   * already exists (does not reset progress on an active/completed quest).
   */
  static startQuest(state: GameState, questId: string): void {
    if (!state.quests[questId]) {
      state.quests[questId] = {
        questId,
        status: "active",
        currentObjectiveIndex: 0,
        milestonesReached: [],
      };
    }
  }

  /**
   * Advances the objective index for an active quest. No-op if the quest
   * does not exist or is not currently active.
   */
  static completeObjective(state: GameState, questId: string): void {
    const q = state.quests[questId];
    if (q && q.status === "active") {
      q.currentObjectiveIndex++;
    }
  }

  /**
   * Records a milestone for an active quest, guarding against duplicates.
   */
  static reachMilestone(state: GameState, questId: string, milestone: string): void {
    const q = state.quests[questId];
    if (q && q.status === "active" && !q.milestonesReached.includes(milestone)) {
      q.milestonesReached.push(milestone);
    }
  }

  /**
   * Marks an active quest as completed. No-op if the quest does not exist
   * or is not currently active.
   */
  static completeQuest(state: GameState, questId: string): void {
    const q = state.quests[questId];
    if (q && q.status === "active") {
      q.status = "completed";
    }
  }

  /**
   * Sets an arbitrary world flag value (boolean, string, or number).
   */
  static setWorldFlag(state: GameState, flagId: string, value: boolean | string | number): void {
    state.worldFlags[flagId] = value;
  }

  /**
   * Reads a world flag value, or undefined if it has not been set.
   */
  static getWorldFlag(state: GameState, flagId: string): boolean | string | number | undefined {
    return state.worldFlags[flagId];
  }
}