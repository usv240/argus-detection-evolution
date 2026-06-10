import { GLOSSARY, LANDING } from "../content";
import { Button, Card, InfoTip, SectionHeading } from "../components/ui";

export function Landing({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-14 space-y-20">

        {/* ── Hero ────────────────────────────────────────────────── */}
        <section className="text-center space-y-6">
          {/* Track badge */}
          <div className="inline-flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-full border border-accent/30 text-accent bg-accent-lo/40">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping opacity-70" aria-hidden />
            Splunk Agentic Ops Hackathon · Security track
          </div>

          {/* Headline */}
          <div>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white leading-[1.1]">
              ARGUS
            </h1>
            <p className="text-xl sm:text-2xl font-medium text-muted-hi mt-3 leading-snug max-w-2xl mx-auto">
              {LANDING.tagline}
            </p>
          </div>

          {/* Sub */}
          <p className="text-sm sm:text-base text-muted max-w-2xl mx-auto leading-relaxed">
            {LANDING.sub}
          </p>

          {/* Visual arms-race snapshot */}
          <div className="inline-flex items-center gap-3 bg-panel border border-edge rounded-2xl px-6 py-4 text-sm">
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl" aria-hidden>⚔</span>
              <span className="text-[10px] font-semibold text-refute uppercase tracking-wide">Red</span>
              <span className="text-[10px] text-muted">attacks</span>
            </div>
            <Arrow />
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl" aria-hidden>⚡</span>
              <span className="text-[10px] font-semibold text-muted-hi uppercase tracking-wide">Splunk</span>
              <span className="text-[10px] text-muted">scores live</span>
            </div>
            <Arrow />
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl" aria-hidden>🛡</span>
              <span className="text-[10px] font-semibold text-support uppercase tracking-wide">Blue</span>
              <span className="text-[10px] text-muted">evolves</span>
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <Arrow />
              <div className="flex flex-col items-center gap-1">
                <div className="text-lg font-bold">
                  <span className="text-refute">0%</span>
                  <span className="text-muted mx-1">→</span>
                  <span className="text-support">75%</span>
                </div>
                <span className="text-[10px] text-muted">coverage gain</span>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button onClick={onLaunch} className="px-6 py-2.5 text-base">
              ▶ Launch the Arena
            </Button>
            <a
              href="#how"
              className="px-5 py-2.5 rounded-lg text-sm border border-edge text-muted-hi hover:text-white hover:border-edge-hi hover:bg-edge/40 transition-all duration-150"
            >
              How it works
            </a>
          </div>

          <p className="text-xs text-muted">
            New to security? Every term has an{" "}
            <span className="inline-flex items-center justify-center w-[14px] h-[14px] rounded-full border border-muted/50 text-[9px] text-muted mx-0.5">i</span>
            — click it for a plain-English explanation.
          </p>
        </section>

        {/* ── Stats strip ─────────────────────────────────────────── */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STATS.map(s => (
              <div
                key={s.value}
                className="flex flex-col items-center text-center bg-panel border border-edge rounded-xl py-5 px-3 hover:border-edge-hi transition-colors duration-200"
              >
                <div className="text-3xl font-bold text-white tabular-nums">{s.value}</div>
                <div className="text-[11px] text-muted mt-1.5 leading-snug">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Problem ─────────────────────────────────────────────── */}
        <section>
          <div className="rounded-xl border border-refute/30 bg-refute-lo/20 p-6">
            <div className="flex items-start gap-4">
              <div className="text-3xl flex-shrink-0 mt-0.5" aria-hidden>⚠</div>
              <div>
                <h2 className="text-base font-semibold text-white mb-2">{LANDING.problem.title}</h2>
                <p className="text-sm text-muted-hi leading-relaxed">{LANDING.problem.body}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ────────────────────────────────────────── */}
        <section id="how">
          <SectionHeading sub="Four steps, repeated generation after generation — an attacker AI and a defender AI evolving against each other on real data.">
            How ARGUS works
          </SectionHeading>

          {/* Desktop: connected steps with gradient line */}
          <div className="relative">
            {/* Connector line — visible on lg+ */}
            <div
              aria-hidden
              className="hidden lg:block absolute top-8 h-px left-[13%] right-[13%]"
              style={{ background: "linear-gradient(to right, transparent, #1e2d45 20%, #2d4060 50%, #1e2d45 80%, transparent)" }}
            />

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {LANDING.steps.map((s, i) => (
                <StepCard key={s.k} step={s} index={i} />
              ))}
            </div>
          </div>

          <p className="text-center text-sm text-muted-hi mt-6">
            Coverage climbs from the baseline (often{" "}
            <span className="text-refute font-semibold">0%</span>) to a hardened evolved rule —
            typically{" "}
            <span className="text-support font-semibold">60–100%</span> — with every number proved live.
          </p>
        </section>

        {/* ── Glossary ────────────────────────────────────────────── */}
        <section>
          <SectionHeading sub="The complete vocabulary in plain language. Click any ⓘ for more depth.">
            Everything you'll see, explained
          </SectionHeading>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {GLOSSARY_ORDER.map(k => {
              const t = GLOSSARY[k];
              return (
                <div
                  key={k}
                  className="flex items-start gap-3 bg-panel border border-edge rounded-xl p-4 hover:border-edge-hi hover:bg-panel-lo transition-all duration-150 group"
                >
                  <div className="w-1 self-stretch rounded-full bg-edge group-hover:bg-accent/40 transition-colors duration-200 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white flex items-center">
                      {t.name}
                      <InfoTip term={k} />
                    </div>
                    <div className="text-xs text-muted mt-1 leading-relaxed">{t.short}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Who it's for ────────────────────────────────────────── */}
        <section>
          <SectionHeading>Who it's for</SectionHeading>
          <ul className="space-y-3">
            {LANDING.audience.map((a, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-muted-hi bg-panel border border-edge rounded-xl px-4 py-3">
                <span className="text-accent font-bold mt-px flex-shrink-0">▹</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Final CTA ───────────────────────────────────────────── */}
        <section className="pb-8">
          <div
            className="rounded-2xl border border-accent/35 bg-accent-lo/20 p-8 text-center shadow-glow-sm"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, rgba(139,92,246,0.03) 0, rgba(139,92,246,0.03) 1px, transparent 1px, transparent 8px)",
            }}
          >
            <div className="text-2xl font-bold text-white mb-2">Watch the arms race live.</div>
            <p className="text-sm text-muted max-w-lg mx-auto leading-relaxed mb-6">
              Pick an attack scenario and run the Arena. You'll watch Red and Blue trade blows on
              real Splunk data, see MITRE coverage self-improve, and download a signed Resilience
              Certificate — all computed live, nothing faked.
            </p>
            <Button onClick={onLaunch} className="px-8 py-3 text-base">
              ▶ Launch the Arena
            </Button>
            <p className="text-[11px] text-muted mt-3">~3–5 minutes · 30–45 live Splunk searches</p>
          </div>
        </section>

      </div>
    </div>
  );
}

// ─── StepCard ─────────────────────────────────────────────────────────────────

const STEP_COLORS = [
  "text-refute border-refute/30 bg-refute-lo/30",      // 1 · Attack
  "text-muted-hi border-edge-hi bg-edge/40",            // 2 · Measure
  "text-support border-support/30 bg-support-lo/30",   // 3 · Evolve
  "text-accent border-accent/30 bg-accent-lo/30",      // 4 · Prove
];

function StepCard({ step, index }: { step: { k: string; title: string; body: string }; index: number }) {
  return (
    <div className="relative bg-panel border border-edge rounded-xl p-5 hover:border-edge-hi hover:shadow-card transition-all duration-200 group">
      {/* Step number circle */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mb-4 border ${STEP_COLORS[index]}`}>
        {index + 1}
      </div>
      <div className="text-sm font-semibold text-white flex items-center mb-2">
        {step.title.replace(/^\d+ · /, "")}
        <InfoTip term={step.k} />
      </div>
      <p className="text-xs text-muted leading-relaxed">{step.body}</p>
    </div>
  );
}

// ─── Arrow ────────────────────────────────────────────────────────────────────

function Arrow() {
  return (
    <div className="flex items-center text-muted/40" aria-hidden>
      <div className="w-4 h-px bg-current" />
      <div className="w-0 h-0 border-t-4 border-b-4 border-l-4 border-t-transparent border-b-transparent border-l-current" />
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const STATS = [
  { value: "39+",  label: "Live MCP searches per arena run" },
  { value: "2",    label: "Attack scenarios (cryptomining · IAM)" },
  { value: "678+", label: "Real BOTS v3 CloudTrail events" },
  { value: "100%", label: "Results computed live, nothing faked" },
];

const GLOSSARY_ORDER = [
  "argus", "splunk", "detection", "baseline", "red", "blue", "evaluator",
  "armsRace", "generation", "evasion", "recall", "falsePositive",
  "mitre", "coverage", "frontier", "certificate", "scenario", "noHardcoded",
];
