# ARGUS — Reference Links (Splunk dev integration)

Authoritative docs/sources used to build ARGUS's Splunk integration. Code comments point back here.

## Splunk Developer docs
- Developer welcome / guide: https://dev.splunk.com/enterprise/docs/welcome/
- API reference index: https://dev.splunk.com/enterprise/reference/

## Splunk Python SDK (`splunk/sdk_client.py`, `spike_search.py`)
- SDK overview: https://dev.splunk.com/enterprise/docs/devtools/python/sdk-python
- Connect to Splunk: https://dev.splunk.com/enterprise/docs/devtools/python/sdk-python/howtousesplunkpython/howtoconnectpython
- Run searches and jobs: https://dev.splunk.com/view/SP-CAAAEE5 · https://dev.splunk.com/view/SP-CAAAEHQ
- `splunklib.client` API ref: https://docs.splunk.com/DocumentationStatic/PythonSDK/1.2.1/client.html
- SDK repo: https://github.com/splunk/splunk-sdk-python
- Pattern: `client.connect(...)` → `service.jobs.oneshot(spl, output_mode="json")` → `splunklib.results.JSONResultsReader`.

## Splunk MCP Server — OFFICIAL (`splunk/mcp_client.py`)
- Official repo: https://github.com/CiscoDevNet/Splunk-MCP-Server-official
- Splunkbase app id: **7931** (built-in app; install into Splunk)
- Endpoint: `https://<host>:8089/services/mcp` · Transport: HTTP/SSE · Auth: Bearer token · respects RBAC
- Supported Splunk: 8.0–10.2
- `authorize.conf`: `[role_mcp_user] mcp_tool_admin=enabled  mcp_tool_execute=enabled`
- `mcp.conf`: `[mcp] ssl_verify=false` (self-signed dev certs)
- Tools: `run_splunk_query`, `generate_spl` (AI NL→SPL), `get_indexes`, `get_index_info`, `get_saved_searches`, `get_splunk_info`
- Splunk blog on MCP TA security: https://www.splunk.com/en_us/blog/security/securing-ai-agents-model-context-protocol.html

## Data + detections (real)
- Boss of the SOC (BOTS v3) dataset: https://github.com/splunk/botsv3
- Splunk Attack Range (optional): https://github.com/splunk/attack_range
- Splunk Security Content / ESCU (real baseline detections): https://github.com/splunk/security_content
- Detection search UI: https://research.splunk.com/

## MCP Python client
- `mcp` Python SDK (SSE client + ClientSession): https://github.com/modelcontextprotocol/python-sdk
