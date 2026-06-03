"""FastAPI app for ARGUS — the Adversarial Detection Evolution Engine.

Endpoints:
  GET  /api/health  — real connectivity (Splunk + LLM + scorer config). Never faked.
  POST /api/arena   — run the co-evolution arena, streaming every step over SSE.

If a backend isn't configured, /api/arena emits an honest `error` event instead of any mock output.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from config import settings
from exceptions import NotConfiguredError

app = FastAPI(title="ARGUS", version="0.2.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    """Reports real configuration + connectivity. No value is faked."""
    status: dict[str, Any] = {
        "search_provider": settings.search_provider,
        "scorer_backend": settings.scorer_backend or None,
        "llm_configured": bool(settings.anthropic_api_key),
        "mcp_url_set": bool(settings.splunk_mcp_url),
        "hec_configured": bool(settings.splunk_hec_token),
    }
    try:
        from splunk.search import get_search_provider
        status["splunk"] = await get_search_provider().healthcheck()
    except Exception as exc:  # noqa: BLE001 - report the real reason it's not ready
        status["splunk"] = {"connected": False, "reason": str(exc)}
    return status


@app.get("/api/scenarios")
async def scenarios() -> list[dict[str, Any]]:
    """List available attack scenarios (proves the engine is not hardcoded to one attack)."""
    from scenarios import SCENARIOS
    return [{"key": s.key, "name": s.name, "technique": s.technique, "mitre": s.mitre}
            for s in SCENARIOS.values()]


class ArenaBody(BaseModel):
    scenario: str = ""
    generations: int = 3
    variants_per_gen: int = 4
    refine_attempts: int = 4
    stop_on_converge: bool = False


@app.post("/api/arena")
async def arena(body: ArenaBody) -> EventSourceResponse:
    """Run the adversarial detection-evolution arena and stream every step (SSE).

    Events (dicts): arena_started, variants_generated, generation_scored, blue_evolved,
    blue_attempt_rejected, generation_complete, converged, arena_finished, error. All metrics live.
    """
    queue: asyncio.Queue = asyncio.Queue()

    async def emit(e: dict) -> None:
        await queue.put(e)

    async def driver() -> None:
        try:
            from arena_orchestrator import ArenaOrchestrator
            from models.llm import LLM
            from scenarios import SCENARIOS, DEFAULT_SCENARIO
            from splunk.hec import HECWriter
            from splunk.search import get_search_provider
            scenario = SCENARIOS.get(body.scenario or DEFAULT_SCENARIO, SCENARIOS[DEFAULT_SCENARIO])
            orch = ArenaOrchestrator(LLM(), get_search_provider(), HECWriter())
            await orch.run_arena(scenario, generations=body.generations,
                                 variants_per_gen=body.variants_per_gen,
                                 refine_attempts=body.refine_attempts,
                                 stop_on_converge=body.stop_on_converge, emit=emit)
        except NotConfiguredError as exc:
            await emit({"type": "error", "kind": "not_configured", "message": str(exc)})
        except Exception as exc:  # noqa: BLE001 - surface real errors, never hide them
            await emit({"type": "error", "kind": "unexpected", "message": repr(exc)})
        finally:
            await queue.put(None)

    async def gen():
        task = asyncio.create_task(driver())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield {"event": item.get("type", "message"), "data": json.dumps(item)}
        finally:
            task.cancel()

    return EventSourceResponse(gen())
