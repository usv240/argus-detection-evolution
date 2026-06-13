"""Splunk Python SDK search provider (fallback / spike path).

Fully functional once SETUP.md Step 4 passes. Runs real SPL and returns real events. The blocking
splunklib calls are pushed to a worker thread so they don't stall the async event loop.
"""
from __future__ import annotations

import asyncio
from typing import Any

from config import settings
from exceptions import SearchError


class SDKSearchProvider:
    name = "splunk-sdk"

    def _connect(self):
        import splunklib.client as client  # imported lazily so the app starts without creds
        return client.connect(
            host=settings.splunk_host,
            port=settings.splunk_port,
            scheme=settings.splunk_scheme,
            username=settings.splunk_username,
            password=settings.splunk_password,
            verify=settings.splunk_verify,
        )

    def _run_blocking(self, spl: str, earliest: str | None, latest: str | None) -> list[dict[str, Any]]:
        import splunklib.results as results
        svc = self._connect()
        kwargs: dict[str, Any] = {"output_mode": "json", "count": 0}
        if earliest:
            kwargs["earliest_time"] = earliest
        if latest:
            kwargs["latest_time"] = latest
        query = spl if spl.lstrip().startswith("|") or spl.lstrip().lower().startswith("search") else f"search {spl}"
        try:
            stream = svc.jobs.oneshot(query, **kwargs)
            return [dict(row) for row in results.JSONResultsReader(stream)
                    if not isinstance(row, results.Message)]
        except Exception as exc:  # noqa: BLE001 - surface the real error
            raise SearchError(f"SDK search failed: {exc}") from exc

    async def run_search(self, spl: str, *, earliest: str | None = None,
                         latest: str | None = None) -> list[dict[str, Any]]:
        last: Exception | None = None
        for attempt in range(2):  # one retry to ride out transient connection blips
            try:
                return await asyncio.to_thread(self._run_blocking, spl, earliest, latest)
            except SearchError as exc:
                last = exc
                await asyncio.sleep(1.0)
        raise last  # type: ignore[misc]

    async def healthcheck(self) -> dict[str, Any]:
        def _check() -> dict[str, Any]:
            svc = self._connect()
            return {"connected": True, "splunk_version": svc.info.get("version")}
        try:
            return await asyncio.to_thread(_check)
        except Exception as exc:  # noqa: BLE001
            raise SearchError(f"SDK healthcheck failed: {exc}") from exc


async def create_saved_search(name: str, search: str, *, disabled: bool = True) -> dict[str, Any]:
    """Create (or update) a Splunk saved search via the Python SDK - Best Use of Splunk
    Developer Tools, exercised on the human-in-the-loop "Approve & Deploy" path.

    Ships `disabled=1` by default: this only creates the artifact in Splunk so it's
    visible under Settings -> Searches; a separate human action inside Splunk is
    required to enable it. ARGUS never auto-runs anything it deploys."""
    def _create() -> dict[str, Any]:
        import splunklib.client as client
        svc = client.connect(
            host=settings.splunk_host, port=settings.splunk_port,
            scheme=settings.splunk_scheme, username=settings.splunk_username,
            password=settings.splunk_password, verify=settings.splunk_verify,
            app="search",
        )
        kwargs = {"disabled": "1" if disabled else "0"}
        if name in svc.saved_searches:
            ss = svc.saved_searches[name]
            ss.update(search=search, **kwargs).refresh()
            created = False
        else:
            ss = svc.saved_searches.create(name, search, **kwargs)
            created = True
        return {"name": ss.name, "created": created, "disabled": disabled}

    try:
        return await asyncio.to_thread(_create)
    except Exception as exc:  # noqa: BLE001 - surface the real error, never fake success
        raise SearchError(f"SDK saved-search create failed: {exc}") from exc
