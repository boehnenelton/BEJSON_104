"""
Library:         lib_bejson_AI_ai_dispatch.py
Family:          AI
Module Purpose:  Implements runtime functionality and logic for lib_bejson_AI_ai_dispatch.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         1.6.0
Release_Version: 300
Date:            2026-09-21
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   9c4a1e7f-3d8b-4a2c-9e6f-1b5d0a8c4f37
"""

import logging
from typing import Optional

from lib_bejson_AI_ai_response import AIResponse, ai_response_ok, ai_response_error

logger = logging.getLogger("lib_bejson_AI_ai_dispatch")

VERSION = "1.6.0"

PROVIDERS = ("groq", "openrouter", "gemini", "genai", "grok", "huggingface", "openai", "tokenrouter", "ollama")


# ── Ollama (bejson_ollama.py) ─────────────────────────────────────────────

def _adapt_ollama(user_input: str, model_id: Optional[str], system_instruction: Optional[str], **config) -> AIResponse:
    from lib_bejson_AI_bejson_ollama import get_standard_prompter

    unsupported = []
    if config:
        unsupported.append("config:" + ",".join(sorted(config.keys())))

    prompter = get_standard_prompter()
    result = prompter.prompt(user_input, model_id, system_instruction=system_instruction)  # always returns a str
    used_model = model_id or prompter.model_reg.active_model_id

    if isinstance(result, str) and result.startswith("ERROR:"):
        return ai_response_error(result, provider="ollama", model_id=used_model,
                                  unsupported_params=unsupported, raw=result)
    return ai_response_ok(result, provider="ollama", model_id=used_model,
                           unsupported_params=unsupported, raw=result)


# ── TokenRouter (bejson_tokenrouter.py) ───────────────────────────────────

def _adapt_tokenrouter(user_input: str, model_id: Optional[str], system_instruction: Optional[str], **config) -> AIResponse:
    from lib_bejson_AI_bejson_tokenrouter import get_standard_prompter

    unsupported = []
    if config:
        unsupported.append("config:" + ",".join(sorted(config.keys())))

    prompter = get_standard_prompter()
    result = prompter.prompt(user_input, model_id, system_instruction=system_instruction)  # always returns a str
    used_model = model_id or prompter.model_reg.active_model_id

    if isinstance(result, str) and result.startswith("ERROR:"):
        return ai_response_error(result, provider="tokenrouter", model_id=used_model,
                                  unsupported_params=unsupported, raw=result)
    return ai_response_ok(result, provider="tokenrouter", model_id=used_model,
                           unsupported_params=unsupported, raw=result)


# ── OpenAI (bejson_openai.py) ─────────────────────────────────────────────

def _adapt_openai(user_input: str, model_id: Optional[str], system_instruction: Optional[str], **config) -> AIResponse:
    from lib_bejson_AI_bejson_openai import get_standard_prompter

    unsupported = []
    if config:
        unsupported.append("config:" + ",".join(sorted(config.keys())))

    prompter = get_standard_prompter()
    result = prompter.prompt(user_input, model_id, system_instruction=system_instruction)  # always returns a str
    used_model = model_id or prompter.model_reg.active_model_id

    if isinstance(result, str) and result.startswith("ERROR:"):
        return ai_response_error(result, provider="openai", model_id=used_model,
                                  unsupported_params=unsupported, raw=result)
    return ai_response_ok(result, provider="openai", model_id=used_model,
                           unsupported_params=unsupported, raw=result)



# ── Groq ───────────────────────────────────────────────────────────────────

def _adapt_groq(user_input: str, model_id: Optional[str], system_instruction: Optional[str], **config) -> AIResponse:
    from lib_bejson_AI_bejson_groq import get_standard_prompter

    unsupported = []
    if system_instruction:
        # GroqStandardPrompter.prompt() has no system_instruction param --
        # its system prompt is fixed at GroqProfile.instruction, loaded from
        # STD_PROFILE_PATH on disk. There is no per-call override today.
        unsupported.append("system_instruction")
    if config:
        unsupported.append("config:" + ",".join(sorted(config.keys())))

    prompter = get_standard_prompter()
    result = prompter.prompt(user_input, model_id)  # always returns a str
    used_model = model_id or prompter.model_reg.active_model_id

    if isinstance(result, str) and result.startswith("ERROR:"):
        return ai_response_error(result, provider="groq", model_id=used_model,
                                  unsupported_params=unsupported, raw=result)
    return ai_response_ok(result, provider="groq", model_id=used_model,
                           unsupported_params=unsupported, raw=result)


# ── OpenRouter ────────────────────────────────────────────────────────────

def _adapt_openrouter(user_input: str, model_id: Optional[str], system_instruction: Optional[str], **config) -> AIResponse:
    from lib_bejson_AI_bejson_openrouter import get_standard_prompter

    unsupported = []
    if system_instruction:
        # Same limitation as Groq: OpenRouterStandardPrompter.prompt() has no
        # per-call system_instruction -- it comes from OpenRouterProfile on
        # disk (STD_PROFILE_PATH).
        unsupported.append("system_instruction")
    if config:
        unsupported.append("config:" + ",".join(sorted(config.keys())))

    prompter = get_standard_prompter()
    result = prompter.prompt(user_input, model_id)  # always returns {"content", "thought"}
    used_model = model_id or prompter.model_reg.active_model_id
    content = result.get("content", "")

    if content.startswith("ERROR:"):
        return ai_response_error(content, provider="openrouter", model_id=used_model,
                                  unsupported_params=unsupported, raw=result)
    return ai_response_ok(content, provider="openrouter", model_id=used_model,
                           thought=result.get("thought", ""),
                           unsupported_params=unsupported, raw=result)


# ── Hugging Face (bejson_huggingface.py) ────────────────────────────────────

def _adapt_huggingface(user_input: str, model_id: Optional[str], system_instruction: Optional[str], **config) -> AIResponse:
    from lib_bejson_AI_bejson_huggingface import get_standard_prompter

    unsupported = []
    if config:
        unsupported.append("config:" + ",".join(sorted(config.keys())))

    prompter = get_standard_prompter()
    result = prompter.prompt(user_input, model_id, system_instruction=system_instruction)  # {"content", "thought"}
    used_model = model_id or prompter.model_reg.active_model_id
    content = result.get("content", "")

    if content.startswith("ERROR:"):
        return ai_response_error(content, provider="huggingface", model_id=used_model,
                                  unsupported_params=unsupported, raw=result)
    return ai_response_ok(content, provider="huggingface", model_id=used_model,
                           thought=result.get("thought", ""),
                           unsupported_params=unsupported, raw=result)


# ── Grok (bejson_grok.py) ────────────────────────────────────────────────

def _adapt_grok(user_input: str, model_id: Optional[str], system_instruction: Optional[str], **config) -> AIResponse:
    from lib_bejson_AI_bejson_grok import get_standard_prompter

    unsupported = []
    if config:
        unsupported.append("config:" + ",".join(sorted(config.keys())))

    prompter = get_standard_prompter()
    result = prompter.prompt(user_input, model_id, system_instruction=system_instruction)  # always returns a str
    used_model = model_id or prompter.model_reg.active_model_id

    if isinstance(result, str) and result.startswith("ERROR:"):
        return ai_response_error(result, provider="grok", model_id=used_model,
                                  unsupported_params=unsupported, raw=result)
    return ai_response_ok(result, provider="grok", model_id=used_model,
                           unsupported_params=unsupported, raw=result)


# ── Gemini (bejson_gemini.py / GeminiAPI) ───────────────────────────────────

def _adapt_gemini(user_input: str, model_id: Optional[str], system_instruction: Optional[str], **config) -> AIResponse:
    from lib_bejson_AI_bejson_gemini import get_standard_api

    api = get_standard_api()
    used_model = model_id or api.models.active_model_id
    gen_config = dict(config)
    if system_instruction:
        gen_config["system_instruction"] = system_instruction

    try:
        # GeminiAPI.generate() raises on failure by contract -- normalize
        # that to AIResponse(success=False, ...) like every other adapter,
        # so ai_dispatch_call() never raises for provider-side failures.
        content = api.generate(user_input, model_id=model_id, **gen_config)
        return ai_response_ok(content, provider="gemini", model_id=used_model, raw=content)
    except Exception as e:
        return ai_response_error(str(e), provider="gemini", model_id=used_model, raw=e)


# ── GenAI (bejson_genai.py / GeminiStandardPrompter) ────────────────────────

def _adapt_genai(user_input: str, model_id: Optional[str], system_instruction: Optional[str], **config) -> AIResponse:
    from lib_bejson_AI_bejson_genai import GeminiStandardPrompter

    unsupported = []
    if config:
        # genai.py's prompt() takes only text/model/system_instruction --
        # no room for arbitrary generation config (temperature etc).
        unsupported.append("config:" + ",".join(sorted(config.keys())))

    prompter = GeminiStandardPrompter()
    kwargs = {}
    if model_id:
        kwargs["model"] = model_id
    if system_instruction:
        kwargs["system_instruction"] = system_instruction

    result = prompter.prompt(user_input, **kwargs)  # Optional[str]; None == failure
    used_model = model_id or "gemini-3-flash-preview"  # genai.py's own default

    if result is None:
        return ai_response_error(
            "genai request failed (see GenAIClient status log for the specific cause -- "
            "no keys, SDK missing, or every key exhausted)",
            provider="genai", model_id=used_model, unsupported_params=unsupported,
        )
    return ai_response_ok(result, provider="genai", model_id=used_model,
                           unsupported_params=unsupported, raw=result)


_ADAPTERS = {
    "groq": _adapt_groq,
    "openrouter": _adapt_openrouter,
    "gemini": _adapt_gemini,
    "genai": _adapt_genai,
    "grok": _adapt_grok,
    "huggingface": _adapt_huggingface,
    "openai": _adapt_openai,
    "tokenrouter": _adapt_tokenrouter,
    "ollama": _adapt_ollama,
}


def ai_dispatch_call(
    provider: str,
    user_input: str,
    *,
    model_id: Optional[str] = None,
    system_instruction: Optional[str] = None,
    **config,
) -> AIResponse:
    """
    The one call interface for all four AI-family providers.

    provider            -- "groq" | "openrouter" | "gemini" | "genai" | "grok" | "huggingface".
    user_input          -- The prompt text.
    model_id            -- Optional model override; falls back to each
                           provider's own active/default model if omitted.
    system_instruction  -- Optional system prompt override. Honored natively
                           by gemini and genai; NOT honorable by groq/
                           openrouter today (see unsupported_params in the
                           returned AIResponse) since their system prompt is
                           fixed in a profile file on disk.
    **config            -- Provider-specific generation knobs (temperature,
                           top_p, etc). Only gemini currently accepts these;
                           passed elsewhere they land in unsupported_params.

    Returns an AIResponse. Never raises for provider-side failures --
    check response["success"] and response["error"]. Raises ValueError only
    for an unknown provider name (programmer error, not a runtime failure).
    """
    if provider not in _ADAPTERS:
        raise ValueError(f"Unknown AI provider {provider!r}; expected one of {PROVIDERS}")

    try:
        return _ADAPTERS[provider](user_input, model_id, system_instruction, **config)
    except ValueError:
        raise
    except Exception as e:
        # Belt-and-suspenders: a bug inside an adapter (not a provider-side
        # failure, which each adapter already catches) still comes back as
        # an AIResponse instead of blowing up the caller.
        logger.error(f"[ai_dispatch] Adapter for {provider!r} raised unexpectedly: {e}")
        return ai_response_error(f"dispatch adapter error: {e}", provider=provider, model_id=model_id)