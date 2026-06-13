# ARGUS - Integration References

Authoritative sources for every external dependency ARGUS uses. Code comments point back here.

---

## Splunk Platform

### Developer docs
- Developer welcome / guide: https://dev.splunk.com/enterprise/docs/welcome/
- API reference index: https://dev.splunk.com/enterprise/reference/
- Developer License (free 10 GB): https://dev.splunk.com/

### Splunk Python SDK (`backend/splunk/sdk_client.py`)
- Overview: https://dev.splunk.com/enterprise/docs/devtools/python/sdk-python
- Connect to Splunk: https://dev.splunk.com/enterprise/docs/devtools/python/sdk-python/howtousesplunkpython/howtoconnectpython
- Run searches: https://dev.splunk.com/view/SP-CAAAEE5 · https://dev.splunk.com/view/SP-CAAAEHQ
- `splunklib.client` API ref: https://docs.splunk.com/DocumentationStatic/PythonSDK/1.2.1/client.html
- SDK repo: https://github.com/splunk/splunk-sdk-python
- PyPI package: `splunk-sdk` (pinned 2.1.0 in `requirements.txt`)
- Pattern used: `client.connect(host, port, …)` → `service.jobs.oneshot(spl, output_mode="json")` → `splunklib.results.JSONResultsReader`

### Splunk MCP Server (`backend/splunk/mcp_client.py`) - primary agentic path
- Official repo: https://github.com/CiscoDevNet/Splunk-MCP-Server-official
- **Splunkbase app id: 7931** - install into Splunk from https://splunkbase.splunk.com/app/7931
- Endpoint: `https://<host>:8089/services/mcp` (HTTP/SSE transport)
- Auth: `Authorization: Bearer <splunk-auth-token>` (respects Splunk RBAC)
- Supported Splunk versions: 8.0 – 10.2 (ARGUS pins Splunk to 10.2.4)
- Required `authorize.conf` capabilities: `mcp_tool_admin`, `mcp_tool_execute`
- `mcp.conf` for self-signed certs: `[mcp] ssl_verify = false`
- Tools used by ARGUS:
  - `run_splunk_query` - executes live SPL and returns results (load-bearing: all evals go through this)
  - `generate_spl` - Splunk's own AI turns natural language into SPL
  - `get_indexes` - list available indexes
  - `get_index_info` - per-index metadata (field discovery)
  - `get_saved_searches` - discover existing detections / ESCU rules
  - `get_splunk_info` - version + server name (healthcheck)
- Splunk blog: https://www.splunk.com/en_us/blog/security/securing-ai-agents-model-context-protocol.html
- MCP Python client (`mcp` SDK, SSE transport): https://github.com/modelcontextprotocol/python-sdk

### Splunk HEC (`backend/splunk/hec.py`)
- Docs: https://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector
- Endpoint: `https://<host>:8088/services/collector/event` (JSON batch over HTTPS)
- Used by Red to write synthetic attack variants into `argus_sandbox` with retry + backoff

---

## Data & Detections

### Boss of the SOC v3 (BOTS v3)
- Repo: https://github.com/splunk/botsv3
- Public download (CC0): `https://botsdataset.s3.amazonaws.com/botsv3/botsv3_data_set.tgz` (~320 MB
  compressed, ~2.08M events; `aws:cloudtrail`, syslog, network streams) - see SETUP.md Step 2
- Both ARGUS scenarios and the anomaly-scorer baseline are computed live from one real
  `aws:cloudtrail` incident inside this dataset: the `web_admin` cryptomining spray (576 events).
- Data is from **2018–2019** → all ARGUS searches use `earliest=0`
- Real attacker in the data: IAM user `web_admin`, source IP `139.198.18.205` - cryptomining spray,
  576 `RunInstances` events across 10 regions in a single hour (2018-08-20 09:00 UTC): 280
  `Client.InstanceLimitExceeded` + 185 `Client.UnauthorizedOperation` + 104 `Client.Unsupported` +
  7 `Server.InsufficientInstanceCapacity`. Normal `AssumedRole` autoscaling activity is the benign
  baseline.

### Splunk Security Content / ESCU (baseline detection source)
- Repo: https://github.com/splunk/security_content
- Detection browse UI: https://research.splunk.com/
- ARGUS's baseline detections are translated from ESCU logic to raw CloudTrail SPL
  (no CIM/TA required, so BOTS v3 works without add-ons)

### Splunk Attack Range *(optional, for fresh attack generation)*
- Repo: https://github.com/splunk/attack_range

---

## Reasoning models

### Anthropic Claude (`backend/models/llm.py`)
- API: https://console.anthropic.com / https://docs.anthropic.com/
- Models used:
  - `claude-sonnet-4-6` - primary agent reasoning (SPL generation, evasion proposals, Blue evolution)
  - `claude-haiku-4-5-20251001` - fast tier for cheap/narration steps
- Cost note: `temperature` is deprecated on Opus-class models; ARGUS omits it
- SDK: `anthropic` (Python), pinned in `requirements.txt`

---

## Frontend

| Library | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| TypeScript | 5 | Type safety |
| Vite | 6 | Dev server + build |
| Tailwind CSS | 3 | Styling (colorblind-safe palette: blue/amber, not red/green) |
| Framer Motion | 11 | Motion (causation only, never decoration) |
| React Flow | 11 | Graph layout (unused in current Arena view; available for future Constellation) |

### Design principles applied
- **Progressive disclosure** (Nielsen Norman Group) - verdict first, detail on demand via ⓘ
- **Consistency** (UXPin) - single design system (`components/ui.tsx`); single-source copy (`content.ts`)
- **Recognition over recall** (Laws of UX) - every term has a plain-English ⓘ tooltip
- **Accessibility** - ARIA labels, keyboard + Escape-close tooltips, `focus-visible`, WCAG-AA contrast
- **Colorblind-safe** - diverging blue/amber palette (not red/green)

---

## Submission

- Devpost: https://splunk.devpost.com/
- Track: **Security**
- Entrant: Ujwal Suresh Vanjare
- Deadline: June 15, 2026, 9:00 AM PDT
- Prize targets: Best Use of Splunk MCP Server · Best of Security · Grand Prize
