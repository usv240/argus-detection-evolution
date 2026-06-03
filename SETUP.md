# ARGUS — Setup & Run Guide

Everything needed to run ARGUS against a real Splunk instance with real data. ARGUS uses **no
hardcoded data** — if a backend isn't configured, it fails loudly with a pointer here rather than
returning mock results.

> **Components:** Splunk Enterprise (with the official MCP Server + a real dataset) · a Python
> FastAPI backend (the agent engine) · a React frontend. The agents act on Splunk through the
> **Splunk MCP Server** (or the Python SDK as a fallback).

---

## 1. Prerequisites
- **Docker Desktop** (recommended) — or a native Splunk Enterprise install
- **Python 3.11+**, **Node 20+**, **git**
- An **Anthropic API key** (the agents' reasoning model) — https://console.anthropic.com
- A free **Splunk account** (for the dataset + MCP app downloads) — https://splunk.com

---

## 2. Splunk Enterprise (real instance)

### Docker (recommended)
```bash
docker run -d --name splunk \
  -p 8000:8000 -p 8088:8088 -p 8089:8089 \
  -e SPLUNK_GENERAL_TERMS=--accept-sgt-current-at-splunk-com \
  -e SPLUNK_START_ARGS=--accept-license \
  -e 'SPLUNK_PASSWORD=ChangeMe_Strong123!' \
  -v splunk-etc:/opt/splunk/etc -v splunk-var:/opt/splunk/var \
  splunk/splunk:10.2.4
```
- Web UI: http://localhost:8000 (`admin` / your password) · mgmt+MCP: `8089` · HEC: `8088`
- Pinned to **10.2.4** for MCP-app compatibility (app 7931 supports Splunk 8.0–10.2).
- Named volumes persist data across container recreation.
- *(Native install also works — apps go in `C:\Program Files\Splunk\etc\apps` / `$SPLUNK_HOME/etc/apps`.)*

Create the replay sandbox index:
```bash
curl -sk -u admin:<pw> --data-urlencode "name=argus_sandbox" \
  "https://localhost:8089/services/data/indexes?output_mode=json"
```

Optional but recommended: request a free **Developer License** (10 GB) at https://dev.splunk.com and
apply it (Settings → Licensing).

---

## 3. Real data — Boss of the SOC (BOTS v3)
Public CC0 security dataset (pre-indexed). Download (≈320 MB):
`https://botsdataset.s3.amazonaws.com/botsv3/botsv3_data_set.tgz`

Install into Splunk:
```bash
docker cp botsv3_data_set.tgz splunk:/tmp/botsv3.tgz
docker exec -u root splunk tar -xzf /tmp/botsv3.tgz -C /opt/splunk/etc/apps
docker exec -u root splunk chown -R splunk:splunk /opt/splunk/etc/apps/botsv3_data_set
docker restart splunk
```
Verify (data is from 2018–2019, so always search with `earliest=0`):
```
| tstats count where index=botsv3
```

---

## 4. Splunk MCP Server (the agentic path)
Install the **official Splunk MCP Server** — Splunkbase **app id 7931**
(https://splunkbase.splunk.com/app/7931), supports Splunk 8.0–10.2.

```bash
docker cp <downloaded-mcp-app>.tgz splunk:/tmp/mcp.tgz
docker exec -u root splunk tar -xzf /tmp/mcp.tgz -C /opt/splunk/etc/apps
docker restart splunk
```
- Grant your role MCP capabilities in `authorize.conf`: `mcp_tool_admin`, `mcp_tool_execute`.
- For self-signed dev certs, set `[mcp] ssl_verify = false` in `mcp.conf`.
- Create a Splunk **auth token** (Settings → Tokens) for `SPLUNK_MCP_TOKEN`.
- Endpoint: `https://localhost:8089/services/mcp` (HTTP/SSE, `Authorization: Bearer <token>`).
- Tools used: `run_splunk_query`, `generate_spl`, `get_indexes`, `get_index_info`, `get_saved_searches`.

*(Fallback: set `SEARCH_PROVIDER=sdk` to run searches via the Splunk Python SDK instead of MCP.)*

---

## 5. Backend (agent engine)
```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1            # Windows PowerShell  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env                 # then fill in real values (see below)
uvicorn api:app --reload --port 8801
```
Confirm it's wired to real Splunk + LLM:
```
GET http://localhost:8801/api/health
```
This reports actual connectivity — if something isn't configured it says so (no mock fallback).

### Key `.env` values
| Var | Meaning |
|---|---|
| `SPLUNK_*` | host/port/creds for the SDK path (`8089`, `admin`, your password) |
| `SPLUNK_MCP_URL` / `SPLUNK_MCP_TOKEN` | MCP endpoint + Bearer token |
| `SEARCH_PROVIDER` | `mcp` (primary) or `sdk` (fallback) |
| `SCORER_BACKEND` | `hosted` (Splunk hosted model) or `local` (a real local model, labeled in UI) |
| `ANTHROPIC_API_KEY` | enables agent reasoning |
| `ANTHROPIC_MODEL` / `ANTHROPIC_MODEL_FAST` | tiered models (Sonnet primary / Haiku fast) for cost |

---

## 6. Frontend
```bash
cd frontend
npm install
npm run dev                            # http://localhost:5173  (proxies /api -> :8801)
```
Open http://localhost:5173 — the connection banner shows live Splunk/LLM status; click
**Run investigation** to start a live run on real data.

---

## 7. How it works (at a glance)
See [architecture_diagram.md](architecture_diagram.md). An adversarial co-evolution loop:
**Red (Attack Synthesizer)** invents evasive attack variants (synthetic events sampled from real
Splunk field distributions, injected via HEC); the **Evaluator** runs the detection live via Splunk
(MCP or SDK) and measures recall / false positives; **Blue (Detection Evolver)** rewrites the SPL
detection to catch what evaded — without firing on benign traffic. The **Arena Orchestrator** runs
this generation after generation, then reports the coverage gain, a MITRE ATT&CK coverage map, a
resilience certificate, real-attack validation, and the residual blind-spot frontier. Integration
sources: [REFERENCES.md](REFERENCES.md).
