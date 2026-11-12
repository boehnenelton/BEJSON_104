########################################
# lib_bejson_AI_interactions_multiturn
# Bounded Autonomous Multi-Turn Execution Coordinator for Gemini Interactions API
# Version: 1.0.0
# Date Created: 2026-11-06
# Author Credit: Elton Boehnen · boehnenelton2024@gmail.com
# Website: https://boehnenelton2024.pages.dev
# Github: https://github.com/boehnenelton
# RELATIONAL_ID: bejson-ai-interactions-multiturn-001
########################################

import os
import sys
import re
import json
import time
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

# Dynamic relative path bootstrapping
_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent.parent
_LIB_CORE_DIR = _REPO_ROOT / "lib" / "Core"
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))
if str(_LIB_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(_LIB_CORE_DIR))

try:
    from lib_bejson_AI_interactions_bubble import (
        InteractionsBubbleEngine,
        InteractionsBubbleResult,
        get_interactions_bubble_engine,
        DEFAULT_MAX_TOKENS,
    )
except ImportError:
    InteractionsBubbleEngine = None
    InteractionsBubbleResult = None
    get_interactions_bubble_engine = None
    DEFAULT_MAX_TOKENS = 80000

try:
    from lib_bejson_AI_chat_url_fetch import url_fetch_many
except ImportError:
    url_fetch_many = None

logger = logging.getLogger("lib_bejson_AI_interactions_multiturn")

VERSION = "1.0.0"
DEFAULT_MAX_AUTONOMOUS_TURNS = 10
DEFAULT_LOOP_TIMEOUT_SECONDS = 180.0

TOOL_COMMAND_REGEX = re.compile(r":::tool:([a-zA-Z0-9_\-]+)\s*(\{[\s\S]*?\})\s*:::")


@dataclass
class MultiTurnStep:
    """Record of a single step in the multi-turn trajectory."""
    turn_index: int
    input_text: str
    output_text: str
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)
    tool_results: List[Dict[str, Any]] = field(default_factory=list)
    interaction_id: Optional[str] = None
    tokens_used: int = 0
    duration_sec: float = 0.0
    timestamp: str = ""


@dataclass
class MultiTurnExecutionResult:
    """Outcome package of a bounded multi-turn execution sequence."""
    session_id: str
    status: str  # "completed", "max_turns_exceeded", "budget_exhausted", "error"
    final_text: str
    total_turns: int
    max_turns: int
    interaction_id: Optional[str]
    steps: List[MultiTurnStep] = field(default_factory=list)
    budget_stats: Dict[str, Any] = field(default_factory=dict)
    execution_duration_sec: float = 0.0
    error_message: Optional[str] = None


class InteractionsMultiTurnCoordinator:
    """
    Coordinates bounded autonomous multi-turn loops for Gemini Interactions API.
    Governs turn steps (1, 2, 3... up to max_turns = 10), dispatches tool feedback,
    and enforces token budgeting via the hybridized Interactions Bubble.
    """

    def __init__(self,
                 bubble_engine: Optional[InteractionsBubbleEngine] = None,
                 *,
                 default_max_turns: int = DEFAULT_MAX_AUTONOMOUS_TURNS,
                 tool_dispatcher: Optional[Callable[[str, Dict[str, Any]], Dict[str, Any]]] = None) -> None:
        self.bubble_engine = bubble_engine or (get_interactions_bubble_engine() if get_interactions_bubble_engine else None)
        self.default_max_turns = max(1, int(default_max_turns))
        self.custom_tool_dispatcher = tool_dispatcher
        self._built_in_tools: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {
            "fetch_url": self._tool_fetch_url,
            "render_markdown": self._tool_render_markdown,
            "render_canvas": self._tool_render_canvas,
            "clear_canvas": self._tool_clear_canvas,
            "notify_user": self._tool_notify_user,
        }

    # ── Tool Handlers ────────────────────────────────────────────────────────

    def register_tool_handler(self, name: str, handler: Callable[[Dict[str, Any]], Dict[str, Any]]) -> None:
        """Register or override a tool execution handler."""
        self._built_in_tools[name] = handler

    def _tool_fetch_url(self, args: Dict[str, Any]) -> Dict[str, Any]:
        url = args.get("url") or args.get("target_url") or ""
        if not url:
            return {"status": "error", "message": "Missing 'url' parameter"}
        if url_fetch_many is not None:
            results = url_fetch_many([url], max_urls=1)
            content = results[0].get("text", "") if results else ""
            return {"status": "success", "url": url, "content": content[:8000]}
        return {"status": "error", "message": "url_fetch_many unavailable"}

    def _tool_render_markdown(self, args: Dict[str, Any]) -> Dict[str, Any]:
        md_text = args.get("markdown") or ""
        return {"status": "success", "parsed_length": len(md_text)}

    def _tool_render_canvas(self, args: Dict[str, Any]) -> Dict[str, Any]:
        html = args.get("html") or args.get("content") or ""
        return {"status": "success", "action": "render_canvas", "bytes": len(html), "terminal": True}

    def _tool_clear_canvas(self, args: Dict[str, Any]) -> Dict[str, Any]:
        return {"status": "success", "action": "clear_canvas"}

    def _tool_notify_user(self, args: Dict[str, Any]) -> Dict[str, Any]:
        msg = args.get("message") or ""
        return {"status": "success", "notified": msg}

    def dispatch_tool(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Dispatches tool execution to custom dispatcher or built-in handler."""
        if self.custom_tool_dispatcher is not None:
            try:
                res = self.custom_tool_dispatcher(tool_name, args)
                if res is not None:
                    return res
            except Exception as exc:
                logger.error("Custom tool dispatcher error for %s: %s", tool_name, exc)
                return {"status": "error", "error": str(exc)}

        handler = self._built_in_tools.get(tool_name)
        if handler:
            try:
                return handler(args)
            except Exception as exc:
                logger.error("Built-in tool handler error for %s: %s", tool_name, exc)
                return {"status": "error", "error": str(exc)}

        return {"status": "ignored", "message": f"Client-only or unknown tool '{tool_name}'"}

    # ── Command Extraction ───────────────────────────────────────────────────

    def extract_tool_commands(self, text: str) -> List[Tuple[str, Dict[str, Any], str]]:
        """
        Extracts tool calls from LLM output.
        Returns: [(tool_name, args_dict, full_match_text), ...]
        """
        commands = []
        if not text:
            return commands

        for match in TOOL_COMMAND_REGEX.finditer(text):
            tool_name = match.group(1).strip()
            raw_json = match.group(2).strip()
            try:
                args = json.loads(raw_json)
            except Exception:
                args = {"raw": raw_json}
            commands.append((tool_name, args, match.group(0)))

        return commands

    # ── Bounded Multi-Turn Execution Loop ─────────────────────────────────────

    def execute_bounded_loop(self,
                             engine: Any,
                             session_id: str,
                             initial_prompt: str,
                             *,
                             attachments: Optional[List[Dict[str, Any]]] = None,
                             model: str = "gemini-3.6-flash",
                             system_instruction: str = "",
                             profile_data: Optional[Dict[str, Any]] = None,
                             max_turns: Optional[int] = None,
                             temperature: float = 0.7,
                             max_tokens: int = 8192,
                             thinking: bool = False,
                             timeout_sec: float = DEFAULT_LOOP_TIMEOUT_SECONDS) -> MultiTurnExecutionResult:
        """
        Executes bounded multi-turn sequence (1, 2, 3... up to max_turns).
        Stops automatically when:
        1. AI produces final response without unhandled tools.
        2. AI emits terminal command (e.g. render_canvas without further requests).
        3. Loop bound reached (max_turns).
        4. Cumulative token ceiling reached.
        """
        start_time = time.time()
        effective_max_turns = min(20, max(1, int(max_turns or self.default_max_turns)))
        steps: List[MultiTurnStep] = []
        current_input = initial_prompt
        current_attachments = attachments or []
        last_interaction_id: Optional[str] = None
        final_text = ""
        loop_status = "completed"
        error_msg = None

        turn_index = 1
        while turn_index <= effective_max_turns:
            step_start = time.time()
            if (time.time() - start_time) > timeout_sec:
                loop_status = "timeout"
                error_msg = f"Multi-turn sequence exceeded timeout of {timeout_sec}s"
                break

            logger.info("Executing multi-turn step %d/%d for session %s",
                        turn_index, effective_max_turns, session_id)

            # Step 1 sends full system instructions + profile; Step 2+ chains deltas
            try:
                if self.bubble_engine is not None:
                    bubble_res: InteractionsBubbleResult = self.bubble_engine.execute_turn(
                        engine=engine,
                        session_id=session_id,
                        user_message=current_input,
                        attachments=current_attachments if turn_index == 1 else [],
                        model=model,
                        system_instruction=system_instruction,
                        profile_data=profile_data,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        thinking=thinking
                    )
                    reply_text = bubble_res.text
                    last_interaction_id = bubble_res.interaction_id or last_interaction_id
                    tokens_used = bubble_res.budget_stats.get("estimated_total_tokens", 0)
                else:
                    # Direct engine invocation fallback
                    parts = []
                    if turn_index == 1 and current_attachments:
                        for att in current_attachments:
                            parts.append({"type": "document", "mime_type": att.get("mimeType", "text/plain"), "data": att.get("data", "")})
                    if current_input:
                        parts.append({"type": "text", "text": current_input})

                    direct_reply = engine.chat_turn(
                        parts,
                        model=model,
                        system_instruction=system_instruction if turn_index == 1 else "",
                        previous_interaction_id=last_interaction_id,
                        temperature=temperature,
                        max_output_tokens=max_tokens,
                        thinking=thinking
                    )
                    reply_text = direct_reply.text
                    last_interaction_id = direct_reply.interaction_id or last_interaction_id
                    tokens_used = len(reply_text) // 4
            except Exception as exc:
                logger.error("Multi-turn step %d failed: %s", turn_index, exc)
                loop_status = "error"
                error_msg = str(exc)
                break

            final_text = reply_text
            tool_commands = self.extract_tool_commands(reply_text)
            step_tool_calls: List[Dict[str, Any]] = []
            step_tool_results: List[Dict[str, Any]] = []
            needs_another_turn = False
            feedback_parts: List[str] = []

            for tool_name, tool_args, _ in tool_commands:
                step_tool_calls.append({"name": tool_name, "args": tool_args})
                exec_result = self.dispatch_tool(tool_name, tool_args)
                step_tool_results.append({"name": tool_name, "result": exec_result})

                # If the tool provides server-side data (e.g. fetched content), feed it back to AI
                if tool_name == "fetch_url" and exec_result.get("status") == "success":
                    needs_another_turn = True
                    feedback_parts.append(
                        f"[TOOL OUTPUT: fetch_url for {exec_result.get('url')}]:\n{exec_result.get('content', '')}"
                    )
                elif tool_name == "profile_parser" and exec_result.get("status") == "success":
                    needs_another_turn = True
                    feedback_parts.append(
                        f"[TOOL OUTPUT: profile_parser result]:\n{json.dumps(exec_result)}"
                    )

            step = MultiTurnStep(
                turn_index=turn_index,
                input_text=current_input,
                output_text=reply_text,
                tool_calls=step_tool_calls,
                tool_results=step_tool_results,
                interaction_id=last_interaction_id,
                tokens_used=tokens_used,
                duration_sec=time.time() - step_start,
                timestamp=time.strftime("%Y-%m-%d %H:%M:%S")
            )
            steps.append(step)

            # Check termination
            if not needs_another_turn:
                logger.info("Multi-turn sequence completed naturally at step %d", turn_index)
                loop_status = "completed"
                break

            if turn_index >= effective_max_turns:
                logger.warning("Multi-turn sequence hit loop bound limit (%d turns)", effective_max_turns)
                loop_status = "max_turns_exceeded"
                break

            # Prepare delta input for the next turn
            current_input = "\n\n".join(feedback_parts)
            current_attachments = []
            turn_index += 1

        total_duration = time.time() - start_time
        budget_metrics = self.bubble_engine.get_metrics(session_id) if self.bubble_engine else {}

        return MultiTurnExecutionResult(
            session_id=session_id,
            status=loop_status,
            final_text=final_text,
            total_turns=len(steps),
            max_turns=effective_max_turns,
            interaction_id=last_interaction_id,
            steps=steps,
            budget_stats=budget_metrics,
            execution_duration_sec=total_duration,
            error_message=error_msg
        )
