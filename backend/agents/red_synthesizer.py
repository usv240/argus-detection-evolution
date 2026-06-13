"""Red (Attack Synthesizer): invents evasive variants of the attack and materializes them as
SYNTHETIC events in the sandbox - grounded in REAL field distributions queried live.

Scenario-agnostic: the attack briefing, the param schema, and how to build an event all come from
the Scenario. The LLM proposes evasion strategies; a generic materializer turns each into events via
scenario.build_event and writes them to the sandbox via HEC, tagged argus_synthetic + variant_id.

Synthetic, but never hardcoded: variants are generated at runtime; field values are sampled from
genuine data; every downstream metric is computed live by the Evaluator.
"""
from __future__ import annotations

import uuid
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from models.llm import LLM
from scenarios import Scenario
from splunk.hec import HECWriter

SYSTEM = """You are an elite cloud red-team operator. Given a defender's current detection (SPL) and
the real characteristics of the environment, design attack variants that still achieve the objective
while EVADING that specific detection. Each variant should exploit a concrete weakness in the rule.
Be precise and realistic; use the provided value pools."""


@dataclass
class Variant:
    id: str
    name: str
    evasion: str
    description: str
    params: dict[str, Any]
    indicators: dict[str, list[str]] = field(default_factory=dict)
    mitre: list[str] = field(default_factory=list)
    event_count: int = 0


class RedSynthesizer:
    name = "red"

    def __init__(self, llm: LLM, search: Any, hec: HECWriter) -> None:
        self.llm = llm
        self.search = search
        self.hec = hec

    async def propose(self, scenario: Scenario, distributions: dict[str, Any],
                      blue_spl: str, n: int) -> list[Variant]:
        data = await self.llm.complete_json(
            SYSTEM,
            f"Current defender detection (SPL):\n{blue_spl}\n\n"
            f"Attack briefing:\n{scenario.red_brief}\n\n"
            f"Evasion dimensions to consider:\n{scenario.evasion_dimensions}\n\n"
            f"MITRE ATT&CK techniques (pick the 1-3 each variant exercises):\n{scenario.mitre_names}\n\n"
            f"Real value pools (sample from these):\nregions={distributions.get('regions')}\n"
            f"instance_types={distributions.get('instance_types')}\nsource_ips={distributions['source_ips']}\n\n"
            f"Design {n} DISTINCT evasive variants. Return JSON: {{\"variants\": [{{"
            '"name": "...", "evasion": "...", "description": "why it evades THIS rule", '
            "...all the per-variant params named in the attack briefing..., "
            '"total_events": 40, "window_minutes": 15, "success_ratio": 0.1, "mitre": ["Txxxx"]}, ...]}',
        )
        variants: list[Variant] = []
        for v in data.get("variants", [])[:n]:
            vid = str(uuid.uuid4())[:8]
            params = {k: val for k, val in v.items()
                      if k not in ("name", "evasion", "description", "mitre")}
            params.setdefault("identity_type", "IAMUser")
            params["usernames"] = v.get("usernames") or ["argus_atk_" + vid]
            params["source_ips"] = v.get("source_ips") or distributions["source_ips"][:1]
            params["total_events"] = int(v.get("total_events", 40))
            params["window_minutes"] = max(1, int(v.get("window_minutes", 15)))
            params["success_ratio"] = float(v.get("success_ratio", 0.1))
            variants.append(Variant(
                id=vid, name=v.get("name", vid), evasion=v.get("evasion", ""),
                description=v.get("description", ""), params=params,
                indicators={"usernames": params["usernames"], "source_ips": params["source_ips"]},
                mitre=[t for t in (v.get("mitre") or []) if t in scenario.mitre_names]
                      or [next(iter(scenario.mitre_names), "T1078")],
            ))
        return variants

    def materialize(self, variant: Variant, scenario: Scenario, offset_min: int,
                    run_id: str = "") -> list[dict[str, Any]]:
        """Generic: spread events over the window; scenario.build_event assembles each one."""
        p = variant.params
        rng = random.Random(variant.id)
        n = p["total_events"]
        span = p["window_minutes"] * 60
        start = scenario.base_epoch + offset_min * 60
        regions = p.get("regions") or ["us-east-1"]
        iam_actions = p.get("iam_actions") or ["CreateUser"]
        events: list[dict[str, Any]] = []
        for i in range(n):
            ts = start + (span * i / max(1, n - 1))
            picks = {
                "i": i, "ts": ts,
                "uname": p["usernames"][i % len(p["usernames"])],
                "ip": p["source_ips"][i % len(p["source_ips"])],
                "region": regions[i % len(regions)],
                "seq_action": iam_actions[i % len(iam_actions)],
            }
            event = scenario.build_event(p, picks, rng)
            event["eventTime"] = _iso(ts)
            event["argus_synthetic"] = "true"
            event["variant_id"] = variant.id
            event["argus_run"] = run_id
            events.append({"time": ts, "event": event})
        variant.event_count = len(events)
        return events

    async def run(self, scenario: Scenario, distributions: dict[str, Any], blue_spl: str,
                  n: int, run_id: str = "") -> list[Variant]:
        variants = await self.propose(scenario, distributions, blue_spl, n)
        for i, v in enumerate(variants):
            events = self.materialize(v, scenario, offset_min=i * 90, run_id=run_id)
            await self.hec.send(events, index=scenario.sandbox_index)
        return variants


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
