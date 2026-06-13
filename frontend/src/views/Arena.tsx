import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { startArena } from "../api/stream";
import { Badge, Button, Card, InfoTip, type BadgeVariant } from "../components/ui";

type Ev = Record<string, any>;

interface Evasion {
  id: string;
  name: string;
  evasion: string;
  detected?: boolean;
  description?: string;
  mitre?: string[];
  changed?: Record<string, any>;
  anomalyScore?: number;
  anomalySource?: string;
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
  const [runError, setRunError] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"rule" | "searches" | "log">("rule");
  const [learnMode, setLearnMode] = useState(false);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [scenarioKey, setScenarioKey] = useState<string>("");
  const abort = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const searchesRef = useRef<HTMLDivElement>(null);

  const v = useMemo(() => derive(events), [events]);

  useEffect(() => {
    fetch("/api/scenarios")
      .then(r => r.json())
      .then(s => { setScenarios(s); if (s[0]) setScenarioKey(s[0].key); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (rightTab === "log" && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [v.log, rightTab]);

  useEffect(() => {
    if (rightTab === "searches" && searchesRef.current) searchesRef.current.scrollTop = searchesRef.current.scrollHeight;
  }, [v.searchAll, rightTab]);

  async function run() {
    setEvents([]);
    setRunError(null);
    setRunning(true);
    abort.current = new AbortController();
    try {
      await startArena(
        { scenario: scenarioKey, generations: 3, variants_per_gen: 3, refine_attempts: 4, stop_on_converge: false },
        e => setEvents(p => [...p, e]),
        abort.current.signal,
      );
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (!msg.includes("abort") && !msg.includes("user aborted")) {
        setRunError(msg);
      }
    } finally {
      setRunning(false);
    }
  }

  const arenaStarted = v.baseline !== undefined;
  const totalGens = v.totalGenerations ?? 3;
  const completedGens = v.generations.filter(g => g.recallAfter != null).length;
  const done = v.certificate != null;

  return (
    <div className="min-h-full lg:h-full flex flex-col bg-ink">

      {/* ── Animated scan line ── */}
      <div className="h-0.5 overflow-hidden flex-shrink-0 bg-ink">
        {running && (
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent animate-scan" />
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="px-5 py-2.5 flex flex-wrap items-center gap-3 border-b border-edge bg-panel/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-white flex items-center gap-1 truncate">
            {v.scenario ?? "Adversarial Detection Evolution"}
            <InfoTip term="armsRace" direction="down" />
          </div>
          {v.baseline && (
            <div className="text-xs text-muted flex items-center gap-1">
              Baseline<InfoTip term="baseline" />:{" "}
              <span className="text-refute font-semibold">{v.baseline}</span>
            </div>
          )}
        </div>

        {(v.error || runError) && (
          <div className="text-refute text-xs bg-refute-lo/30 border border-refute/30 rounded-lg px-2.5 py-1 max-w-[200px] sm:max-w-sm truncate" title={runError ?? v.error}>
            {runError ?? v.error}
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted flex items-center gap-0.5 whitespace-nowrap">
            Scenario<InfoTip term="scenario" direction="down" />
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

        <button
          type="button"
          onClick={() => setLearnMode(lm => !lm)}
          title={learnMode ? "Hide plain-English explanations" : "Show plain-English explanations for each panel"}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 whitespace-nowrap
            ${learnMode
              ? "text-support border-support/40 bg-support-lo/30"
              : "text-muted border-edge hover:text-muted-hi hover:border-edge-hi"
            }`}
        >
          {learnMode ? "Learning" : "Learn"}
        </button>

        <Button onClick={run} disabled={running} loading={running}>
          {running ? "Evolving…" : "▶ Run the Arena"}
        </Button>
      </div>

      {/* ── Run tracker ── */}
      {arenaStarted && (
        <RunTracker completedGens={completedGens} totalGens={totalGens} done={done} running={running} />
      )}

      {/* ── Main grid ── */}
      <div className="flex-1 grid lg:grid-cols-3 gap-0 lg:min-h-0 lg:overflow-hidden max-w-[1800px] mx-auto w-full">

        {/* ── Left panel ── */}
        <div className="lg:col-span-2 lg:overflow-auto p-5 space-y-4">

          <AnimatePresence>
            {(v.baselineRecall != null || v.liveRecall != null) && !v.certificate && (
              <motion.div key="headline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Headline v={v} />
              </motion.div>
            )}
          </AnimatePresence>

          {v.certificate && <Certificate cert={v.certificate} v={v} />}
          {v.certificate && <NarrativeSummary v={v} />}

          {v.generations.length === 0 && !running && <EmptyState />}

          {running && (
            <AgentFlow activeAgent={v.activeAgent} searchesRun={v.searchesRun} />
          )}

          {running && learnMode && (
            <LearnNote>
              Three AI players take turns: <strong>Red AI</strong> invents attack variants targeting
              your detection's weaknesses. <strong>Splunk</strong> runs those variants through the
              real detection query - live. <strong>Blue AI</strong> studies what slipped through and
              rewrites the SPL rule. Then Red attacks again with the harder rule.
            </LearnNote>
          )}

          {running && v.searchAll.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-6 text-center"
            >
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping opacity-60 flex-shrink-0" />
                Connecting to Splunk MCP and measuring baseline…
              </div>
              <div className="text-xs text-muted/40 max-w-xs leading-relaxed">
                The backend is running your first live Splunk search to establish a baseline detection score. This takes 20–60 seconds.
              </div>
            </motion.div>
          )}

          {running && v.searchAll.length > 0 && (
            <>
              <LiveMCPFeed searches={v.searchAll} provider={v.searchProvider} />
              {learnMode && (
                <LearnNote>
                  Each row here is a real Splunk search ARGUS just ran through the MCP Server.
                  "Rows" = events that matched. <strong>Zero rows means the detection missed the
                  attack</strong> - that's exactly what Blue studies to write a better rule.
                  These aren't simulated queries; they run against your actual Splunk data.
                </LearnNote>
              )}
            </>
          )}

          {v.generations.map(g => (
            <GenerationCard
              key={g.gen}
              g={g}
              defaultExpanded={!!v.certificate}
              frontierNames={v.certificate ? new Set((v.frontier || []).map((f: any) => f.name)) : undefined}
            />
          ))}
          {learnMode && v.generations.length > 0 && (
            <LearnNote>
              Each card above is one round of the arms race. Red invented evasions → Splunk scored
              them live → Blue rewrote the detection. <strong>Click a card</strong> to see which
              evasion variants Red tried, which ones Blue caught, and the plain-English rationale
              for the rule change. Later generations attack the <em>evolved</em> rule - harder every round.
              The <strong>anomaly %</strong> badge is a separate signal: a Splunk-trained model
              ({v.scorerBackend?.replace(/-/g, " ") || "baseline model"}) scores how unusual each
              variant's behavior is compared to real traffic - high anomaly + "evaded" means a
              detection gap on genuinely weird behavior, the highest-priority kind.
            </LearnNote>
          )}

          {v.frontier.length > 0 && (
            <>
              <FrontierPanel frontier={v.frontier} />
              {learnMode && (
                <LearnNote>
                  The frontier is your <strong>real residual risk</strong> - attack variants that
                  survived every generation of evolution. The evolved rule is genuinely better, but
                  these show where it still has blind spots. Unlike generic scanner findings, these
                  are calibrated to your actual Splunk data and your real detection rule.
                </LearnNote>
              )}
            </>
          )}

          {v.coverageMap.length > 0 && (
            <>
              <CoverageMap rows={v.coverageMap} />
              {learnMode && (
                <LearnNote>
                  <strong>MITRE ATT&CK</strong> is a public framework cataloging real attacker
                  techniques. T1496 = Resource Hijacking (cryptomining); T1078 = Valid Accounts
                  (stolen credentials). The bars show how many attack variants using each technique
                  your evolved rule now catches - grey is baseline, blue is after ARGUS hardened it.
                </LearnNote>
              )}
            </>
          )}

          {v.certificate && <ProofPanel v={v} />}
          {v.certificate && learnMode && (
            <LearnNote>
              The Proof panel above is the judge's table - every measurable fact from this run in
              one place. The <strong>Resilience Certificate</strong> above is downloadable proof:
              its SHA-256 fingerprint uniquely identifies this exact run and its data inputs. Share
              it with leadership to show detection hardening happened, with evidence not assertions.
            </LearnNote>
          )}
        </div>

        {/* ── Right panel ── */}
        <div className="border-t lg:border-t-0 lg:border-l border-edge flex flex-col lg:min-h-0 lg:overflow-hidden">

          {/* Tab bar */}
          <div className="flex flex-shrink-0 border-b border-edge bg-panel-lo">
            <RightTab active={rightTab === "rule"} onClick={() => setRightTab("rule")}>Rule</RightTab>
            <TabWithTip
              active={rightTab === "searches"}
              onClick={() => setRightTab("searches")}
              label={`Searches${v.searchesRun > 0 ? ` · ${v.searchesRun}` : ""}`}
              tipName="Live Splunk searches"
              tipText="Every query ARGUS ran against Splunk this run - provider (MCP or SDK), row count, and the exact SPL. 'Rows' shows whether the detection fired on that query. Download the JSON receipt to audit every search offline."
            />
            <TabWithTip
              active={rightTab === "log"}
              onClick={() => setRightTab("log")}
              label="Log"
              tipName="Agent log"
              tipText="Step-by-step AI decision trail. 'rejected' = Blue proposed a new detection rule but recall didn't improve - Blue tries up to 4 times per round, so rejected attempts are normal. 'Blue evolved → recall X%' = an improvement was accepted. The final line shows overall baseline → evolved coverage."
            />
          </div>

          {/* Rule tab */}
          {rightTab === "rule" && (
            <div className="flex-1 lg:overflow-auto lg:min-h-0 px-4 py-4 space-y-4">
              {v.baselineSpl ? (
                <>
                  <div>
                    <div className="text-[11px] text-refute font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      Baseline rule <InfoTip term="spl" />
                    </div>
                    <pre className="text-[11px] leading-relaxed text-muted whitespace-pre-wrap bg-ink rounded-lg p-2.5 border border-edge/60">
                      {v.baselineSpl}
                    </pre>
                  </div>
                  <div>
                    <div className="text-[11px] text-support font-semibold uppercase tracking-wide mb-1.5">
                      Evolved rule {v.currentSpl ? "(live)" : ""}
                    </div>
                    <EvolvedSpl baseline={v.baselineSpl} evolved={v.currentSpl} />
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted/60 italic">
                  Detection rule appears once the run starts.
                </div>
              )}
              {learnMode && v.currentSpl && (
                <LearnNote>
                  <strong>Blue-highlighted lines</strong> show what Blue AI added or changed. These targeted
                  changes came from studying the real shapes of missed attacks - not generic
                  improvements, but changes calibrated to the specific evasion patterns Red
                  discovered in your Splunk data.
                </LearnNote>
              )}
              {v.rationale && (
                <div className="text-sm bg-support-lo/20 border border-support/20 rounded-lg p-3.5">
                  <div className="flex items-center gap-1 mb-1.5">
                    <span className="text-support font-semibold">Why it improved</span>
                    <InfoTip term="rationale" />
                  </div>
                  <p className="text-muted-hi leading-relaxed">{v.rationale}</p>
                </div>
              )}
              {v.currentSpl && <ApprovalControls spl={v.currentSpl} runId={v.runId} scenario={v.scenario} />}
              {learnMode && v.currentSpl && (
                <LearnNote>
                  <strong>Human-in-the-loop:</strong> security teams don't auto-deploy AI-generated
                  rules. Approve keeps the evolved rule, Edit lets you tweak the SPL directly,
                  Reject discards it. Nothing deploys without human review - this is intentional.
                  Checking "Deploy" creates the rule as a <strong>disabled</strong> saved search in
                  Splunk via the SDK; a second human action inside Splunk is needed to enable it.
                </LearnNote>
              )}
              {v.certificate && (
                <div className="pt-1">
                  <div className="text-[11px] text-muted uppercase tracking-wide mb-2 flex items-center gap-1">
                    Certificate <InfoTip term="certificate" />
                  </div>
                  <CertMini cert={v.certificate} />
                </div>
              )}
            </div>
          )}

          {/* Searches tab */}
          {rightTab === "searches" && (
            <div className="flex-1 lg:overflow-auto lg:min-h-0 px-4 py-4 space-y-3">
              {v.searchAll.length === 0 ? (
                <div className="text-xs text-muted/40 italic">No searches yet. Start a run first.</div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-hi flex items-center gap-1">
                      <span className="font-semibold text-white">{v.searchesRun}</span> live searches
                      <InfoTip
                        name="Live Splunk searches"
                        text="Every detection run and evidence query executes live against Splunk through the MCP server. This list is proof that Splunk is load-bearing - not decorative."
                      />
                    </span>
                    {v.searchAll.length > 0 && (
                      <button
                        onClick={() => downloadJson(
                          { run_id: v.runId, provider: v.searchProvider, total_searches: v.searchesRun, generated_at: new Date().toISOString(), searches: v.searchAll },
                          `argus-search-receipt-${v.runId ?? "run"}.json`,
                        )}
                        className="text-[11px] px-2 py-0.5 rounded border border-edge hover:text-white hover:border-edge-hi transition-colors"
                      >
                        ↓ receipt
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted/50 px-1 pb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm border-l-2 border-accent bg-accent-lo/20" />
                      tests a Red-generated variant
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-support font-mono font-semibold px-1 rounded bg-support/10">N</span>
                      rows returned = rule fired
                    </span>
                    <span className="ml-auto">click a row to expand</span>
                  </div>
                  <div ref={searchesRef} className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
                    {v.searchAll.map((s: any, i: number) => (
                      <SearchRow key={i} s={s} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Log tab */}
          {rightTab === "log" && (
            <div ref={logRef} className="flex-1 lg:overflow-auto lg:min-h-0 px-4 py-2 space-y-0.5">
              {v.log.length === 0 ? (
                <div className="text-xs text-muted/40 italic">Waiting for run to start…</div>
              ) : (
                v.log.map((l, i) => {
                  const genStart = l.match(/^gen (\d+): Red generated/);
                  const cls = l.startsWith("finished") ? "text-accent font-semibold"
                    : l.startsWith("error") ? "text-refute font-semibold"
                    : l.includes("Blue evolved") ? "text-support font-medium"
                    : l.includes("rejected") ? "text-muted/40"
                    : l.includes("Red generated") ? "text-refute/75"
                    : l.includes("converged") ? "text-accent/80"
                    : /^(arena started|anomaly scorer)/.test(l) ? "text-muted/60"
                    : "text-muted";
                  return (
                    <div key={i}>
                      {genStart && (
                        <div className={`flex items-center gap-2 ${i === 0 ? "" : "mt-2.5"} mb-1`}>
                          <div className="flex-1 h-px bg-edge" />
                          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted/50">
                            Generation {genStart[1]}
                          </span>
                          <div className="flex-1 h-px bg-edge" />
                        </div>
                      )}
                      <div className={`text-xs font-mono leading-relaxed ${cls}`}>
                        <span className="text-muted/25 mr-1.5 select-none">{String(i + 1).padStart(2, "0")}</span>
                        {l}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
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
      <div className="flex items-center overflow-x-auto">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center">
            {i > 0 && (
              <div className={`h-px w-5 sm:w-14 transition-colors duration-500 ${s.done ? "bg-support/50" : "bg-edge"}`} />
            )}
            <div className="flex flex-col items-center gap-0.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-300
                ${s.done
                  ? "bg-support/20 border-support/50 text-support"
                  : i === activeIndex && running
                  ? "bg-accent/20 border-accent/50 text-accent animate-pulse"
                  : "bg-edge/30 border-edge text-muted/40"
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-[10px] whitespace-nowrap transition-colors duration-300
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
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 py-6">
        <AgentBadge icon="R" label="Red AI" color="refute" sub="synthesizes evasions" />
        <FlowConnector tone="refute" label="vs" />
        <AgentBadge icon="S" label="Splunk" color="neutral" sub="scores live" />
        <FlowConnector tone="support" label="→" />
        <AgentBadge icon="B" label="Blue AI" color="support" sub="evolves defenses" />
      </div>

      <Card variant="subtle">
        <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          How to run the Arena
          <InfoTip term="armsRace" />
        </div>
        <ol className="space-y-3">
          {GUIDE_STEPS.map((step, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 border
                ${i === 0 ? "bg-accent/15 text-accent border-accent/30"
                  : i === 1 ? "bg-refute-lo/40 text-refute border-refute/30"
                  : "bg-support-lo/40 text-support border-support/30"
                }`}
              >
                {i + 1}
              </span>
              <div>
                <div className="text-base text-white font-medium">{step.title}</div>
                <div className="text-sm text-muted mt-0.5 leading-relaxed">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 pt-3 border-t border-edge text-sm text-muted flex items-center gap-1">
          Everything computed live on real Splunk data - nothing faked.
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
  const glow: Record<string, string> = {
    refute:  "rgb(var(--c-refute) / 0.18)",
    neutral: "transparent",
    support: "rgb(var(--c-support) / 0.18)",
  };
  return (
    <div className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border ${cls[color]}`}>
      <span className="relative w-9 h-9 flex items-center justify-center text-base font-bold" aria-hidden>
        <span className="absolute inset-0 rounded-full animate-pulse" style={{ boxShadow: `0 0 0 6px ${glow[color]}` }} />
        <span className="relative">{icon}</span>
      </span>
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[11px] text-muted text-center">{sub}</span>
    </div>
  );
}

function FlowConnector({ tone, label }: { tone: "refute" | "support"; label: string }) {
  const color = tone === "refute" ? "rgb(var(--c-refute) / 0.7)" : "rgb(var(--c-support) / 0.7)";
  const line = (delay?: string) => (
    <div className="relative w-6 sm:w-9 h-px bg-edge overflow-hidden">
      <div
        className="absolute inset-y-0 w-1/3 animate-scan"
        style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)`, animationDelay: delay }}
        aria-hidden
      />
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      {line()}
      <span className="text-[10px] text-muted/40 select-none">{label}</span>
      {line("0.4s")}
    </div>
  );
}

const GUIDE_STEPS = [
  {
    title: "Choose a scenario and press Run",
    body: "Select an attack scenario - cryptomining or IAM abuse - then click ▶ Run the Arena in the toolbar.",
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

// ── AgentFlow ─────────────────────────────────────────────────────────────────

const AGENT_PHASES: Record<string, { agent: "red" | "splunk" | "blue"; label: string }> = {
  red:    { agent: "red",    label: "generating evasions…" },
  splunk: { agent: "splunk", label: "scoring detections live…" },
  blue:   { agent: "blue",   label: "evolving defense…" },
};

function AgentFlow({ activeAgent, searchesRun }: {
  activeAgent: "red" | "splunk" | "blue" | null;
  searchesRun: number;
}) {
  const phase = activeAgent ? AGENT_PHASES[activeAgent] : null;

  const agents: { id: "red" | "splunk" | "blue"; icon: string; label: string; color: string; activeColor: string }[] = [
    { id: "red",    icon: "R", label: "Red AI",  color: "border-refute/25 bg-refute-lo/20 text-refute",   activeColor: "border-refute/60 bg-refute-lo/40 text-refute shadow-[0_0_20px_rgba(245,158,11,0.25)]" },
    { id: "splunk", icon: "S", label: "Splunk",  color: "border-edge-hi bg-edge/30 text-muted-hi",        activeColor: "border-support/50 bg-support-lo/30 text-support shadow-[0_0_20px_rgba(59,130,246,0.25)]" },
    { id: "blue",   icon: "B", label: "Blue AI", color: "border-support/25 bg-support-lo/20 text-support", activeColor: "border-accent/50 bg-accent-lo/30 text-accent shadow-[0_0_20px_rgba(139,92,246,0.25)]" },
  ];

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {agents.map((a, i) => {
          const isActive = activeAgent === a.id;
          return (
            <div key={a.id} className="flex items-center gap-3">
              {i > 0 && (
                <div className="flex flex-col items-center gap-1">
                  <motion.div
                    className="w-8 h-px bg-edge"
                    animate={{ backgroundColor: isActive || activeAgent === agents[i - 1].id ? "#3b82f6" : "#1e2d45" }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              )}
              <motion.div
                animate={{
                  scale: isActive ? 1.06 : 1,
                  transition: { type: "spring", stiffness: 300, damping: 20 },
                }}
                className={`flex flex-col items-center gap-1.5 px-5 py-3 rounded-xl border transition-all duration-300 ${isActive ? a.activeColor : a.color}`}
              >
                <span className="text-base font-bold" aria-hidden>{a.icon}</span>
                <span className="text-sm font-semibold">{a.label}</span>
                {isActive && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[10px] text-current/70 whitespace-nowrap"
                  >
                    {phase?.label}
                  </motion.span>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>
      {searchesRun > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-support animate-ping opacity-60" />
          {searchesRun} live Splunk search{searchesRun !== 1 ? "es" : ""} executed
        </div>
      )}
    </div>
  );
}

// ── LiveMCPFeed ───────────────────────────────────────────────────────────────

function LiveMCPFeed({ searches, provider }: {
  searches: any[];
  provider?: string;
}) {
  const visible = searches.slice(-10);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [searches.length]);

  return (
    <div className="rounded-xl border border-edge bg-panel-lo overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-edge bg-ink/40">
        <span className="relative flex-shrink-0">
          <span className="absolute inset-0 w-2 h-2 rounded-full bg-support animate-ping opacity-50" />
          <span className="relative block w-2 h-2 rounded-full bg-support" />
        </span>
        <span className="text-xs font-semibold text-white uppercase tracking-wide">Live Splunk MCP Feed</span>
        <span className="text-[11px] text-muted ml-1">via {provider ?? "splunk-mcp"}</span>
        <span className="ml-auto text-[11px] text-muted tabular-nums">{searches.length} calls</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-edge/40">
        <span className="text-[10px] text-muted/50 uppercase tracking-widest w-32 flex-shrink-0">Tool</span>
        <span className="text-[10px] text-muted/50 uppercase tracking-widest w-8 text-right flex-shrink-0">Rows</span>
        <span className="text-[10px] text-muted/50 uppercase tracking-widest flex-1">SPL query</span>
      </div>

      {/* Entries */}
      <div ref={feedRef} className="divide-y divide-edge/30 max-h-52 overflow-auto">
        <AnimatePresence initial={false}>
          {visible.map((s: any, i: number) => (
            <motion.div
              key={`${s.n}-${i}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex items-start gap-3 px-4 py-2 font-mono text-xs ${i === visible.length - 1 ? "bg-support/5" : ""}`}
            >
              <span className="text-accent/80 flex-shrink-0 w-32 truncate" title="splunk_run_query">
                splunk_run_query
              </span>
              <span className={`tabular-nums w-8 text-right flex-shrink-0 ${s.rows > 0 ? "text-support" : "text-muted/40"}`}>
                {s.rows}
              </span>
              <span className="text-muted whitespace-pre-wrap break-all flex-1 min-w-0">{s.spl}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

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
          <div className="text-[11px] text-muted uppercase tracking-widest mb-1 flex items-center gap-0.5">
            Coverage<InfoTip term="recall" />
          </div>
          <div className="text-4xl font-bold tabular-nums leading-none">
            <span className="text-refute">{pct(base)}</span>
            <span className="text-muted/40 mx-2 font-light">→</span>
            <span className="text-support">{pct(fin)}</span>
          </div>
          {gain != null && (
            <div className="text-sm text-muted mt-1.5">
              +{gain}pp gain
            </div>
          )}
        </div>
        <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 flex-1">
          {v.totalVariants != null && <StatMini label="Variants tested" value={String(v.totalVariants)} />}
          <StatMini label="False positives" value={v.finalFp == null ? "-" : v.finalFp ? "present" : "0"}
            tone={v.finalFp == null ? "default" : v.finalFp ? "bad" : "good"} />
          {v.searchesRun > 0 && <StatMini label="Live searches" value={String(v.searchesRun)} />}
          {v.realAttack && (
            <StatMini label="Real attack" value={v.realAttack.final_caught ? "caught" : "missed"}
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
      <div className="text-[11px] text-muted uppercase tracking-wide">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

// ── GenerationCard ────────────────────────────────────────────────────────────

function GenerationCard({ g, defaultExpanded, frontierNames }: { g: GenView; defaultExpanded?: boolean; frontierNames?: Set<string> }) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const gain = g.recallAfter != null && g.recallBefore != null
    ? Math.round((g.recallAfter - g.recallBefore) * 100) : null;

  // Once the run finishes (certificate issued), reveal each round's "Blue learned"
  // rationale by default - it's the strongest evidence of the AI's reasoning.
  useEffect(() => {
    if (defaultExpanded) setExpanded(true);
  }, [defaultExpanded]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-panel border border-edge rounded-xl overflow-hidden"
    >
      {/* Clickable header - always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(e => !e)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(o => !o); } }}
        aria-expanded={expanded}
        className={`px-4 py-3 flex items-center gap-3 flex-wrap cursor-pointer select-none hover:bg-edge/15 transition-colors duration-150 ${expanded ? "border-b border-edge/60" : ""}`}
      >
        <div className="w-6 h-6 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
          {g.gen + 1}
        </div>
        <span className="text-base font-semibold text-white">Generation {g.gen + 1}</span>
        {g.converged && <Badge variant="good">converged</Badge>}
        <div className="ml-auto flex items-center gap-2 text-base font-semibold tabular-nums">
          {g.recallBefore != null && <span className="text-refute">{pct(g.recallBefore)}</span>}
          {g.recallBefore != null && g.recallAfter != null && <span className="text-muted/40 font-light">→</span>}
          {g.recallAfter != null && <span className="text-support">{pct(g.recallAfter)}</span>}
          {gain != null && gain > 0 && <Badge variant="good">+{gain}pp</Badge>}
          <span
            aria-hidden
            className="text-muted/40 text-xs leading-none"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.2s ease" }}
          >
            ▾
          </span>
        </div>
      </div>

      {/* Progress bar - always visible once scored */}
      {g.recallAfter != null && (
        <div className="h-0.5 bg-panel-lo relative overflow-hidden">
          <div className="absolute h-full bg-edge" style={{ width: `${(g.recallBefore ?? 0) * 100}%` }} />
          <motion.div
            className="absolute h-full bg-support"
            initial={{ width: 0 }}
            animate={{ width: `${(g.recallAfter ?? 0) * 100}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        </div>
      )}

      {/* Collapsible body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-4 pt-3 pb-1 space-y-2">
              <div className="text-[11px] text-muted uppercase tracking-wide mb-1 flex items-center gap-1">
                {g.evasions.length} evasion{g.evasions.length !== 1 ? "s" : ""}
                <InfoTip term="evasion" />
              </div>
              {g.evasions.map(e => {
                // If the run is finished, override per-generation detected status with the
                // final rule's outcome: anything NOT in the residual frontier was caught.
                const finalDetected = frontierNames !== undefined
                  ? !frontierNames.has(e.name)
                  : e.detected;
                return (
                <div
                  key={e.id}
                  className={`pl-3 border-l-2 rounded-r py-1.5 transition-colors
                    ${finalDetected === undefined
                      ? "border-edge"
                      : finalDetected
                      ? "border-support bg-support/5"
                      : "border-refute bg-refute/5"
                    }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {finalDetected !== undefined && (
                      <span className={`text-[11px] font-semibold ${finalDetected ? "text-support" : "text-refute"}`}>
                        {finalDetected ? "caught" : "evaded"}
                      </span>
                    )}
                    <span className="text-sm font-medium text-white">{e.name}</span>
                    {(e.mitre || []).map(m => <Badge key={m} variant="neutral">{m}</Badge>)}
                    {e.anomalyScore !== undefined && <AnomalyBadge score={e.anomalyScore} source={e.anomalySource} />}
                  </div>
                  {e.description && (
                    <div className="text-xs text-muted mt-0.5">why missed: {e.description}</div>
                  )}
                  {e.changed && (
                    <div className="text-[11px] text-muted/60 font-mono mt-0.5">{summarizeChanged(e.changed)}</div>
                  )}
                </div>
                );
              })}
            </div>

            {g.rationale && (
              <div className="px-4 pb-4 pt-2">
                <div className="bg-support-lo/20 rounded-lg px-3.5 py-3 border border-support/15">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[11px] text-support font-semibold uppercase tracking-wide">Blue learned</span>
                    <InfoTip term="rationale" />
                  </div>
                  <p className="text-sm text-muted-hi leading-relaxed">{g.rationale}</p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── FrontierPanel ─────────────────────────────────────────────────────────────

function FrontierPanel({ frontier }: { frontier: any[] }) {
  return (
    <Card variant="warn">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-refute font-semibold text-base">
          Residual frontier - {frontier.length} evasion{frontier.length !== 1 ? "s" : ""} still uncaught
        </span>
        <InfoTip term="frontier" />
      </div>
      <p className="text-sm text-muted mb-3 leading-relaxed">
        Real blind spots ARGUS surfaced that even the hardened rule misses - prioritize these in your next sprint.
      </p>
      <div className="flex flex-wrap gap-2">
        {frontier.map((o: any, i: number) => (
          <span key={i} title={o.evasion} className="inline-flex items-center gap-1">
            <Badge variant="bad">{o.name}</Badge>
            {o.anomaly_score !== undefined && <AnomalyBadge score={o.anomaly_score} source={o.anomaly_source} />}
          </span>
        ))}
      </div>
    </Card>
  );
}

// ── Certificate (main, left panel) ───────────────────────────────────────────

function Certificate({ cert, v }: { cert: any; v: ReturnType<typeof derive> }) {
  const download = () => downloadJson(cert, `${cert.id}.json`);
  const [exporting, setExporting] = useState(false);
  const [appinspect, setAppinspect] = useState<AppinspectResult | null>(null);
  const exportApp = async () => {
    setExporting(true);
    try {
      const result = await exportSplunkApp(v);
      setAppinspect(result);
    } catch (err: any) {
      alert(err?.message ?? String(err));
    } finally {
      setExporting(false);
    }
  };
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
        <div className="flex items-start justify-between mb-5 gap-2 flex-wrap">
          <div>
            <div className="text-[11px] text-accent/70 font-bold uppercase tracking-[0.14em] mb-1 flex items-center gap-1">
              Resilience Certificate<InfoTip term="certificate" />
            </div>
            <div className="text-xs font-mono text-muted">{cert.id}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={exportApp} loading={exporting} title="Download the evolved detection as an installable Splunk app (.spl) - disabled saved search + README + this certificate, validated with Splunk AppInspect">
              Export Splunk App
            </Button>
            {appinspect && <AppinspectBadge result={appinspect} />}
            <Button variant="ghost" onClick={download}>
              ↓ Download JSON
            </Button>
          </div>
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
            { label: "Live searches",        value: v.searchesRun > 0 ? String(v.searchesRun) : "-", tone: "default" },
            { label: "Real attack",          value: v.realAttack ? (v.realAttack.final_caught ? "caught" : "missed") : "-",
              tone: v.realAttack ? (v.realAttack.final_caught ? "good" : "bad") : "default" },
          ].map(s => (
            <div key={s.label} className="bg-ink/60 rounded-lg p-2.5 border border-accent/10">
              <div className="text-[11px] text-muted uppercase tracking-wide">{s.label}</div>
              <div className={`text-base font-semibold mt-0.5
                ${s.tone === "bad" ? "text-refute" : s.tone === "good" ? "text-support" : "text-white"}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-ink/50 rounded-lg px-3 py-2 border border-accent/10 font-mono text-[11px] text-muted/60 break-all">
          SHA-256: {cert.fingerprint}
        </div>
        <div className="text-[11px] text-muted/60 mt-1.5">issued {cert.issued_at}</div>
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
          className="text-[11px] px-2 py-0.5 rounded border border-edge hover:text-white hover:border-edge-hi transition-colors ml-2 whitespace-nowrap"
        >
          ↓ JSON
        </button>
      </div>
      <div className="text-base font-semibold">
        <span className="text-refute">{pct(cert.baseline_recall)}</span>
        <span className="text-muted/40 mx-1.5 font-light">→</span>
        <span className="text-support">{pct(cert.final_recall)}</span>
        <span className="text-muted text-xs font-normal ml-2">{cert.total_variants} variants</span>
      </div>
      <div className="text-[10px] text-muted/40 font-mono mt-0.5">
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
    ["Variants tested",  String(v.totalVariants ?? "-"),                       "default"],
    ["Real attack",      v.realAttack ? (v.realAttack.final_caught ? "caught" : "missed") : "-",
      v.realAttack?.final_caught ? "good" : v.realAttack ? "bad" : "default"],
    ["Live searches",    `${v.searchesRun} via ${v.searchProvider ?? "-"}`,    "default"],
    ["Anomaly model",    (v.certificate?.anomaly_scorer_backend ?? v.scorerBackend ?? "-").replace(/-/g, " "), "default"],
    ["Synthetic index",  v.syntheticIndex ?? "-",                              "default"],
    ["Run ID",           v.runId ?? "-",                                       "default"],
    ["SHA-256",          v.certificate ? `${String(v.certificate.fingerprint).slice(0, 20)}…` : "-", "default"],
  ];
  return (
    <Card variant="elevated">
      <div className="text-base font-semibold text-white mb-3">Judge proof - every number computed live</div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0">
        {rows.map(([k, val, tone], i) => (
          <div key={i} className="flex justify-between text-sm border-b border-edge/30 py-1.5 last:border-0">
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
      <div className="text-xs text-muted/60 italic bg-ink rounded-lg px-2.5 py-2 border border-edge/60">
        Evolves once the run starts…
      </div>
    );
  }
  const baseSet = new Set((baseline || "").split("\n").map(l => l.trim()).filter(Boolean));
  return (
    <pre className="text-[11px] leading-relaxed whitespace-pre-wrap bg-ink rounded-lg p-2.5 border border-edge/60">
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

function ApprovalControls({ spl, runId, scenario }: { spl: string; runId?: string; scenario?: string }) {
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(spl);
  const [deploy, setDeploy] = useState(false);
  const [deployResult, setDeployResult] = useState<any>(null);

  async function decide(decision: string, body: any = {}) {
    setStatus("pending");
    setDeployResult(null);
    try {
      const res = await fetch("/api/approval", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, run_id: runId, scenario, ...body }),
      });
      const data = await res.json();
      setDeployResult(data);
      setStatus(decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "saved");
    } catch { setStatus("error"); }
  }

  const statusLabel: Record<string, string> = {
    pending: "…", approved: "Approved", rejected: "Rejected", saved: "Edit saved", error: "Error",
  };

  return (
    <div className="border border-edge rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 border-b border-edge bg-panel-lo">
        <div className="text-[11px] text-muted uppercase tracking-wide">Human review</div>
      </div>
      <div className="p-2.5 space-y-2">
        {!editing ? (
          <>
            <div className="flex gap-2 items-center flex-wrap">
              <Button variant="ghost" onClick={() => decide("approve", { spl, deploy })}
                className="text-sm py-1 !border-support/30 !text-support hover:!bg-support-lo/30">
                Approve
              </Button>
              <Button variant="ghost" onClick={() => setEditing(true)} className="text-sm py-1">
                Edit
              </Button>
              <Button variant="danger" onClick={() => decide("reject")} className="text-sm py-1">
                Reject
              </Button>
              {status && (
                <span className={`text-sm ${status === "error" ? "text-refute" : "text-muted"}`}>
                  {statusLabel[status]}
                </span>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none">
              <input type="checkbox" checked={deploy} onChange={e => setDeploy(e.target.checked)} className="accent-accent" />
              Deploy as disabled saved search (SDK)
              <InfoTip name="Deploy as saved search" text="On Approve, creates a real Splunk saved search via the Python SDK - shipped disabled=1, so it never runs on its own. A second human action inside Splunk is required to enable it. ARGUS then calls splunk_run_saved_search (MCP) once to confirm it really exists." />
            </label>
            {deployResult?.deployed && (
              <div className="text-xs text-support">
                Created Splunk saved search <span className="font-mono">{deployResult.saved_search?.name}</span> (disabled)
                {deployResult.mcp_verification?.ok && " - verified live via splunk_run_saved_search (MCP)"}
              </div>
            )}
            {deployResult?.deploy_error && (
              <div className="text-xs text-refute">Deploy failed: {deployResult.deploy_error}</div>
            )}
          </>
        ) : (
          <div>
            <textarea
              value={edited}
              onChange={e => setEdited(e.target.value)}
              className="w-full h-24 text-xs font-mono bg-ink border border-edge rounded p-2 text-muted-hi resize-y focus:border-accent focus:outline-none transition-colors"
            />
            <div className="flex gap-2 mt-1.5">
              <Button onClick={() => { decide("edit", { spl: edited }); setEditing(false); }} className="text-sm py-1">
                Save edit
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} className="text-sm py-1">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SearchRow ─────────────────────────────────────────────────────────────────

/** One live-search entry. Click to expand the full SPL (wrapped, selectable). */
function SearchRow({ s }: { s: any }) {
  const [open, setOpen] = useState(false);
  const rows = s.rows ?? 0;
  const isVariantTest = (s.spl ?? "").includes("argus_sandbox");
  return (
    <div
      onClick={() => setOpen(o => !o)}
      className={`flex gap-2 text-[11px] py-1 px-2 rounded-md border-l-2 cursor-pointer transition-colors hover:bg-edge/30
        ${open ? "items-start" : "items-baseline"}
        ${isVariantTest ? "border-accent bg-accent-lo/10" : "border-edge/60"}`}
    >
      <span className="text-muted/40 flex-shrink-0 select-none w-2.5">{open ? "▾" : "▸"}</span>
      <span className="text-accent/70 font-mono flex-shrink-0">{s.provider ?? "mcp"}</span>
      <span className={`flex-shrink-0 tabular-nums rounded px-1.5 py-px font-mono font-semibold
        ${rows === 0 ? "text-refute/60 bg-refute/5" : "text-support bg-support/10"}`}>
        {rows}r
      </span>
      <span className={`text-muted font-mono leading-relaxed ${open ? "whitespace-pre-wrap break-all" : "truncate"}`}>
        {s.spl}
      </span>
    </div>
  );
}

// ── RightTab ──────────────────────────────────────────────────────────────────

function RightTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 text-sm font-medium transition-all duration-150 border-b-2 select-none
        ${active
          ? "text-accent border-accent bg-accent-lo/20"
          : "text-muted hover:text-muted-hi border-transparent hover:bg-edge/30"
        }`}
    >
      {children}
    </button>
  );
}

// ── TabWithTip - tab + ⓘ as siblings (avoids nested <button>) ────────────────

function TabWithTip({ active, onClick, label, tipName, tipText }: {
  active: boolean; onClick: () => void; label: string; tipName: string; tipText: string;
}) {
  return (
    <div className={`flex-1 flex items-center justify-center border-b-2 transition-all duration-150
      ${active ? "border-accent bg-accent-lo/20" : "border-transparent hover:bg-edge/30"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`py-2 text-sm font-medium select-none transition-colors duration-150
          ${active ? "text-accent" : "text-muted hover:text-muted-hi"}`}
      >
        {label}
      </button>
      <InfoTip name={tipName} text={tipText} direction="down" />
    </div>
  );
}

// ── LearnNote ─────────────────────────────────────────────────────────────────

function LearnNote({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5 text-sm bg-support-lo/15 border border-support/20 rounded-lg px-3 py-2.5 text-muted-hi leading-relaxed"
    >
      <span className="text-support font-bold text-[10px] uppercase tracking-wide flex-shrink-0 mt-0.5 select-none">Learn</span>
      <span>{children}</span>
    </motion.div>
  );
}

// ── NarrativeSummary ──────────────────────────────────────────────────────────

function NarrativeSummary({ v }: { v: ReturnType<typeof derive> }) {
  const cert = v.certificate;
  if (!cert) return null;
  const gain = Math.round(((cert.final_recall ?? 0) - (cert.baseline_recall ?? 0)) * 100);
  const gens = v.totalGenerations ?? 3;
  return (
    <div className="rounded-xl bg-panel border border-edge px-5 py-4 text-base text-muted-hi leading-relaxed space-y-2.5">
      <p>
        ARGUS ran{" "}
        <span className="text-white font-medium">{gens} generation{gens !== 1 ? "s" : ""}</span> of AI vs AI,
        {" "}testing{" "}
        <span className="text-white font-medium">{cert.total_variants} attack variants</span>{" "}
        against real Splunk data. Detection coverage improved from{" "}
        <span className="text-refute font-semibold">{pct(cert.baseline_recall)}</span>
        {" "}to{" "}
        <span className="text-support font-semibold">{pct(cert.final_recall)}</span>
        {" "}(+{gain}pp).{" "}
        {cert.residual_blind_spots > 0 ? (
          <>{cert.residual_blind_spots} variant{cert.residual_blind_spots !== 1 ? "s" : ""} still evade - see{" "}
          <span className="text-refute font-medium">frontier</span> below.</>
        ) : (
          <span className="text-support font-medium">All tested variants are now caught.</span>
        )}
      </p>
      {gens > 1 && (
        <p className="text-sm text-muted border-t border-edge/60 pt-2.5">
          <span className="text-muted-hi font-medium">Reading the generations below: </span>
          each card's before → after score is graded only against THAT round's fresh batch of
          evasions - so a new generation can start lower than the last one ended, because Red just
          invented new attacks against the rule Blue had just evolved. The{" "}
          <span className="text-support font-medium">{pct(cert.final_recall)}</span> above is the
          final rule's score across all {cert.total_variants} variants from every round combined - 
          a separate, cumulative number.
        </p>
      )}
    </div>
  );
}

// ── CoverageMap ───────────────────────────────────────────────────────────────

function CoverageMap({ rows }: { rows: any[] }) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <div className="text-base font-semibold text-white">MITRE ATT&CK coverage</div>
        <Badge variant="accent">self-improving</Badge>
        <InfoTip term="coverage" />
      </div>
      <p className="text-sm text-muted mb-3 leading-relaxed">
        Baseline (grey) → hardened by ARGUS (blue). Each row is one MITRE technique.
      </p>
      <div className="space-y-3">
        {rows.map(r => {
          const b = r.total ? r.baseline_caught / r.total : 0;
          const f = r.total ? r.final_caught / r.total : 0;
          return (
            <div key={r.technique}>
              <div className="flex justify-between text-sm mb-1 gap-2">
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

// ── AnomalyBadge ──────────────────────────────────────────────────────────────
// Shows the live Splunk-baseline anomaly score (0=normal, 1=highly anomalous) for
// one variant's behavioral profile, plus which model produced it (hover to see).

function AnomalyBadge({ score, source }: { score: number; source?: string }) {
  const pct = Math.round(score * 100);
  const variant: BadgeVariant = score >= 0.6 ? "bad" : score >= 0.3 ? "accent" : "dim";
  const label = (source || "").replace("splunk-", "").replace(/-/g, " ");
  return (
    <span title={`Anomaly score from live Splunk baseline (${label || "model"}): ${pct}%`}>
      <Badge variant={variant}>anomaly {pct}%</Badge>
    </span>
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

type AppinspectResult = {
  available: boolean;
  verdict?: "pass" | "warning" | "fail" | "unknown";
  errors?: number;
  failures?: number;
  warnings?: number;
  checks?: number;
  reason?: string;
};

async function exportSplunkApp(v: ReturnType<typeof derive>): Promise<AppinspectResult> {
  const resp = await fetch("/api/export_app", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenario: v.scenario,
      final_spl: v.currentSpl,
      run_id: v.runId,
      certificate: v.certificate,
    }),
  });
  if (!resp.ok) throw new Error(`export failed (${resp.status})`);
  const blob = await resp.blob();
  const cd = resp.headers.get("Content-Disposition") || "";
  const filename = cd.match(/filename="?([^"]+)"?/)?.[1] || "argus_app.spl";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  if (resp.headers.get("X-Appinspect-Available") !== "true") {
    return { available: false, reason: resp.headers.get("X-Appinspect-Reason") ?? undefined };
  }
  return {
    available: true,
    verdict: (resp.headers.get("X-Appinspect-Verdict") as AppinspectResult["verdict"]) ?? "unknown",
    errors: Number(resp.headers.get("X-Appinspect-Errors") ?? 0),
    failures: Number(resp.headers.get("X-Appinspect-Failures") ?? 0),
    warnings: Number(resp.headers.get("X-Appinspect-Warnings") ?? 0),
    checks: Number(resp.headers.get("X-Appinspect-Checks") ?? 0),
  };
}

function AppinspectBadge({ result }: { result: AppinspectResult }) {
  if (!result.available) {
    return (
      <span className="text-[11px] font-mono text-muted/60" title={result.reason ?? "splunk-appinspect not available"}>
        AppInspect: not run
      </span>
    );
  }
  const issues = (result.errors ?? 0) + (result.failures ?? 0);
  const colorClass =
    result.verdict === "pass" ? "text-support border-support/40 bg-support-lo/10"
    : result.verdict === "fail" ? "text-refute border-refute/40 bg-refute-lo/10"
    : "text-accent border-accent/40 bg-accent-lo/10";
  const label =
    result.verdict === "pass" ? "PASS"
    : issues > 0 ? `${issues} issue${issues === 1 ? "" : "s"}`
    : `${result.warnings ?? 0} warning${(result.warnings ?? 0) === 1 ? "" : "s"}`;
  return (
    <span
      className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${colorClass}`}
      title={`Splunk AppInspect: ${result.checks ?? 0} checks run`}
    >
      AppInspect: {label}
    </span>
  );
}

function pct(x?: number | null): string {
  return x == null ? "-" : `${Math.round(x * 100)}%`;
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
  let scorerBackend: string | undefined;
  let activeAgent: "red" | "splunk" | "blue" | null = null;
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
        activeAgent = "splunk";
        log.push(`arena started - ${e.generations} generations`);
        break;
      case "scorer_ready":
        scorerBackend = e.backend;
        log.push(`anomaly scorer ready - ${e.backend}`);
        break;
      case "search":
        searchesRun = e.n ?? searchesRun;
        searchProvider = e.provider ?? searchProvider;
        searchAll.push({ n: e.n, provider: e.provider, spl: e.spl, rows: e.rows });
        break;
      case "variants_generated":
        G(e.generation).evasions = e.variants.map((x: any) => ({ ...x }));
        activeAgent = "red";
        log.push(`gen ${e.generation + 1}: Red generated ${e.variants.length} evasions`);
        break;
      case "generation_scored": {
        const g = G(e.generation);
        g.recallBefore = e.recall;
        liveRecall = e.recall;
        activeAgent = "splunk";
        const byId = new Map(e.outcomes.map((o: any) => [o.id, o.detected]));
        const scores: Record<string, any> = e.anomaly_scores ?? {};
        g.evasions = g.evasions.map(x => ({
          ...x,
          detected: !!byId.get(x.id),
          anomalyScore: scores[x.id]?.value,
          anomalySource: scores[x.id]?.source,
        }));
        break;
      }
      case "blue_evolved":
        currentSpl = e.blue_spl;
        rationale = e.rationale;
        liveRecall = e.new_recall;
        activeAgent = "blue";
        G(e.generation).rationale = e.rationale;
        log.push(`gen ${e.generation + 1} attempt ${e.attempt}: Blue evolved → recall ${pct(e.new_recall)}`);
        break;
      case "blue_attempt_rejected":
        activeAgent = "blue";
        log.push(`gen ${e.generation + 1} attempt ${e.attempt}: rejected`);
        break;
      case "generation_complete": {
        const g = G(e.generation);
        g.recallBefore = e.recall_before;
        g.recallAfter = e.recall_after;
        liveRecall = e.recall_after;
        activeAgent = null;
        break;
      }
      case "converged":
        G(e.generation).converged = true;
        activeAgent = null;
        log.push(`gen ${e.generation + 1}: converged`);
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
        activeAgent = null;
        log.push(`finished - baseline ${pct(e.baseline_recall)} → evolved ${pct(e.final_recall)}`);
        break;
      case "error":
        error = e.message;
        activeAgent = null;
        log.push(`error: ${e.message}`);
        break;
    }
  }

  return {
    scenario, baseline, currentSpl, rationale, baselineRecall, finalRecall, liveRecall,
    totalVariants, finalFp, error, frontier, coverageMap, certificate, realAttack,
    baselineSpl, searchProvider, searchesRun, syntheticIndex, runId, totalGenerations,
    scorerBackend, activeAgent,
    searchAll,
    log: log.slice(-60),
    generations: [...gens.values()].sort((a, b) => a.gen - b.gen),
  };
}
