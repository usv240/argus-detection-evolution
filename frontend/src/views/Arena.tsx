import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { startArena } from "../api/stream";
import { InfoTip } from "../components/ui";

// The hero. Streams the adversarial co-evolution live: Red invents evasions, Blue evolves the
// detection, recall climbs. Every value comes from the backend's live run — nothing seeded.
type Ev = Record<string, any>;

interface GenView {
  gen: number;
  evasions: { id: string; name: string; evasion: string; detected?: boolean }[];
  recallBefore?: number;
  recallAfter?: number;
  converged?: boolean;
}

export function Arena() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [running, setRunning] = useState(false);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [scenarioKey, setScenarioKey] = useState<string>("");
  const abort = useRef<AbortController | null>(null);

  const v = useMemo(() => derive(events), [events]);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((s) => { setScenarios(s); if (s[0]) setScenarioKey(s[0].key); })
      .catch(() => {});
  }, []);

  async function run() {
    setEvents([]);
    setRunning(true);
    abort.current = new AbortController();
    try {
      await startArena(
        { scenario: scenarioKey, generations: 3, variants_per_gen: 3, refine_attempts: 4, stop_on_converge: false },
        (e) => setEvents((p) => [...p, e]),
        abort.current.signal,
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-3 flex items-center gap-4 border-b border-edge bg-ink">
        <div className="flex-1">
          <div className="text-sm text-slate-200 flex items-center">
            {v.scenario ?? "Adversarial Detection Evolution"}
            <InfoTip term="armsRace" />
          </div>
          <div className="text-xs text-muted flex items-center">
            baseline<InfoTip term="baseline" />: {v.baseline ?? "—"}
          </div>
        </div>
        {v.error && <span className="text-refute text-sm max-w-md truncate">{v.error}</span>}
        <label className="text-xs text-muted flex items-center">
          scenario<InfoTip term="scenario" />
        </label>
        <select
          value={scenarioKey}
          onChange={(e) => setScenarioKey(e.target.value)}
          disabled={running}
          className="bg-panel border border-edge rounded px-2 py-1.5 text-sm text-slate-200 disabled:opacity-40"
          aria-label="Attack scenario"
        >
          {scenarios.map((s) => (
            <option key={s.key} value={s.key}>{s.name}</option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={running}
          className="px-4 py-1.5 rounded bg-accent text-white disabled:opacity-40"
        >
          {running ? "Evolving…" : "Run the Arena"}
        </button>
      </div>

      <div className="flex-1 min-h-0 grid lg:grid-cols-3 gap-0">
        {/* left: generations / arms race */}
        <div className="lg:col-span-2 overflow-auto p-6 space-y-4">
          <Headline v={v} />
          {v.generations.length === 0 && !running && (
            <div className="bg-panel border border-edge rounded-xl p-6 mt-2">
              <div className="text-base font-semibold text-white">How to read this</div>
              <p className="text-sm text-muted mt-1">
                Pick a scenario above and press <span className="text-white">Run the Arena</span>. Then watch, top to bottom:
              </p>
              <ol className="mt-4 space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="text-accent font-semibold">1.</span>
                  <span className="text-slate-300">
                    The <span className="text-white">coverage headline</span> shows the % of attacks caught —
                    it should climb from the baseline as ARGUS hardens.
                    <InfoTip term="recall" />
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-accent font-semibold">2.</span>
                  <span className="text-slate-300">
                    Each <span className="text-white">generation</span> is one round: the attacker AI
                    <InfoTip term="red" /> invents evasions<InfoTip term="evasion" />, then the defender AI
                    <InfoTip term="blue" /> rewrites the detection to catch them.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-accent font-semibold">3.</span>
                  <span className="text-slate-300">
                    At the end you get a <span className="text-white">MITRE coverage map</span><InfoTip term="coverage" />,
                    a <span className="text-white">resilience certificate</span><InfoTip term="certificate" />, and the
                    <span className="text-white"> residual blind spots</span><InfoTip term="frontier" /> it still can't catch.
                  </span>
                </li>
              </ol>
              <p className="text-xs text-muted mt-4">
                Everything is computed live on real Splunk data — nothing is faked.<InfoTip term="noHardcoded" />
              </p>
            </div>
          )}
          {v.generations.map((g) => (
            <GenerationCard key={g.gen} g={g} />
          ))}

          {v.frontier.length > 0 && (
            <div className="bg-panel border border-refute rounded p-4">
              <div className="text-sm font-medium text-refute flex items-center">
                Residual frontier — {v.frontier.length} evasion{v.frontier.length > 1 ? "s" : ""} still uncaught
                <InfoTip term="frontier" />
              </div>
              <div className="text-xs text-muted mb-2">
                Real blind spots ARGUS surfaced that even the hardened rule misses — prioritize these.
              </div>
              <div className="flex flex-wrap gap-2">
                {v.frontier.map((o: any, i: number) => (
                  <span key={i} title={o.evasion} className="text-xs px-2 py-1 rounded border border-refute text-refute">
                    {o.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {v.coverageMap.length > 0 && <CoverageMap rows={v.coverageMap} />}
        </div>

        {/* right: evolved detection + log */}
        <div className="border-l border-edge flex flex-col min-h-0">
          <div className="p-4 border-b border-edge">
            <div className="text-xs text-muted uppercase tracking-wide mb-1 flex items-center">
              Detection rule — baseline → evolved<InfoTip term="spl" />
            </div>
            {v.baselineSpl && (
              <>
                <div className="text-[10px] text-refute mt-1">▸ baseline (starting rule — misses the evasions)</div>
                <pre className="text-[10px] leading-relaxed text-slate-400 whitespace-pre-wrap max-h-28 overflow-auto">
                  {v.baselineSpl}
                </pre>
              </>
            )}
            <div className="text-[10px] text-support mt-2">▸ evolved by ARGUS {v.currentSpl ? "(live)" : ""}</div>
            <pre className="text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap max-h-56 overflow-auto">
              {v.currentSpl ?? "— (evolves once the run starts)"}
            </pre>
            {v.rationale && <p className="text-xs text-muted mt-2">{v.rationale}</p>}
          </div>
          {v.certificate && <Certificate cert={v.certificate} />}
          {v.searchTrace.length > 0 && (
            <div className="border-t border-edge p-4">
              <div className="text-xs text-muted uppercase tracking-wide flex items-center">
                Splunk searches — {v.searchesRun} via {v.searchProvider}
                <InfoTip name="Splunk search activity"
                  text="Every detection run and evidence query executes live against Splunk through the configured provider (Splunk MCP Server, or the SDK fallback). This streams those real searches — proof Splunk is load-bearing, not decorative." />
              </div>
              <div className="mt-2 space-y-1 max-h-40 overflow-auto">
                {v.searchTrace.slice().reverse().map((s: any, i: number) => (
                  <div key={i} className="text-[10px] font-mono text-muted truncate" title={s.spl}>
                    <span className="text-accent">{s.provider}</span> · {s.rows} rows · {s.spl}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1 overflow-auto p-4 text-xs font-mono text-muted space-y-1">
            {v.log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Headline({ v }: { v: ReturnType<typeof derive> }) {
  const base = v.baselineRecall;
  const fin = v.finalRecall ?? v.liveRecall;
  if (base == null && fin == null) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-panel border border-support rounded p-5 flex items-center gap-6"
    >
      <div>
        <div className="text-xs text-muted uppercase tracking-wide flex items-center">
          Detection coverage of evasions<InfoTip term="recall" />
        </div>
        <div className="text-3xl font-semibold mt-1">
          {pct(base)} <span className="text-muted">→</span>{" "}
          <span className="text-support">{pct(fin)}</span>
        </div>
      </div>
      <div className="text-sm text-muted">
        {v.totalVariants != null && <div>{v.totalVariants} attack variants tested</div>}
        <div className={`flex items-center ${v.finalFp ? "text-refute" : "text-support"}`}>
          {v.finalFp ? "⚠ false positives present" : "✓ no false positives on benign"}
          <InfoTip term="falsePositive" />
        </div>
        {v.realAttack && (
          <div className={`flex items-center ${v.realAttack.final_caught ? "text-support" : "text-refute"}`}>
            {v.realAttack.final_caught ? "✓ catches the REAL attack in the data" : "✗ misses the real attack"}
            <InfoTip name="Real-attack validation"
              text="Beyond the synthetic evasions, ARGUS also runs the rule against the genuine attack present in the BOTS dataset (the real compromised-credential cryptomining spree). This confirms the hardened rule catches the actual attack, not just the variants ARGUS generated." />
          </div>
        )}
        {v.searchesRun > 0 && (
          <div className="flex items-center text-slate-300">
            {v.searchesRun} live Splunk searches via {v.searchProvider}
            <InfoTip name="Live Splunk searches"
              text="Count of real searches executed against Splunk during this run, through the configured provider (Splunk MCP Server, or SDK fallback). Splunk is load-bearing — every metric comes from these live searches." />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function GenerationCard({ g }: { g: GenView }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-panel border border-edge rounded p-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Generation {g.gen}</span>
        <span className="text-xs text-muted flex items-center">
          Red generated {g.evasions.length} evasions<InfoTip term="evasion" />
        </span>
        {g.converged && <span className="text-xs text-support">converged</span>}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-refute">{pct(g.recallBefore)}</span>
          <span className="text-muted">→</span>
          <span className="text-support">{pct(g.recallAfter)}</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 bg-ink rounded overflow-hidden">
        <motion.div
          className="h-full bg-support"
          initial={{ width: 0 }}
          animate={{ width: `${(g.recallAfter ?? 0) * 100}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {g.evasions.map((e) => (
          <span
            key={e.id}
            title={e.evasion}
            className={`text-xs px-2 py-1 rounded border ${
              e.detected
                ? "border-support text-support"
                : "border-refute text-refute"
            }`}
          >
            {e.detected ? "✓ caught" : "✗ evaded"} · {e.name}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

function CoverageMap({ rows }: { rows: any[] }) {
  return (
    <div className="bg-panel border border-edge rounded p-4">
      <div className="text-sm font-medium flex items-center">
        MITRE ATT&CK coverage — self-improving<InfoTip term="coverage" />
      </div>
      <div className="text-xs text-muted mb-3">
        Evasions caught per technique: baseline (grey) → after ARGUS hardened (blue).
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const b = r.total ? r.baseline_caught / r.total : 0;
          const f = r.total ? r.final_caught / r.total : 0;
          return (
            <div key={r.technique}>
              <div className="flex justify-between text-xs">
                <span className="text-slate-200">{r.technique} · {r.name}</span>
                <span className="text-muted">
                  {r.baseline_caught}/{r.total} →{" "}
                  <span className="text-support">{r.final_caught}/{r.total}</span>
                </span>
              </div>
              <div className="mt-1 h-2 bg-ink rounded overflow-hidden relative">
                <div className="absolute h-full bg-edge" style={{ width: `${b * 100}%` }} />
                <motion.div
                  className="absolute h-full bg-support"
                  initial={{ width: 0 }}
                  animate={{ width: `${f * 100}%` }}
                  transition={{ duration: 0.9 }}
                  style={{ opacity: 0.8 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Certificate({ cert }: { cert: any }) {
  const download = () => {
    const blob = new Blob([JSON.stringify(cert, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cert.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="m-4 bg-panel border border-accent rounded p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted uppercase tracking-wide flex items-center">
          Resilience Certificate<InfoTip term="certificate" />
        </div>
        <button onClick={download} className="text-xs px-2 py-1 rounded border border-edge hover:text-white">
          Download
        </button>
      </div>
      <div className="text-sm font-mono mt-1">{cert.id}</div>
      <div className="mt-2 text-sm">
        coverage <span className="text-refute">{pct(cert.baseline_recall)}</span>{" → "}
        <span className="text-support">{pct(cert.final_recall)}</span>
        <span className="text-muted"> · {cert.total_variants} variants · {cert.residual_blind_spots} residual</span>
      </div>
      <div className="text-[10px] text-muted mt-2 break-all">
        SHA-256 fingerprint: {String(cert.fingerprint).slice(0, 32)}…
      </div>
      <div className="text-[10px] text-muted">issued {cert.issued_at}</div>
    </div>
  );
}

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
  const searchTrace: any[] = [];
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
        log.push(`arena started — ${e.generations} generations`);
        break;
      case "search":
        searchesRun = e.n ?? searchesRun;
        searchProvider = e.provider ?? searchProvider;
        searchTrace.push({ n: e.n, provider: e.provider, spl: e.spl, rows: e.rows });
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
        g.evasions = g.evasions.map((x) => ({ ...x, detected: !!byId.get(x.id) }));
        break;
      }
      case "blue_evolved":
        currentSpl = e.blue_spl;
        rationale = e.rationale;
        liveRecall = e.new_recall;
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
        log.push(`gen ${e.generation}: converged ✓`);
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
    baselineSpl, searchProvider, searchesRun, searchTrace: searchTrace.slice(-14),
    log: log.slice(-40),
    generations: [...gens.values()].sort((a, b) => a.gen - b.gen),
  };
}

function pct(x?: number | null): string {
  return x == null ? "—" : `${Math.round(x * 100)}%`;
}
