"""
Library:        lib_bejson_AI_profiles_abstraction.py
Family:         AI
Description:    Profile execution abstraction and runtime adapter for
                multi-environment model dispatch (Cloud vs On-Device SLMs).
                Provides non-destructive prompt compression, low-word signal
                constraints for mobile models, and resilient pre-parser output
                sanitization while preserving canonical AI_Profile 104a schema
                immutability.
Version:        1.0.0
Date:           2026-11-08
Author:         Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
RELATIONAL_ID:  bejson-ai-profiles-abstraction-001

Changelog:
  1.0.0 (2026-11-08) -- Initial implementation of Profile Runtime Abstraction
                        layer for local and cloud models.
"""

import json
import logging
import re
from typing import Any, Dict, Iterable, Optional, Tuple

logger = logging.getLogger("lib_bejson_AI_profiles_abstraction")

VERSION = "1.0.0"

# ── Model Classifications ─────────────────────────────────────────────────────
MODEL_CLASS_CLOUD = "cloud"
MODEL_CLASS_LOCAL_SLM = "local_slm"
MODEL_CLASS_CONSTRAINED = "constrained"

LOCAL_SERVICE_IDENTIFIERS = (
    "ollamalocal",
    "ollama_local",
    "litertlm",
    "litertlm_local",
    "litert_lm",
    "on_device",
)

DEFAULT_MAX_LOCAL_PROMPT_CHARS = 1200
DEFAULT_LOCAL_WORD_LIMIT = 30

# Regular expressions for resilient output extraction
FENCED_CODE_BLOCK_PATTERN = re.compile(r"```(?:json|python|javascript|js)?\s*([\s\S]*?)\s*```", re.IGNORECASE)
JSON_OBJECT_ARRAY_PATTERN = re.compile(r"(\{[\s\S]*\}|\[[\s\S]*\])")


SMALL_MODEL_PATTERN = re.compile(r"\b(?:0\.[0-9]+|[1-4](?:\.[0-9]+)?)b\b|mobile|nano|tiny", re.IGNORECASE)


def profiles_abstraction_detect_model_class(
    service_name: Optional[str] = None,
    model_name: Optional[str] = None
) -> str:
    """
    Classifies the execution environment based on service and model names.
    Local on-device SLMs receive prompt budgeting and output sanitization.
    """
    normalized_service = (service_name or "").strip().lower()
    normalized_model = (model_name or "").strip().lower()

    if any(local_identifier in normalized_service for local_identifier in LOCAL_SERVICE_IDENTIFIERS):
        return MODEL_CLASS_LOCAL_SLM

    # Identify small local model tags commonly deployed on Android (<= 4b)
    if SMALL_MODEL_PATTERN.search(normalized_model):
        return MODEL_CLASS_LOCAL_SLM

    return MODEL_CLASS_CLOUD


def profiles_abstraction_adapt_instruction(
    system_instruction: str,
    service_name: Optional[str] = None,
    model_class: Optional[str] = None,
    max_prompt_chars: int = DEFAULT_MAX_LOCAL_PROMPT_CHARS,
    signal_mode: bool = True
) -> str:
    """
    Non-destructively adapts a canonical profile's System_Instruction for the target environment.
    Cloud models receive the original instruction untouched.
    Local models receive a condensed instruction with signal and low-word discipline.
    """
    resolved_class = model_class or profiles_abstraction_detect_model_class(service_name)
    raw_instruction = (system_instruction or "").strip()

    if resolved_class == MODEL_CLASS_CLOUD or not raw_instruction:
        return raw_instruction

    # Local SLM budget adaptation
    condensed_instruction = raw_instruction
    if len(condensed_instruction) > max_prompt_chars:
        # Preserve head guidance and note condensation
        condensed_instruction = (
            condensed_instruction[:max_prompt_chars].rstrip()
            + "\n[Guidance condensed for on-device context budget]"
        )

    if signal_mode:
        signal_constraint = (
            "\n\n[LOCAL EXECUTION RULE: Respond strictly in the required format. "
            f"Limit output to under {DEFAULT_LOCAL_WORD_LIMIT} words. "
            "Do not include conversational preamble, pleasantries, or explanations.]"
        )
        condensed_instruction += signal_constraint

    return condensed_instruction


def profiles_abstraction_sanitize_output(raw_text: str) -> str:
    """
    Extracts the core data payload from model output, stripping conversational chatter.
    Essential for 1B-3B local models that add conversational framing around JSON blocks.
    """
    text_content = (raw_text or "").strip()
    if not text_content:
        return ""

    # Strategy 1: Extract from fenced code block (e.g. ```json ... ```)
    fenced_match = FENCED_CODE_BLOCK_PATTERN.search(text_content)
    if fenced_match:
        extracted = fenced_match.group(1).strip()
        if extracted:
            return extracted

    # Strategy 2: Extract outermost JSON object {...} or array [...]
    bracket_match = JSON_OBJECT_ARRAY_PATTERN.search(text_content)
    if bracket_match:
        extracted = bracket_match.group(1).strip()
        if extracted:
            return extracted

    # Strategy 3: Return original trimmed text
    return text_content


def profiles_abstraction_run_parser(
    profile: Dict[str, Any],
    raw_text: str,
    approved_fingerprints: Iterable[str],
    service_name: Optional[str] = None,
    model_class: Optional[str] = None,
    record_index: int = 0,
    timeout: float = 5.0
) -> Dict[str, Any]:
    """
    Dispatches parser execution through lib_bejson_AI_gemini_standard_profiles.
    For local SLMs, applies pre-parser sanitization and fallback heuristics
    to protect against malformed on-device conversational wrappers.
    """
    try:
        from lib_bejson_AI_gemini_standard_profiles import gemini_profiles_run_parser
    except ImportError as import_error:
        logger.error("Cannot import gemini_profiles_run_parser: %s", import_error)
        return {
            "success": False,
            "reason": f"Profile runtime unavailable: {import_error}",
            "fingerprint": None
        }

    resolved_class = model_class or profiles_abstraction_detect_model_class(service_name)

    # For cloud models, pass through directly to standard parser
    if resolved_class == MODEL_CLASS_CLOUD:
        return gemini_profiles_run_parser(
            profile=profile,
            raw_text=raw_text,
            approved_fingerprints=approved_fingerprints,
            record_index=record_index,
            timeout=timeout
        )

    # For local SLMs: first attempt with sanitized text
    sanitized_text = profiles_abstraction_sanitize_output(raw_text)
    result = gemini_profiles_run_parser(
        profile=profile,
        raw_text=sanitized_text,
        approved_fingerprints=approved_fingerprints,
        record_index=record_index,
        timeout=timeout
    )

    if result.get("success"):
        return result

    # Fallback attempt: if sanitized text failed, try raw text directly
    if sanitized_text != raw_text.strip():
        fallback_result = gemini_profiles_run_parser(
            profile=profile,
            raw_text=raw_text.strip(),
            approved_fingerprints=approved_fingerprints,
            record_index=record_index,
            timeout=timeout
        )
        if fallback_result.get("success"):
            return fallback_result

    return result
