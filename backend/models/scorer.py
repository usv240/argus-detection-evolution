"""Anomaly scoring for ARGUS - the Splunk-native model layer.

Priority order for scorer backends:
  1. SCORER_BACKEND="hosted" - Splunk-hosted model REST endpoint (MLTK Serving or custom).
  2. SCORER_BACKEND="splunk_mltk" - Splunk MLTK fit/apply via SPL (IsolationForest in Splunk).
  3. SCORER_BACKEND="splunk_spl" - Splunk built-in anomalydetection SPL command.
  4. SCORER_BACKEND="local" - scikit-learn IsolationForest trained on live Splunk baseline.
  5. default (empty) - falls back to "local" automatically.

Every path queries REAL Splunk data. No scores are fabricated.
The source label in the Score object tells the UI exactly which backend produced the score.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

import httpx

from config import settings
from exceptions import NotConfiguredError, ArgusError


@dataclass
class Score:
    value: float              # 0.0 (normal) → 1.0 (highly anomalous)
    source: str               # e.g. "splunk-mltk", "splunk-spl", "splunk-baseline-zscore"
    baseline: float | None    # reference threshold, if available
    detail: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# AnomalyScorer - the primary scorer used by the arena orchestrator
# ---------------------------------------------------------------------------

class AnomalyScorer:
    """Anomaly scorer that trains on REAL Splunk baseline data and scores variants.

    Tries each backend in priority order; falls through to the next on failure.
    Every path issues live Splunk searches - the search is counted + traced to the UI.
    """

    def __init__(self, search: Any) -> None:
        self._search = search
        self._backend: str = ""
        self._baseline: dict[str, float] = {}
        self._iso: Any = None            # sklearn IsolationForest (local path)
        self._mltk_model_name = "argus_baseline_model"

    # ── public interface ────────────────────────────────────────────────────

    async def train(self, scenario: Any) -> None:
        """Query Splunk baseline and fit the anomaly model. Called once before the first generation."""
        backend = (settings.scorer_backend or "").lower() or "local"

        if backend == "hosted":
            await self._verify_hosted()
            return

        if backend in ("splunk_mltk", "mltk"):
            if await self._try_mltk_fit(scenario):
                return
            # MLTK not available - fall through

        if backend in ("splunk_spl", "spl"):
            if await self._try_splunk_spl(scenario):
                return
            # anomalydetection not available - fall through

        # "local" or any fallback
        await self._train_local(scenario)

    async def score(self, shape: dict[str, Any]) -> Score | None:
        """Score one variant's behavioral profile against the trained baseline.

        Dispatches on the concrete label `train()` set on `self._backend` (e.g.
        "splunk-baseline-isolation-forest"), not the raw SCORER_BACKEND config
        string - train() may have fallen through to a different backend than
        configured."""
        if self._backend == "hosted":
            return await self._score_hosted(shape)
        if self._backend == "splunk-mltk-isolation-forest":
            return await self._score_mltk(shape)
        if self._backend == "splunk-spl-anomalydetection":
            return self._score_zscore(shape, source="splunk-spl-baseline")
        if self._backend in ("splunk-baseline-isolation-forest", "splunk-baseline-zscore"):
            return self._score_local(shape)
        return None

    @property
    def source(self) -> str:
        return self._backend or "unconfigured"

    # ── backend 1: Splunk-hosted model REST endpoint ────────────────────────

    async def _verify_hosted(self) -> None:
        if not settings.scorer_hosted_endpoint:
            raise NotConfiguredError("SCORER_HOSTED_ENDPOINT", "SETUP.md Step 6")
        self._backend = "hosted"

    async def _score_hosted(self, shape: dict[str, Any]) -> Score:
        if not settings.scorer_hosted_endpoint:
            raise NotConfiguredError("SCORER_HOSTED_ENDPOINT", "SETUP.md Step 6")
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                settings.scorer_hosted_endpoint,
                json={"model": settings.scorer_hosted_model, "input": shape},
            )
            resp.raise_for_status()
            body = resp.json()
        value = body.get("score")
        if value is None:
            raise ArgusError("Hosted model returned no score field; refusing to fabricate one.")
        return Score(
            value=float(value),
            source=f"splunk-hosted:{settings.scorer_hosted_model}",
            baseline=body.get("baseline"),
            detail=body,
        )

    # ── backend 2: MLTK IsolationForest via SPL fit/apply ──────────────────

    async def _try_mltk_fit(self, scenario: Any) -> bool:
        """Fit an IsolationForest via Splunk MLTK's |fit command. Returns True if MLTK available.

        Note: |fit stores the model in Splunk's model registry; the IsAnomaly fields appear only
        when you later |apply the model to new data, not in the fit output itself.
        """
        fit_spl = (
            f"search index={scenario.source_index} sourcetype={scenario.sourcetype} "
            f"{scenario.benign_scope} earliest=0 "
            "| bin _time span=1h "
            "| stats count as launches dc(sourceIPAddress) as distinct_ips "
            "dc(awsRegion) as distinct_regions by _time 'userIdentity.userName' "
            f"| fit IsolationForest launches distinct_ips distinct_regions "
            f"into {self._mltk_model_name} random_state=42 n_estimators=50 contamination=0.05"
        )
        try:
            rows = await asyncio.wait_for(
                self._search.run_search(fit_spl, earliest="0"), timeout=45.0
            )
            # |fit succeeds silently; if we got here, the model was created.
            # Test the apply path to confirm the model is usable:
            test_spl = (
                f'| makeresults | eval launches=100, distinct_ips=10, distinct_regions=2 '
                f'| apply {self._mltk_model_name} '
                f'| fields IsAnomaly anomaly_score'
            )
            test_rows = await asyncio.wait_for(
                self._search.run_search(test_spl, earliest="0"), timeout=20.0
            )
            if test_rows and ("IsAnomaly" in test_rows[0] or "anomaly_score" in test_rows[0]):
                self._backend = "splunk-mltk-isolation-forest"
                # Also build a fallback z-score from the training rows
                await self._build_zscore_from_rows(rows, "launches", "distinct_ips", "distinct_regions")
                return True
        except Exception:
            pass
        return False

    async def _score_mltk(self, shape: dict[str, Any]) -> Score:
        """Apply the fitted MLTK model to a variant's behavioral profile."""
        launches = float(shape.get("events", 0) or 0)
        ips = float(shape.get("distinct_source_ips", 0) or 0)
        regions = float(shape.get("distinct_regions", 0) or 0)
        apply_spl = (
            f'| makeresults | eval launches={launches}, distinct_ips={ips}, '
            f'distinct_regions={regions} '
            f"| apply {self._mltk_model_name} "
            "| fields IsAnomaly anomaly_score launches distinct_ips distinct_regions"
        )
        try:
            rows = await asyncio.wait_for(
                self._search.run_search(apply_spl, earliest="0"), timeout=20.0
            )
            if rows:
                r = rows[0]
                raw = float(r.get("anomaly_score") or r.get("IsAnomaly") or 0)
                return Score(
                    value=min(1.0, max(0.0, raw)),
                    source="splunk-mltk-isolation-forest",
                    baseline=None,
                    detail=dict(r),
                )
        except Exception:
            pass
        # MLTK apply failed - fall back to z-score
        return self._score_zscore(shape, source="splunk-mltk-zscore-fallback")

    # ── backend 3: Splunk built-in anomalydetection command ────────────────

    async def _try_splunk_spl(self, scenario: Any) -> bool:
        """Probe whether |anomalydetection is available by running it on the real
        per-hour baseline (no 'userIdentity.userName' split - same tier-2 shape
        _baseline_rows() falls back to, since AssumedRole identities often have no
        top-level userName and tier-1 can legitimately return 0 rows).

        Splunk's built-in command (action=annotate) only adds annotation fields
        (probable_cause, log_event_prob, max_freq, ...) to rows it actually flags as
        anomalous, which a clean baseline may have none of - so availability is judged
        by the command running cleanly and returning the baseline rows, not by whether
        THIS baseline happens to contain a flagged outlier."""
        probe_spl = (
            f"search index={scenario.source_index} sourcetype={scenario.sourcetype} "
            f"{scenario.benign_scope} earliest=0 "
            "| bin _time span=1h "
            "| stats count as launches dc(sourceIPAddress) as distinct_ips "
            "dc(awsRegion) as distinct_regions by _time "
            "| anomalydetection launches distinct_ips distinct_regions action=annotate"
        )
        try:
            rows = await asyncio.wait_for(
                self._search.run_search(probe_spl, earliest="0"), timeout=30.0
            )
            if len(rows) >= 5:
                self._backend = "splunk-spl-anomalydetection"
                await self._build_zscore_from_rows(rows, "launches", "distinct_ips", "distinct_regions")
                return True
        except Exception:
            pass
        return False

    # ── backend 4: scikit-learn IsolationForest on live Splunk data ─────────

    async def _baseline_rows(self, scenario: Any) -> list[dict[str, Any]]:
        """Real per-hour activity stats from Splunk to train the baseline model on.

        Tries three live queries, in order of how well they isolate genuinely
        "normal" behavior, and returns the first with >=5 rows:

          1. benign_scope, per-user/hour (e.g. AssumedRole automation by user).
          2. benign_scope, per-hour only - some BOTS v3 extracts carry AssumedRole
             identities with no top-level userIdentity.userName (it's nested under
             sessionContext in real CloudTrail), so (1) can legitimately return zero
             rows even though benign_scope itself matches plenty of events.
          3. all events for this index/sourcetype, per-hour - last resort if
             benign_scope matches almost nothing; may include the real attack hours.

        Every tier is a live Splunk query. Guarantees the model never silently
        trains on hardcoded constants while any real data exists in the source
        index, and prefers a baseline that excludes the real attack when possible."""
        tiers = [
            (
                f"search index={scenario.source_index} sourcetype={scenario.sourcetype} "
                f"{scenario.benign_scope} earliest=0 "
                "| bin _time span=1h "
                "| stats count as launches dc(sourceIPAddress) as distinct_ips "
                "dc(awsRegion) as distinct_regions by _time 'userIdentity.userName'"
            ),
            (
                f"search index={scenario.source_index} sourcetype={scenario.sourcetype} "
                f"{scenario.benign_scope} earliest=0 "
                "| bin _time span=1h "
                "| stats count as launches dc(sourceIPAddress) as distinct_ips "
                "dc(awsRegion) as distinct_regions by _time"
            ),
            (
                f"search index={scenario.source_index} sourcetype={scenario.sourcetype} earliest=0 "
                "| bin _time span=1h "
                "| stats count as launches dc(sourceIPAddress) as distinct_ips "
                "dc(awsRegion) as distinct_regions by _time"
            ),
        ]
        best: list[dict[str, Any]] = []
        for spl in tiers:
            try:
                rows = await self._search.run_search(spl, earliest="0")
            except Exception:
                rows = []
            if len(rows) >= 5:
                return rows
            if len(rows) > len(best):
                best = rows
        return best

    async def _train_local(self, scenario: Any) -> None:
        """Query real baseline from Splunk; fit IsolationForest (sklearn) on it."""
        rows = await self._baseline_rows(scenario)

        if len(rows) >= 5:
            import numpy as np
            from sklearn.ensemble import IsolationForest

            X = np.array([
                [float(r.get("launches", 0) or 0),
                 float(r.get("distinct_ips", 0) or 0),
                 float(r.get("distinct_regions", 0) or 0)]
                for r in rows
            ], dtype=float)
            self._iso = IsolationForest(contamination=0.05, random_state=42, n_estimators=100)
            self._iso.fit(X)
            self._backend = "splunk-baseline-isolation-forest"
            # Also precompute z-score stats as fallback
            self._baseline = {
                "avg_launches": float(np.mean(X[:, 0])),
                "std_launches": float(np.std(X[:, 0])) or 1.0,
                "avg_ips": float(np.mean(X[:, 1])),
                "std_ips": float(np.std(X[:, 1])) or 0.5,
                "avg_regions": float(np.mean(X[:, 2])),
                "std_regions": float(np.std(X[:, 2])) or 0.3,
            }
        else:
            # Minimal baseline from whatever we got (or defaults derived from BOTS known stats)
            await self._build_zscore_from_rows(rows, "launches", "distinct_ips", "distinct_regions")
            self._backend = "splunk-baseline-zscore"

    def _score_local(self, shape: dict[str, Any]) -> Score:
        if self._iso is None:
            return self._score_zscore(shape, source="splunk-baseline-zscore")

        import numpy as np
        launches = float(shape.get("events", 0) or 0)
        span_h = float(shape.get("span_hours") or 1.0) or 1.0
        rate = launches / span_h
        ips = float(shape.get("distinct_source_ips", 0) or 0)
        regions = float(shape.get("distinct_regions", 0) or 0)

        X = np.array([[rate, ips, regions]], dtype=float)
        # decision_function: negative = anomalous; convert to [0,1]
        raw = float(self._iso.decision_function(X)[0])
        # Map: -0.5 (most anomalous) → 1.0; +0.1 (normal) → ~0.0
        iso_score = max(0.0, min(1.0, (-raw + 0.1) / 0.6))

        # With only ~25 hourly training rows, IsolationForest's decision_function
        # can be unreliable for points far outside the training range (e.g. a
        # constant-valued training feature gives it no basis to penalize huge
        # deviations on that dimension). Blend with the z-score against the same
        # real baseline, which scales correctly for extreme outliers - take
        # whichever signal flags the variant as MORE anomalous.
        z = self._score_zscore(shape, source="splunk-baseline-isolation-forest")
        score = max(iso_score, z.value)
        detail = dict(z.detail)
        detail.update({"raw_decision": round(raw, 4), "isolation_forest_score": round(iso_score, 3)})
        return Score(
            value=round(score, 3),
            source="splunk-baseline-isolation-forest",
            baseline=0.1,
            detail=detail,
        )

    # ── shared z-score helper ───────────────────────────────────────────────

    async def _build_zscore_from_rows(self, rows: list[dict], *field_names: str) -> None:
        """Compute mean/std from row data for z-score fallback baseline."""
        if not rows:
            return
        import numpy as np
        arrays = {}
        for f in field_names:
            vals = [float(r.get(f, 0) or 0) for r in rows]
            arrays[f] = np.array(vals, dtype=float)
        self._baseline = {
            "avg_launches": float(np.mean(arrays.get("launches", np.array([2.5])))),
            "std_launches": max(0.5, float(np.std(arrays.get("launches", np.array([1.0]))))),
            "avg_ips": float(np.mean(arrays.get("distinct_ips", np.array([1.0])))),
            "std_ips": max(0.3, float(np.std(arrays.get("distinct_ips", np.array([0.5]))))),
            "avg_regions": float(np.mean(arrays.get("distinct_regions", np.array([1.0])))),
            "std_regions": max(0.2, float(np.std(arrays.get("distinct_regions", np.array([0.3]))))),
        }

    def _score_zscore(self, shape: dict[str, Any], source: str) -> Score:
        launches = float(shape.get("events", 0) or 0)
        span_h = float(shape.get("span_hours") or 1.0) or 1.0
        rate = launches / span_h
        ips = float(shape.get("distinct_source_ips", 0) or 0)
        regions = float(shape.get("distinct_regions", 0) or 0)
        b = self._baseline or {
            "avg_launches": 2.5, "std_launches": 1.0,
            "avg_ips": 1.0, "std_ips": 0.5,
            "avg_regions": 1.0, "std_regions": 0.3,
        }
        z_launch = (rate - b["avg_launches"]) / b["std_launches"]
        z_ips = (ips - b["avg_ips"]) / b["std_ips"]
        z_regions = (regions - b["avg_regions"]) / b["std_regions"]
        max_z = max(z_launch, z_ips, z_regions, 0.0)
        score = min(1.0, max_z / 8.0)   # 8-sigma → 100%
        return Score(
            value=round(score, 3),
            source=source,
            baseline=None,
            detail={"z_launch_rate": round(z_launch, 2), "z_distinct_ips": round(z_ips, 2),
                    "z_distinct_regions": round(z_regions, 2), "rate_per_hour": round(rate, 1)},
        )
