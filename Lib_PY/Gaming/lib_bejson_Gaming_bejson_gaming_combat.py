"""
Library:         lib_bejson_Gaming_bejson_gaming_combat.py
Family:          Gaming
Module Purpose:  Implements runtime functionality and logic for lib_bejson_Gaming_bejson_gaming_combat.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         1.0.0
Release_Version: 300
Date:            2026-06-29
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   e4f5a6b7-c8d9-0123-def0-234567890123
"""

import math
import random
from typing import Optional


# ---------------------------------------------------------------------------
# Damage calculation
# ---------------------------------------------------------------------------

def bejson_gaming_combat_calculate_damage(
    attacker: dict,
    defender: dict,
    weapon: Optional[dict] = None,
    armor: Optional[dict] = None,
    rng: Optional[random.Random] = None
) -> int:
    """
    Calculates raw damage based on base stats, equipment, levels, and
    randomness.  Mirrors calculateDamage in TS exactly.

    Formula: max(1, floor(totalAtk - totalDef * 0.6))
    Crit:    10% chance for 1.75x damage multiplier
    Level:   floor(levelDiff * 1.5) bonus if attacker level > defender level

    Args:
        attacker: Dict with keys atk (int), level (int).
        defender: Dict with keys def (int), level (int).
        weapon:   Optional dict with attack_bonus (int).
        armor:    Optional dict with defense_bonus (int).
        rng:      Optional seeded random.Random instance for deterministic
                  cross-platform verification.  If None, uses module-level
                  random (matches TS Math.random() behaviour).

    Returns:
        Final damage value, always >= 1.
    """
    _rng = rng if rng is not None else random

    base_atk    = attacker.get("atk", 1)
    weapon_bonus = weapon.get("attack_bonus", 0) if weapon else 0
    total_atk   = base_atk + weapon_bonus

    base_def    = defender.get("def", 0)
    armor_bonus  = armor.get("defense_bonus", 0) if armor else 0
    total_def   = base_def + armor_bonus

    # Core formula — 60% armor mitigation
    damage = max(1, math.floor(total_atk - (total_def * 0.6)))

    # Critical hit — 10% chance for 1.75x multiplier
    if _rng.random() < 0.1:
        damage = math.floor(damage * 1.75)

    # Level advantage bonus
    attacker_level = attacker.get("level", 1)
    defender_level = defender.get("level", 1)
    level_diff = attacker_level - defender_level
    if level_diff > 0:
        damage += math.floor(level_diff * 1.5)

    return max(1, damage)


# ---------------------------------------------------------------------------
# Sword attack helpers
# ---------------------------------------------------------------------------

def bejson_gaming_combat_create_sword_attack(
    player: dict,
    sword_asset: Optional[dict],
    is_spin: bool,
    last_swing_left_to_right: bool,
    rng: Optional[random.Random] = None
) -> dict:
    """
    Generates a sword attack state object based on player position and swing
    type.  Mirrors createSwordAttack in TS exactly.
    """
    _rng = rng if rng is not None else random

    base_duration = 0.30 if is_spin else 0.15

    # Speed multiplier — normal: 0.95–1.05x, heavy: 1.15–1.25x
    is_heavy_swing = _rng.random() < 0.15
    if is_heavy_swing:
        speed_multiplier = 1.15 + _rng.random() * 0.1
    else:
        speed_multiplier = 0.95 + _rng.random() * 0.1

    final_duration = base_duration * speed_multiplier

    player_facing = player.get("facing", {"x": 0, "y": 0})
    sword_damage   = sword_asset.get("damage", 10) if sword_asset else 10
    hitbox_width   = sword_asset.get("hitbox_width", 24) if sword_asset else 24
    hitbox_height  = sword_asset.get("hitbox_height", 24) if sword_asset else 24

    return {
        "x":                 player["x"] + player_facing["x"] * 24,
        "y":                 player["y"] + player_facing["y"] * 24,
        "width":             hitbox_width,
        "height":            hitbox_height,
        "damage":            sword_damage * 1.5 if is_heavy_swing else sword_damage,
        "life":              final_duration,
        "maxLife":           final_duration,
        "facingAngle":       math.atan2(player_facing["y"], player_facing["x"]),
        "isSpin":            is_spin,
        "isLeftToRight":     last_swing_left_to_right,
        "isHeavySwing":      is_heavy_swing,
        "reachOffset":       (_rng.random() - 0.5) * 6,
        "gapOffset":         (_rng.random() - 0.5) * 4,
        "extensionOffset":   (_rng.random() - 0.5) * 6,
        "angleOffset":       (_rng.random() - 0.5) * 0.20,
    }


def bejson_gaming_combat_update_sword_arc(
    sword: dict,
    player: dict,
    delta_time: float
) -> None:
    """
    Updates the precise sweep angle and coordinates of a sword attack volume.
    Mutates sword in place.  Mirrors updateSwordArc in TS exactly.
    """
    sword["life"] = sword.get("life", 0) - delta_time

    max_life = sword.get("maxLife", 1)
    current_life = max(0.0, sword.get("life", 0))
    progress = 1.0 - (current_life / max_life)

    angle_deviation = sword.get("angleOffset", 0.0)
    is_spin         = sword.get("isSpin", False)
    sweep_spread    = math.pi * 2 if is_spin else math.pi * (150 / 180)

    if is_spin:
        start_angle  = sword.get("facingAngle", 0.0) - (math.pi / 2) + angle_deviation
        total_sweep  = math.pi * 2
    elif sword.get("isLeftToRight", True):
        start_angle  = sword.get("facingAngle", 0.0) - (sweep_spread / 2) + angle_deviation
        total_sweep  = sweep_spread
    else:
        start_angle  = sword.get("facingAngle", 0.0) + (sweep_spread / 2) + angle_deviation
        total_sweep  = -sweep_spread

    sweep_angle = start_angle + (progress * total_sweep)
    reach       = 28 + sword.get("reachOffset", 0.0) + sword.get("extensionOffset", 0.0)

    sword["x"] = (
        player["x"] + (player.get("width", 0) / 2)
        + math.cos(sweep_angle) * reach
        - (sword.get("width", 0) / 2)
    )
    sword["y"] = (
        player["y"] + (player.get("height", 0) / 2)
        + math.sin(sweep_angle) * reach
        - (sword.get("height", 0) / 2)
    )