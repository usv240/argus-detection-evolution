# ADR-0004: SSE streaming over polling or one big response

**Status:** Accepted
**Date:** 2026-06-03

---

A full ARGUS run involves several generations, each with multiple AI calls and dozens of live
Splunk searches. End to end, this can take well over a minute.

The simple way to build the `/api/arena` endpoint would be: do all of that work, then send back
one large response at the end, with the frontend showing a spinner until it arrives.

That falls short for ARGUS specifically, because the whole point of the project is that the work
is real: real searches, real reasoning, real scores. If all the user sees is a spinner and then a
final number, there's no way to tell whether it took one generation or four, whether Blue's first
attempt was rejected and tried again, or whether Splunk was actually involved along the way. The
interesting part would be invisible.

We considered polling: the frontend asks "are you done yet?" every couple of seconds. That works,
but it adds a few seconds of lag to every update and wastes requests while nothing has changed
yet. We also considered WebSockets, which would work, but they're built for two-way communication,
and ARGUS never needs the browser to send anything back mid-run. Adding a full bidirectional
channel for a one-way stream of updates felt like more complexity than the problem needed.

What ARGUS does is have `/api/arena` return a stream of Server-Sent Events (SSE), using FastAPI
with `sse-starlette`. The orchestrator sends one event the moment something happens: a new batch
of attack variants, a live search and its result count, a rule update from Blue (or a rejected
attempt), a generation finishing, the real-attack check, and the final report and certificate. The
frontend listens to this stream with the browser's built-in `EventSource` and updates the screen
incrementally as each event arrives.

The honest tradeoff is that the frontend has to keep track of a growing list of event types
(`arena_started`, `variants_generated`, `search`, `generation_scored`, `blue_evolved`,
`blue_attempt_rejected`, `generation_complete`, `converged`, `arena_finished`) and update its view
for each one, which is more bookkeeping than rendering a single response. The payoff is that
watching a run feels like watching something happen rather than waiting for a result: each
generation card, each search, each accepted or rejected rule change appears on screen the moment
it occurs.
