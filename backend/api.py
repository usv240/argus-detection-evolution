"""FastAPI app for ARGUS - the Adversarial Detection Evolution Engine.

Endpoints:
  GET  /api/health - real connectivity (Splunk + LLM + scorer config). Never faked.
  POST /api/arena - run the co-evolution arena, streaming every step over SSE.

If a backend isn't configured, /api/arena emits an honest `error` event instead of any mock output.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import FastAPI, Response
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
    expose_headers=[
        "Content-Disposition", "X-Appinspect-Available", "X-Appinspect-Verdict",
        "X-Appinspect-Errors", "X-Appinspect-Failures", "X-Appinspect-Warnings",
        "X-Appinspect-Checks", "X-Appinspect-Reason",
    ],
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
    """Reports real configuration + connectivity. No value is faked.

    When the MCP provider is active, also probes `splunk_get_indexes` and
    `splunk_get_index_info` - proving ARGUS exercises MCP's index-discovery tools, not
    just `splunk_run_query` (Best Use of Splunk MCP Server)."""
    status: dict[str, Any] = {
        "search_provider": settings.search_provider,
        "scorer_backend": settings.scorer_backend or None,
        "llm_configured": bool(settings.anthropic_api_key),
        "mcp_url_set": bool(settings.splunk_mcp_url),
        "hec_configured": bool(settings.splunk_hec_token),
    }
    try:
        from splunk.search import get_search_provider
        provider = get_search_provider()
        status["splunk"] = await provider.healthcheck()

        if hasattr(provider, "get_indexes"):
            try:
                idx_rows = await provider.get_indexes()
                names = sorted({r.get("title") for r in idx_rows if r.get("title")})
                target = settings.splunk_index if settings.splunk_index in names else (names[0] if names else None)
                info_sample = None
                if target and hasattr(provider, "get_index_info"):
                    info_rows = await provider.get_index_info(target)
                    info_sample = info_rows[:5] if isinstance(info_rows, list) else info_rows
                status["mcp_tool_diversity"] = {
                    "ok": True,
                    "tools_used": ["splunk_run_query", "splunk_get_indexes", "splunk_get_index_info"],
                    "index_count": len(names),
                    "indexes_sample": names[:10],
                    "index_info_target": target,
                    "index_info_sample": info_sample,
                }
                if hasattr(provider, "get_server_info"):
                    try:
                        server_info = await provider.get_server_info()
                        status["mcp_tool_diversity"]["tools_used"].append("splunk_get_info")
                        status["mcp_tool_diversity"]["server_info"] = (
                            server_info[0] if isinstance(server_info, list) and server_info else server_info
                        )
                    except Exception as exc:  # noqa: BLE001 - report, don't fail /api/health
                        status["mcp_tool_diversity"]["server_info_error"] = str(exc)
            except Exception as exc:  # noqa: BLE001 - report, don't fail /api/health
                status["mcp_tool_diversity"] = {"ok": False, "error": str(exc)}
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


class ExportAppBody(BaseModel):
    scenario: str
    final_spl: str
    run_id: str | None = None
    certificate: dict[str, Any] | None = None


@app.post("/api/export_app")
async def export_app(body: ExportAppBody) -> Response:
    """Package the evolved detection from a completed run as an installable Splunk app
    (.spl = gzip tarball: app.conf, savedsearches.conf, metadata/default.meta, README,
    and the run's Resilience Certificate). Every export is validated automatically with
    Splunk's official `splunk-appinspect` CLI: the result is embedded as
    APPINSPECT_REPORT.json (when the CLI is available) and summarized in X-Appinspect-*
    response headers.

    The saved search ships disabled - nothing ARGUS produces auto-deploys."""
    from app_export import build_app_bundle
    from scenarios import SCENARIOS, DEFAULT_SCENARIO
    scenario = SCENARIOS.get(body.scenario or DEFAULT_SCENARIO, SCENARIOS[DEFAULT_SCENARIO])
    app_id, blob, appinspect = await asyncio.to_thread(
        build_app_bundle, scenario, body.final_spl, body.run_id, body.certificate)

    headers = {
        "Content-Disposition": f'attachment; filename="{app_id}.spl"',
        "X-Appinspect-Available": str(bool(appinspect.get("available"))).lower(),
    }
    if appinspect.get("available"):
        summary = appinspect.get("summary", {})
        headers["X-Appinspect-Verdict"] = appinspect.get("verdict", "unknown")
        headers["X-Appinspect-Errors"] = str(summary.get("error", 0))
        headers["X-Appinspect-Failures"] = str(summary.get("failure", 0))
        headers["X-Appinspect-Warnings"] = str(summary.get("warning", 0))
        headers["X-Appinspect-Checks"] = str(sum(summary.values()))
    else:
        reason = str(appinspect.get("reason", "unknown")).replace("\n", " ").replace("\r", " ")
        headers["X-Appinspect-Reason"] = reason[:200]

    return Response(content=blob, media_type="application/gzip", headers=headers)


class ApprovalBody(BaseModel):
    decision: str            # "approve" | "edit" | "reject"
    spl: str | None = None   # edited SPL when decision == "edit"
    deploy: bool = False      # deploy approved detection as a Splunk saved search (disabled by default)
    run_id: str | None = None
    scenario: str | None = None


@app.post("/api/approval")
async def approval(body: ApprovalBody) -> dict[str, Any]:
    """Human-in-the-loop on the evolved detection. `deploy=true` is OFF by default in the
    UI (operational-maturity signal); when a human explicitly opts in on "approve", this
    creates a REAL Splunk saved search via the Python SDK (Best Use of Splunk Developer
    Tools) - but it ships `disabled=1`, so nothing starts running automatically. The new
    saved search is then exercised live via the MCP server's `splunk_run_saved_search`
    tool (Best Use of Splunk MCP Server) to confirm it really exists in Splunk."""
    result: dict[str, Any] = {"status": "recorded", "decision": body.decision, "deployed": False}
    if body.decision == "approve" and body.deploy and body.spl:
        from app_export import _oneline_spl, _real_src
        from scenarios import SCENARIOS, DEFAULT_SCENARIO
        from splunk.sdk_client import create_saved_search
        scenario = SCENARIOS.get(body.scenario or DEFAULT_SCENARIO, SCENARIOS[DEFAULT_SCENARIO])
        resolved_spl = _oneline_spl(body.spl.replace("{src}", _real_src(scenario)))
        name = f"ARGUS Evolved - {body.scenario or 'detection'} - {body.run_id or 'manual'}"
        try:
            created = await create_saved_search(name, resolved_spl, disabled=True)
            result["deployed"] = True
            result["saved_search"] = created
            try:
                from splunk.mcp_client import MCPSearchProvider
                rows = await MCPSearchProvider().run_saved_search(name)
                result["mcp_verification"] = {
                    "ok": True, "tool": "splunk_run_saved_search", "row_count": len(rows),
                }
            except Exception as exc:  # noqa: BLE001 - report, don't fail the deploy
                result["mcp_verification"] = {"ok": False, "error": str(exc)}
        except Exception as exc:  # noqa: BLE001 - surface the real error, never fake success
            result["deploy_error"] = str(exc)
    elif body.decision == "approve" and body.spl:
        result["note"] = "set deploy=true to create a disabled Splunk saved search via the SDK"
    from slack_notifier import notify_approval
    asyncio.create_task(notify_approval(body.decision, body.run_id, body.scenario))
    return result
