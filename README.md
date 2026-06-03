# ARGUS — the Adversarial Detection Evolution Engine

> **Splunk Agentic Ops Hackathon · Security track.**
> ARGUS pits an **attacker AI against a defender AI inside your own Splunk data.** They co-evolve —
> generation after generation — until your detections catch attacks **no human ever wrote a rule
> for.** It doesn't investigate alerts; it evolves your defenses against the attacks you *can't yet
> see*, and **proves the coverage gain with live numbers.**

## What it does

Starting from a real Splunk ESCU-based detection, ARGUS runs an adversarial co-evolution loop:

1. **Red (Attack Synthesizer)** invents evasive variants of an attack that beat the *current*
   detection — materialized as synthetic CloudTrail events sampled from **real field distributions**
   and injected into a sandbox index via HEC.
2. **Evaluator** runs the detection live and measures **recall, false-positive rate (on real benign
   traffic), and lead time** — every number computed from real Splunk searches.
3. **Blue (Detection Evolver)** evolves the SPL detection to catch the survivors, calibrated to the
   *real measured shape* of each evasion, without firing on benign autoscaling.
4. Next generation, Red attacks the **evolved** rule — the arms race escalates.

The result: a hardened detection and a proven coverage gain (e.g. *baseline 0% → evolved 100% of
evasions caught, with no false positives*) — all on live data.

## Why it's different

The "AI that investigates an alert" space is crowded. ARGUS is the opposite: an **autonomous
purple-team** that discovers your detection blind spots before an attacker does, and *proves* it
closed them. It's genuinely agentic (Red/Blue/Evaluator on a generational loop), Splunk-native
(search via MCP/SDK, synthetic injection via HEC, detections as SPL), and **uses no hardcoded data**.

## Scenarios & outputs

ARGUS is **scenario-agnostic** — a registry of attack scenarios, each defining its data source,
baseline detection, and synthesis. Two ship today (both on BOTS v3 CloudTrail, the cleanly-extracted
data): **AWS cryptomining** (Resource Hijacking) and **AWS IAM account-persistence** (Create Account /
Account Manipulation). Adding an attack family = adding a `Scenario`, no engine changes. *(Endpoint/
identity scenarios need the relevant Splunk TAs so their data is field-extracted; the engine already
supports them.)*

Each run produces, all computed live:
- a **MITRE ATT&CK coverage map** that self-improves as Blue hardens (per-technique baseline → final);
- a **Resilience Certificate** — a downloadable before/after artifact with a SHA-256 fingerprint;
- the **residual frontier** — evasions still uncaught (your real, prioritized blind spots).

## The no-hardcoded-data rule (project invariant)

> Per-PR test: *"If I deleted my Splunk instance, would this number still appear?"* If yes, fix it.

No mock API responses, no fixture results, no fabricated metrics, no faked model scores. Real data:
Splunk **BOTS v3** (`aws:cloudtrail`). The only synthetic data is Red's variants — *generated at
runtime* from real distributions and clearly labeled `argus_synthetic=true`. All metrics are live.

## Architecture

See [`architecture_diagram.md`](architecture_diagram.md). Integration sources: [`REFERENCES.md`](REFERENCES.md).

```
argus/
├── backend/
│   ├── arena_orchestrator.py     generational co-evolution + hill-climbing
│   ├── agents/red_synthesizer.py Red — invents + injects evasions
│   ├── agents/evaluator.py       live recall / FP / lead-time + variant profiling
│   ├── agents/blue_evolver.py    Blue — evolves the SPL detection
│   ├── scenarios.py              scenario spec + real-distribution queries + baseline rule
│   ├── splunk/ (mcp_client, sdk_client, hec, search)   live Splunk I/O — never mocked
│   ├── models/llm.py             Claude reasoning (tiered: Sonnet primary / Haiku fast)
│   └── api.py                    FastAPI: /api/arena (SSE) + /api/health
└── frontend/                     React Arena UI (coverage, generations, evolving genome, log)
```

## Setup & run

Full guide with verification gates: [`SETUP.md`](SETUP.md). Short version:

### 1. Splunk + data (no Splunk account required)
```bash
docker run -d --name splunk -p 8000:8000 -p 8088:8088 -p 8089:8089 \
  -e SPLUNK_GENERAL_TERMS=--accept-sgt-current-at-splunk-com \
  -e SPLUNK_START_ARGS=--accept-license -e 'SPLUNK_PASSWORD=ChangeMe_Strong123!' \
  -v splunk-etc:/opt/splunk/etc -v splunk-var:/opt/splunk/var splunk/splunk:10.2.4
```
Then load BOTS v3 + create the `argus_sandbox` index + enable HEC (see [`SETUP.md`](SETUP.md) §3–4).

### 2. Backend
```bash
cd backend && python -m venv .venv && .venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env        # fill in Splunk creds, HEC token, ANTHROPIC_API_KEY
uvicorn api:app --reload --port 8801
```

### 3. Frontend
```bash
cd frontend && npm install && npm run dev    # http://localhost:5173
```
Open the app → **Run the Arena** → watch the co-evolution stream live.

## Configuration

Environment-driven (`backend/.env`, see [`.env.example`](backend/.env.example)). No secrets committed.
`SEARCH_PROVIDER=mcp` (Splunk MCP Server, primary) or `sdk` (Splunk Python SDK, fallback). If a
backend isn't configured, `/api/arena` emits an explicit error event — never mock data.

## License

[MIT](LICENSE).
