"""HEC writer - injects the Red agent's synthetic adversarial variants into the sandbox index.

Events are SYNTHETIC but structured exactly like real CloudTrail and tagged `argus_synthetic="true"`
+ `variant_id`, so the same detection SPL matches them and the UI labels them clearly. This is
legitimate purple-teaming: the agent generates variants at runtime (sampled from real field
distributions); it never reads pre-written fixtures, and all later metrics are computed live.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx

from config import settings
from exceptions import NotConfiguredError, ArgusError


class HECWriter:
    def __init__(self) -> None:
        if not settings.splunk_hec_token:
            raise NotConfiguredError("HEC token (SPLUNK_HEC_TOKEN)", "SETUP.md / .env")
        self._url = settings.splunk_hec_url
        self._headers = {"Authorization": f"Splunk {settings.splunk_hec_token}"}

    async def send(self, events: list[dict[str, Any]], *, index: str | None = None,
                   sourcetype: str = "aws:cloudtrail") -> int:
        """events: list of {"time": <epoch>, "event": {<cloudtrail record>}}. Returns count sent."""
        index = index or settings.splunk_sandbox_index
        lines = []
        for e in events:
            payload: dict[str, Any] = {"index": index, "sourcetype": sourcetype, "event": e["event"]}
            if "time" in e:
                payload["time"] = e["time"]
            lines.append(json.dumps(payload))
        body = "\n".join(lines)
        last: Exception | None = None
        for attempt in range(3):  # HEC can briefly 503 under load; retry with backoff
            try:
                async with httpx.AsyncClient(verify=False, timeout=120.0) as client:
                    resp = await client.post(self._url, headers=self._headers, content=body)
                if resp.status_code == 200:
                    return len(events)
                last = ArgusError(f"HEC write failed ({resp.status_code}): {resp.text[:200]}")
            except Exception as exc:  # noqa: BLE001 - network blip; retry
                last = exc
            await asyncio.sleep(1.0 * (attempt + 1))
        raise last  # type: ignore[misc]
