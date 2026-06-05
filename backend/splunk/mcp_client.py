"""Splunk MCP Server provider (primary, agentic path) — the load-bearing integration.

Targets the OFFICIAL Splunk MCP Server (Splunkbase app id 7931, CiscoDevNet/Splunk-MCP-Server-official):
  - Hosted inside Splunk; endpoint:  https://<host>:8089/services/mcp
  - Transport: HTTP/SSE (MCP)         Auth: Authorization: Bearer <splunk-token>  (respects RBAC)
  - Tools exposed:
        run_splunk_query     execute SPL, return results        <- ARGUS search path
        generate_spl         AI-powered natural-language -> SPL  <- Splunk's own AI, via MCP
        get_indexes          list indexes
        get_index_info       index metadata (field discovery)
        get_saved_searches   discover saved searches / detections (baseline ESCU rule)
        get_splunk_info      version / server name (healthcheck)

We use the standards-compliant `mcp` Python client (SSE transport) rather than hand-rolled JSON-RPC,
so the protocol handshake/session are handled correctly. A fresh session is opened per call for
simplicity at this stage. Refs: REFERENCES.md.

No mock path: if SPLUNK_MCP_URL is unset, get_search_provider() never builds this class.
TODO(Step 5): confirm SSE vs streamable-HTTP against the live server and the exact arg name for
run_splunk_query ("query" assumed); adjust below once verified.
"""
from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any

from config import settings
from exceptions import NotConfiguredError, SearchError

TOOL_RUN_QUERY = "run_splunk_query"
TOOL_GENERATE_SPL = "generate_spl"
TOOL_GET_INDEXES = "get_indexes"
TOOL_GET_INDEX_INFO = "get_index_info"
TOOL_GET_SAVED_SEARCHES = "get_saved_searches"
TOOL_GET_INFO = "get_splunk_info"


class MCPSearchProvider:
    name = "splunk-mcp"

    def __init__(self) -> None:
        if not settings.splunk_mcp_url:
            raise NotConfiguredError("Splunk MCP Server (SPLUNK_MCP_URL)", "SETUP.md Step 5")
        self._url = settings.splunk_mcp_url
        self._headers = {}
        if settings.splunk_mcp_token:
            self._headers["Authorization"] = f"Bearer {settings.splunk_mcp_token}"

    @asynccontextmanager
    async def _session(self):
        # Lazy imports so the app starts even before `mcp` is installed/configured.
        from mcp import ClientSession
        from mcp.client.sse import sse_client
        async with sse_client(self._url, headers=self._headers) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session

    async def _call(self, tool: str, arguments: dict[str, Any]) -> list[dict[str, Any]]:
        last: Exception | None = None
        for attempt in range(2):  # one retry for transient SSE/connection blips
            try:
                async with self._session() as session:
                    result = await asyncio.wait_for(session.call_tool(tool, arguments), timeout=120)
                if getattr(result, "isError", False):
                    raise SearchError(f"MCP tool '{tool}' returned an error: {result.content}")
                return _parse_content(result.content)
            except SearchError:
                raise
            except Exception as exc:  # noqa: BLE001 - network/timeout blip; retry then surface
                last = exc
                await asyncio.sleep(1.0)
        raise SearchError(f"MCP call '{tool}' failed after retry: {last}")

    # --- SearchProvider protocol ---
    async def run_search(self, spl: str, *, earliest: str | None = None,
                         latest: str | None = None) -> list[dict[str, Any]]:
        args: dict[str, Any] = {"query": spl}
        if earliest:
            args["earliest_time"] = earliest
        if latest:
            args["latest_time"] = latest
        return await self._call(TOOL_RUN_QUERY, args)

    async def healthcheck(self) -> dict[str, Any]:
        try:
            async with self._session() as session:
                tools = await session.list_tools()
                names = [t.name for t in tools.tools]
            return {"connected": True, "tools": names}
        except Exception as exc:  # noqa: BLE001
            raise SearchError(f"MCP healthcheck failed: {exc}") from exc

    # --- Splunk-native helpers usable by agents (Best Use of MCP Server) ---
    async def generate_spl(self, natural_language: str) -> list[dict[str, Any]]:
        """Use Splunk's OWN AI (via MCP) to turn NL into SPL."""
        return await self._call(TOOL_GENERATE_SPL, {"query": natural_language})

    async def get_indexes(self) -> list[dict[str, Any]]:
        return await self._call(TOOL_GET_INDEXES, {})

    async def get_index_info(self, index: str) -> list[dict[str, Any]]:
        return await self._call(TOOL_GET_INDEX_INFO, {"index": index})

    async def get_saved_searches(self) -> list[dict[str, Any]]:
        return await self._call(TOOL_GET_SAVED_SEARCHES, {})


def _parse_content(content: Any) -> list[dict[str, Any]]:
    """MCP tool results arrive as content blocks; SPL results are JSON text. Never fabricated."""
    rows: list[dict[str, Any]] = []
    for block in content or []:
        text = getattr(block, "text", None)
        if not text:
            continue
        try:
            parsed = json.loads(text)
            rows.extend(parsed if isinstance(parsed, list) else [parsed])
        except json.JSONDecodeError:
            rows.append({"_raw": text})
    return rows
