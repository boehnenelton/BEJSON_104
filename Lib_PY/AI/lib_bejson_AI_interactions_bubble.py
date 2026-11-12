"""
Library:         lib_bejson_AI_interactions_bubble.py
Path:            lib/AI/lib_bejson_AI_interactions_bubble.py
Family:          AI
Description:     Hybridized Context Bubble engine for the Gemini Interactions API.
                 Wraps stateful interaction threads inside a configurable token-capped
                 budget allotment. Allows external modules/plugins to hook additional
                 allotments while letting the Interactions API natively manage
                 cumulative session data within its granted share (default 100%).
Version:         1.0.1
Date:            2026-11-09
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   ad58f4d4-a2af-4546-8ad9-27d1a253fe0a
Release_Version: 300

Changelog:
  1.0.0 (2026-11-06) -- Initial creation. Hybridized Context Bubble architecture:
        * Wraps stateful Interactions threads in a configurable token-capped budget allotment (default 100%).
        * Hookable allotment registry (register_allotment, unregister_allotment, update_allotment).
        * Dynamic budget normalization and spill-up (unused hooked allotment grants spill into interactions_session).
        * Stateful turn lifecycle: Turn-1 seeds system_instruction + policy; Turn > 1 chains delta inputs via previous_interaction_id.
        * BEJSON 104a configuration with O(1) Field Map Caching (config/interactions_bubble.104a.bejson).
        * Token accounting: tracks cumulative input/output token estimates against the granted allotment ceiling.
        * Decoupled from existing ai_context_bubble.py (bubble lib left untouched).

CHANGE (2026-11-09): Google Search support removed (tool, parameter and schema/profile column), per project decision.
"""

import copy
import json
import logging
import math
import os
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

# ── Sibling Resolution ────────────────────────────────────────────────────────
_LIB_DIR = os.path.dirname(os.path.abspath(__file__))
if _LIB_DIR not in sys.path:
    sys.path.insert(0, _LIB_DIR)

_CORE_DIR = os.path.join(os.path.dirname(_LIB_DIR), "Core")
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)

try:
    from lib_bejson_Core_bejson_core import (
        bejson_core_atomic_write,
        bejson_core_get_field_map,
        bejson_core_load_file,
    )
except ImportError:
    bejson_core_atomic_write = None
    bejson_core_get_field_map = None
    bejson_core_load_file = None

try:
    from lib_bejson_AI_chat_interactions_engine import (
        InteractionsChatEngine,
        InteractionReply,
    )
except ImportError:
    InteractionsChatEngine = None
    InteractionReply = None

logger = logging.getLogger("lib_bejson_AI_interactions_bubble")

VERSION = "1.0.1"
CONFIG_SCHEMA_NAME = "InteractionsBubbleConfig"
DEFAULT_CONFIG_FILENAME = "interactions_bubble.104a.bejson"
DEFAULT_MAX_TOKENS = 80000
DEFAULT_CHARS_PER_TOKEN = 4.0
CORE_ALLOTMENT_NAME = "interactions_session"
PROFILE_ALLOTMENT_NAME = "profile"

# ─── Data Contracts ──────────────────────────────────────────────────────────

@dataclass
class InteractionsBubbleContext:
    """Context object passed to hooked allotment builders."""
    session_id: str
    turn_index: int
    interaction_id: Optional[str]
    user_message: str
    total_budget_tokens: int
    granted_tokens: int
    granted_chars: int
    profile_data: Optional[Dict[str, Any]] = None


@dataclass
class InteractionsAllotment:
    """Registered allotment entry in the hybridized bubble."""
    name: str
    rank: int
    pct: float
    enabled: bool
    label: str
    directive: str
    builder: Optional[Callable[[InteractionsBubbleContext], str]] = None


@dataclass
class InteractionsBubbleSession:
    """Represents the live state of an interaction thread wrapped in the bubble."""
    session_id: str
    interaction_id: Optional[str] = None
    turn_index: int = 0
    model_id: str = "gemini-3.6-flash"
    system_instruction: str = ""
    profile_data: Optional[Dict[str, Any]] = None
    cumulative_tokens_used: int = 0
    granted_token_budget: int = DEFAULT_MAX_TOKENS
    budget_warning: bool = False
    created_at: str = ""
    updated_at: str = ""


@dataclass
class InteractionsPreparedTurn:
    """Pre-turn assembly package ready for dispatch."""
    session_id: str
    interaction_id: Optional[str]
    turn_index: int
    input_parts: List[Dict[str, Any]]
    system_instruction: str
    allotment_texts: Dict[str, str]
    allotment_shares: Dict[str, float]
    granted_interactions_tokens: int
    estimated_total_tokens: int
    budget_warning: bool


@dataclass
class InteractionsBubbleResult:
    """Result package returned after turn execution."""
    text: str
    thinking: str
    interaction_id: Optional[str]
    session_id: str
    turn_index: int
    notice: str
    budget_stats: Dict[str, Any]


def default_profile_allotment_builder(ctx: InteractionsBubbleContext) -> str:
    """
    Builds profile context for the turn:
    - Extracts System_Instruction
    - Extracts Parser_Language, Parser, and Renderer
    - Formats output contract specification so the model outputs conforming syntax
    """
    prof = ctx.profile_data or {}
    if not prof:
        return ""

    blocks = []
    sys_inst = prof.get("System_Instruction") or prof.get("SystemInstruction") or ""
    if sys_inst.strip():
        blocks.append(f"SYSTEM INSTRUCTIONS:\n{sys_inst.strip()}")

    parser_lang = prof.get("Parser_Language") or ""
    parser_code = prof.get("Parser") or ""
    renderer_code = prof.get("Renderer") or ""

    if parser_code or renderer_code or parser_lang:
        spec_lines = [
            "EMBEDDED PARSER & RENDERER CONTRACT:",
            "The client parses and renders your response using an embedded parser and renderer.",
            f"Parser Language: {parser_lang or 'standard'}",
        ]
        if parser_code:
            spec_lines.append(f"Expected Parser Specification / Routine:\n```\n{parser_code}\n```")
        if renderer_code:
            spec_lines.append(f"Target Renderer Component / Routine:\n```\n{renderer_code}\n```")
    blocks.append(
        "GLOBAL CLIENT TOOLS & COMMANDS:\n"
        "The client has a global command parser and a Web Preview Canvas screen.\n"
        "To render web interfaces, HTML prototypes, diagrams, or components to the user's Web Preview Canvas, output:\n"
        ":::tool:render_canvas\n"
        "{\n"
        '  "html": "<!DOCTYPE html><html>...</html>"\n'
        "}\n"
        ":::\n"
        "Additional client commands:\n"
        "- :::tool:clear_canvas {}::: (resets preview canvas)\n"
        "- :::tool:notify_user {\"message\": \"...\", \"type\": \"ok\"}:::\n"
        "The client parses these commands globally, logs them in the Tools tab, and renders output on the Web Preview Canvas."
    )

    return "\n\n".join(blocks)


# ─── Hybridized Interactions Bubble Engine ───────────────────────────────────

class InteractionsBubbleEngine:
    """
    Hybridized Context Bubble that wraps the Gemini Interactions API inside
    a configurable, token-capped allotment while permitting external hooks.
    """

    def __init__(self, config_dir: Optional[str] = None, *,
                 max_tokens: int = DEFAULT_MAX_TOKENS,
                 chars_per_token: float = DEFAULT_CHARS_PER_TOKEN) -> None:
        self.lock = threading.RLock()
        self.config_dir = Path(config_dir) if config_dir else Path(_LIB_DIR) / "config"
        self.max_tokens = max(10, int(max_tokens))
        self.chars_per_token = max(1.0, float(chars_per_token))

        self._allotments: Dict[str, InteractionsAllotment] = {}
        self._sessions: Dict[str, InteractionsBubbleSession] = {}

        # Register core allotment: interactions_session gets 75% baseline
        self.register_allotment(
            name=CORE_ALLOTMENT_NAME,
            builder=None,  # Core session is handled natively
            rank=1,
            pct=75.0,
            enabled=True,
            label="Interactions Session",
            directive="Stateful session thread maintained by Gemini Interactions API."
        )

        # Register profile allotment: 25% of token budget for instructions + parser/renderer context
        self.register_allotment(
            name=PROFILE_ALLOTMENT_NAME,
            builder=default_profile_allotment_builder,
            rank=2,
            pct=25.0,
            enabled=True,
            label="Profile Context",
            directive="Profile instructions, embedded parser contracts, and renderer specifications."
        )

        # Load persisted config if present
        self.load_config()

    # ── Token & Character Estimation ─────────────────────────────────────────

    def tokens_to_chars(self, tokens: int) -> int:
        return int(tokens * self.chars_per_token)

    def chars_to_tokens(self, chars: int) -> int:
        return max(1, int(math.ceil(chars / self.chars_per_token))) if chars > 0 else 0

    def estimate_input_parts_tokens(self, parts: List[Dict[str, Any]]) -> int:
        total_tokens = 0
        for p in parts:
            ptype = p.get("type", "")
            if ptype == "text":
                total_tokens += self.chars_to_tokens(len(p.get("text", "")))
            elif ptype == "image":
                total_tokens += 258  # Standard Gemini image token weight
            elif ptype == "document":
                # Rough token estimation for base64 document or plain text
                data_len = len(p.get("data", ""))
                total_tokens += max(100, int(data_len / 16))
        return total_tokens

    # ── Allotment Hook Registry ──────────────────────────────────────────────

    def register_allotment(self, name: str,
                           builder: Optional[Callable[[InteractionsBubbleContext], str]],
                           rank: int = 5,
                           pct: float = 0.0,
                           enabled: bool = True,
                           label: str = "",
                           directive: str = "") -> None:
        """Register or update an allotment hook in the hybridized bubble."""
        with self.lock:
            self._allotments[name] = InteractionsAllotment(
                name=name,
                rank=int(rank),
                pct=float(pct),
                enabled=bool(enabled),
                label=label or name,
                directive=directive or "",
                builder=builder,
            )
            logger.info("InteractionsBubble: Registered allotment hook '%s' (rank=%d, pct=%.1f%%)",
                        name, rank, pct)

    def unregister_allotment(self, name: str) -> bool:
        """Unregister an allotment hook. Core interactions_session cannot be removed."""
        if name == CORE_ALLOTMENT_NAME:
            logger.warning("InteractionsBubble: Cannot unregister core '%s'", CORE_ALLOTMENT_NAME)
            return False
        with self.lock:
            if name in self._allotments:
                del self._allotments[name]
                return True
        return False

    def get_allotment(self, name: str) -> Optional[InteractionsAllotment]:
        with self.lock:
            return copy.deepcopy(self._allotments.get(name))

    def list_allotments(self) -> List[Dict[str, Any]]:
        with self.lock:
            ordered = sorted(self._allotments.values(), key=lambda a: (a.rank, a.name))
            return [
                {
                    "name": a.name,
                    "rank": a.rank,
                    "pct": a.pct,
                    "enabled": a.enabled,
                    "label": a.label,
                    "directive": a.directive,
                }
                for a in ordered
            ]

    # ── Budget Normalization & Dynamic Spill-Up ──────────────────────────────

    def calculate_effective_shares(self) -> Dict[str, float]:
        """
        Calculates normalized percentage shares across enabled allotments.
        If only interactions_session is active, it receives 100.0%.
        """
        with self.lock:
            enabled_allotments = [a for a in self._allotments.values() if a.enabled]
            if not enabled_allotments:
                return {CORE_ALLOTMENT_NAME: 100.0}

            total_pct = sum(a.pct for a in enabled_allotments)
            if total_pct <= 0:
                # Fallback to even distribution
                share = 100.0 / len(enabled_allotments)
                return {a.name: share for a in enabled_allotments}

            return {a.name: (a.pct / total_pct) * 100.0 for a in enabled_allotments}

    # ── Session Lifecycle Management ─────────────────────────────────────────

    def get_or_create_session(self, session_id: str,
                              model_id: str = "gemini-3.6-flash",
                              system_instruction: str = "") -> InteractionsBubbleSession:
        with self.lock:
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            if session_id not in self._sessions:
                self._sessions[session_id] = InteractionsBubbleSession(
                    session_id=session_id,
                    interaction_id=None,
                    turn_index=0,
                    model_id=model_id,
                    system_instruction=system_instruction or "",
                    cumulative_tokens_used=0,
                    granted_token_budget=self.max_tokens,
                    budget_warning=False,
                    created_at=now_iso,
                    updated_at=now_iso,
                )
            else:
                sess = self._sessions[session_id]
                sess.updated_at = now_iso
                if system_instruction and not sess.system_instruction:
                    sess.system_instruction = system_instruction
                if model_id:
                    sess.model_id = model_id
            return self._sessions[session_id]

    def reset_session(self, session_id: str) -> None:
        with self.lock:
            if session_id in self._sessions:
                del self._sessions[session_id]
                logger.info("InteractionsBubble: Session '%s' reset.", session_id)

    # ── Turn Preparation ─────────────────────────────────────────────────────

    def prepare_turn(self, session_id: str,
                     user_message: str,
                     attachments: Optional[List[Dict[str, Any]]] = None,
                     system_instruction: str = "",
                     model_id: str = "gemini-3.6-flash",
                     profile_data: Optional[Dict[str, Any]] = None) -> InteractionsPreparedTurn:
        """
        Prepares turn payload for the Interactions API within the budgeted allotment:
        - Turn 1: Injects system_instruction + active hooked allotments (e.g. profile, policy).
        - Turn > 1: Dispatches only delta inputs + previous_interaction_id.
        - Dynamic spill-up: Unused grants from hooked allotments spill into interactions_session.
        """
        session = self.get_or_create_session(session_id, model_id=model_id,
                                             system_instruction=system_instruction)
        if profile_data:
            session.profile_data = profile_data

        effective_shares = self.calculate_effective_shares()
        core_share = effective_shares.get(CORE_ALLOTMENT_NAME, 75.0)
        core_token_budget = int(self.max_tokens * (core_share / 100.0))

        # Evaluate hooked allotments and capture any generated text
        allotment_texts: Dict[str, str] = {}
        used_hooked_tokens = 0

        with self.lock:
            hooked = [a for a in self._allotments.values() if a.enabled and a.name != CORE_ALLOTMENT_NAME]

        for allot in hooked:
            allot_share = effective_shares.get(allot.name, 0.0)
            allot_budget_tokens = int(self.max_tokens * (allot_share / 100.0))
            allot_budget_chars = self.tokens_to_chars(allot_budget_tokens)

            ctx = InteractionsBubbleContext(
                session_id=session_id,
                turn_index=session.turn_index,
                interaction_id=session.interaction_id,
                user_message=user_message,
                total_budget_tokens=self.max_tokens,
                granted_tokens=allot_budget_tokens,
                granted_chars=allot_budget_chars,
                profile_data=profile_data or session.profile_data,
            )

            text = ""
            if allot.builder:
                try:
                    text = allot.builder(ctx) or ""
                except Exception as exc:
                    logger.error("InteractionsBubble: Builder error in '%s': %s", allot.name, exc)
                    text = ""

            if text.strip():
                # Enforce allotment character ceiling
                if len(text) > allot_budget_chars:
                    text = text[:allot_budget_chars]
                allotment_texts[allot.name] = text
                used_hooked_tokens += self.chars_to_tokens(len(text))

        # Granted tokens for core interactions session after spill-up:
        # Full budget minus whatever was actually consumed by hooked allotments
        granted_interactions_tokens = max(1, self.max_tokens - used_hooked_tokens)
        session.granted_token_budget = granted_interactions_tokens

        # Build turn input parts
        input_parts: List[Dict[str, Any]] = []

        # Process attachments into Interactions API spec
        if attachments:
            for att in attachments:
                att_name = att.get("name", "file")
                att_mimetype = (att.get("mimeType") or "application/octet-stream").strip()
                att_data = att.get("data", "")
                if not att_data:
                    continue
                if att_mimetype.startswith("image/"):
                    input_parts.append({"type": "image", "mime_type": att_mimetype, "data": att_data})
                elif att_mimetype == "application/pdf":
                    input_parts.append({"type": "document", "mime_type": "application/pdf", "data": att_data})
                else:
                    try:
                        import base64 as _b64
                        decoded = _b64.b64decode(att_data).decode("utf-8", errors="replace")
                        input_parts.append({"type": "text", "text": f"[Attachment: {att_name}]\n```\n{decoded}\n```"})
                    except Exception:
                        input_parts.append({"type": "text", "text": f"[Attachment: {att_name}]"})

        # Turn 1 vs Chained Turn
        effective_sys_inst = session.system_instruction or system_instruction

        if session.turn_index == 0 or not session.interaction_id:
            # Turn 1: Prepend any active hooked allotment text (e.g. policy) before the user message
            prepended_blocks = []
            for name, text in allotment_texts.items():
                prepended_blocks.append(f"[{name.upper()}]\n{text}")

            if prepended_blocks:
                full_initial_text = "\n\n".join(prepended_blocks) + f"\n\n{user_message}" if user_message else "\n\n".join(prepended_blocks)
                input_parts.append({"type": "text", "text": full_initial_text})
            elif user_message:
                input_parts.append({"type": "text", "text": user_message})
        else:
            # Turn > 1: Stateful continuity. Do NOT re-inject static policy or system instructions!
            if user_message:
                input_parts.append({"type": "text", "text": user_message})

        # Token estimation & budget check
        turn_input_tokens = self.estimate_input_parts_tokens(input_parts)
        estimated_total = session.cumulative_tokens_used + turn_input_tokens
        budget_warning = estimated_total >= int(granted_interactions_tokens * 0.90)
        session.budget_warning = budget_warning

        return InteractionsPreparedTurn(
            session_id=session_id,
            interaction_id=session.interaction_id,
            turn_index=session.turn_index,
            input_parts=input_parts,
            system_instruction=effective_sys_inst,
            allotment_texts=allotment_texts,
            allotment_shares=effective_shares,
            granted_interactions_tokens=granted_interactions_tokens,
            estimated_total_tokens=estimated_total,
            budget_warning=budget_warning,
        )

    # ── Turn Execution & State Mutation ──────────────────────────────────────

    def execute_turn(self, engine: Any,
                     session_id: str,
                     user_message: str,
                     attachments: Optional[List[Dict[str, Any]]] = None,
                     model: str = "gemini-3.6-flash",
                     system_instruction: str = "",
                     profile_data: Optional[Dict[str, Any]] = None,
                     code_execution: bool = False,
                     temperature: Optional[float] = None,
                     max_output_tokens: Optional[int] = None,
                     max_tokens: Optional[int] = None,
                     thinking: bool = False,
                     **kwargs: Any) -> InteractionsBubbleResult:
        """
        Executes a turn through InteractionsChatEngine within the hybridized bubble allotment.
        Updates cumulative token counts and interaction_id chaining upon success.
        """
        effective_output_tokens = max_output_tokens if max_output_tokens is not None else max_tokens
        prepared = self.prepare_turn(
            session_id=session_id,
            user_message=user_message,
            attachments=attachments,
            system_instruction=system_instruction,
            model_id=model,
            profile_data=profile_data
        )

        reply = engine.chat_turn(
            prepared.input_parts,
            model,
            system_instruction=prepared.system_instruction,
            previous_interaction_id=prepared.interaction_id,
            code_execution=code_execution,
            temperature=temperature,
            max_output_tokens=effective_output_tokens,
            thinking=thinking
        )

        # Update session state with new interaction ID and tokens
        session = self.get_or_create_session(session_id)
        with self.lock:
            session.interaction_id = reply.interaction_id or session.interaction_id
            session.turn_index += 1

            turn_input_tokens = self.estimate_input_parts_tokens(prepared.input_parts)
            turn_output_tokens = self.chars_to_tokens(len(reply.text) + len(reply.thinking))
            session.cumulative_tokens_used += (turn_input_tokens + turn_output_tokens)
            session.budget_warning = session.cumulative_tokens_used >= int(prepared.granted_interactions_tokens * 0.90)
            session.updated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        budget_stats = {
            "total_budget_tokens": self.max_tokens,
            "granted_interactions_tokens": prepared.granted_interactions_tokens,
            "estimated_used_tokens": session.cumulative_tokens_used,
            "remaining_tokens": max(0, prepared.granted_interactions_tokens - session.cumulative_tokens_used),
            "allotment_shares": prepared.allotment_shares,
            "budget_warning": session.budget_warning,
        }

        return InteractionsBubbleResult(
            text=reply.text,
            thinking=reply.thinking,
            interaction_id=session.interaction_id,
            session_id=session_id,
            turn_index=session.turn_index,
            notice=reply.notice,
            budget_stats=budget_stats,
        )

    # ── Status & Metrics ─────────────────────────────────────────────────────

    def get_metrics(self, session_id: str) -> Dict[str, Any]:
        """Returns comprehensive bubble and allotment metrics for UI rendering."""
        with self.lock:
            session = self._sessions.get(session_id)
            effective_shares = self.calculate_effective_shares()
            core_share = effective_shares.get(CORE_ALLOTMENT_NAME, 100.0)
            granted = int(self.max_tokens * (core_share / 100.0))

            return {
                "session_id": session_id,
                "interaction_id": session.interaction_id if session else None,
                "turn_index": session.turn_index if session else 0,
                "total_budget_tokens": self.max_tokens,
                "granted_interactions_tokens": granted,
                "cumulative_tokens_used": session.cumulative_tokens_used if session else 0,
                "remaining_tokens": max(0, granted - (session.cumulative_tokens_used if session else 0)),
                "budget_warning": session.budget_warning if session else False,
                "effective_shares": effective_shares,
                "allotments": [
                    {
                        "name": a.name,
                        "rank": a.rank,
                        "pct": a.pct,
                        "enabled": a.enabled,
                        "label": a.label,
                    }
                    for a in sorted(self._allotments.values(), key=lambda x: (x.rank, x.name))
                ]
            }

    # ── BEJSON 104a Persistence ──────────────────────────────────────────────

    def get_config_path(self) -> Path:
        return self.config_dir / DEFAULT_CONFIG_FILENAME

    def load_config(self) -> bool:
        """Load allotments and budget settings from BEJSON 104a file."""
        cfg_path = self.get_config_path()
        if not cfg_path.is_file():
            self.save_config()
            return True

        try:
            with open(cfg_path, "r", encoding="utf-8") as fh:
                doc = json.load(fh)

            fmap = bejson_core_get_field_map(doc) if bejson_core_get_field_map else {
                str(f.get("name", "")).strip(): i for i, f in enumerate(doc.get("Fields", []))
            }

            if "Max_Total_Tokens" in doc:
                self.max_tokens = int(doc["Max_Total_Tokens"])
            if "Chars_Per_Token" in doc:
                self.chars_per_token = float(doc["Chars_Per_Token"])

            i_name = fmap.get("name")
            i_rank = fmap.get("rank")
            i_pct = fmap.get("pct")
            i_enabled = fmap.get("enabled")
            i_label = fmap.get("label")
            i_directive = fmap.get("directive")

            if None in (i_name, i_rank, i_pct, i_enabled):
                return False

            with self.lock:
                for row in doc.get("Values", []):
                    name = str(row[i_name]).strip()
                    rank = int(row[i_rank])
                    pct = float(row[i_pct])
                    enabled = bool(row[i_enabled])
                    label = str(row[i_label]) if i_label is not None else name
                    directive = str(row[i_directive]) if i_directive is not None else ""

                    if name in self._allotments:
                        # Update configuration parameters while preserving registered builders
                        self._allotments[name].rank = rank
                        self._allotments[name].pct = pct
                        self._allotments[name].enabled = enabled
                        self._allotments[name].label = label
                        self._allotments[name].directive = directive
                    else:
                        self._allotments[name] = InteractionsAllotment(
                            name=name, rank=rank, pct=pct, enabled=enabled,
                            label=label, directive=directive, builder=None
                        )
            return True
        except Exception as exc:
            logger.error("InteractionsBubble: Failed to load config from %s: %s", cfg_path, exc)
            return False

    def save_config(self) -> bool:
        """Persist allotments and budget settings to BEJSON 104a."""
        cfg_path = self.get_config_path()
        cfg_path.parent.mkdir(parents=True, exist_ok=True)

        with self.lock:
            ordered = sorted(self._allotments.values(), key=lambda a: (a.rank, a.name))
            values = [
                [a.name, a.rank, a.pct, a.enabled, a.label, a.directive]
                for a in ordered
            ]

        doc = {
            "Format": "BEJSON",
            "Format_Version": "104a",
            "Format_Creator": "Elton Boehnen",
            "Schema_Name": CONFIG_SCHEMA_NAME,
            "Schema_Version": "1.0.0",
            "Max_Total_Tokens": self.max_tokens,
            "Chars_Per_Token": self.chars_per_token,
            "Records_Type": ["Allotment"],
            "Fields": [
                {"name": "name", "type": "string"},
                {"name": "rank", "type": "integer"},
                {"name": "pct", "type": "number"},
                {"name": "enabled", "type": "boolean"},
                {"name": "label", "type": "string"},
                {"name": "directive", "type": "string"}
            ],
            "Values": values
        }

        try:
            if bejson_core_atomic_write:
                bejson_core_atomic_write(str(cfg_path), doc)
            else:
                tmp_path = cfg_path.with_suffix(".tmp")
                with open(tmp_path, "w", encoding="utf-8") as fh:
                    json.dump(doc, fh, indent=2)
                tmp_path.replace(cfg_path)
            return True
        except Exception as exc:
            logger.error("InteractionsBubble: Failed to save config to %s: %s", cfg_path, exc)
            return False


# Global default engine singleton
_DEFAULT_ENGINE: Optional[InteractionsBubbleEngine] = None

def get_interactions_bubble_engine(config_dir: Optional[str] = None) -> InteractionsBubbleEngine:
    global _DEFAULT_ENGINE
    if _DEFAULT_ENGINE is None:
        _DEFAULT_ENGINE = InteractionsBubbleEngine(config_dir)
    return _DEFAULT_ENGINE
