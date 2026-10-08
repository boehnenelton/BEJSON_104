/**
 * Library:         lib_bejson_GamingBackend_combat.ts
 * Family:          Backend
 * Module Purpose:  Damage and attack mechanics for the Gaming backend. Handles stat-based damage calculation, sword attack volume creation, and sweep-arc position updates. Fully stateless. RELATIONAL_ID: b2c3d4e5-f6a7-8901-bcde-f12345678901
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         1.0.0
 * Release_Version: 300
 * Date:            2026-06-18
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   b2c3d4e5-f6a7-8901-bcde-f12345678901
 */

import { ActorState, Item, SwordAttack } from "./lib_bejson_GamingBackend_types";

// ---------------------------------------------------------------------------
// BEJSONGamingCombat
// ---------------------------------------------------------------------------

export class BEJSONGamingCombat {
  /**
   * Calculates raw damage based on base stats, equipment, levels, and randomness.
   *
   * Formula: max(1, floor(totalAtk - totalDef * 0.6))
   * Critical hit: 10% chance for 1.75× multiplier.
   * Level advantage: +1.5 damage per level above defender.
   *
   * @param attacker  Actor doing the attacking.
   * @param defender  Actor receiving the hit.
   * @param weapon    Optional weapon item worn by attacker.
   * @param armor     Optional armor item worn by defender.
   * @returns         Final damage value (minimum 1).
   */
  static calculateDamage(
    attacker: ActorState,
    defender: ActorState,
    weapon?:  Item,
    armor?:   Item
  ): number {
    const baseAtk    = (attacker as any).atk ?? 1;
    const weaponBonus = weapon ? (weapon.attack_bonus ?? 0) : 0;
    const totalAtk   = baseAtk + weaponBonus;

    const baseDef    = (defender as any).def ?? 0;
    const armorBonus = armor ? (armor.defense_bonus ?? 0) : 0;
    const totalDef   = baseDef + armorBonus;

    let damage = Math.max(1, Math.floor(totalAtk - totalDef * 0.6));

    // 10% critical for 1.75× damage
    if (Math.random() < 0.1) {
      damage = Math.floor(damage * 1.75);
    }

    // Level advantage bonus
    const levelDiff = (attacker.level ?? 1) - (defender.level ?? 1);
    if (levelDiff > 0) {
      damage += Math.floor(levelDiff * 1.5);
    }

    return Math.max(1, damage);
  }

  /**
   * Generates a sword attack volume based on player position and swing type.
   *
   * Normal swings last ~0.15s; spin attacks ~0.30s.
   * 15% chance of a heavy swing (1.15–1.25× duration, 1.5× damage).
   *
   * @param player              Actor performing the attack.
   * @param swordAsset          Asset definition for the equipped sword.
   * @param isSpin              Whether this is a 360° spin attack.
   * @param lastSwingLeftToRight Direction of the previous non-spin swing.
   * @returns                   SwordAttack volume object.
   */
  static createSwordAttack(
    player:              ActorState,
    swordAsset:          any,
    isSpin:              boolean,
    lastSwingLeftToRight: boolean
  ): SwordAttack {
    const baseDuration  = isSpin ? 0.30 : 0.15;
    const isHeavySwing  = Math.random() < 0.15;
    const speedMult     = isHeavySwing
      ? 1.15 + Math.random() * 0.1
      : 0.95 + Math.random() * 0.1;
    const finalDuration = baseDuration * speedMult;

    const facing = player.facing ?? { x: 1, y: 0 };

    return {
      x:               (player.x ?? 0) + facing.x * 24,
      y:               (player.y ?? 0) + facing.y * 24,
      width:           swordAsset?.hitbox_width  ?? 24,
      height:          swordAsset?.hitbox_height ?? 24,
      damage:          isHeavySwing
                         ? (swordAsset?.damage ?? 10) * 1.5
                         : (swordAsset?.damage ?? 10),
      life:            finalDuration,
      maxLife:         finalDuration,
      facingAngle:     Math.atan2(facing.y, facing.x),
      isSpin,
      isLeftToRight:   lastSwingLeftToRight,
      isHeavySwing,
      reachOffset:     (Math.random() - 0.5) * 6,
      gapOffset:       (Math.random() - 0.5) * 4,
      extensionOffset: (Math.random() - 0.5) * 6,
      angleOffset:     (Math.random() - 0.5) * 0.20,
    };
  }

  /**
   * Updates the sweep position of a sword attack volume each frame.
   *
   * Mutates sword.x and sword.y in place based on animation progress.
   *
   * @param sword  The sword attack volume being animated.
   * @param player The player actor the sword is anchored to.
   * @param dt     Delta time in seconds (used for life counter externally; unused here).
   */
  static updateSwordArc(sword: SwordAttack, player: ActorState, _dt: number): void {
    const progress       = 1 - Math.max(0, sword.life) / sword.maxLife;
    const angleDeviation = sword.angleOffset ?? 0;
    const sweepSpread    = sword.isSpin ? Math.PI * 2 : Math.PI * (150 / 180);

    let startAngle: number;
    let totalSweep: number;

    if (sword.isSpin) {
      startAngle = sword.facingAngle - Math.PI / 2 + angleDeviation;
      totalSweep = Math.PI * 2;
    } else if (sword.isLeftToRight) {
      startAngle = sword.facingAngle - sweepSpread / 2 + angleDeviation;
      totalSweep = sweepSpread;
    } else {
      startAngle = sword.facingAngle + sweepSpread / 2 + angleDeviation;
      totalSweep = -sweepSpread;
    }

    const sweepAngle = startAngle + progress * totalSweep;
    const reach      = 28 + (sword.reachOffset ?? 0) + (sword.extensionOffset ?? 0);
    const pw         = player.width  ?? 0;
    const ph         = player.height ?? 0;

    sword.x = (player.x ?? 0) + pw / 2 + Math.cos(sweepAngle) * reach - sword.width  / 2;
    sword.y = (player.y ?? 0) + ph / 2 + Math.sin(sweepAngle) * reach - sword.height / 2;
  }
}