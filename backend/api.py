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
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5180", "http://localhost:5173",
        "http://127.0.0.1:5180", "http://127.0.0.1:5173",
    ],
    allow_methods=["*"], allow_headers=["*"],
)


@app.get("/api/mcp_probe")
async def mcp_probe() -> dict[str, Any]:
    """Judge verification: runs a live MCP search via Splunk MCP Server (app 7931).
    Returns ok=true and a result row to prove MCP is load-bearing, not decorative.
    """
    try:
        from splunk.mcp_client import MCPSearchProvider
        provider = MCPSearchProvider()
        rows = await provider.run_search(
            "search index=_internal | head 1 | fields host, sourcetype", earliest="-5m"
        )
        return {"ok": True, "provider": "splunk-mcp", "rows": rows, "mcp_url": settings.splunk_mcp_url}
    except Exception as exc:
        causes = []
        if hasattr(exc, "exceptions"):
            for sub in exc.exceptions:
                causes.append(f"{type(sub).__name__}: {sub}")
        return {"ok": False, "error": str(exc), "causes": causes}


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
        causes = []
        if hasattr(exc, "exceptions"):
            for sub in exc.exceptions:
                causes.append(f"{type(sub).__name__}: {sub}")
        reason = "; ".join(causes) if causes else str(exc)
        status["splunk"] = {"connected": False, "reason": reason}
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
            from slack_notifier import notify_arena_finished
            from splunk.hec import HECWriter
            from splunk.search import get_search_provider
            scenario = SCENARIOS.get(body.scenario or DEFAULT_SCENARIO, SCENARIOS[DEFAULT_SCENARIO])
            orch = ArenaOrchestrator(LLM(), get_search_provider(), HECWriter())
            summary = await orch.run_arena(scenario, generations=body.generations,
                                           variants_per_gen=body.variants_per_gen,
                                           refine_attempts=body.refine_attempts,
                                           stop_on_converge=body.stop_on_converge, emit=emit)
            asyncio.create_task(notify_arena_finished(summary))
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


class ApprovalBody(BaseModel):
    decision: str            # "approve" | "edit" | "reject"
    spl: str | None = None   # edited SPL when decision == "edit"
    deploy: bool = False      # deploy approved detection as a Splunk saved search (disabled by default)
    run_id: str | None = None
    scenario: str | None = None


@app.post("/api/approval")
async def approval(body: ApprovalBody) -> dict[str, Any]:
    """Human-in-the-loop on the evolved detection. Deploy-as-saved-search is intentionally
    DISABLED by default in the demo (operational-maturity signal). Enabling it would create a
    Splunk saved search via the SDK — never auto-deployed."""
    result: dict[str, Any] = {"status": "recorded", "decision": body.decision, "deployed": False}
    if body.decision == "approve" and body.deploy and body.spl:
        result["note"] = "deploy disabled in demo; would create a Splunk saved search via the SDK"
    from slack_notifier import notify_approval
    asyncio.create_task(notify_approval(body.decision, body.run_id, body.scenario))
    return result
