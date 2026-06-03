"""Anomaly/classification scoring — the Splunk-native model layer.

Decision made in SETUP.md Step 6:
  - SCORER_BACKEND="hosted": call a Splunk hosted model (targets the 'Best Use of Hosted Models'
    bonus). Returns a real score + the model identity so the UI can attribute it honestly.
  - SCORER_BACKEND="local": call a real local/3p model, returned with source="local-model" so the
    UI labels it clearly. NEVER a fabricated number.

If SCORER_BACKEND is unset, scoring raises NotConfiguredError. There is no faked-score mode.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from config import settings
from exceptions import NotConfiguredError, ArgusError


@dataclass
class Score:
    value: float            # real model output
    source: str             # e.g. "splunk-hosted:<model>" or "local-model:<name>"
    baseline: float | None  # baseline/threshold for interpretation, if available
    detail: dict[str, Any]


class Scorer:
    async def score(self, features: dict[str, Any]) -> Score:
        backend = (settings.scorer_backend or "").lower()
        if backend == "hosted":
            return await self._score_hosted(features)
        if backend == "local":
            return await self._score_local(features)
        raise NotConfiguredError("Scorer model (SCORER_BACKEND)", "SETUP.md Step 6")

    async def _score_hosted(self, features: dict[str, Any]) -> Score:
        if not settings.scorer_hosted_endpoint:
            raise NotConfiguredError("SCORER_HOSTED_ENDPOINT", "SETUP.md Step 6")
        # TODO(Step 6): finalize request/response shape against the real hosted-model API.
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(settings.scorer_hosted_endpoint,
                                     json={"model": settings.scorer_hosted_model, "input": features})
            resp.raise_for_status()
            body = resp.json()
        value = body.get("score")
        if value is None:
            raise ArgusError("Hosted model returned no score field; refusing to fabricate one.")
        return Score(value=float(value), source=f"splunk-hosted:{settings.scorer_hosted_model}",
                     baseline=body.get("baseline"), detail=body)

    async def _score_local(self, features: dict[str, Any]) -> Score:
        # Placeholder for a REAL local model wired in during Step 6 (e.g., an isolation-forest /
        # z-score over real baseline stats pulled from Splunk). Must compute from real data.
        raise NotConfiguredError("Local Scorer model implementation", "SETUP.md Step 6")
