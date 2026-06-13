"""Blue (Detection Evolver): evolves the SPL detection to catch the evasions that beat it - 
without firing on real benign traffic.

Given the current rule + the variants that EVADED it (with how they evaded), the LLM produces an
improved detection. It must keep the {src} token and emit `entity` + `detect_time` (the evaluation
contract), and must not flag benign autoscaling.
"""
from __future__ import annotations

import re
from typing import Any

from exceptions import AgentError
from models.llm import LLM
from scenarios import Scenario

SYSTEM = """You are an elite Splunk detection engineer. Evolve a CloudTrail detection so it catches
attacker variants that currently EVADE it, while NEVER firing on benign traffic.

Hard requirements for your output SPL:
- Start with the literal token {src} (the evaluator substitutes the data scope there).
- Operate on aws:cloudtrail RunInstances events.
- End by producing exactly two output fields: `entity` (the flagged actor: a username, IP, or
  access key) and `detect_time` (epoch of earliest triggering event). Use `| table entity detect_time`.
- MUST NOT flag benign autoscaling: userIdentity.type=AssumedRole from sourceIPAddress
  "autoscaling.amazonaws.com", steady ~2-3 RunInstances/hour, single region.
- Available raw fields: eventName, errorCode, awsRegion, sourceIPAddress, userIdentity.type,
  userIdentity.userName, userIdentity.accessKeyId, userIdentity.arn, requestParameters.instanceType.
- Prefer behavioral signals robust to evasion (e.g. many regions or many failed attempts from one
  source IP / access key in a window; bursts regardless of success), not brittle single-field thresholds.

BEATING ROTATION (important): if a variant's shape shows MANY distinct values of a field (e.g.
distinct_source_ips is high), the attacker is ROTATING that field - do NOT group by it. Instead key
on an invariant the attacker reuses (often userIdentity.accessKeyId, which belongs to the
compromised user even as IPs rotate), or use an aggregate velocity signal (total RunInstances in the
window across actors) with a threshold well above benign autoscaling (~2-3/hour). Choose the entity
that stays stable across the evasion.

STRICT SPL FORM (keep it valid and simple):
- Output ONE single linear pipeline. Do NOT use append, appendcols, join, transaction, or subsearches.
- Use EXACTLY ONE `stats` aggregation, grouped by your chosen entity field plus a time bin
  (e.g. `bin _time span=1h` then `... by <entity> _time`).
- Pick a single robust `entity` (sourceIPAddress or userIdentity.accessKeyId resist username rotation).
- Keep it under 12 lines. End with `| eval entity=<field>` then `| table entity detect_time`.
- IMPORTANT: in `eval`, single-quote any field name containing a dot, e.g.
  `eval entity='userIdentity.accessKeyId'` (unquoted dotted names silently yield null). Plain names
  like sourceIPAddress need no quotes.
"""


def _stable_field(shape: dict[str, Any]) -> str | None:
    """The identifier with the fewest distinct values relative to events = the attacker's invariant."""
    cand = [
        ("userIdentity.accessKeyId", shape.get("distinct_access_keys")),
        ("userIdentity.userName", shape.get("distinct_usernames")),
        ("sourceIPAddress", shape.get("distinct_source_ips")),
    ]
    cand = [(f, n) for f, n in cand if isinstance(n, int) and n > 0]
    return min(cand, key=lambda x: x[1])[0] if cand else None


class BlueEvolver:
    name = "blue"

    def __init__(self, llm: LLM) -> None:
        self.llm = llm

    async def evolve(self, scenario: Scenario, current_spl: str,
                     missed: list[dict[str, Any]], false_positive: bool) -> dict[str, Any]:
        """missed: [{"evasion": str, "shape": {events, distinct_source_ips, distinct_regions,
        distinct_usernames, distinct_access_keys, identity_types, span_hours, error_rate}}].
        The shapes are REAL measurements - calibrate thresholds to them so the rule fires."""
        # For each evasion, compute the most STABLE identifier (fewest distinct values relative to
        # events) and hand it to Blue as a grouping recommendation - this is what makes Blue pivot
        # away from a field the attacker is rotating.
        annotated = [{**m, "recommended_group_by": _stable_field(m.get("shape", {}))} for m in missed]
        fp_note = ("Your previous rule fired on BENIGN autoscaling (false positive) - exclude "
                   "sourceIPAddress=\"autoscaling.amazonaws.com\" and keep benign quiet."
                   if false_positive else "")
        # Fenced-block response (robust for multi-line SPL - avoids JSON-escaping failures).
        text = await self.llm.complete(
            SYSTEM,
            f"Current detection (SPL):\n{current_spl}\n\n"
            f"These variants EVADE it. Each 'shape' is the REAL measured shape of that variant's "
            f"events - set your aggregation window and thresholds to these numbers so the rule "
            f"FIRES on them. E.g. if a variant is 40 events from 1 source IP across 8 regions over "
            f"6 hours, group by sourceIPAddress over a wide enough window and threshold below 40.\n"
            f"{annotated}\n\n"
            "Each item's 'recommended_group_by' is the identifier the attacker does NOT rotate (the "
            "fewest distinct values) - if your current rule groups by a rotated field, SWITCH the "
            f"grouping to recommended_group_by and threshold below its event count.\n\n{fp_note}\n\n"
            "Respond in EXACTLY this format and nothing else:\n"
            "```spl\n<your full detection SPL - multi-line ok, must start with {src} and end with "
            "| table entity detect_time>\n```\n"
            "RATIONALE: <ONE sentence, max 25 words, describing ONLY the grouping field + time "
            "window (from your stats/bin clauses) and the firing threshold(s) (from your where "
            "clause), each exactly as written in the SPL above. If a field appears only inside "
            "NOT (...), call it an exclusion - never describe it as a detection signal. Do not "
            "invent any other signal, mechanism, or field not in those clauses. No hedging or "
            "self-correction (never use 'but', 'however', 'actually', 'wait', or a dash to revise "
            "yourself mid-sentence).>",
            max_tokens=1500,
        )
        m = re.search(r"```(?:spl)?\s*(.*?)```", text, re.S)
        spl = (m.group(1) if m else "").strip()
        if not spl or "{src}" not in spl:
            raise AgentError("Blue did not produce a valid SPL detection")
        rat = re.search(r"RATIONALE:\s*(.+)", text)
        rat_text = rat.group(1).strip() if rat else ""
        if len(rat_text) > 200:
            rat_text = rat_text[:200].rsplit(" ", 1)[0].rstrip(",;: - -") + "…"
        return {"spl": spl, "rationale": rat_text}
