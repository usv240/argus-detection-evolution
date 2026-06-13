# ADR-0002: MCP primary, SDK fallback

**Status:** Accepted
**Date:** 2026-06-03

---

Every agent in ARGUS (Red, Blue, the Evaluator, the anomaly scorer) needs to run searches against
Splunk. We wanted one interface for this, so the rest of the code doesn't need to know or care
which path is underneath: `run_search()` and `healthcheck()`.

There were two real ways to talk to Splunk: the official Splunk MCP Server (Splunkbase app 7931),
and the Splunk Python SDK.

We considered using only the SDK. It's the well-known, always-available path, and it would have
been the simplest thing to ship. But this hackathon specifically calls out MCP as an integration
worth building toward, and MCP is also a more natural fit for how ARGUS thinks about Splunk: each
search becomes a tool call (`splunk_run_query`) over a standard protocol, with its own bearer
token and Splunk's own role-based permissions, rather than a raw database-style connection. It
also makes every search easy to account for: each MCP call is counted and shown live in the
Arena's search trace as it happens.

We also considered only supporting MCP. We didn't, because setting up the MCP Server means
installing an extra Splunkbase app and creating a token, which not every Splunk environment has on
day one. Requiring it would mean ARGUS doesn't run at all on a plain install.

So the decision was: `SearchProvider` is a small interface with two real implementations,
`MCPSearchProvider` and `SDKSearchProvider`. MCP is the default and primary path
(`SEARCH_PROVIDER=mcp`). The SDK is the fallback (`SEARCH_PROVIDER=sdk`), and it's also kept for
one thing the MCP tool set doesn't cover: actually creating the saved search, disabled, in Splunk
when a human approves Blue's evolved rule.

One more decision worth calling out on its own: there's no mock or fake provider. If neither MCP
nor the SDK is configured, `get_search_provider()` raises an error and the run doesn't start,
instead of quietly returning made-up results. Given that ARGUS's whole pitch is that every number
is real, a fake provider would undermine the project from the inside. A loud failure at startup is
much better than a quiet fake one during a demo.

The honest tradeoff is that maintaining two real client implementations behind one interface is
more code than picking just one and moving on. In return, ARGUS runs end to end on a plain Splunk
install using only the SDK, and switching to the MCP Server, for the agent-style integration and
the bonus category, is one environment variable with no code changes anywhere else.
