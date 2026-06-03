"""Arena orchestrator: runs the adversarial co-evolution loop.

Each generation: Red synthesizes evasions targeting the CURRENT detection -> Evaluator scores it
live -> Blue evolves the detection to catch them. At the end, the BASELINE and the FINAL evolved
detection are both scored over ALL accumulated variants to produce the headline coverage gain.

Safeguards: a broken/evasion-failing evolved rule is validated before adoption; if it errors or
regresses to false positives on benign, we keep the previous rule.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from agents.blue_evolver import BlueEvolver
from agents.evaluator import Evaluator, EvalResult
from agents.red_synthesizer import RedSynthesizer, Variant
from exceptions import ArgusError, SearchError
from models.llm import LLM
from scenarios import Scenario

Emit = Callable[[dict[str, Any]], Awaitable[None]]
INGEST_WAIT = 8  # seconds for HEC events to become searchable


async def _noop(_: dict[str, Any]) -> None:
    return None


def _coverage_map(all_variants, base, final, scenario) -> list[dict[str, Any]]:
    """Per ATT&CK technique: how many exercising variants are caught, baseline vs final."""
    base_caught = {o.id for o in base.outcomes if o.detected} if base else set()
    final_caught = {o.id for o in final.outcomes if o.detected} if final else set()
    tech: dict[str, dict[str, int]] = {}
    for v in all_variants:
        for t in (v.mitre or []):
            d = tech.setdefault(t, {"total": 0, "baseline": 0, "final": 0})
            d["total"] += 1
            if v.id in base_caught:
                d["baseline"] += 1
            if v.id in final_caught:
                d["final"] += 1
    return [{"technique": t, "name": scenario.mitre_names.get(t, t),
             "total": d["total"], "baseline_caught": d["baseline"], "final_caught": d["final"]}
            for t, d in sorted(tech.items())]


class ArenaOrchestrator:
    def __init__(self, llm: LLM, search: Any, hec: Any) -> None:
        self.search = search
        self.red = RedSynthesizer(llm, search, hec)
        self.blue = BlueEvolver(llm)
        self.evaluator = Evaluator(search)

    def _real_src(self, s: Scenario) -> str:
        return f"search index={s.source_index} sourcetype={s.sourcetype}"

    async def _safe_eval(self, s: Scenario, template: str, variants: list[Variant]) -> EvalResult | None:
        try:
            return await self.evaluator.evaluate(s, template, variants)
        except SearchError:
            return None

    async def _valid_rule(self, s: Scenario, template: str) -> bool:
        if "{src}" not in template:
            return False
        try:  # must run without error on benign scope
            await self.evaluator._run(template, self.evaluator._benign_src(s))
            return True
        except SearchError:
            return False

    async def run_arena(self, scenario: Scenario, generations: int = 3,
                        variants_per_gen: int = 4, refine_attempts: int = 3,
                        stop_on_converge: bool = False, emit: Emit = _noop) -> dict[str, Any]:
        dist = await scenario.distributions(self.search, scenario)
        await emit({"type": "arena_started", "scenario": scenario.name,
                    "baseline": scenario.baseline_name, "generations": generations})

        blue_template = scenario.baseline_spl
        all_variants: list[Variant] = []
        history: list[dict[str, Any]] = []

        for gen in range(generations):
            variants = await self.red.run(
                scenario, dist, blue_template.replace("{src}", self._real_src(scenario)),
                n=variants_per_gen)
            all_variants += variants
            await emit({"type": "variants_generated", "generation": gen,
                        "variants": [{"id": v.id, "name": v.name, "evasion": v.evasion} for v in variants]})
            await asyncio.sleep(INGEST_WAIT)

            shapes = await self.evaluator.profile(scenario, variants)
            res = await self._safe_eval(scenario, blue_template, variants)
            if res is None:
                break
            await emit({"type": "generation_scored", "generation": gen, "recall": res.recall,
                        "false_positive": res.false_positive,
                        "outcomes": [asdict(o) for o in res.outcomes]})

            # Inner refinement loop: Blue iterates with REAL miss-shape feedback until recall climbs
            # (hill-climbing: only keep a proposal that catches more, with no false positives).
            best_spl, best = blue_template, res
            for attempt in range(refine_attempts):
                if best.recall >= 1.0 and not best.false_positive:
                    break
                missed = [{"evasion": o.evasion, "shape": shapes.get(o.id, {})}
                          for o in best.outcomes if not o.detected]
                if not missed and not best.false_positive:
                    break
                try:
                    proposal = await self.blue.evolve(scenario, best_spl, missed, best.false_positive)
                except Exception:  # noqa: BLE001 - a bad LLM response is a failed attempt, not a crash
                    await emit({"type": "blue_attempt_rejected", "generation": gen, "attempt": attempt})
                    continue
                if not await self._valid_rule(scenario, proposal["spl"]):
                    await emit({"type": "blue_attempt_rejected", "generation": gen, "attempt": attempt})
                    continue
                evo = await self._safe_eval(scenario, proposal["spl"], variants)
                if evo and not evo.false_positive and evo.recall > best.recall:
                    best_spl, best = proposal["spl"], evo
                    await emit({"type": "blue_evolved", "generation": gen, "attempt": attempt,
                                "rationale": proposal["rationale"], "blue_spl": best_spl,
                                "new_recall": best.recall})
                else:
                    await emit({"type": "blue_attempt_rejected", "generation": gen, "attempt": attempt,
                                "tried_recall": (evo.recall if evo else None)})

            blue_template = best_spl
            history.append({"generation": gen, "recall_before": res.recall,
                            "recall_after": best.recall, "false_positive": best.false_positive,
                            "blue_spl": best_spl, "outcomes": [asdict(o) for o in best.outcomes]})
            await emit({"type": "generation_complete", "generation": gen,
                        "recall_before": res.recall, "recall_after": best.recall})

            if best.recall >= 1.0 and not best.false_positive:
                await emit({"type": "converged", "generation": gen})
                if stop_on_converge:
                    break
                # else: keep going — next generation's Red attacks the EVOLVED rule (escalation).

        # Headline: baseline vs final, scored over ALL accumulated variants.
        base = await self._safe_eval(scenario, scenario.baseline_spl, all_variants)
        final = await self._safe_eval(scenario, blue_template, all_variants)
        final_outcomes = [asdict(o) for o in final.outcomes] if final else []
        # The residual frontier = evasions the final hardened rule STILL misses (real blind spots).
        frontier = [o for o in final_outcomes if not o["detected"]]

        # Does the rule catch the REAL attack in the data (not just synthetic variants)?
        real_attack = None
        try:
            br = await self.evaluator.evaluate_real_attack(scenario, scenario.baseline_spl)
            fr = await self.evaluator.evaluate_real_attack(scenario, blue_template)
            if br is not None and fr is not None:
                real_attack = {"baseline_caught": br["caught"], "final_caught": fr["caught"]}
        except SearchError:
            real_attack = None

        # MITRE ATT&CK coverage map: per technique, how many exercising variants are caught,
        # baseline vs final. Computed from real outcomes — coverage that self-improves as Blue hardens.
        coverage_map = _coverage_map(all_variants, base, final, scenario)

        # Resilience certificate: a measured before/after artifact with a tamper-evident fingerprint.
        certificate = {
            "id": "ARGUS-CERT-" + uuid.uuid4().hex[:10].upper(),
            "issued_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "scenario": scenario.name,
            "baseline_detection": scenario.baseline_name,
            "generations": len(history),
            "total_variants": len(all_variants),
            "baseline_recall": round(base.recall, 4) if base else None,
            "final_recall": round(final.recall, 4) if final else None,
            "false_positive": final.false_positive if final else None,
            "residual_blind_spots": len(frontier),
            "real_attack_caught": real_attack["final_caught"] if real_attack else None,
            "mitre_coverage": coverage_map,
            "final_detection_spl": blue_template,
        }
        certificate["fingerprint"] = hashlib.sha256(
            json.dumps(certificate, sort_keys=True).encode()).hexdigest()

        summary = {
            "scenario": scenario.name,
            "baseline_name": scenario.baseline_name,
            "total_variants": len(all_variants),
            "baseline_recall": base.recall if base else None,
            "final_recall": final.recall if final else None,
            "final_false_positive": final.false_positive if final else None,
            "baseline_spl": scenario.baseline_spl,
            "final_spl": blue_template,
            "final_outcomes": final_outcomes,
            "frontier": frontier,
            "coverage_map": coverage_map,
            "real_attack": real_attack,
            "certificate": certificate,
            "history": history,
        }
        await emit({"type": "arena_finished",
                    "total_variants": summary["total_variants"],
                    "baseline_recall": summary["baseline_recall"],
                    "final_recall": summary["final_recall"],
                    "final_false_positive": summary["final_false_positive"],
                    "final_spl": blue_template,
                    "frontier": frontier,
                    "coverage_map": coverage_map,
                    "real_attack": real_attack,
                    "certificate": certificate})
        return summary
