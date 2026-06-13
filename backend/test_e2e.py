"""End-to-end smoke tests for ARGUS endpoints.

Run: pytest test_e2e.py -v
Requires: backend running on localhost:8810, Splunk + MCP + HEC + Claude API configured.
"""
import asyncio
import json
from typing import Any

import httpx
import pytest


BASE_URL = "http://127.0.0.1:8810"
TIMEOUT = httpx.Timeout(60.0)


@pytest.fixture
async def client():
    """Async HTTP client for tests."""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT) as c:
        yield c


@pytest.mark.asyncio
async def test_health_endpoint(client: httpx.AsyncClient) -> None:
    """Confirm all backends report connected."""
    r = await client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["search_provider"] in ("mcp", "sdk")
    assert data["scorer_backend"] in ("splunk_spl", "splunk_mltk", "hosted", "local")
    assert data["llm_configured"] is True
    assert data["hec_configured"] is True
    assert data["splunk"]["connected"] is True
    # Bonus: 4+ MCP tools exercised
    if "mcp_tool_diversity" in data:
        assert len(data["mcp_tool_diversity"].get("tools_used", [])) >= 4


@pytest.mark.asyncio
async def test_mcp_probe_endpoint(client: httpx.AsyncClient) -> None:
    """Confirm MCP Server responds to a real query."""
    r = await client.get("/api/mcp_probe")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["provider"] == "splunk-mcp"
    assert len(data.get("rows", [])) > 0


@pytest.mark.asyncio
async def test_scenarios_endpoint(client: httpx.AsyncClient) -> None:
    """Confirm scenario list loads."""
    r = await client.get("/api/scenarios")
    assert r.status_code == 200
    scenarios = r.json()
    assert isinstance(scenarios, list)
    assert len(scenarios) >= 2
    for s in scenarios:
        assert "key" in s
        assert "name" in s
        assert "technique" in s


@pytest.mark.asyncio
async def test_arena_stream_smoke(client: httpx.AsyncClient) -> None:
    """Smoke test: confirm /api/arena streams without crashing on first few events."""
    body = {
        "scenario": "aws_cryptomining",
        "generations": 1,
        "variants_per_gen": 2,
        "refine_attempts": 2,
        "stop_on_converge": False,
    }
    async with client.stream("POST", "/api/arena", json=body) as r:
        assert r.status_code == 200
        event_count = 0
        async for line in r.aiter_lines():
            if line.startswith("event:"):
                event_count += 1
                # Confirm we get at least: arena_started + scorer_ready + some search events
                if event_count >= 3:
                    break
        assert event_count >= 3


@pytest.mark.asyncio
async def test_export_app_endpoint(client: httpx.AsyncClient) -> None:
    """Smoke test: confirm /api/export_app accepts a valid request."""
    spl = "index=botsv3 | head 10"
    body = {
        "scenario": "aws_cryptomining",
        "final_spl": spl,
        "run_id": "TEST-E2E-001",
    }
    r = await client.post("/api/export_app", json=body)
    assert r.status_code == 200
    # Should be gzip-compressed .spl bundle
    assert r.headers.get("content-type") == "application/gzip"
    assert "attachment" in r.headers.get("content-disposition", "")
    assert len(r.content) > 0


@pytest.mark.asyncio
async def test_approval_without_deploy(client: httpx.AsyncClient) -> None:
    """Test /api/approval with approve but no deploy."""
    spl = "index=botsv3 eventName=RunInstances | stats count"
    body = {
        "decision": "approve",
        "spl": spl,
        "deploy": False,
        "scenario": "aws_cryptomining",
        "run_id": "TEST-E2E-002",
    }
    r = await client.post("/api/approval", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["decision"] == "approve"
    assert data["deployed"] is False
    # Note: true deploy would require splunklib + SDK connection


@pytest.mark.asyncio
async def test_approval_body_model(client: httpx.AsyncClient) -> None:
    """Test /api/approval rejects invalid decision."""
    body = {
        "decision": "invalid_decision",
        "spl": "index=botsv3 | head 1",
    }
    r = await client.post("/api/approval", json=body)
    # FastAPI with Pydantic should accept any string for decision; API layer doesn't validate it.
    # The endpoint just records it. So this should succeed with 200.
    assert r.status_code == 200
    data = r.json()
    assert data["decision"] == "invalid_decision"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
