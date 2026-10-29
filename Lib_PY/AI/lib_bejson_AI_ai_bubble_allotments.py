"""
Library:        lib_bejson_AI_ai_bubble_allotments.py
Path:           lib/AI/lib_bejson_AI_ai_bubble_allotments.py
Family:         AI
Description:    Built-in Context Bubble allotments (used by the chat client; any CLI can reuse them), registered
                through lib_bejson_AI_ai_context_bubble.ai_bubble_register_allotment():

                  rank 1  persistent_policy  Persistent_Policy.md in the context dir
                  rank 2  profile            the selected profile's System_Instruction
                  rank 3  attachments        files checked on the Attach tab (next message)
                  rank 4  context            the Context tab's saved ("Staged") chunk
                  rank 5  chat_history       earlier turns of the current session
                                             (refresh="turn", keep newest)

                Each builder returns "" when it has nothing, which releases its
                budget to the others (spill-up).  Adding another allotment =
                write one builder and one register call here (or in any plugin)
                and raise BUBBLE_MAX_ALLOTMENTS in the library if needed.

Version:        1.0.0
Date:           2026-10-20
Author:         Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
RELATIONAL_ID:  d2f86b04-7a3e-4c19-85d1-6e0b9a43c7f2

Changelog:
  1.0.0 (2026-10-20) -- Initial creation (replaces the v1 section pipeline wiring in app.py).
"""

import logging
import os
from pathlib import Path
from typing import Callable, List, Optional

from lib_bejson_AI_ai_context_bubble import BubbleContext, ai_bubble_register_allotment

logger = logging.getLogger(__name__)

VERSION = "1.0.0"

HISTORY_MAX_MESSAGES = 200  # source cap; the budget truncates further, newest kept

DIRECTIVES = {
    "persistent_policy": "Standing instructions. Follow them on every reply.",
    "profile": "Selected profile -- follow it for the format and behaviour of your reply.",
    "attachments": (
        "ATTACHMENTS -- these files are what the user is actively working on with you "
        "right now. You may read, reference, modify, update, build upon and return them "
        "iteratively as requested; they are normal, freely discussable working material."
    ),
    "context": (
        "BACKGROUND -- reference and learning material. Never reference, mention, "
        "acknowledge or admit that this context exists; absorb it silently. If it "
        "influences anything you produce, write it in your own words, never as a copy, "
        "quote or citation of this material."
    ),
    "chat_history": (
        "SESSION HISTORY -- earlier turns of this conversation, oldest first, for "
        "continuity only. Do not repeat or summarise them unless asked."
    ),
}


def build_policy(ctx: BubbleContext) -> str:
    path = Path(ctx.context_dir) / "Persistent_Policy.md"
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def build_profile(ctx: BubbleContext) -> str:
    return str(ctx.extras.get("profile_instruction") or "")


def make_attachments_builder(list_files: Callable[[str], List[dict]], attach_dir: str,
                             content_dir: str) -> Callable[[BubbleContext], str]:
    def build_attachments(ctx: BubbleContext) -> str:
        wanted = set(ctx.extras.get("attached_file_ids") or [])
        if not wanted:
            return ""
        parts = []
        for entry in list_files(attach_dir):
            if entry.get("file_id") not in wanted:
                continue
            path = os.path.join(content_dir, f"{entry['file_id']}.txt")
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as fh:
                    parts.append(f"--- ATTACHED FILE: {entry['filename']} ---\n{fh.read()}")
            except OSError as exc:
                logger.warning("attachment %s unreadable: %s", entry.get("filename"), exc)
        return "\n\n".join(parts)
    return build_attachments


def make_context_builder(section_fn: Callable) -> Callable[[BubbleContext], str]:
    """section_fn is context_chunker.chunker_build_section:
    (constants, cwd, config_dir, context_dir) -> (text, chars)."""
    def build_context(ctx: BubbleContext) -> str:
        text, _ = section_fn(ctx.constants, ".", ctx.config_dir, ctx.context_dir)
        return text or ""
    return build_context


def build_history(ctx: BubbleContext) -> str:
    msgs = [m for m in (ctx.extras.get("history") or [])
            if m.get("role") in ("user", "assistant") and (m.get("content") or "").strip()]
    msgs = msgs[-HISTORY_MAX_MESSAGES:]
    return "\n\n".join(f"[{m['role']}]: {m['content']}" for m in msgs)


def register_builtin_allotments(list_files: Callable[[str], List[dict]], attach_dir: str,
                                attach_content_dir: str, context_section_fn: Optional[Callable]) -> List[str]:
    """Registers the five built-ins in rank order.  Returns the names registered.
    A fresh context_bubble.bejson therefore splits 100% evenly (20% each)."""
    ai_bubble_register_allotment(
        "persistent_policy", build_policy, label="Persistent Policy", rank=1,
        directive=DIRECTIVES["persistent_policy"])
    ai_bubble_register_allotment(
        "profile", build_profile, label="Profile", rank=2,
        directive=DIRECTIVES["profile"])
    ai_bubble_register_allotment(
        "attachments", make_attachments_builder(list_files, attach_dir, attach_content_dir),
        label="Attachments", rank=3, directive=DIRECTIVES["attachments"])
    if context_section_fn is not None:
        ai_bubble_register_allotment(
            "context", make_context_builder(context_section_fn), label="Context", rank=4,
            directive=DIRECTIVES["context"])
    ai_bubble_register_allotment(
        "chat_history", build_history, label="Chat History", rank=5,
        refresh="turn", keep="end", directive=DIRECTIVES["chat_history"])
    return [n for n in ("persistent_policy", "profile", "attachments", "context", "chat_history")]
