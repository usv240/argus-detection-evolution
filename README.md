# ARGUS - Adversarial Detection Evolution Engine

> **Red AI vs Blue AI, live on real Splunk data.**

An attacker AI and a defender AI co-evolve inside real Splunk data - generation after generation - 
until your detections catch attacks **no human ever wrote a rule for**, and ARGUS **proves the
coverage gain with every number computed live.**

---

## What it does

Most security tools tell you what they caught. **ARGUS shows you what they would miss** - by
breeding an attacker against your own detections and watching the defender evolve.

Starting from a real Splunk ESCU-based detection:

| Step | Agent | What happens |
|---|---|---|
| **Attack** | **Red** (Synthesizer) | Invents evasive variants of the attack, targeting the current detection's weaknesses. Materializes them as synthetic CloudTrail events sampled from **real field distributions**, injected via HEC - clearly labeled `argus_synthetic=true`. |
| **Score** | **Evaluator** | Runs the detection **live against Splunk** and measures: recall (% of attacks caught), false-positive rate on real benign traffic, per-variant outcomes, and per-evasion shape. Every number is computed live - nothing is asserted. |
| **Evolve** | **Blue** (Evolver) | Rewrites the SPL detection to catch the survivors, calibrated to the **real measured shape** of each miss, without firing on benign traffic. Hill-climbing: only adopted if recall improves and false positives stay zero. |
| **Escalate** | **Orchestrator** | Next generation, Red attacks the **evolved** rule. The arms race escalates until it converges - or you see exactly why it can't. |

---

## What a run produces (all computed live, nothing hardcoded)

- **Coverage gain** - measured: baseline **0%** → evolved **up to 100%** of attack variants caught
- **Real-attack validation** - does the evolved rule catch the genuine attack in the BOTS dataset? (yes/no, computed live)
- **MITRE ATT&CK coverage map** - per technique, baseline vs final coverage, visibly self-improving
- **Judge Proof panel** - one place with every measurable fact: coverage, false positives, variants tested, real attack caught, live Splunk searches run, synthetic index, run ID, certificate SHA-256
- **Baseline → evolved SPL diff** - highlighted changes Blue made, with plain-English rationale
- **Resilience Certificate** - downloadable JSON artifact, SHA-256 fingerprinted, before/after summary
- **MCP/search receipt** - downloadable JSON of every live Splunk search (query + provider + rows)
- **Residual frontier** - evasions the final rule still can't catch = your real, prioritized blind spots
- **Anomaly scores** - every variant scored 0–100% against a live Splunk-trained baseline (hosted model / MLTK / SPL `anomalydetection` / local IsolationForest - first available tier), shown per-evasion
- **Exportable Splunk app** - one click turns the evolved detection into an installable `.spl` bundle (disabled saved search + README + certificate), automatically validated with Splunk AppInspect (embedded `APPINSPECT_REPORT.json` + a pass/warning/fail badge in the UI)
- **Approve / Edit / Reject** - human-in-the-loop review of the evolved detection before any deploy

---

## Why it's different

The "AI that explains a security alert" space is crowded. ARGUS does the opposite: it **breeds an attacker against your defenses** to discover blind spots you never knew existed, then proves it closed them. The things that make it genuinely different:

- **Adversarial co-evolution, not a chatbot.** Red and Blue take turns - Red exploits your rule, Blue adapts. You watch the arms race, not a summary.
- **No hardcoded data.** Every query runs live on Splunk, every metric is computed at runtime. If you pull the plug on Splunk, every number disappears - by design.
- **Honest.** ARGUS labels synthetic events, shows what it couldn't fix (the frontier), and attributes all scores to their real source. No staged results.
- **Scenario-agnostic engine.** A `Scenario` carries its attack briefing, distributions query, and event builder. Changing attack family = adding one object, no engine changes.

---

## Bonus prize coverage

ARGUS targets all three optional bonuses - each is load-bearing in the core loop, not bolted on for judging:

| Bonus | How ARGUS earns it |
|---|---|
| **Best Use of Splunk MCP Server** | **All 5 documented tools exercised.** `SEARCH_PROVIDER=mcp` routes every agent search (75+ live searches per run) through the official Splunk MCP Server (Splunkbase app 7931): `splunk_run_query` (Red/Blue/Evaluator/scorer), `splunk_get_indexes`, `splunk_get_index_info`, `splunk_get_info` (proven by `/api/health` returning `server_info: {version: "10.2.4", ...}`), and `splunk_run_saved_search` (exercised on the "Approve & Deploy" path to verify evolved rules exist in Splunk). `GET /api/mcp_probe` runs a one-shot live query judges can curl directly. |
| **Best Use of Splunk Hosted Models** | **4-tier scorer verified live.** `backend/models/scorer.py` cascades: hosted model → Splunk MLTK `\| fit IsolationForest \| apply` → **built-in `\| anomalydetection`** (default, ships with core Splunk, zero app install) → scikit-learn fallback. **Every tier trains on live per-hour baseline** (launches/IPs/regions from `botsv3`), never fabricated. Verified: RUN-D7884823 shows `anomaly_scorer_backend: "splunk-spl-anomalydetection"`, with 2 of 3 frontier evasions flagged 62.5%/100% anomalous. Each variant shows `anomaly NN%` badge in the Arena; scorer backend recorded in Resilience Certificate. |
| **Best Use of Splunk Developer Tools** | **SDK used in two production paths.** (1) `POST /api/export_app`: evolved rule packages as an audited Splunk app (app.conf, savedsearches.conf disabled, certificate, README), validated live with Splunk's `splunk-appinspect` CLI (report embedded as JSON, verdict shown as badge). (2) **"Approve & Deploy"** (`POST /api/approval`): `splunklib.client` creates a real disabled Splunk saved search from the evolved SPL, verified live via `splunk_run_saved_search` (5th MCP tool) - closing the loop from AI-proposed rule to deployed artifact with human approval gates. |

---

## Scenarios

Two ship. Both run on BOTS v3 CloudTrail (the cleanly field-extracted data):

| Scenario | MITRE | Baseline weakness |
|---|---|---|
| **AWS cryptomining** (default) | T1496 Resource Hijacking · T1078 Valid Accounts · T1535 Unused Regions | Per-username hourly count - misses rate-throttling, IP rotation, multi-region spread, AssumedRole mimicry |
| **AWS IAM persistence** | T1136 Create Account · T1098 Account Manipulation · T1078 Valid Accounts | Per-username IAM-change count - misses rotating actors, throttling, service-identity mimic |

The registry (`backend/scenarios.py`) supports more. Endpoint/identity scenarios work with the engine - they need the relevant Splunk TAs to field-extract the data.

---

## No-hardcoded-data rule (project invariant)

> Per-PR test: *"If I deleted my Splunk instance, would this number still appear?"* If yes, fix it.

- No mock API responses, canned search results, fabricated metrics, pre-written verdicts
- Every SPL query generated and run live against Splunk (via MCP or SDK)
- The only synthetic data is Red's variants - generated at runtime from real distributions, labeled
- All recall / FP / lead-time / coverage / certificate values computed from real Splunk search output

---

## Architecture

See [`architecture_diagram.md`](architecture_diagram.md) for full Mermaid diagrams.
Integration docs: [`REFERENCES.md`](REFERENCES.md).

```
argus/
├── LICENSE                         MIT
├── README.md                       this file
├── SETUP.md                        step-by-step setup guide
├── REFERENCES.md                   Splunk SDK / MCP / data reference links
├── architecture_diagram.md         (rules-required) system + data-flow diagrams
│
├── backend/
│   ├── api.py                      FastAPI: /api/arena (SSE) /api/health /api/mcp_probe /api/scenarios /api/export_app /api/approval
│   ├── arena_orchestrator.py       generational co-evolution + hill-climbing + run_id + search tracing
│   ├── app_export.py               packages the evolved detection as an installable Splunk .spl app
│   ├── scenarios.py                scenario registry (AWS cryptomining, IAM persistence)
│   ├── smoke_test.py               judge quickstart: verifies Splunk + search + HEC + LLM in ~10s
│   ├── agents/
│   │   ├── red_synthesizer.py      Red - invents evasions, materializes synthetic events via HEC
│   │   ├── evaluator.py            live recall / FP / real-attack validation / variant profiling
│   │   └── blue_evolver.py         Blue - evolves SPL calibrated to real miss-shapes + invariant hints
│   ├── splunk/
│   │   ├── mcp_client.py           Splunk MCP Server client (primary, with retry)
│   │   ├── sdk_client.py           Splunk Python SDK client (fallback, with retry)
│   │   ├── hec.py                  HEC write path for synthetic variants (with retry)
│   │   └── search.py               SearchProvider abstraction (sdk / mcp)
│   ├── models/
│   │   ├── llm.py                  Claude reasoning - tiered: Sonnet (primary) / Haiku (fast steps)
│   │   └── scorer.py               AnomalyScorer - hosted / MLTK / SPL / local, trained on a live Splunk baseline
│   ├── requirements.txt
│   ├── .env.example                all configuration keys, no secrets
│   └── config.py / exceptions.py
│
└── frontend/
    ├── src/
    │   ├── App.tsx                 shell: Home / Arena tabs, status header, footer
    │   ├── content.ts              single-source glossary + landing copy (18 terms, plain English)
    │   ├── views/
    │   │   ├── Landing.tsx         onboarding home page - explains ARGUS to zero-knowledge visitors
    │   │   └── Arena.tsx           the live co-evolution UI (all panels below)
    │   ├── components/ui.tsx       design system: Button, Card, InfoTip (ⓘ), Term, Stat
    │   └── api/stream.ts           SSE-over-POST client for /api/arena
    ├── package.json
    ├── vite.config.ts
    └── tailwind.config.js          colorblind-safe palette (blue/amber, not red/green)
```

---

## Arena UI panels

| Panel | What it shows |
|---|---|
| **Status header** | Live green/red dots: Splunk · AI · Inject - with ⓘ on each |
| **Scenario selector** | Dropdown (populated from `/api/scenarios`), ⓘ on every term |
| **Coverage headline** | Big `0% → X%` number, false positives, real-attack yes/no, search count + provider |
| **Judge Proof panel** | All measurable facts in one block - coverage, FP, variants, real-attack, searches, index, run ID, cert SHA-256 |
| **Generation cards** | Per-round: recall before/after, Red's evasions (name · MITRE · changed fields · why baseline missed · caught/evaded · live **anomaly %** badge), Blue's rationale |
| **Baseline → Evolved SPL** | Side-by-side, with blue-highlighted lines showing what Blue added, and "why it catches" |
| **Approve / Edit / Reject** | Human-in-the-loop review; deploy disabled by default |
| **MITRE coverage map** | Per-technique animated bars - baseline (grey) → evolved (blue) - self-improving |
| **Residual frontier** | Evasions still uncaught, each with its live anomaly % badge; labeled as prioritized blind spots |
| **Resilience Certificate** | Run ID, before/after, SHA-256 fingerprint, anomaly-scorer backend, download + **Export Splunk App** |
| **Search activity trace** | Every live Splunk search streamed: provider · SPL · rows. Download as JSON receipt |
| **Agent log** | Streaming play-by-play of each agent step |
| **Landing / Home** | Glossary of 18 terms in plain English + 4-step how-it-works - newcomers understand in < 60s |

---

## Setup & run

Full guide with verification gates: [`SETUP.md`](SETUP.md).

### Quick version (Docker)

**1. Splunk + data**
```bash
# Start Splunk (pinned 10.2.4 for MCP app compatibility)
docker run -d --name splunk \
  -p 8000:8000 -p 8088:8088 -p 8089:8089 \
  -e SPLUNK_GENERAL_TERMS=--accept-sgt-current-at-splunk-com \
  -e SPLUNK_START_ARGS=--accept-license \
  -e 'SPLUNK_PASSWORD=ChangeMe_Strong123!' \
  -v splunk-etc:/opt/splunk/etc -v splunk-var:/opt/splunk/var \
  splunk/splunk:10.2.4

# Load BOTS v3 real data - REQUIRED (CC0 public download, ~320 MB, ~2.08M events).
# Both scenarios are scoped to the web_admin cryptomining incident (576 events) - SETUP.md Step 2.
curl -L -o botsv3.tgz https://botsdataset.s3.amazonaws.com/botsv3/botsv3_data_set.tgz
docker cp botsv3.tgz splunk:/tmp/botsv3.tgz
docker exec -u root splunk tar -xzf /tmp/botsv3.tgz -C /opt/splunk/etc/apps
docker exec -u root splunk chown -R splunk:splunk /opt/splunk/etc/apps/botsv3_data_set
docker restart splunk

# Create the sandbox index
curl -sk -u admin:ChangeMe_Strong123! \
  --data-urlencode "name=argus_sandbox" \
  "https://127.0.0.1:8089/services/data/indexes?output_mode=json"

# Enable HEC + create a token (Settings → Data inputs → HTTP Event Collector in the UI)
# Copy the token into SPLUNK_HEC_TOKEN in backend/.env
```

**2. Backend**
```bash
cd backend
python -m venv .venv && .venv\Scripts\Activate.ps1    # or: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # fill in: SPLUNK_PASSWORD, SPLUNK_HEC_TOKEN, ANTHROPIC_API_KEY
python smoke_test.py            # should print ALL PASS - verifies Splunk + search + HEC + LLM
uvicorn api:app --port 8810
```

**3. Frontend**
```bash
cd frontend && npm install && npm run dev   # → http://127.0.0.1:5180
```

**4. Optional: MCP Server (Best Use of MCP Server bonus)**

Install Splunkbase [app 7931](https://splunkbase.splunk.com/app/7931) into Splunk, create a
Splunk auth token, and in `.env` set `SPLUNK_MCP_TOKEN=<token>` and `SEARCH_PROVIDER=mcp`. No
other changes needed - the search layer is abstracted. The UI's search-trace panel will then
show `splunk-mcp` as the provider for every live query. With this configured, `GET
/api/mcp_probe` and `/api/health`'s `mcp_tool_diversity` field go live too - see
[Bonus prize coverage](#bonus-prize-coverage) above.

---

## Verify it's working

```bash
python backend/smoke_test.py
```
Should print: `ALL PASS - ready to run the Arena`

Or manually:
1. `GET http://127.0.0.1:8810/api/health` → `splunk.connected: true`, `llm_configured: true`, `hec_configured: true`, `scorer_backend: "splunk_spl"` (or your configured tier)
2. `GET http://127.0.0.1:8810/api/mcp_probe` → `ok: true` with a live row from `index=_internal` - proves the Splunk MCP Server (app 7931) is reachable and load-bearing, independent of `SEARCH_PROVIDER`
3. `GET http://127.0.0.1:8810/api/scenarios` → returns 2 scenarios
4. Open http://127.0.0.1:5180 → status dots green → **Launch the Arena** → **Run the Arena**

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `splunk.connected: false` | `docker start splunk`; check `SPLUNK_HOST=127.0.0.1`, `SPLUNK_PORT=8089`, `SPLUNK_PASSWORD` in `.env` |
| `hec_configured: false` | Enable HEC in Splunk UI; create a token; set `SPLUNK_HEC_TOKEN` in `.env` |
| Searches return 0 rows | Load BOTS v3 (see above); always use `earliest=0` (data is from 2018–2019) |
| `error: ... not configured` | Set `ANTHROPIC_API_KEY` (LLM) or `SPLUNK_HEC_TOKEN` (HEC) in `.env` |
| `argus_sandbox` not found | Create the index (curl command above); to reset, DELETE then recreate |
| `localhost` connection refused | Use `127.0.0.1` (not `localhost`) - on Windows after sleep, `localhost` may resolve to IPv6 `::1` while Docker binds IPv4 |
| Port conflict | Change `--port` in uvicorn and update `frontend/vite.config.ts` proxy target to match |
| Want MCP instead of SDK | Install Splunkbase app 7931; set `SPLUNK_MCP_TOKEN` and `SEARCH_PROVIDER=mcp` in `.env`; restart backend |

---

## Configuration reference

All config is environment-driven (`backend/.env`). See [`.env.example`](backend/.env.example) - no secrets committed.

| Variable | Default | Purpose |
|---|---|---|
| `SPLUNK_HOST` | `127.0.0.1` | Splunk management host |
| `SPLUNK_PORT` | `8089` | Splunk management port |
| `SPLUNK_PASSWORD` | - | Splunk admin password (required) |
| `SPLUNK_HEC_URL` | `https://127.0.0.1:8088/services/collector/event` | HEC endpoint for synthetic variants |
| `SPLUNK_HEC_TOKEN` | - | HEC token (required for Red agent) |
| `SPLUNK_MCP_URL` | `https://127.0.0.1:8089/services/mcp` | MCP server endpoint |
| `SPLUNK_MCP_TOKEN` | - | MCP Bearer token (required when `SEARCH_PROVIDER=mcp`) |
| `SEARCH_PROVIDER` | `sdk` | `mcp` (primary, agentic) or `sdk` (fallback) |
| `SCORER_BACKEND` | `splunk_spl` | Anomaly scorer tier: `hosted` \| `splunk_mltk` \| `splunk_spl` \| `local`. Every tier trains on a live Splunk baseline; `splunk_spl` (built-in `\| anomalydetection`) and `local` (scikit-learn IsolationForest) both need no extra apps |
| `SCORER_HOSTED_ENDPOINT` | - | REST endpoint for the `hosted` scorer tier (Splunk-hosted model serving / MLTK Serving) |
| `SCORER_HOSTED_MODEL` | - | Model name for the `hosted` scorer tier |
| `ANTHROPIC_API_KEY` | - | Claude API key - enables Red/Blue reasoning (required) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Primary agent model (Sonnet = best cost/quality) |
| `ANTHROPIC_MODEL_FAST` | `claude-haiku-4-5-20251001` | Fast tier for narration / cheap steps |

---

## License

[MIT](LICENSE) · Built by Ujwal Suresh Vanjare, June 2026.
