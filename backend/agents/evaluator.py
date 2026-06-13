"""Evaluator: scores a detection (Blue rule) against the synthetic variants + real benign - LIVE.

For a given detection template (containing the {src} token and emitting `entity` + `detect_time`):
  - FP check: run it scoped to REAL benign events only (should fire on nothing).
  - Per variant: run it scoped to (that variant's synthetic events) + real benign, and check whether
    a flagged `entity` matches one of the variant's known indicators (usernames / source IPs).

Every number - recall, false positives, detection time - is computed by real SPL over Splunk.
Nothing is assumed; an undetected variant is a real evasion.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from agents.red_synthesizer import Variant
from scenarios import Scenario


@dataclass
class VariantOutcome:
    id: str
    name: str
    evasion: str
    detected: bool
    detect_time: float | None


@dataclass
class EvalResult:
    recall: float
    false_positive: bool
    fp_entities: list[str]
    outcomes: list[VariantOutcome] = field(default_factory=list)
    fitness: float = 0.0


class Evaluator:
    def __init__(self, search: Any) -> None:
        self.search = search

    def _benign_conditions(self, s: Scenario) -> str:
        # Conditions only (no `search` keyword, no inline earliest) so they compose correctly
        # inside an OR group. earliest is passed via the search provider param in _run().
        return f"index={s.source_index} sourcetype={s.sourcetype} {s.benign_scope}"

    def _benign_src(self, s: Scenario) -> str:
        return f"search {self._benign_conditions(s)}"

    async def _run(self, template: str, src: str) -> list[dict[str, Any]]:
        return await self.search.run_search(template.replace("{src}", src), earliest="0")

    async def profile(self, scenario: Scenario, variants: list[Variant]) -> dict[str, dict[str, Any]]:
        """Real shape of each variant's events (so Blue can calibrate thresholds to actual numbers)."""
        if not variants:
            return {}
        ids = " OR ".join(f'variant_id="{v.id}"' for v in variants)
        spl = (f"search index={scenario.sandbox_index} ({ids}) earliest=0 "
               "| stats count as events dc(sourceIPAddress) as distinct_ips "
               "dc(awsRegion) as distinct_regions dc(userIdentity.userName) as distinct_users "
               "dc(userIdentity.accessKeyId) as distinct_keys values(userIdentity.type) as identity_types "
               "min(_time) as f max(_time) as l "
               'sum(eval(if(isnotnull(errorCode) AND errorCode!="",1,0))) as errors by variant_id')
        rows = await self.search.run_search(spl, earliest="0")
        shapes: dict[str, dict[str, Any]] = {}
        for r in rows:
            ev = int(r.get("events", 0) or 0)
            try:
                span_h = round((float(r["l"]) - float(r["f"])) / 3600.0, 2)
            except (KeyError, ValueError):
                span_h = None
            shapes[r["variant_id"]] = {
                "events": ev,
                "distinct_source_ips": int(r.get("distinct_ips", 0) or 0),
                "distinct_regions": int(r.get("distinct_regions", 0) or 0),
                "distinct_usernames": int(r.get("distinct_users", 0) or 0),
                "distinct_access_keys": int(r.get("distinct_keys", 0) or 0),
                "identity_types": r.get("identity_types"),
                "span_hours": span_h,
                "error_rate": round(int(r.get("errors", 0) or 0) / ev, 2) if ev else 0,
            }
        return shapes

    async def evaluate_real_attack(self, scenario: Scenario, blue_template: str) -> dict[str, Any] | None:
        """Does this rule catch the REAL attack present in the data (not just synthetic variants)?

        Runs the detection scoped to (the real attack events + real benign). If it flags any
        non-benign entity, it caught the real attack. Returns None if the scenario has no real attack.
        """
        if not scenario.real_attack_scope:
            return None
        attack = (f"index={scenario.source_index} sourcetype={scenario.sourcetype} "
                  f"{scenario.real_attack_scope}")
        fp_rows = await self._run(blue_template, self._benign_src(scenario))
        fp_set = {r.get("entity") for r in fp_rows if r.get("entity")}
        rows = await self._run(blue_template, f"search (({attack}) OR ({self._benign_conditions(scenario)}))")
        hits = [r for r in rows if r.get("entity") and r.get("entity") not in fp_set]
        detect_time = None
        if hits:
            times = [float(r["detect_time"]) for r in hits if r.get("detect_time")]
            detect_time = min(times) if times else None
        return {"caught": len(hits) > 0, "detect_time": detect_time}

    async def evaluate(self, scenario: Scenario, blue_template: str,
                       variants: list[Variant]) -> EvalResult:
        # False positives: rule must not fire on real benign autoscaling.
        fp_rows = await self._run(blue_template, self._benign_src(scenario))
        fp_entities = [r.get("entity") for r in fp_rows if r.get("entity")]
        false_positive = len(fp_entities) > 0

        # Robust matching: scoped to (one variant + real benign), any flagged entity that is NOT a
        # benign entity must come from the variant -> caught. Works regardless of which field the
        # evolved rule keys on (IP / username / access key).
        fp_set = set(fp_entities)
        outcomes: list[VariantOutcome] = []
        detected_count = 0
        for v in variants:
            var_src = (f'search ((index={scenario.sandbox_index} variant_id="{v.id}") '
                       f"OR ({self._benign_conditions(scenario)}))")
            rows = await self._run(blue_template, var_src)
            hits = [r for r in rows if r.get("entity") and r.get("entity") not in fp_set]
            detected = len(hits) > 0
            detect_time = None
            if detected:
                times = [float(r["detect_time"]) for r in hits if r.get("detect_time")]
                detect_time = min(times) if times else None
                detected_count += 1
            outcomes.append(VariantOutcome(v.id, v.name, v.evasion, detected, detect_time))

        recall = detected_count / len(variants) if variants else 0.0
        # Fitness rewards catching evasions, penalizes false positives.
        fitness = round(recall - (0.5 if false_positive else 0.0), 4)
        return EvalResult(recall=recall, false_positive=false_positive, fp_entities=fp_entities,
                          outcomes=outcomes, fitness=fitness)
