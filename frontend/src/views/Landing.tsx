import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import { GLOSSARY, LANDING } from "../content";
import { Button, InfoTip, SectionHeading } from "../components/ui";
import type { Health } from "../types";

export function Landing({ onLaunch, health }: { onLaunch: () => void; health?: Health | null }) {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto px-6 pt-3 pb-8 space-y-10">

        {/* ── Hero ────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative text-center space-y-4"
        >
          {/* Ambient glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[320px] -z-10"
            style={{ background: "radial-gradient(ellipse 55% 60% at 50% 25%, rgb(var(--c-accent) / 0.10), transparent 70%)" }}
          />

          {/* Track badge */}
          <div className="inline-flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-full border border-accent/30 text-accent bg-accent-lo/40">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping opacity-70" aria-hidden />
            Red AI vs Blue AI · Live on real Splunk data
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

          {/* Visual centerpiece: the arms race */}
          <div className="pt-2">
            <ArmsRaceDiagram />
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
- click it for a plain-English explanation.
          </p>
        </motion.section>

        {/* ── Stats strip ─────────────────────────────────────────── */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.08, ease: "easeOut" }}
                className="flex flex-col items-center text-center bg-panel border border-edge rounded-xl py-5 px-3 hover:border-edge-hi hover:shadow-card transition-all duration-200"
              >
                <div className={`text-3xl font-bold tabular-nums ${TONE_TEXT[s.tone]}`}>
                  <CountUp to={s.value} suffix={s.suffix} />
                </div>
                <div className="text-[11px] text-muted mt-1.5 leading-snug">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Problem ─────────────────────────────────────────────── */}
        <Reveal>
          <div className="rounded-xl border border-refute/30 bg-refute-lo/20 p-6">
            <div>
              <h2 className="text-base font-semibold text-white mb-2">{LANDING.problem.title}</h2>
              <p className="text-sm text-muted-hi leading-relaxed">{LANDING.problem.body}</p>
            </div>
          </div>
        </Reveal>

        {/* ── How it works ────────────────────────────────────────── */}
        <section id="how">
          <SectionHeading sub="Four steps, repeated generation after generation - an attacker AI and a defender AI evolving against each other on real data.">
            How ARGUS works
          </SectionHeading>

          {/* Desktop: connected steps with gradient line */}
          <div className="relative">
            {/* Connector line - visible on lg+ */}
            <div
              aria-hidden
              className="hidden lg:block absolute top-8 h-px left-[13%] right-[13%]"
              style={{ background: "linear-gradient(to right, transparent, #1e2d45 20%, #2d4060 50%, #1e2d45 80%, transparent)" }}
            />

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {LANDING.steps.map((s, i) => (
                <motion.div
                  key={s.k}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: i * 0.08, ease: "easeOut" }}
                >
                  <StepCard step={s} index={i} />
                </motion.div>
              ))}
            </div>
          </div>

          <p className="text-center text-sm text-muted-hi mt-6">
            Coverage climbs from the baseline (often{" "}
            <span className="text-refute font-semibold">0%</span>) to a hardened evolved rule - 
            typically{" "}
            <span className="text-support font-semibold">60–100%</span> - with every number proved live.
          </p>
        </section>

        {/* ── Glossary ────────────────────────────────────────────── */}
        <section>
          <SectionHeading sub="The complete vocabulary in plain language, grouped so it's easy to scan. Click any ⓘ for more depth.">
            Everything you'll see, explained
          </SectionHeading>
          <div className="space-y-5">
            {GLOSSARY_GROUPS.map((group, gi) => (
              <motion.div
                key={group.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: gi * 0.08, ease: "easeOut" }}
              >
                <div className="flex items-baseline gap-2 mb-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">{group.title}</h3>
                  <span className="text-[11px] text-muted">{group.hint}</span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {group.keys.map(k => {
                    const t = GLOSSARY[k];
                    return (
                      <div
                        key={k}
                        className="flex items-start gap-3 bg-panel border border-edge rounded-xl p-3.5 hover:border-edge-hi hover:bg-panel-lo transition-all duration-150 group"
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
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Who it's for ────────────────────────────────────────── */}
        <Reveal>
          <SectionHeading>Who it's for</SectionHeading>
          <ul className="space-y-3">
            {LANDING.audience.map((a, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-muted-hi bg-panel border border-edge rounded-xl px-4 py-3">
                <span className="text-accent font-bold mt-px flex-shrink-0">▹</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* ── Under the hood ──────────────────────────────────────── */}
        <Reveal>
          <SectionHeading sub="The same connections shown as status dots in the header - what's actually wired up and running, right now.">
            Under the hood
          </SectionHeading>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {STACK.map((s) => (
              <div
                key={s.id}
                className="flex items-start gap-3 bg-panel border border-edge rounded-xl p-3.5 hover:border-edge-hi hover:bg-panel-lo transition-all duration-150"
              >
                <div className="w-1 self-stretch rounded-full bg-edge flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                    {s.label}
                    <LiveDot ok={s.live(health)} />
                  </div>
                  <div className="text-xs text-muted mt-1 leading-relaxed">{s.detail(health)}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-muted mt-4">
            Built with FastAPI · Python · React · TypeScript · Tailwind · Vite · Framer Motion
          </p>
        </Reveal>

        {/* ── Final CTA ───────────────────────────────────────────── */}
        <Reveal className="pb-8">
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
              Certificate - all computed live, nothing faked.
            </p>
            <Button onClick={onLaunch} className="px-8 py-3 text-base">
              ▶ Launch the Arena
            </Button>
            <p className="text-[11px] text-muted mt-3">~3–5 minutes · 75+ live Splunk searches</p>
          </div>
        </Reveal>

      </div>
    </div>
  );
}

// ─── Reveal - scroll-triggered fade/slide-in for a whole section ──────────────

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

// ─── CountUp - animates 0 → `to` once it scrolls into view ─────────────────────

function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);

  return <span ref={ref}>{n}{suffix}</span>;
}

// ─── ArmsRaceDiagram - the hero's visual centerpiece ───────────────────────────

function ArmsRaceDiagram() {
  return (
    <div className="relative max-w-2xl mx-auto rounded-3xl border border-edge bg-panel/70 shadow-glow-sm overflow-hidden">
      <div aria-hidden className="absolute -top-20 -left-16 w-48 h-48 rounded-full bg-refute/10 blur-3xl" />
      <div aria-hidden className="absolute -bottom-20 -right-16 w-48 h-48 rounded-full bg-support/10 blur-3xl" />

      <div className="relative px-5 py-5 sm:px-10 sm:py-6">
        <div className="flex items-center justify-center gap-2 sm:gap-5">
          <DiagramNode icon="R" label="Red" caption="attacks" tone="refute" />
          <FlowArrow tone="refute" />
          <DiagramNode icon="S" label="Splunk" caption="scores live" tone="neutral" />
          <FlowArrow tone="support" />
          <DiagramNode icon="B" label="Blue" caption="evolves" tone="support" />
        </div>

        <div className="mt-5 pt-4 border-t border-edge text-center">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.16em] mb-2">
            Coverage gain, one arms race
          </div>
          <div className="flex items-center justify-center gap-3 text-3xl sm:text-4xl font-bold tabular-nums">
            <span className="text-refute">0%</span>
            <Arrow />
            <span className="text-support"><CountUp to={75} suffix="%" /></span>
          </div>
          <div className="mt-3 h-1.5 max-w-xs mx-auto rounded-full bg-edge overflow-hidden">
            <ProgressFill to={75} />
          </div>
          <div className="mt-2 text-[11px] text-muted">
            Example outcome - every live run computes its own numbers in the Arena
          </div>
        </div>
      </div>
    </div>
  );
}

function DiagramNode({ icon, label, caption, tone }: { icon: string; label: string; caption: string; tone: "refute" | "support" | "neutral" }) {
  const ring =
    tone === "refute"  ? "border-refute/30 bg-refute-lo/30 text-refute" :
    tone === "support" ? "border-support/30 bg-support-lo/30 text-support" :
                          "border-edge-hi bg-edge/40 text-muted-hi";
  const labelColor = tone === "refute" ? "text-refute" : tone === "support" ? "text-support" : "text-muted-hi";
  const glow =
    tone === "refute"  ? "rgb(var(--c-refute) / 0.18)" :
    tone === "support" ? "rgb(var(--c-support) / 0.18)" : "transparent";

  return (
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
      <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full border flex items-center justify-center text-lg sm:text-xl font-bold ${ring}`}>
        <span className="absolute inset-0 rounded-full animate-pulse" style={{ boxShadow: `0 0 0 6px ${glow}` }} aria-hidden />
        <span className="relative" aria-hidden>{icon}</span>
      </div>
      <span className={`text-[11px] font-bold uppercase tracking-wide ${labelColor}`}>{label}</span>
      <span className="text-[10px] text-muted">{caption}</span>
    </div>
  );
}

function FlowArrow({ tone }: { tone: "refute" | "support" }) {
  const color = tone === "refute" ? "rgb(var(--c-refute) / 0.8)" : "rgb(var(--c-support) / 0.8)";
  return (
    <div className="relative w-6 sm:w-12 h-px bg-edge overflow-hidden flex-shrink-0">
      <div
        className="absolute inset-y-0 w-1/3 animate-scan"
        style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }}
        aria-hidden
      />
    </div>
  );
}

function ProgressFill({ to }: { to: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <div
      ref={ref}
      className="h-full rounded-full bg-gradient-to-r from-refute via-accent to-support transition-[width] duration-[1200ms] ease-out"
      style={{ width: inView ? `${to}%` : "0%" }}
    />
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
    <div className="relative bg-panel border border-edge rounded-xl p-5 hover:border-edge-hi hover:shadow-card transition-all duration-200 group h-full">
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

const TONE_TEXT: Record<"accent" | "support", string> = {
  accent:  "text-accent",
  support: "text-support",
};

const STATS: { value: number; suffix: string; label: string; tone: "accent" | "support" }[] = [
  { value: 75,  suffix: "+",  label: "Live MCP searches per arena run", tone: "accent" },
  { value: 2,   suffix: "",   label: "Attack scenarios - cryptomining & IAM", tone: "support" },
  { value: 2,   suffix: "M+", label: "Real BOTS v3 CloudTrail events", tone: "accent" },
  { value: 100, suffix: "%",  label: "Results computed live - nothing faked", tone: "support" },
];

// ─── Stack - what's actually wired up, with live status from /api/health ──────

const STACK: {
  id: string;
  label: string;
  detail: (h?: Health | null) => string;
  live: (h?: Health | null) => boolean;
}[] = [
  {
    id: "mcp",
    label: "Splunk MCP Server",
    detail: () => "5 tools - every agent search runs through splunk_run_query",
    live: h => !!h?.mcp_tool_diversity?.ok,
  },
  {
    id: "sdk",
    label: "Splunk SDK",
    detail: () => "Approve & Deploy creates a real saved search via splunklib",
    live: h => !!h?.splunk?.connected,
  },
  {
    id: "hec",
    label: "HTTP Event Collector",
    detail: () => "injects labeled synthetic attack variants as real events",
    live: h => !!h?.hec_configured,
  },
  {
    id: "scorer",
    label: "AnomalyScorer",
    detail: h => `4-tier fallback - active: ${h?.scorer_backend ?? "local"}`,
    live: h => !!h?.scorer_backend,
  },
  {
    id: "llm",
    label: "Claude Sonnet 4.6 + Haiku 4.5",
    detail: () => "Red & Blue agent reasoning via the Anthropic API",
    live: h => !!h?.llm_configured,
  },
  {
    id: "splunk",
    label: "Splunk (botsv3 + sandbox)",
    detail: h => h?.splunk?.splunk_version ? `connected - Splunk ${h.splunk.splunk_version}` : "real attack data + synthetic injection index",
    live: h => !!h?.splunk?.connected,
  },
];

// ─── LiveDot - small pulse indicating a live, currently-connected backend ─────

function LiveDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="relative inline-flex w-1.5 h-1.5 flex-shrink-0"
      title={ok ? "Live - connected right now" : "Not connected"}
    >
      {ok && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" aria-hidden />}
      <span className={`absolute inset-0 rounded-full ${ok ? "bg-emerald-500" : "bg-muted/30"}`} aria-hidden />
    </span>
  );
}

const GLOSSARY_GROUPS: { title: string; hint: string; keys: string[] }[] = [
  { title: "The players", hint: "who's in the arena",     keys: ["argus", "splunk", "red", "blue", "evaluator"] },
  { title: "The process",  hint: "how the arms race runs", keys: ["detection", "baseline", "armsRace", "generation", "evasion", "scenario"] },
  { title: "The proof",    hint: "what gets measured",     keys: ["recall", "falsePositive", "mitre", "coverage", "frontier", "certificate", "noHardcoded"] },
];
