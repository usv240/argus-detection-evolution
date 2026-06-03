"""SearchProvider abstraction.

All agent searches go through a SearchProvider. Two real implementations exist:
  - MCPSearchProvider: runs SPL through the Splunk MCP Server (primary, the agentic path).
  - SDKSearchProvider: runs SPL through the Splunk Python SDK (fallback / spike path).

There is deliberately NO mock provider. If nothing is configured, get_search_provider() raises
NotConfiguredError so the failure is loud and honest.
"""
from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from config import settings
from exceptions import NotConfiguredError
from .mcp_client import MCPSearchProvider
from .sdk_client import SDKSearchProvider


@runtime_checkable
class SearchProvider(Protocol):
    name: str

    async def run_search(self, spl: str, *, earliest: str | None = None,
                         latest: str | None = None) -> list[dict[str, Any]]:
        """Execute SPL against the real Splunk instance and return real events."""
        ...

    async def healthcheck(self) -> dict[str, Any]:
        """Confirm the provider can reach Splunk. Returns real status info."""
        ...


def get_search_provider() -> SearchProvider:
    choice = (settings.search_provider or "").lower()
    if choice == "mcp":
        if not settings.splunk_mcp_url:
            raise NotConfiguredError("Splunk MCP Server (SPLUNK_MCP_URL)", "SETUP.md Step 5")
        return MCPSearchProvider()
    if choice == "sdk":
        if not settings.splunk_password:
            raise NotConfiguredError("Splunk SDK credentials (SPLUNK_PASSWORD)", "SETUP.md Step 4")
        return SDKSearchProvider()
    raise NotConfiguredError("SEARCH_PROVIDER (set to 'mcp' or 'sdk')", "SETUP.md Step 4/5")
