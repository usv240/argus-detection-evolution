import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { startArena } from "../api/stream";
import { Badge, Button, Card, Divider, InfoTip, Spinner } from "../components/ui";

type Ev = Record<string, any>;

interface Evasion {
  id: string;
  name: string;
  evasion: string;
  detected?: boolean;
  description?: string;
  mitre?: string[];
  changed?: Record<string, any>;
}
interface GenView {
  gen: number;
  evasions: Evasion[];
  recallBefore?: number;
  recallAfter?: number;
  converged?: boolean;
  rationale?: string;
}

export function Arena() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [running, setRunning] = useState(false);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [scenarioKey, setScenarioKey] = useState<string>("");
  const abort = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const v = useMemo(() => derive(events), [events]);

  useEffect(() => {
    fetch("/api/scenarios")
      .then(r => r.json())
      .then(s => { setScenarios(s); if (s[0]) setScenarioKey(s[0].key); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [v.log]);

  async function run() {
    setEvents([]);
    setRunning(true);
    abort.current = new AbortController();
    try {
      await startArena(
        { scenario: scenarioKey, generations: 3, variants_per_gen: 3, refine_attempts: 4, stop_on_converge: false },
        e => setEvents(p => [...p, e]),
        abort.current.signal,
      );
    } finally {
      setRunning(false);
    }
  }

  const arenaStarted = v.baseline !== undefined;
  const totalGens = v.totalGenerations ?? 3;
  const completedGens = v.generations.filter(g => g.recallAfter != null).length;
  const done = v.certificate != null;

  return (
    <div className="h-full flex flex-col bg-ink">

      {/* ── Animated scan line ── */}
      <div className="h-0.5 overflow-hidden flex-shrink-0 bg-ink">
        {running && (
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent animate-scan" />
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="px-5 py-2.5 flex items-center gap-3 border-b border-edge bg-panel/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white flex items-center gap-1 truncate">
            {v.scenario ?? "Adversarial Detection Evolution"}
            <InfoTip term="armsRace" />
          </div>
          {v.baseline && (
            <div className="text-[11px] text-muted flex items-center gap-1">
              Baseline<InfoTip term="baseline" />:{" "}
              <span className="text-refute font-semibold">{v.baseline}</span>
            </div>
          )}
        </div>

        {v.error && (
          <div className="text-refute text-xs bg-refute-lo/30 border border-refute/30 rounded-lg px-2.5 py-1 max-w-xs truncate">
            {v.error}
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted flex items-center gap-0.5 whitespace-nowrap">
            Scenario<InfoTip term="scenario" />
          </label>
          <select
            value={scenarioKey}
            onChange={e => setScenarioKey(e.target.value)}
            disabled={running}
            aria-label="Attack scenario"
            className="bg-ink border border-edge rounded-lg px-2.5 py-1.5 text-sm text-muted-hi disabled:opacity-40 hover:border-edge-hi transition-colors duration-150 cursor-pointer min-w-[160px]"
          >
            {scenarios.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
          </select>
        </div>

        <Button onClick={run} disabled={running} loading={running}>
          {running ? "Evolving…" : "▶ Run the Arena"}
        </Button>
      </div>

      {/* ── Run tracker ── */}
      {arenaStarted && (
        <RunTracker completedGens={completedGens} totalGens={totalGens} done={done} running={running} />
      )}

      {/* ── Main grid ── */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-3 gap-0 overflow-hidden">

        {/* ── Left panel ── */}
        <div className="lg:col-span-2 overflow-auto p-5 space-y-4">

          <AnimatePresence>
            {(v.baselineRecall != null || v.liveRecall != null) && (
              <motion.div key="headline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Headline v={v} />
              </motion.div>
            )}
          </AnimatePresence>

          {v.certificate && <Certificate cert={v.certificate} v={v} />}

          {v.generations.length === 0 && !running && <EmptyState />}

          {v.generations.length === 0 && running && (
            <Card variant="subtle" className="flex items-center gap-3 py-6">
              <Spinner size="md" className="text-accent" />
              <div>
                <div className="text-sm font-medium text-white">Establishing baseline…</div>
                <div className="text-xs text-muted mt-0.5">Running initial coverage measurement on Splunk</div>
              </div>
            </Card>
          )}

          {v.generations.map(g => <GenerationCard key={g.gen} g={g} />)}

          {v.frontier.length > 0 && <FrontierPanel frontier={v.frontier} />}

          {v.coverageMap.length > 0 && <CoverageMap rows={v.coverageMap} />}

          {v.certificate && <ProofPanel v={v} />}
        </div>

        {/* ── Right panel ── */}
        <div className="border-l border-edge flex flex-col min-h-0 overflow-hidden">

          <Divider label="Detection Rule" />
          <div className="flex-shrink-0 px-4 pb-4 space-y-3">
            {v.baselineSpl ? (
              <>
                <div>
                  <div className="text-[10px] text-refute font-semibold uppercase tracking-wide mb-1 flex items-center gap-1">
                    ▸ Baseline <InfoTip term="spl" />
                  </div>
                  <pre className="text-[10px] leading-relaxed text-muted whitespace-pre-wrap max-h-24 overflow-auto bg-ink rounded-lg p-2.5 border border-edge/60">
                    {v.baselineSpl}
                  </pre>
                </div>
                <div>
                  <div className="text-[10px] text-support font-semibold uppercase tracking-wide mb-1">
                    ▸ Evolved {v.currentSpl ? "(live)" : ""}
                  </div>
                  <EvolvedSpl baseline={v.baselineSpl} evolved={v.currentSpl} />
                </div>
              </>
            ) : (
              <div className="text-xs text-muted/60 italic py-2">
                Detection rule appears once the run starts.
              </div>
            )}
            {v.rationale && (
              <div className="text-xs bg-support-lo/20 border border-support/20 rounded-lg p-2.5">
                <span className="text-support font-semibold">Why it improved: </span>
                <span className="text-muted-hi">{v.rationale}</span>
              </div>
            )}
            {v.currentSpl && <ApprovalControls spl={v.currentSpl} />}
          </div>

          {v.certificate && (
            <>
              <Divider label="Certificate" />
              <CertMini cert={v.certificate} />
            </>
          )}

          {v.searchTrace.length > 0 && (
            <>
              <Divider label={`Splunk Searches · ${v.searchesRun} via ${v.searchProvider ?? "mcp"}`} />
              <SearchTrace v={v} />
            </>
          )}

          <Divider label="Agent Log" />
          <div ref={logRef} className="flex-1 overflow-auto px-4 py-2 space-y-0.5 min-h-0">
            {v.log.length === 0 ? (
              <div className="text-[11px] text-muted/40 italic">Waiting for run to start…</div>
            ) : (
              v.log.map((l, i) => (
                <div key={i} className="text-[11px] font-mono text-muted leading-relaxed">
                  <span className="text-muted/30 mr-1.5 select-none">{String(i + 1).padStart(2, "0")}</span>
                  {l}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── RunTracker ────────────────────────────────────────────────────────────────

function RunTracker({ completedGens, totalGens, done, running }: {
  completedGens: number; totalGens: number; done: boolean; running: boolean;
}) {
  const steps = [
    { label: "Baseline", done: true },
    ...Array.from({ length: totalGens }, (_, i) => ({ label: `Gen ${i + 1}`, done: completedGens > i })),
    { label: "Final", done },
  ];
  const activeIndex = done
    ? steps.length - 1
    : 1 + completedGens;

  return (
    <div className="px-5 py-2 border-b border-edge bg-panel-lo flex-shrink-0">
      <div className="flex items-center">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center">
            {i > 0 && (
              <div className={`h-px w-8 sm:w-14 transition-colors duration-500 ${s.done ? "bg-support/50" : "bg-edge"}`} />
            )}
            <div className="flex flex-col items-center gap-0.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border transition-all duration-300
                ${s.done
                  ? "bg-support/20 border-support/50 text-support"
                  : i === activeIndex && running
                  ? "bg-accent/20 border-accent/50 text-accent animate-pulse"
                  : "bg-edge/30 border-edge text-muted/40"
                }`}
              >
                {s.done ? "✓" : i + 1}
              </div>
              <span className={`text-[9px] whitespace-nowrap transition-colors duration-300
                ${s.done ? "text-support" : i === activeIndex && running ? "text-accent" : "text-muted/30"}`}
              >
                {s.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-center gap-4 py-6">
        <AgentBadge icon="⚔" label="Red AI" color="refute" sub="synthesizes evasions" />
        <div className="flex flex-col items-center gap-1">
          <div className="w-8 h-px bg-edge" />
          <span className="text-[9px] text-muted/30">vs</span>
          <div className="w-8 h-px bg-edge" />
        </div>
        <AgentBadge icon="⚡" label="Splunk" color="neutral" sub="scores live" />
        <div className="flex flex-col items-center gap-1">
          <div className="w-8 h-px bg-edge" />
          <span className="text-[9px] text-muted/30">→</span>
          <div className="w-8 h-px bg-edge" />
        </div>
        <AgentBadge icon="🛡" label="Blue AI" color="support" sub="evolves defenses" />
      </div>

      <Card variant="subtle">
        <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          How to run the Arena
          <InfoTip term="armsRace" />
        </div>
        <ol className="space-y-3">
          {GUIDE_STEPS.map((step, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 border
                ${i === 0 ? "bg-accent/15 text-accent border-accent/30"
                  : i === 1 ? "bg-refute-lo/40 text-refute border-refute/30"
                  : "bg-support-lo/40 text-support border-support/30"
                }`}
              >
                {i + 1}
              </span>
              <div>
                <div className="text-sm text-white font-medium">{step.title}</div>
                <div className="text-xs text-muted mt-0.5 leading-relaxed">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 pt-3 border-t border-edge text-xs text-muted flex items-center gap-1">
          Everything computed live on real Splunk data — nothing faked.
          <InfoTip term="noHardcoded" />
        </div>
      </Card>
    </motion.div>
  );
}

function AgentBadge({ icon, label, color, sub }: { icon: string; label: string; color: string; sub: string }) {
  const cls: Record<string, string> = {
    refute:  "text-refute border-refute/25 bg-refute-lo/20",
    neutral: "text-muted-hi border-edge-hi bg-edge/30",
    support: "text-support border-support/25 bg-support-lo/20",
  };
  return (
    <div className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border ${cls[color]}`}>
      <span className="text-2xl" aria-hidden>{icon}</span>
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[10px] text-muted text-center">{sub}</span>
    </div>
  );
}

const GUIDE_STEPS = [
  {
    title: "Choose a scenario and press Run",
    body: "Select an attack scenario — cryptomining or IAM abuse — then click ▶ Run the Arena in the toolbar.",
  },
  {
    title: "Watch Red attack, Blue defend",
    body: "Red AI generates evasion variants. Splunk scores each one live. Blue AI rewrites the detection to catch what's slipping through.",
  },
  {
    title: "Download your Resilience Certificate",
    body: "After 3 generations you get a signed certificate showing coverage gain, MITRE map, and residual blind spots.",
  },
];

// ── Headline ──────────────────────────────────────────────────────────────────

function Headline({ v }: { v: ReturnType<typeof derive> }) {
  const base = v.baselineRecall;
  const fin = v.finalRecall ?? v.liveRecall;
  if (base == null && fin == null) return null;
  const gain = v.finalRecall != null && v.baselineRecall != null
    ? Math.round((v.finalRecall - v.baselineRecall) * 100) : null;
  return (
    <Card variant="accent" className="!p-0 overflow-hidden">
      <div className="flex items-stretch flex-wrap">
        <div className="px-6 py-4 flex flex-col justify-center border-r border-accent/20 flex-shrink-0">
          <div className="text-[10px] text-muted uppercase tracking-widest mb-1 flex items-center gap-0.5">
            Coverage<InfoTip term="recall" />
          </div>
          <div className="text-4xl font-bold tabular-nums leading-none">
            <span className="text-refute">{pct(base)}</span>
            <span className="text-muted/40 mx-2 font-light">→</span>
            <span className="text-support">{pct(fin)}</span>
          </div>
          {gain != null && (
            <div className="text-xs text-muted mt-1.5">
              +{gain}pp gain
            </div>
          )}
        </div>
        <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 flex-1">
          {v.totalVariants != null && <StatMini label="Variants tested" value={String(v.totalVariants)} />}
          <StatMini label="False positives" value={v.finalFp == null ? "—" : v.finalFp ? "present" : "0"}
            tone={v.finalFp == null ? "default" : v.finalFp ? "bad" : "good"} />
          {v.searchesRun > 0 && <StatMini label="Live searches" value={String(v.searchesRun)} />}
          {v.realAttack && (
            <StatMini label="Real attack" value={v.realAttack.final_caught ? "caught ✓" : "missed ✗"}
              tone={v.realAttack.final_caught ? "good" : "bad"} />
          )}
          {v.searchProvider && <StatMini label="Provider" value={v.searchProvider} />}
        </div>
      </div>
    </Card>
  );
}

function StatMini({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "bad" }) {
  const color = tone === "good" ? "text-support" : tone === "bad" ? "text-refute" : "text-white";
  return (
    <div>
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

// ── GenerationCard ────────────────────────────────────────────────────────────

function GenerationCard({ g }: { g: GenView }) {
  const gain = g.recallAfter != null && g.recallBefore != null
    ? Math.round((g.recallAfter - g.recallBefore) * 100) : null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-panel border border-edge rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-edge/60 flex items-center gap-3 flex-wrap">
        <div className="w-6 h-6 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-[11px] font-bold text-accent flex-shrink-0">
          {g.gen}
        </div>
        <span className="text-sm font-medium text-white">Generation {g.gen}</span>
        <span className="text-xs text-muted">
          Red generated {g.evasions.length} evasion{g.evasions.length !== 1 ? "s" : ""}
          <InfoTip term="evasion" />
        </span>
        {g.converged && <Badge variant="good">converged</Badge>}
        <div className="ml-auto flex items-center gap-2 text-sm font-semibold tabular-nums">
          {g.recallBefore != null && <span className="text-refute">{pct(g.recallBefore)}</span>}
          {g.recallBefore != null && g.recallAfter != null && <span className="text-muted/40">→</span>}
          {g.recallAfter != null && <span className="text-support">{pct(g.recallAfter)}</span>}
          {gain != null && gain > 0 && <Badge variant="good">+{gain}pp</Badge>}
        </div>
      </div>

      {/* Progress bar */}
      {g.recallAfter != null && (
        <div className="h-1 bg-ink relative overflow-hidden">
          <div className="absolute h-full bg-edge/50" style={{ width: `${(g.recallBefore ?? 0) * 100}%` }} />
          <motion.div
            className="absolute h-full bg-support"
            initial={{ width: 0 }}
            animate={{ width: `${(g.recallAfter ?? 0) * 100}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        </div>
      )}

      {/* Evasions */}
      <div className="px-4 py-3 space-y-2">
        {g.evasions.map(e => (
          <div
            key={e.id}
            className={`pl-3 border-l-2 rounded-r py-1 transition-colors
              ${e.detected === undefined
                ? "border-edge"
                : e.detected
                ? "border-support bg-support/5"
                : "border-refute bg-refute/5"
              }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              {e.detected !== undefined && (
                <span className={`text-[10px] font-semibold ${e.detected ? "text-support" : "text-refute"}`}>
                  {e.detected ? "caught" : "evaded"}
                </span>
              )}
              <span className="text-xs font-medium text-white">{e.name}</span>
              {(e.mitre || []).map(m => <Badge key={m} variant="neutral">{m}</Badge>)}
            </div>
            {e.description && (
              <div className="text-[11px] text-muted mt-0.5">why missed: {e.description}</div>
            )}
            {e.changed && (
              <div className="text-[10px] text-muted/60 font-mono mt-0.5">{summarizeChanged(e.changed)}</div>
            )}
          </div>
        ))}
      </div>

      {/* Rationale */}
      {g.rationale && (
        <div className="px-4 pb-4">
          <div className="bg-ink rounded-lg px-3 py-2.5 border border-edge">
            <span className="text-[10px] text-support font-semibold uppercase tracking-wide">Blue learned: </span>
            <span className="text-xs text-muted-hi">{g.rationale}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── FrontierPanel ─────────────────────────────────────────────────────────────

function FrontierPanel({ frontier }: { frontier: any[] }) {
  return (
    <Card variant="warn">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-refute font-semibold text-sm">
          Residual frontier — {frontier.length} evasion{frontier.length !== 1 ? "s" : ""} still uncaught
        </span>
        <InfoTip term="frontier" />
      </div>
      <p className="text-xs text-muted mb-3 leading-relaxed">
        Real blind spots ARGUS surfaced that even the hardened rule misses — prioritize these in your next sprint.
      </p>
      <div className="flex flex-wrap gap-2">
        {frontier.map((o: any, i: number) => (
          <span key={i} title={o.evasion}>
            <Badge variant="bad">{o.name}</Badge>
          </span>
        ))}
      </div>
    </Card>
  );
}

// ── Certificate (main, left panel) ───────────────────────────────────────────

function Certificate({ cert, v }: { cert: any; v: ReturnType<typeof derive> }) {
  const download = () => downloadJson(cert, `${cert.id}.json`);
  const gain = Math.round(((cert.final_recall ?? 0) - (cert.baseline_recall ?? 0)) * 100);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
      <div
        className="rounded-2xl border border-accent/40 bg-accent-lo/20 p-6 shadow-glow-sm relative overflow-hidden"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg,rgba(139,92,246,0.035) 0,rgba(139,92,246,0.035) 1px,transparent 1px,transparent 8px)",
        }}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-[10px] text-accent/70 font-bold uppercase tracking-[0.14em] mb-1 flex items-center gap-1">
              Resilience Certificate<InfoTip term="certificate" />
            </div>
            <div className="text-xs font-mono text-muted">{cert.id}</div>
          </div>
          <Button variant="ghost" onClick={download} className="text-xs">
            ↓ Download JSON
          </Button>
        </div>

        <div className="flex items-baseline gap-3 mb-5 flex-wrap">
          <div className="text-5xl font-bold tabular-nums leading-none">
            <span className="text-refute">{pct(cert.baseline_recall)}</span>
            <span className="text-muted/40 mx-3 font-light text-3xl">→</span>
            <span className="text-support">{pct(cert.final_recall)}</span>
          </div>
          {gain > 0 && <div className="text-xl font-bold text-support">+{gain}pp</div>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Variants tested",     value: String(cert.total_variants),  tone: "default" },
            { label: "Residual blind spots", value: String(cert.residual_blind_spots), tone: cert.residual_blind_spots > 0 ? "bad" : "good" },
            { label: "Live searches",        value: v.searchesRun > 0 ? String(v.searchesRun) : "—", tone: "default" },
            { label: "Real attack",          value: v.realAttack ? (v.realAttack.final_caught ? "caught ✓" : "missed ✗") : "—",
              tone: v.realAttack ? (v.realAttack.final_caught ? "good" : "bad") : "default" },
          ].map(s => (
            <div key={s.label} className="bg-ink/60 rounded-lg p-2.5 border border-accent/10">
              <div className="text-[10px] text-muted uppercase tracking-wide">{s.label}</div>
              <div className={`text-sm font-semibold mt-0.5
                ${s.tone === "bad" ? "text-refute" : s.tone === "good" ? "text-support" : "text-white"}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-ink/50 rounded-lg px-3 py-2 border border-accent/10 font-mono text-[10px] text-muted/60 break-all">
          SHA-256: {cert.fingerprint}
        </div>
        <div className="text-[10px] text-muted/40 mt-1.5">issued {cert.issued_at}</div>
      </div>
    </motion.div>
  );
}

// ── CertMini (right panel) ────────────────────────────────────────────────────

function CertMini({ cert }: { cert: any }) {
  const download = () => downloadJson(cert, `${cert.id}.json`);
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-mono text-muted/60 truncate flex-1">{cert.id}</div>
        <button
          onClick={download}
          className="text-[10px] px-2 py-0.5 rounded border border-edge hover:text-white hover:border-edge-hi transition-colors ml-2 whitespace-nowrap"
        >
          ↓ JSON
        </button>
      </div>
      <div className="text-sm font-semibold">
        <span className="text-refute">{pct(cert.baseline_recall)}</span>
        <span className="text-muted/40 mx-1.5 font-light">→</span>
        <span className="text-support">{pct(cert.final_recall)}</span>
        <span className="text-muted text-xs font-normal ml-2">{cert.total_variants} variants</span>
      </div>
      <div className="text-[9px] text-muted/40 font-mono mt-0.5">
        SHA-256: {String(cert.fingerprint).slice(0, 20)}…
      </div>
    </div>
  );
}

// ── ProofPanel ────────────────────────────────────────────────────────────────

function ProofPanel({ v }: { v: any }) {
  const rows: [string, string, "default" | "good" | "bad"][] = [
    ["Coverage",         `${pct(v.baselineRecall)} → ${pct(v.finalRecall)}`, "default"],
    ["False positives",  v.finalFp ? "present" : "0",                         v.finalFp ? "bad" : "good"],
    ["Variants tested",  String(v.totalVariants ?? "—"),                       "default"],
    ["Real attack",      v.realAttack ? (v.realAttack.final_caught ? "caught" : "missed") : "—",
      v.realAttack?.final_caught ? "good" : v.realAttack ? "bad" : "default"],
    ["Live searches",    `${v.searchesRun} via ${v.searchProvider ?? "—"}`,    "default"],
    ["Synthetic index",  v.syntheticIndex ?? "—",                              "default"],
    ["Run ID",           v.runId ?? "—",                                       "default"],
    ["SHA-256",          v.certificate ? `${String(v.certificate.fingerprint).slice(0, 20)}…` : "—", "default"],
  ];
  return (
    <Card variant="elevated">
      <div className="text-sm font-semibold text-white mb-3">Judge proof — every number computed live</div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0">
        {rows.map(([k, val, tone], i) => (
          <div key={i} className="flex justify-between text-xs border-b border-edge/30 py-1.5 last:border-0">
            <span className="text-muted">{k}</span>
            <span className={tone === "bad" ? "text-refute" : tone === "good" ? "text-support" : "text-muted-hi"}>
              {val}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── EvolvedSpl ────────────────────────────────────────────────────────────────

function EvolvedSpl({ baseline, evolved }: { baseline?: string; evolved?: string }) {
  if (!evolved) {
    return (
      <div className="text-[11px] text-muted/60 italic bg-ink rounded-lg px-2.5 py-2 border border-edge/60">
        Evolves once the run starts…
      </div>
    );
  }
  const baseSet = new Set((baseline || "").split("\n").map(l => l.trim()).filter(Boolean));
  return (
    <pre className="text-[10px] leading-relaxed whitespace-pre-wrap max-h-52 overflow-auto bg-ink rounded-lg p-2.5 border border-edge/60">
      {evolved.split("\n").map((line, i) => {
        const added = !!line.trim() && !baseSet.has(line.trim());
        return (
          <div key={i} className={added ? "text-support bg-support/10" : "text-muted"}>
            {added ? "+ " : "  "}{line}
          </div>
        );
      })}
    </pre>
  );
}

// ── ApprovalControls ──────────────────────────────────────────────────────────

function ApprovalControls({ spl }: { spl: string }) {
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(spl);

  async function decide(decision: string, body: any = {}) {
    setStatus("pending");
    try {
      await fetch("/api/approval", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, ...body }),
      });
      setStatus(decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "saved");
    } catch { setStatus("error"); }
  }

  const statusLabel: Record<string, string> = {
    pending: "…", approved: "Approved (deploy disabled in demo)",
    rejected: "Rejected", saved: "Edit saved", error: "Error",
  };

  return (
    <div className="border border-edge rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 border-b border-edge bg-panel-lo">
        <div className="text-[10px] text-muted uppercase tracking-wide">Human review</div>
      </div>
      <div className="p-2.5">
        {!editing ? (
          <div className="flex gap-2 items-center flex-wrap">
            <Button variant="ghost" onClick={() => decide("approve", { spl })}
              className="text-xs py-1 !border-support/30 !text-support hover:!bg-support-lo/30">
              Approve
            </Button>
            <Button variant="ghost" onClick={() => setEditing(true)} className="text-xs py-1">
              Edit
            </Button>
            <Button variant="danger" onClick={() => decide("reject")} className="text-xs py-1">
              Reject
            </Button>
            {status && (
              <span className={`text-xs ${status === "error" ? "text-refute" : "text-muted"}`}>
                {statusLabel[status]}
              </span>
            )}
          </div>
        ) : (
          <div>
            <textarea
              value={edited}
              onChange={e => setEdited(e.target.value)}
              className="w-full h-24 text-[11px] font-mono bg-ink border border-edge rounded p-2 text-muted-hi resize-y focus:border-accent focus:outline-none transition-colors"
            />
            <div className="flex gap-2 mt-1.5">
              <Button onClick={() => { decide("edit", { spl: edited }); setEditing(false); }} className="text-xs py-1">
                Save edit
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} className="text-xs py-1">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SearchTrace ───────────────────────────────────────────────────────────────

function SearchTrace({ v }: { v: ReturnType<typeof derive> }) {
  return (
    <div className="px-4 py-2 flex-shrink-0">
      <div className="flex items-center justify-between mb-1.5">
        <InfoTip
          name="Splunk search activity"
          text="Every detection run and evidence query executes live against Splunk through the configured provider (Splunk MCP Server, or SDK fallback). This streams those real searches — proof Splunk is load-bearing, not decorative."
        />
        {v.searchAll.length > 0 && (
          <button
            onClick={() => downloadJson(
              { run_id: v.runId, provider: v.searchProvider, total_searches: v.searchesRun, generated_at: new Date().toISOString(), searches: v.searchAll },
              `argus-search-receipt-${v.runId ?? "run"}.json`,
            )}
            className="text-[10px] px-2 py-0.5 rounded border border-edge hover:text-white hover:border-edge-hi transition-colors"
          >
            ↓ receipt
          </button>
        )}
      </div>
      <div className="space-y-0.5 max-h-36 overflow-auto">
        {v.searchTrace.slice().reverse().map((s: any, i: number) => (
          <div key={i} className="flex items-baseline gap-1.5 text-[10px] font-mono" title={s.spl}>
            <span className="text-accent/70 flex-shrink-0">{s.provider}</span>
            <span className={`flex-shrink-0 tabular-nums w-5 text-right ${s.rows > 0 ? "text-muted-hi" : "text-muted/30"}`}>
              {s.rows}r
            </span>
            <span className="text-muted truncate">{s.spl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CoverageMap ───────────────────────────────────────────────────────────────

function CoverageMap({ rows }: { rows: any[] }) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <div className="text-sm font-semibold text-white">MITRE ATT&CK coverage</div>
        <Badge variant="accent">self-improving</Badge>
        <InfoTip term="coverage" />
      </div>
      <p className="text-xs text-muted mb-3 leading-relaxed">
        Baseline (grey) → hardened by ARGUS (blue). Each row is one MITRE technique.
      </p>
      <div className="space-y-3">
        {rows.map(r => {
          const b = r.total ? r.baseline_caught / r.total : 0;
          const f = r.total ? r.final_caught / r.total : 0;
          return (
            <div key={r.technique}>
              <div className="flex justify-between text-xs mb-1 gap-2">
                <span className="text-muted-hi truncate">{r.technique} · {r.name}</span>
                <span className="tabular-nums text-muted whitespace-nowrap flex-shrink-0">
                  {r.baseline_caught}/{r.total} →{" "}
                  <span className="text-support font-semibold">{r.final_caught}/{r.total}</span>
                </span>
              </div>
              <div className="h-1.5 bg-ink rounded-full overflow-hidden relative">
                <div className="absolute h-full rounded-full bg-edge/60" style={{ width: `${b * 100}%` }} />
                <motion.div
                  className="absolute h-full rounded-full bg-support"
                  initial={{ width: 0 }}
                  animate={{ width: `${f * 100}%` }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  style={{ opacity: 0.85 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function summarizeChanged(c: Record<string, any>): string {
  const p: string[] = [];
  if (c.identity) p.push(c.identity);
  if (c.source_ips != null) p.push(`${c.source_ips} IP${c.source_ips === 1 ? "" : "s"}`);
  if (c.usernames != null) p.push(`${c.usernames} user${c.usernames === 1 ? "" : "s"}`);
  if (c.regions != null) p.push(`${c.regions} region${c.regions === 1 ? "" : "s"}`);
  if (c.events != null) p.push(`${c.events} events`);
  if (c.window_min != null) p.push(`${c.window_min}m window`);
  return p.join(" · ");
}

function downloadJson(obj: any, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pct(x?: number | null): string {
  return x == null ? "—" : `${Math.round(x * 100)}%`;
}

// ── derive ────────────────────────────────────────────────────────────────────

function derive(events: Ev[]) {
  let scenario: string | undefined;
  let baseline: string | undefined;
  let currentSpl: string | undefined;
  let rationale: string | undefined;
  let baselineRecall: number | undefined;
  let finalRecall: number | undefined;
  let liveRecall: number | undefined;
  let totalVariants: number | undefined;
  let finalFp: boolean | undefined;
  let error: string | undefined;
  let frontier: any[] = [];
  let coverageMap: any[] = [];
  let certificate: any = null;
  let realAttack: any = null;
  let baselineSpl: string | undefined;
  let searchProvider: string | undefined;
  let searchesRun = 0;
  let syntheticIndex: string | undefined;
  let runId: string | undefined;
  let totalGenerations: number | undefined;
  const searchTrace: any[] = [];
  const searchAll: any[] = [];
  const gens = new Map<number, GenView>();
  const log: string[] = [];

  const G = (n: number): GenView => {
    if (!gens.has(n)) gens.set(n, { gen: n, evasions: [] });
    return gens.get(n)!;
  };

  for (const e of events) {
    switch (e.type) {
      case "arena_started":
        scenario = e.scenario;
        baseline = e.baseline;
        baselineSpl = e.baseline_spl;
        searchProvider = e.search_provider;
        syntheticIndex = e.synthetic_index;
        runId = e.run_id;
        totalGenerations = e.generations;
        log.push(`arena started — ${e.generations} generations`);
        break;
      case "search":
        searchesRun = e.n ?? searchesRun;
        searchProvider = e.provider ?? searchProvider;
        searchTrace.push({ n: e.n, provider: e.provider, spl: e.spl, rows: e.rows });
        searchAll.push({ n: e.n, provider: e.provider, spl: e.spl, rows: e.rows });
        break;
      case "variants_generated":
        G(e.generation).evasions = e.variants.map((x: any) => ({ ...x }));
        log.push(`gen ${e.generation}: Red generated ${e.variants.length} evasions`);
        break;
      case "generation_scored": {
        const g = G(e.generation);
        g.recallBefore = e.recall;
        liveRecall = e.recall;
        const byId = new Map(e.outcomes.map((o: any) => [o.id, o.detected]));
        g.evasions = g.evasions.map(x => ({ ...x, detected: !!byId.get(x.id) }));
        break;
      }
      case "blue_evolved":
        currentSpl = e.blue_spl;
        rationale = e.rationale;
        liveRecall = e.new_recall;
        G(e.generation).rationale = e.rationale;
        log.push(`gen ${e.generation} attempt ${e.attempt}: Blue evolved → recall ${pct(e.new_recall)}`);
        break;
      case "blue_attempt_rejected":
        log.push(`gen ${e.generation} attempt ${e.attempt}: rejected`);
        break;
      case "generation_complete": {
        const g = G(e.generation);
        g.recallBefore = e.recall_before;
        g.recallAfter = e.recall_after;
        liveRecall = e.recall_after;
        break;
      }
      case "converged":
        G(e.generation).converged = true;
        log.push(`gen ${e.generation}: converged`);
        break;
      case "arena_finished":
        baselineRecall = e.baseline_recall;
        finalRecall = e.final_recall;
        totalVariants = e.total_variants;
        finalFp = e.final_false_positive;
        frontier = e.frontier || [];
        coverageMap = e.coverage_map || [];
        certificate = e.certificate || null;
        realAttack = e.real_attack || null;
        baselineSpl = e.baseline_spl ?? baselineSpl;
        searchesRun = e.searches_run ?? searchesRun;
        searchProvider = e.search_provider ?? searchProvider;
        syntheticIndex = e.synthetic_index ?? syntheticIndex;
        runId = e.run_id ?? runId;
        log.push(`finished — baseline ${pct(e.baseline_recall)} → evolved ${pct(e.final_recall)}`);
        break;
      case "error":
        error = e.message;
        log.push(`error: ${e.message}`);
        break;
    }
  }

  return {
    scenario, baseline, currentSpl, rationale, baselineRecall, finalRecall, liveRecall,
    totalVariants, finalFp, error, frontier, coverageMap, certificate, realAttack,
    baselineSpl, searchProvider, searchesRun, syntheticIndex, runId, totalGenerations,
    searchTrace: searchTrace.slice(-14), searchAll,
    log: log.slice(-60),
    generations: [...gens.values()].sort((a, b) => a.gen - b.gen),
  };
}
