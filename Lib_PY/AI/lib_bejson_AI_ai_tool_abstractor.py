"""
Library:         lib_bejson_AI_ai_tool_abstractor.py
Path:            lib/AI/lib_bejson_AI_ai_tool_abstractor.py
Family:          AI
Module Purpose:  Translation layer between the AI call libs and the tool gateway. Tools are
                 authored once in a neutral shape (name, description, JSON-Schema parameters).
                 Per-service "dialects" convert them to the wire format a service expects,
                 parse that service's tool-call responses into neutral ToolCall objects,
                 execute them through the gateway, and format the results as the service's
                 tool-result message.
Architecture:    call lib  ->  ToolAbstractor  ->  gateway (tool_gateway.ToolGateway)  ->  handler.py
Dialects:        openai              Ollama /api/chat, OpenAI-compatible (OllamaLocal, Ollama, OpenRouter, Groq, Grok, TokenRouter, HuggingFace)
                 gemini_rest         generateContent functionDeclarations (LiteRTLM, Gemini REST)
                 gemini_interactions Interactions API flat declarations / function_call steps (GeminiInteractions)
Version:         1.0.0
Release_Version: 300
Date:            2026-11-10
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   b4a7c1e9-5d28-4f36-8a0b-3e91d6c72f58

The gateway is duck-typed: any object with list_available_tools(service, model) and
execute_tool(name, args, service, model) works, which keeps this lib testable and independent
of the local_client package.
"""

from __future__ import annotations

import copy
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Protocol

logger = logging.getLogger("lib_bejson_AI_ai_tool_abstractor")

VERSION = "1.0.0"

# Service name -> dialect name. Matches the service names used by AIModelRegistry.
SERVICE_DIALECTS: Dict[str, str] = {
    "OllamaLocal": "openai",
    "Ollama": "openai",
    "OpenRouter": "openai",
    "Groq": "openai",
    "Grok": "openai",
    "TokenRouter": "openai",
    "HuggingFace": "openai",
    "LiteRTLM": "gemini_rest",
    "Gemini": "gemini_rest",
    "GeminiInteractions": "gemini_interactions",
}
DEFAULT_DIALECT = "openai"

# JSON-Schema keys the Gemini function-declaration schema subset does not accept.
_GEMINI_STRIP_KEYS = frozenset({"additionalProperties", "$schema", "$id", "examples"})


class GatewayLike(Protocol):
    def list_available_tools(self, service: str = ..., model: str = ...) -> List[Dict[str, Any]]: ...
    def execute_tool(self, name: str, args: Optional[Dict[str, Any]] = ..., service: str = ..., model: str = ...) -> Dict[str, Any]: ...


@dataclass
class ToolCall:
    """A model-requested tool invocation, normalised across services."""
    name: str
    args: Dict[str, Any] = field(default_factory=dict)
    call_id: str = ""
    args_error: str = ""


@dataclass
class ToolResult:
    """Outcome of executing one ToolCall."""
    call: ToolCall
    ok: bool
    content: str
    raw: Dict[str, Any] = field(default_factory=dict)


# ----------------------------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------------------------
def neutral_tool(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Reduce a gateway tool entry to the neutral spec."""
    return {
        "name": str(entry.get("name", "")).strip(),
        "description": str(entry.get("description", "")).strip(),
        "parameters": copy.deepcopy(entry.get("parameters") or {"type": "object", "properties": {}}),
    }


def _strip_schema_keys(node: Any, banned: frozenset) -> Any:
    if isinstance(node, dict):
        return {k: _strip_schema_keys(v, banned) for k, v in node.items() if k not in banned}
    if isinstance(node, list):
        return [_strip_schema_keys(v, banned) for v in node]
    return node


def coerce_args(raw: Any) -> tuple[Dict[str, Any], str]:
    """Return (args_dict, error). Accepts dicts, JSON strings, None."""
    if raw is None or raw == "":
        return {}, ""
    if isinstance(raw, dict):
        return dict(raw), ""
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except ValueError as exc:
            return {}, f"Tool arguments are not valid JSON: {exc}"
        if isinstance(parsed, dict):
            return parsed, ""
        return {}, "Tool arguments must be a JSON object."
    return {}, f"Unsupported tool argument type: {type(raw).__name__}"


def _result_text(result: Dict[str, Any]) -> tuple[bool, str]:
    """Flatten a gateway execute_tool() result into (ok, text)."""
    status = result.get("status")
    if status != "success":
        return False, "ERROR: " + str(result.get("error") or status or "tool failed")
    output = result.get("output")
    if isinstance(output, dict) and output.get("status") == "error":
        return False, "ERROR: " + str(output.get("error") or "tool failed")
    if isinstance(output, str):
        return True, output
    try:
        return True, json.dumps(output, ensure_ascii=False)
    except (TypeError, ValueError):
        return True, str(output)


# ----------------------------------------------------------------------------------------------
# Dialects
# ----------------------------------------------------------------------------------------------
class Dialect:
    name = "base"

    def declarations(self, tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    def parse_calls(self, response: Dict[str, Any]) -> List[ToolCall]:
        raise NotImplementedError

    def format_result(self, result: ToolResult) -> Dict[str, Any]:
        raise NotImplementedError


class OpenAIDialect(Dialect):
    """Ollama /api/chat and OpenAI-compatible chat completions."""
    name = "openai"

    def declarations(self, tools):
        return [{"type": "function",
                 "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}}
                for t in tools]

    @staticmethod
    def _message(response: Dict[str, Any]) -> Dict[str, Any]:
        if isinstance(response.get("message"), dict):            # Ollama
            return response["message"]
        choices = response.get("choices")                        # OpenAI-style
        if isinstance(choices, list) and choices and isinstance(choices[0], dict):
            msg = choices[0].get("message")
            if isinstance(msg, dict):
                return msg
        return response if "tool_calls" in response else {}

    def parse_calls(self, response):
        calls: List[ToolCall] = []
        for item in self._message(response).get("tool_calls") or []:
            fn = (item or {}).get("function") or {}
            name = str(fn.get("name") or "").strip()
            if not name:
                continue
            args, err = coerce_args(fn.get("arguments"))
            calls.append(ToolCall(name=name, args=args, call_id=str(item.get("id") or ""), args_error=err))
        return calls

    def format_result(self, result):
        msg: Dict[str, Any] = {"role": "tool", "tool_name": result.call.name, "content": result.content}
        if result.call.call_id:
            msg["tool_call_id"] = result.call.call_id
        return msg


class GeminiRestDialect(Dialect):
    """generateContent functionDeclarations (LiteRT-LM, Gemini REST)."""
    name = "gemini_rest"

    def declarations(self, tools):
        if not tools:
            return []
        return [{"functionDeclarations": [
            {"name": t["name"], "description": t["description"],
             "parameters": _strip_schema_keys(t["parameters"], _GEMINI_STRIP_KEYS)}
            for t in tools]}]

    def parse_calls(self, response):
        calls: List[ToolCall] = []
        for cand in response.get("candidates") or []:
            for part in ((cand or {}).get("content") or {}).get("parts") or []:
                fc = (part or {}).get("functionCall")
                if not isinstance(fc, dict) or not fc.get("name"):
                    continue
                args, err = coerce_args(fc.get("args"))
                calls.append(ToolCall(name=str(fc["name"]), args=args, call_id=str(fc.get("id") or ""), args_error=err))
            if calls:
                break
        return calls

    def format_result(self, result):
        return {"role": "user",
                "parts": [{"functionResponse": {"name": result.call.name,
                                                "response": {"ok": result.ok, "result": result.content}}}]}


class GeminiInteractionsDialect(Dialect):
    """Interactions API: flat declarations, function_call steps, function_result input."""
    name = "gemini_interactions"

    def declarations(self, tools):
        return [{"type": "function", "name": t["name"], "description": t["description"],
                 "parameters": _strip_schema_keys(t["parameters"], _GEMINI_STRIP_KEYS)} for t in tools]

    def parse_calls(self, response):
        calls: List[ToolCall] = []
        for step in response.get("steps") or []:
            if (step or {}).get("type") != "function_call" or not step.get("name"):
                continue
            args, err = coerce_args(step.get("arguments"))      # "arguments", NOT "args"
            calls.append(ToolCall(name=str(step["name"]), args=args, call_id=str(step.get("id") or ""), args_error=err))
        return calls

    def format_result(self, result):
        return {"type": "function_result", "name": result.call.name, "call_id": result.call.call_id,
                "result": [{"type": "text", "text": result.content}]}


_DIALECTS: Dict[str, Dialect] = {d.name: d for d in (OpenAIDialect(), GeminiRestDialect(), GeminiInteractionsDialect())}


def register_dialect(dialect: Dialect, services: Optional[List[str]] = None) -> None:
    """Add or replace a dialect; optionally bind service names to it."""
    _DIALECTS[dialect.name] = dialect
    for svc in services or []:
        SERVICE_DIALECTS[svc] = dialect.name


def dialect_for(service: str) -> Dialect:
    name = SERVICE_DIALECTS.get(service)
    if name is None:
        logger.warning("[tool_abstractor] No dialect bound to service %r; using %r.", service, DEFAULT_DIALECT)
        name = DEFAULT_DIALECT
    return _DIALECTS[name]


# ----------------------------------------------------------------------------------------------
# Abstractor
# ----------------------------------------------------------------------------------------------
class ToolAbstractor:
    def __init__(self, gateway: GatewayLike):
        self.gateway = gateway

    def neutral_tools(self, service: str, model: str = "") -> List[Dict[str, Any]]:
        return [neutral_tool(t) for t in self.gateway.list_available_tools(service, model) if t.get("name")]

    def declarations(self, service: str, model: str = "") -> List[Dict[str, Any]]:
        """Tool declarations in the wire format of `service` (empty when no tools are active)."""
        return dialect_for(service).declarations(self.neutral_tools(service, model))

    def system_instruction(self, service: str, model: str = "") -> str:
        parts = [str(t.get("instruction", "")).strip() for t in self.gateway.list_available_tools(service, model)]
        return "\n".join(p for p in parts if p)

    def parse_calls(self, service: str, response: Dict[str, Any]) -> List[ToolCall]:
        if not isinstance(response, dict):
            return []
        return dialect_for(service).parse_calls(response)

    def execute(self, service: str, call: ToolCall, model: str = "") -> ToolResult:
        if call.args_error:
            return ToolResult(call, False, "ERROR: " + call.args_error)
        known = {t["name"] for t in self.neutral_tools(service, model)}
        if call.name not in known:
            return ToolResult(call, False, f"ERROR: unknown tool '{call.name}'. Available: {', '.join(sorted(known)) or 'none'}")
        try:
            raw = self.gateway.execute_tool(call.name, call.args, service, model)
        except Exception as exc:  # gateway contract is not to raise; guard anyway
            logger.error("[tool_abstractor] gateway raised for %s: %s", call.name, exc)
            return ToolResult(call, False, f"ERROR executing tool '{call.name}': {exc}")
        ok, text = _result_text(raw)
        return ToolResult(call, ok, text, raw)

    def format_result(self, service: str, result: ToolResult) -> Dict[str, Any]:
        return dialect_for(service).format_result(result)

    def handle_response(self, service: str, response: Dict[str, Any], model: str = "") -> tuple[List[ToolCall], List[Dict[str, Any]]]:
        """
        One round: parse the model's tool calls, run them, return
        (calls, result_messages) with result_messages already in the service's wire format.
        An empty calls list means the model produced a final answer.
        """
        calls = self.parse_calls(service, response)
        messages = [self.format_result(service, self.execute(service, c, model)) for c in calls]
        return calls, messages
