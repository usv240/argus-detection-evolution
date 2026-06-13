# CLAUDE.md - ARGUS Architecture & Development Context

## Project Summary
**ARGUS** (Adversarial Generative Red-Blue Utility for Security) is an autonomous detection-improvement engine that co-evolves attacker and defender AI agents inside real Splunk data, measuring and closing gaps in security detection rules.

## Design Invariants
1. **No hardcoded data**: every metric and claim is live-verified; synthetic variants are clearly labeled.
2. **All backends load-bearing**: Splunk MCP Server, SDK, HEC, and AnomalyScorer tiers are not optional bolted-on features but core to the engine.
3. **Human approval gates**: rules ship disabled by default; "Approve & Deploy" requires explicit human sign-off before creating a Splunk saved search.
4. **Honest frontier reporting**: the "residual frontier" names evasions ARGUS *can't* catch, ranked by likelihood, so analysts know what to prioritize.

## Tech Stack
- **Backend**: Python (FastAPI + asyncio), Splunk SDK + MCP client, Claude agents
- **Frontend**: React + TypeScript + Tailwind + Vite
- **Splunk integrations**:
  - **MCP Server** (app 7931, Splunkbase): all agent searches route through `splunk_run_query` + 4 other tools
  - **Python SDK** (`splunklib`): fallback search path + SDK-create saved searches for "Approve & Deploy"
  - **HEC** (HTTP Event Collector): Red agent injects synthetic variants as real events
  - **AnomalyScorer** (4-tier): hosted model → MLTK `| fit/apply` → `| anomalydetection` → scikit-learn

## Key Files
- `backend/api.py`: FastAPI endpoints (`/api/arena`, `/api/health`, `/api/approval`, `/api/export_app`)
- `backend/arena_orchestrator.py`: generational hill-climbing loop (Red → Evaluator → Blue)
- `backend/models/scorer.py`: 4-tier anomaly scorer with live Splunk baseline training
- `backend/splunk/mcp_client.py`: MCP Server client (all 5 tools used)
- `backend/splunk/sdk_client.py`: Python SDK client + `create_saved_search()` for "Approve & Deploy"
- `frontend/src/views/Arena.tsx`: live SSE-streamed duel display + Judge Proof panel + Approval controls
- `backend/test_e2e.py`: pytest-based E2E tests for all endpoints

## Running the Backend
```bash
cd argus/backend
pip install -r requirements.txt  # pytest, pytest-asyncio added for tests
export SCORER_BACKEND=splunk_spl  # or splunk_mltk, hosted, local
python -m uvicorn api:app --port 8810 --host 127.0.0.1
```

## Running Tests
```bash
cd argus/backend
pytest test_e2e.py -v
```

## Scoring Backends (AnomalyScorer Priority Order)
1. **hosted**: POST to `SCORER_HOSTED_ENDPOINT` with variant shape → `SCORER_HOSTED_MODEL`
2. **splunk_mltk**: `| fit IsolationForest ... into model | apply model` (built-in MLTK command, works without app install)
3. **splunk_spl** (default): `| anomalydetection action=annotate` (built-in Splunk command)
4. **local**: scikit-learn `IsolationForest` trained on live Splunk baseline (pure Python fallback)

Each tier trains on **live per-hour baseline** (launches, IPs, regions from real `botsv3` data), never fabricated.

## Splunk Setup Verification
```bash
# Health check: confirms MCP + SDK + HEC + LLM all connected
curl http://127.0.0.1:8810/api/health | jq .

# MCP reachability: proves MCP Server is load-bearing
curl http://127.0.0.1:8810/api/mcp_probe | jq .

# Scenario list: proves the engine is not hardcoded to one attack
curl http://127.0.0.1:8810/api/scenarios | jq .

# Test an arena run (short config for quick feedback)
curl -X POST http://127.0.0.1:8810/api/arena \
  -H "Content-Type: application/json" \
  -d '{"scenario":"aws_cryptomining","generations":1,"variants_per_gen":2,"refine_attempts":2}' \
  | head -100
```

## Bonus Prize Coverage
- **Best Use of Splunk MCP Server**: all 5 documented tools exercised (75+ searches per run)
- **Best Use of Splunk Hosted Models**: 4-tier scorer with live baselines, default=`splunk_spl` (built-in `| anomalydetection`)
- **Best Use of Splunk Developer Tools**: app export + AppInspect validation; "Approve & Deploy" via SDK + MCP verification

## Common Development Workflows

### Add a New Splunk Query
All searches go through the provider (MCP or SDK). In `backend/arena_orchestrator.py`, call `await self._search.run_search(spl, earliest=...)`.

### Add a New Evaluation Metric
Edit `backend/arena_orchestrator.py:_evaluate_generation()` to compute and emit new fields. They flow to the SSE stream and appear in the Arena's Judge Proof panel.

### Modify the Anomaly Scorer
Edit `backend/models/scorer.py`. Keep the 4-tier fallthrough strategy (`_verify_hosted` → `_try_mltk_fit` → `_try_splunk_spl` → `_train_local`). Each tier's `Score` object includes a `source` label so the UI shows which backend was used.

### Add a New Scenario
Add a `Scenario` dataclass to `backend/scenarios.py` with `key`, `name`, `technique`, `mitre`, `source_index`, `sourcetype`, `benign_scope`, `baseline_spl`, etc. The engine handles the rest.

### Change the Demo Video Script
Edit `SUBMISSION.md` section B. The script drives the UI through `http://localhost:5180`; highlight coverage metrics, MITRE map, blind-spot frontier, and the app export + approve/deploy flow.

## Known Limitations & Workarounds
- **Docker Splunk & model persistence**: MLTK `| fit` stores models in Splunk's registry; they persist across searches. If you restart Splunk, old models are gone - the scorer falls back automatically.
- **HEC latency**: synthetic variants injected via HEC take ~1–2 seconds to appear in search results; all searches include `earliest=0` to avoid timing races.
- **Environment restart on `.env` change**: uvicorn runs WITHOUT `--reload`, so `.env` changes require a manual backend restart. Frontend Vite HMR auto-applies without restart.

## Judging Checklist (from SUBMISSION.md)
- [ ] Devpost text (section A, rewritten for "continuous improvement" framing)
- [ ] Demo video < 3 min on YouTube (section B script)
- [ ] Public GitHub repo with MIT license
- [ ] Architecture diagram (root of repo)
- [ ] README with setup/run/deps + bonus prize coverage
- [ ] Rotate API key after recording (it was shared in chat)
- Bonuses verified live: MCP (all 5 tools), Hosted Models (splunk_spl + tested MLTK), Dev Tools (export + approve/deploy)
