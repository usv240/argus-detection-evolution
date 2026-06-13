"""Splunk MCP Server provider (primary, agentic path) - the load-bearing integration.

Targets the OFFICIAL Splunk MCP Server (Splunkbase app id 7931, CiscoDevNet/Splunk-MCP-Server-official):
  - Hosted inside Splunk; endpoint:  https://<host>:8089/services/mcp
  - Transport: Streamable HTTP (MCP)   Auth: Authorization: Bearer <splunk-token> (respects RBAC)
  - Tools exposed (MCP Server v1.2.0):
        splunk_run_query        execute SPL, return results        <- ARGUS primary search path
        splunk_get_indexes      list available indexes
        splunk_get_index_info   index metadata + field discovery
        splunk_run_saved_search run a saved search by name
        splunk_get_info         version / server name (healthcheck)

  - Token requirement: Bearer token must have audience="mcp" (hard check in the server).
  - Results: splunk_run_query wraps rows: {"results": [...], "truncated": bool, "total_rows": int}

Transport note: Streamable HTTP (POST JSON-RPC), NOT SSE GET.
We use mcp.client.streamable_http with verify=False for the self-signed dev cert.

No mock path: if SPLUNK_MCP_URL is unset, get_search_provider() never builds this class.
"""
from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any

import httpx

from config import settings
from exceptions import NotConfiguredError, SearchError

TOOL_RUN_QUERY = "splunk_run_query"
TOOL_GET_INDEXES = "splunk_get_indexes"
TOOL_GET_INDEX_INFO = "splunk_get_index_info"
TOOL_GET_SAVED_SEARCHES = "splunk_run_saved_search"
TOOL_GET_INFO = "splunk_get_info"


def _no_verify_http_client(
    headers: dict[str, str] | None = None,
    timeout: httpx.Timeout | None = None,
    auth: httpx.Auth | None = None,
) -> httpx.AsyncClient:
    """httpx_client_factory that disables SSL verification for Splunk's self-signed dev cert."""
    kwargs: dict[str, Any] = {"verify": False, "follow_redirects": True}
    if headers:
        kwargs["headers"] = headers
    if timeout:
        kwargs["timeout"] = timeout
    if auth:
        kwargs["auth"] = auth
    return httpx.AsyncClient(**kwargs)


class MCPSearchProvider:
    name = "splunk-mcp"

    def __init__(self) -> None:
        if not settings.splunk_mcp_url:
            raise NotConfiguredError("Splunk MCP Server (SPLUNK_MCP_URL)", "SETUP.md Step 5")
        self._url = settings.splunk_mcp_url
        self._headers: dict[str, str] = {}
        if settings.splunk_mcp_token:
            self._headers["Authorization"] = f"Bearer {settings.splunk_mcp_token}"

    @asynccontextmanager
    async def _session(self):
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client
        async with streamablehttp_client(
            self._url,
            headers=self._headers,
            httpx_client_factory=_no_verify_http_client,
            timeout=30,
        ) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session

    async def _call(self, tool: str, arguments: dict[str, Any]) -> list[dict[str, Any]]:
        last: Exception | None = None
        for attempt in range(2):  # one retry for transient connection blips
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
            # Use a real lightweight search rather than list_tools() - avoids anyio TaskGroup issues
            rows = await self.run_search(
                "search index=_internal | head 1 | fields host", earliest="-1m"
            )
            tools = [TOOL_RUN_QUERY, TOOL_GET_INDEXES, TOOL_GET_INDEX_INFO,
                     TOOL_GET_SAVED_SEARCHES, TOOL_GET_INFO]
            return {"connected": True, "tools": tools, "ping_rows": len(rows)}
        except Exception as exc:  # noqa: BLE001
            raise SearchError(f"MCP healthcheck failed: {exc}") from exc

    # --- Splunk-native helpers usable by agents (Best Use of MCP Server) ---
    async def get_indexes(self) -> list[dict[str, Any]]:
        return await self._call(TOOL_GET_INDEXES, {})

    async def get_index_info(self, index: str) -> list[dict[str, Any]]:
        return await self._call(TOOL_GET_INDEX_INFO, {"index_name": index})

    async def run_saved_search(self, name: str) -> list[dict[str, Any]]:
        return await self._call(TOOL_GET_SAVED_SEARCHES, {"saved_search_name": name})

    async def get_server_info(self) -> list[dict[str, Any]]:
        return await self._call(TOOL_GET_INFO, {})


def _parse_content(content: Any) -> list[dict[str, Any]]:
    """MCP tool results arrive as content blocks; SPL results are JSON text. Never fabricated."""
    rows: list[dict[str, Any]] = []
    for block in content or []:
        text = getattr(block, "text", None)
        if not text:
            continue
        try:
            parsed = json.loads(text)
            # splunk_run_query wraps results: {"results": [...], "truncated": bool, "total_rows": int}
            if isinstance(parsed, dict) and isinstance(parsed.get("results"), list):
                rows.extend(parsed["results"])
            elif isinstance(parsed, list):
                rows.extend(parsed)
            else:
                rows.append(parsed)
        except json.JSONDecodeError:
            rows.append({"_raw": text})
    return rows
