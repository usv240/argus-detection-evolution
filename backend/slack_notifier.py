"""Send rich Block Kit notifications to Slack at two moments:
  1. Arena finishes - coverage gain, MITRE map, certificate, Approve/Reject buttons
  2. Analyst decides - confirm the approval/rejection back to the channel

Uses an Incoming Webhook (SLACK_WEBHOOK_URL in .env) - no bot token or Slack app
interactive-components setup required. Silently no-ops when the webhook is unset so
the app starts fine without Slack configured.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from config import settings

log = logging.getLogger(__name__)

_FRONTEND = "http://localhost:5180"


def _frontend() -> str:
    return getattr(settings, "argus_frontend_url", _FRONTEND) or _FRONTEND


async def _post(payload: dict[str, Any]) -> None:
    if not settings.slack_webhook_url:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(settings.slack_webhook_url, json=payload)
            if resp.status_code != 200:
                log.warning("Slack webhook %s: %s", resp.status_code, resp.text[:120])
    except Exception as exc:  # noqa: BLE001 - Slack is non-critical; never crash the arena
        log.warning("Slack notification failed (non-fatal): %s", exc)


async def notify_arena_finished(summary: dict[str, Any]) -> None:
    """Post a rich Block Kit message when an arena run completes."""
    if not settings.slack_webhook_url:
        return

    cert = summary.get("certificate") or {}
    baseline_pct = int(round((summary.get("baseline_recall") or 0) * 100))
    final_pct = int(round((summary.get("final_recall") or 0) * 100))
    fp = summary.get("final_false_positive", False)
    real = summary.get("real_attack") or {}
    frontier = summary.get("frontier") or []
    cmap = summary.get("coverage_map") or []
    run_id = cert.get("run_id", "?")
    cert_id = cert.get("id", "?")
    fingerprint = (cert.get("fingerprint") or "")[:16] + "…"
    scenario = summary.get("scenario", "unknown")

    coverage_lines = "\n".join(
        f"• {c['name']} ({c['technique']}): {c['final_caught']}/{c['total']} caught"
        for c in cmap[:5]
    ) or "N/A"

    fp_line = "0 false positives" if not fp else "False positives present"
    real_line = "Real attack caught" if real.get("final_caught") else "Real attack not confirmed"
    blind_line = (f"{len(frontier)} residual blind spot{'s' if len(frontier) != 1 else ''}"
                  if frontier else "0 blind spots")

    url = _frontend()
    blocks: list[dict] = [
        {"type": "header",
         "text": {"type": "plain_text", "text": "ARGUS Arena Complete - Detection Hardened"}},
        {"type": "section",
         "fields": [
             {"type": "mrkdwn", "text": f"*Scenario*\n{scenario}"},
             {"type": "mrkdwn", "text": f"*Run ID*\n`{run_id}`"},
             {"type": "mrkdwn", "text": f"*Coverage Gain*\n{baseline_pct}% → *{final_pct}%*"},
             {"type": "mrkdwn", "text": f"*False Positives*\n{fp_line}"},
             {"type": "mrkdwn", "text": f"*Real Attack*\n{real_line}"},
             {"type": "mrkdwn", "text": f"*Blind Spots*\n{blind_line}"},
         ]},
        {"type": "divider"},
        {"type": "section",
         "text": {"type": "mrkdwn", "text": f"*MITRE ATT&CK Coverage*\n{coverage_lines}"}},
        {"type": "divider"},
        {"type": "section",
         "text": {"type": "mrkdwn",
                  "text": (f"*Resilience Certificate*\n"
                           f"`{cert_id}` · SHA-256: `{fingerprint}`\n"
                           f"_Analyst review required before deployment_")}},
        {"type": "actions",
         "elements": [
             {"type": "button",
              "text": {"type": "plain_text", "text": "View in ARGUS →"},
              "url": url,
              "style": "primary"},
             {"type": "button",
              "text": {"type": "plain_text", "text": "Approve & Deploy"},
              "url": f"{url}?action=approve&run={run_id}"},
             {"type": "button",
              "text": {"type": "plain_text", "text": "Reject"},
              "url": f"{url}?action=reject&run={run_id}",
              "style": "danger"},
         ]},
        {"type": "context",
         "elements": [{"type": "mrkdwn",
                       "text": (f"Splunk searches: {summary.get('searches_run', 0)} · "
                                f"Provider: `{summary.get('search_provider', '?')}` · "
                                f"Variants: {summary.get('total_variants', 0)}")}]},
    ]

    await _post({
        "text": f"ARGUS: {scenario} - {baseline_pct}% → {final_pct}% coverage | {fp_line}",
        "blocks": blocks,
    })


async def notify_approval(decision: str, run_id: str | None, scenario: str | None) -> None:
    """Post a follow-up when the analyst approves/rejects via ARGUS."""
    if not settings.slack_webhook_url:
        return
    verb = {"approve": "approved for deployment", "edit": "approved with edits",
            "reject": "rejected"}.get(decision, decision)
    text = "ARGUS detection"
    if scenario:
        text += f" for *{scenario}*"
    if run_id:
        text += f" (run `{run_id}`)"
    text += f" was *{verb}* by the analyst."
    await _post({"text": text})
