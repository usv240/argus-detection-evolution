"""Judge smoke test - verifies the live stack end-to-end in ~10s (no mock data).

Run from backend/ with the venv:  python smoke_test.py
Checks: Splunk connectivity, a live search over BOTS, HEC write path, and the reasoning LLM.
"""
from __future__ import annotations

import asyncio
import warnings

warnings.filterwarnings("ignore")


async def main() -> None:
    ok = True

    try:
        from splunk.sdk_client import SDKSearchProvider
        provider = SDKSearchProvider()
        info = await provider.healthcheck()
        print(f"[PASS] Splunk connected - version {info.get('splunk_version')}")
    except Exception as exc:  # noqa: BLE001
        ok = False
        print(f"[FAIL] Splunk connectivity: {exc}")
        provider = None

    if provider is not None:
        try:
            rows = await provider.run_search("search index=botsv3 earliest=0 | head 1")
            print(f"[PASS] Live search over BOTS returned {len(rows)} row(s)")
        except Exception as exc:  # noqa: BLE001
            ok = False
            print(f"[FAIL] Live search: {exc}")

    try:
        from splunk.hec import HECWriter
        n = await HECWriter().send([{"time": 0, "event": {"argus_synthetic": "true", "smoke": "1"}}])
        print(f"[PASS] HEC write path - sent {n} event")
    except Exception as exc:  # noqa: BLE001
        ok = False
        print(f"[FAIL] HEC write: {exc}")

    try:
        from models.llm import LLM
        reply = await LLM().complete("connectivity test", "Reply with exactly: OK", max_tokens=5)
        print(f"[PASS] Reasoning LLM - replied '{reply.strip()[:16]}'")
    except Exception as exc:  # noqa: BLE001
        ok = False
        print(f"[FAIL] LLM: {exc}")

    result = "ALL PASS - ready to run the Arena" if ok else "SOME CHECKS FAILED - see SETUP.md"
    print("\nSMOKE RESULT:", result)


if __name__ == "__main__":
    asyncio.run(main())
