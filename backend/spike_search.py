"""SETUP.md Step 4 proof: run a REAL SPL search against Splunk via the SDK and print real events.

Usage (after filling .env):
    python spike_search.py "search index=botsv3 | head 5"
"""
from __future__ import annotations

import asyncio
import sys

from splunk.sdk_client import SDKSearchProvider


async def main() -> None:
    spl = sys.argv[1] if len(sys.argv) > 1 else "search index=botsv3 | head 5"
    provider = SDKSearchProvider()
    health = await provider.healthcheck()
    print("Splunk:", health)
    rows = await provider.run_search(spl)
    print(f"Returned {len(rows)} real events for: {spl}\n")
    for row in rows[:5]:
        print(row)


if __name__ == "__main__":
    asyncio.run(main())
