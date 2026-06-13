"""Reasoning LLM used by agents for planning, SPL generation, and explanations.

This is the agent's 'brain' (Claude). It is separate from the Splunk-native model layer used for
scoring. Raises NotConfiguredError if no API key is set - agents never emit canned reasoning.
"""
from __future__ import annotations

import json
import re
from typing import Any

from config import settings
from exceptions import NotConfiguredError


class LLM:
    def __init__(self) -> None:
        if not settings.anthropic_api_key:
            raise NotConfiguredError("Reasoning LLM (ANTHROPIC_API_KEY)", "SETUP.md / .env")
        from anthropic import AsyncAnthropic
        self._client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        self._model = settings.anthropic_model
        self._fast = settings.anthropic_model_fast

    async def complete(self, system: str, user: str, *, max_tokens: int = 2048,
                       temperature: float | None = None, model: str | None = None,
                       fast: bool = False) -> str:
        # Tiered cost: pass fast=True for cheap steps (Haiku), or model=... to override.
        # `temperature` is accepted for caller compatibility but intentionally NOT forwarded:
        # newer models (e.g. claude-opus-4-8) deprecate it and reject the parameter.
        msg = await self._client.messages.create(
            model=model or (self._fast if fast else self._model),
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(block.text for block in msg.content if block.type == "text")

    async def complete_json(self, system: str, user: str, **kwargs: Any) -> Any:
        """Ask for JSON and parse it robustly (strip fences, extract the outermost object/array)."""
        text = (await self.complete(system + "\n\nRespond with ONLY valid JSON.", user, **kwargs)).strip()
        m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
        if m:
            text = m.group(1).strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            starts = [i for i in (text.find("{"), text.find("[")) if i != -1]
            s = min(starts) if starts else -1
            e = max(text.rfind("}"), text.rfind("]"))
            if s != -1 and e > s:
                return json.loads(text[s:e + 1])
            raise
