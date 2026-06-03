# ARGUS — Architecture Diagram

> Required at repo root by the hackathon rules. Shows how ARGUS interacts with Splunk, how the AI
> agents/models are integrated, and the data flow between services, APIs, and components.
>
> **Design invariant — no hardcoded data:** every value the user sees is computed at runtime from
> real Splunk searches and real model inference. The only synthetic data is the Red agent's attack
> variants, which are *generated live* (sampled from real field distributions) and clearly labeled.
> See the README — *No hardcoded data*.

## What ARGUS is

An **Adversarial Detection Evolution Engine**: an attacker AI (Red) and a defender AI (Blue)
co-evolve inside real Splunk data. Red invents attack variants that evade the current detection;
Blue evolves the detection (SPL) to catch them without firing on benign traffic. Recall is measured
live each round; the result is a hardened detection plus a proven coverage gain.

## System overview

```mermaid
flowchart TB
    subgraph UI["React UI (Vite + Tailwind + Framer Motion)"]
        ARENA["Arena view\n(coverage headline · generation cards ·\nlive evolved-detection genome · agent log)"]
    end

    subgraph API["FastAPI backend"]
        SSE["POST /api/arena  (SSE stream)"]
        HEALTH["GET /api/health  (live connectivity)"]
        ORCH["ArenaOrchestrator\n(generational co-evolution + hill-climbing)"]
    end

    subgraph AGENTS["Agents"]
        RED["RED — Attack Synthesizer\n(LLM invents evasions; samples real distributions)"]
        EVAL["EVALUATOR\n(runs detection SPL; recall / FP / lead-time; variant profiling)"]
        BLUE["BLUE — Detection Evolver\n(LLM evolves SPL from real miss-shapes)"]
    end

    subgraph MODELS["Reasoning models (tiered for cost)"]
        LLM["Anthropic Claude\nSonnet 4.6 (primary) · Haiku 4.5 (fast)"]
    end

    subgraph SPLUNK["Splunk Enterprise 10.2.4 (Docker) — REAL data: BOTS v3"]
        SEARCH["Search: Splunk MCP Server (primary)\nor Splunk Python SDK (fallback)"]
        HEC["HEC — inject synthetic variants"]
        IDX[("indexes:\nbotsv3 (real benign + attack)\nargus_sandbox (synthetic variants)")]
    end

    ARENA <-->|SSE events / run command| API
    ARENA -. status .-> HEALTH
    SSE --> ORCH
    ORCH --> RED & EVAL & BLUE
    RED -->|reason| LLM
    BLUE -->|reason| LLM
    RED -->|write synthetic events| HEC
    EVAL -->|run SPL| SEARCH
    RED -->|query real distributions| SEARCH
    HEC --> IDX
    SEARCH --- IDX
```

## The co-evolution loop (data flow per generation)

```mermaid
sequenceDiagram
    participant O as ArenaOrchestrator
    participant R as Red (LLM)
    participant S as Splunk
    participant E as Evaluator
    participant B as Blue (LLM)
    participant U as UI (SSE)

    O->>R: evolve evasions vs current detection
    R->>S: query real region/instance/IP distributions
    R->>S: write synthetic variant events (HEC -> argus_sandbox)
    O->>U: variants_generated
    O->>E: score current detection vs variants (+ real benign)
    E->>S: run detection SPL (live)
    E-->>O: recall, false_positive, per-variant outcomes, shapes
    O->>U: generation_scored (recall before)
    loop refinement (hill-climb)
        O->>B: evolve SPL using REAL miss-shapes
        B-->>O: candidate detection (SPL)
        O->>E: re-score candidate
        E->>S: run candidate SPL (live)
        E-->>O: recall'
        O->>U: blue_evolved (recall climbs) — adopt only if better & no FP
    end
    O->>U: generation_complete / converged
    Note over O,U: next generation: Red attacks the EVOLVED rule (escalation)
    O->>U: arena_finished (baseline_recall -> final_recall over all variants)
```

## Components

| Component | Tech | Role |
|---|---|---|
| Frontend | React + TS + Vite + Tailwind + Framer Motion | The Arena: live coverage, generation cards, evolving-rule genome, agent log |
| API | FastAPI + sse-starlette | `/api/arena` (SSE run stream), `/api/health` (real status) |
| Orchestrator | `arena_orchestrator.py` | Generational loop + inner hill-climbing refinement |
| Red | `agents/red_synthesizer.py` | Generates evasive variants; materializes synthetic CloudTrail via HEC |
| Evaluator | `agents/evaluator.py` | Live recall / false-positive / lead-time + per-variant shape profiling |
| Blue | `agents/blue_evolver.py` | Evolves SPL detection calibrated to real miss-shapes |
| Search layer | `splunk/mcp_client.py` (MCP) · `splunk/sdk_client.py` (SDK) | Live SPL execution — never mocked |
| Inject layer | `splunk/hec.py` | Writes synthetic variants into `argus_sandbox` |
| Reasoning | `models/llm.py` (Claude, tiered) | Red/Blue reasoning; not the Splunk data path |
| Data | Splunk + BOTS v3 | Real benign + attack telemetry (`aws:cloudtrail`) |

## Scenario registry & run outputs

The engine is scenario-agnostic: a `Scenario` carries its `sourcetype`, baseline detection,
`distributions()` (live field-pool query) and `build_event()` (synthetic-event builder). `SCENARIOS`
registers them; `/api/scenarios` lists them; the UI selects one. Shipped: **AWS cryptomining** and
**AWS IAM persistence**. Each run emits a **MITRE ATT&CK coverage map** (self-improving), a
**Resilience Certificate** (before/after + SHA-256 fingerprint), and the **residual frontier**
(uncaught evasions) — all computed live.

## How Splunk is used (Splunk-native)

- **Search** runs through the **Splunk MCP Server** (`run_splunk_query`, and `generate_spl` — Splunk's
  own NL→SPL AI) when configured; falls back to the **Splunk Python SDK**. Set via `SEARCH_PROVIDER`.
- **HEC** ingests the Red agent's synthetic variants into a dedicated sandbox index.
- Baseline detection is based on real **Splunk ESCU / Security Content** logic; evolved detections are
  valid SPL deployable as Splunk saved searches.
