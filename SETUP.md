# ARGUS — Setup & Run Guide

Everything needed to run ARGUS against a real Splunk instance with real BOTS v3 data.
**ARGUS uses no hardcoded data.** If a backend isn't configured, it fails loudly and says so —
never falls back to mock results.

> **Components:** Splunk Enterprise 10.2.4 (Docker) · BOTS v3 dataset · optional Splunk MCP Server
> (app 7931) · Python/FastAPI backend · React frontend.

---

## Prerequisites

- **Docker Desktop** — recommended for Splunk. [Download](https://www.docker.com/products/docker-desktop/)
- **Python 3.11+**, **Node 20+**, **git**
- **Anthropic API key** — for Red/Blue reasoning. [console.anthropic.com](https://console.anthropic.com)

> **No Splunk account needed** to run the core demo. BOTS v3 is CC0 public domain (free download).
> A Splunk account is only required for the optional MCP app (Splunkbase, Step 4).

---

## Step 1 — Start Splunk Enterprise

Pinned to **10.2.4** (MCP app 7931 supports Splunk 8.0–10.2). Named volumes persist data across
container recreation.

```bash
docker run -d --name splunk \
  -p 8000:8000 -p 8088:8088 -p 8089:8089 \
  -e SPLUNK_GENERAL_TERMS=--accept-sgt-current-at-splunk-com \
  -e SPLUNK_START_ARGS=--accept-license \
  -e 'SPLUNK_PASSWORD=ChangeMe_Strong123!' \
  -v splunk-etc:/opt/splunk/etc -v splunk-var:/opt/splunk/var \
  splunk/splunk:10.2.4
```

Ports: **8000** = Web UI · **8089** = mgmt/REST + MCP endpoint · **8088** = HEC (synthetic events).

Wait for the container to be healthy (~90s):
```bash
docker inspect --format '{{.State.Health.Status}}' splunk
# wait for: healthy
```

**✅ Gate:** `curl -sk -u admin:ChangeMe_Strong123! https://127.0.0.1:8089/services/server/info`
returns JSON (200). *Use `127.0.0.1`, not `localhost` — on Windows, `localhost` may resolve to IPv6
`::1` while Docker binds IPv4, causing connection refused.*

> **Native install:** also works — apps go in `$SPLUNK_HOME/etc/apps`. Use the same ports.

---

## Step 2 — Load BOTS v3 real security data

Boss of the SOC v3 (BOTS) is a real, public (CC0) Splunk dataset with 1.94M real security events
(`aws:cloudtrail`, `syslog`, network streams). No Splunk account required — direct public download.

```bash
# Download (~320 MB, public S3)
curl -L -o botsv3.tgz https://botsdataset.s3.amazonaws.com/botsv3/botsv3_data_set.tgz

# Install into Splunk
docker cp botsv3.tgz splunk:/tmp/botsv3.tgz
docker exec -u root splunk tar -xzf /tmp/botsv3.tgz -C /opt/splunk/etc/apps
docker exec -u root splunk chown -R splunk:splunk /opt/splunk/etc/apps/botsv3_data_set
docker exec -u root splunk rm -f /tmp/botsv3.tgz
docker restart splunk
```

After restart, wait for healthy, then:
```bash
**✅ Gate:** curl -sk -u admin:ChangeMe_Strong123! \
  --data-urlencode "search=| tstats count where index=botsv3" \
  --data-urlencode "earliest_time=0" --data-urlencode "output_mode=json" \
  --data-urlencode "exec_mode=oneshot" \
  "https://127.0.0.1:8089/services/search/jobs"
# result.count should be 1944092
```

> **Important:** BOTS v3 data is from **2018–2019**. All ARGUS searches use `earliest=0` so they
> reach this historical data. Searches without `earliest=0` will return nothing.

---

## Step 3 — Create the sandbox index

ARGUS injects Red's synthetic attack variants into a dedicated index (`argus_sandbox`) so they
never mix with real benign data in `botsv3`.

```bash
curl -sk -u admin:ChangeMe_Strong123! \
  --data-urlencode "name=argus_sandbox" \
  "https://127.0.0.1:8089/services/data/indexes?output_mode=json" \
  -o /dev/null -w "%{http_code}\n"
# should return 201
```

To reset between demo runs (delete + recreate):
```bash
curl -sk -u admin:ChangeMe_Strong123! -X DELETE \
  "https://127.0.0.1:8089/services/data/indexes/argus_sandbox"
sleep 2
curl -sk -u admin:ChangeMe_Strong123! \
  --data-urlencode "name=argus_sandbox" \
  "https://127.0.0.1:8089/services/data/indexes?output_mode=json" -o /dev/null
```

---

## Step 4 — Enable HEC (required for the Red agent)

The Red agent writes synthetic attack variants into `argus_sandbox` via Splunk's **HTTP Event
Collector (HEC)**. You must enable HEC and create a token.

**Option A — Splunk UI:**
1. Open http://127.0.0.1:8000 → Settings → Data Inputs → HTTP Event Collector → Global Settings → **Enabled**
2. New Token → name `argus` → allowed index `argus_sandbox` → sourcetype `aws:cloudtrail`
3. Copy the token value → set `SPLUNK_HEC_TOKEN=<token>` in `backend/.env`

**Option B — REST API:**
```bash
# Enable HEC globally
curl -sk -u admin:ChangeMe_Strong123! -X POST \
  "https://127.0.0.1:8089/servicesNS/nobody/splunk_httpinput/data/inputs/http/http" \
  -d "disabled=0"

# Create a token (copy the "token" field from the response)
curl -sk -u admin:ChangeMe_Strong123! -X POST \
  "https://127.0.0.1:8089/servicesNS/nobody/splunk_httpinput/data/inputs/http" \
  -d "name=argus" -d "index=argus_sandbox" -d "sourcetype=aws:cloudtrail" \
  --data-urlencode "output_mode=json"
```

**✅ Gate:** HEC works:
```bash
curl -sk -H "Authorization: Splunk <your-token>" \
  -d '{"index":"argus_sandbox","event":{"test":1}}' \
  "https://127.0.0.1:8088/services/collector/event"
# {"text":"Success","code":0}
```

---

## Step 5 — Splunk MCP Server *(optional — enables the MCP bonus)*

The Splunk MCP Server (Splunkbase **app id 7931**) is the load-bearing agentic path: agents run
live SPL via `run_splunk_query` and use Splunk's own AI (`generate_spl`) — directly qualifying for
the **Best Use of Splunk MCP Server** bonus prize. Without it, ARGUS falls back to the Python SDK
(still fully functional, same quality output).

**Install (requires Splunk account for download):**
1. Download from [Splunkbase app 7931](https://splunkbase.splunk.com/app/7931)
2. Install into Splunk:
```bash
docker cp <mcp-app>.tgz splunk:/tmp/mcp.tgz
docker exec -u root splunk tar -xzf /tmp/mcp.tgz -C /opt/splunk/etc/apps
docker restart splunk
```
3. Grant MCP capabilities. In `authorize.conf`:
```ini
[role_mcp_user]
mcp_tool_admin = enabled
mcp_tool_execute = enabled
```
4. For self-signed dev certs, add to `mcp.conf`:
```ini
[mcp]
ssl_verify = false
```
5. Create a Splunk auth token (Settings → Tokens) → set `SPLUNK_MCP_TOKEN=<token>` in `.env`

**✅ Gate:** `GET https://127.0.0.1:8089/services/mcp` returns HTTP 200 (not 404).

Once the token is set, change `SEARCH_PROVIDER=mcp` in `.env` and restart the backend. The search-
trace panel in the Arena UI will then show `splunk-mcp` as the provider for every live query.

---

## Step 6 — Backend (agent engine)

```bash
cd backend

# Create virtual environment
python -m venv .venv
.venv\Scripts\Activate.ps1          # Windows PowerShell
# source .venv/bin/activate          # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Configure
copy .env.example .env              # Windows
# cp .env.example .env              # macOS / Linux

# Edit .env — the required values:
#   SPLUNK_HOST=127.0.0.1
#   SPLUNK_PORT=8089
#   SPLUNK_PASSWORD=ChangeMe_Strong123!
#   SPLUNK_HEC_URL=https://127.0.0.1:8088/services/collector/event
#   SPLUNK_HEC_TOKEN=<your-hec-token>           # from Step 4
#   ANTHROPIC_API_KEY=<your-key>
#   SEARCH_PROVIDER=sdk                          # or: mcp (after Step 5)
```

**Verify everything works before starting:**
```bash
python smoke_test.py
# should print: ALL PASS ✓  ready to run the Arena
```

**Start the backend:**
```bash
uvicorn api:app --port 8810
```

**✅ Gate:** `GET http://127.0.0.1:8810/api/health`
```json
{
  "search_provider": "sdk",
  "llm_configured": true,
  "hec_configured": true,
  "splunk": { "connected": true, "splunk_version": "10.2.4" }
}
```

---

## Step 7 — Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:5180** (the Vite dev server proxies `/api` → port 8810).

The header shows live status dots — **Splunk · AI · Inject** — all should be green.

**✅ Gate:** http://127.0.0.1:5180 loads with a green Splunk status dot.

---

## Step 8 — How it works (at a glance)

See [architecture_diagram.md](architecture_diagram.md) for Mermaid system + sequence diagrams.

**The adversarial co-evolution loop per generation:**
1. **Red** queries real field distributions from `index=botsv3` (live), then proposes evasive attack
   variants using the LLM — each targeting a specific weakness in the current detection.
2. Red materializes variants as synthetic CloudTrail events (tagged `argus_synthetic=true`,
   `argus_run=<run_id>`), sampled from real field pools, and writes them via HEC to `argus_sandbox`.
3. **Evaluator** polls until the events are searchable, then runs the current detection SPL (live via
   MCP or SDK) over `(argus_sandbox variant) OR (botsv3 benign)` — measuring recall, false positives,
   and per-variant shapes.
4. **Blue** receives the real miss-shapes (events, distinct IPs/regions/users, span, error rate) and
   the hint of the most-stable identifier (the invariant the attacker reuses). Blue proposes an evolved
   SPL; the Evaluator re-scores it; the orchestrator adopts it only if recall improves with no new FPs
   (hill-climbing). It retries up to `refine_attempts` times.
5. Next generation, Red attacks the **evolved** rule, forcing further adaptation.
6. At the end, the baseline and final detection are scored over **all variants**, the MITRE coverage
   map is computed, the real BOTS attack is validated, and a resilience certificate is issued.

All integration sources: [REFERENCES.md](REFERENCES.md).

---

## Appendix — .env key reference

| Variable | Required | Default | Notes |
|---|---|---|---|
| `SPLUNK_HOST` | ✓ | `127.0.0.1` | Use `127.0.0.1`, not `localhost` (see troubleshooting) |
| `SPLUNK_PORT` | ✓ | `8089` | Splunk management port |
| `SPLUNK_SCHEME` | | `https` | |
| `SPLUNK_USERNAME` | ✓ | `admin` | |
| `SPLUNK_PASSWORD` | ✓ | — | |
| `SPLUNK_VERIFY` | | `false` | SSL verification (false for self-signed dev certs) |
| `SPLUNK_INDEX` | | `botsv3` | Source data index |
| `SPLUNK_SANDBOX_INDEX` | | `argus_sandbox` | Synthetic variant index |
| `SPLUNK_HEC_URL` | ✓ | `https://127.0.0.1:8088/services/collector/event` | |
| `SPLUNK_HEC_TOKEN` | ✓ | — | Created in Step 4 |
| `SPLUNK_MCP_URL` | | `https://127.0.0.1:8089/services/mcp` | Only if `SEARCH_PROVIDER=mcp` |
| `SPLUNK_MCP_TOKEN` | | — | Bearer token for the MCP server |
| `SEARCH_PROVIDER` | | `sdk` | `mcp` (primary) or `sdk` (fallback) |
| `ANTHROPIC_API_KEY` | ✓ | — | Claude API key |
| `ANTHROPIC_MODEL` | | `claude-sonnet-4-6` | Primary — Sonnet best cost/quality |
| `ANTHROPIC_MODEL_FAST` | | `claude-haiku-4-5-20251001` | Fast tier for cheap steps |

---

## Troubleshooting

Run `python backend/smoke_test.py` first — it prints PASS/FAIL per component.

| Symptom | Fix |
|---|---|
| `splunk.connected: false` | `docker start splunk`; wait for healthy; verify `SPLUNK_HOST=127.0.0.1`, port, password |
| `hec_configured: false` | Complete Step 4; set `SPLUNK_HEC_TOKEN` |
| Searches return 0 rows | BOTS v3 not loaded (Step 2); or missing `earliest=0` in queries |
| `argus_sandbox` index errors | Create or reset the index (Step 3) |
| `localhost` refused | Use `127.0.0.1` — Windows sometimes routes `localhost` to IPv6 while Docker uses IPv4 |
| Port conflict | Change `--port` in uvicorn command; update `SEARCH_PROVIDER` proxy in `frontend/vite.config.ts` |
| Blue evolved rule rejected every attempt | LLM produced syntactically invalid SPL — increase `refine_attempts` or run again |
| Run slow (minutes) | Expected — real LLM calls + live Splunk searches. Reduce `variants_per_gen` or `refine_attempts` |
| MCP 404 / not found | App 7931 not installed; check `authorize.conf` capabilities; check `SPLUNK_MCP_TOKEN` |
