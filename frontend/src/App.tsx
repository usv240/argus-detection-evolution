import { useEffect, useState } from "react";
import { Arena } from "./views/Arena";
import { Landing } from "./views/Landing";
import { InfoTip } from "./components/ui";
import type { Health } from "./types";

type Page = "home" | "arena";

// ARGUS shell: a landing page that teaches newcomers end-to-end, then the live Arena.
export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-3 border-b border-edge flex items-center gap-6 bg-panel">
        <button onClick={() => setPage("home")} className="text-left" aria-label="ARGUS home">
          <span className="text-lg font-semibold tracking-tight text-white">ARGUS</span>
          <span className="hidden sm:inline text-muted font-normal text-sm"> · Adversarial Detection Evolution</span>
        </button>

        <nav className="flex gap-1 text-sm" role="tablist" aria-label="Pages">
          <NavLink active={page === "home"} onClick={() => setPage("home")}>Home</NavLink>
          <NavLink active={page === "arena"} onClick={() => setPage("arena")}>Arena</NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="hidden md:flex items-center text-xs text-muted">
            live status<InfoTip name="Live status" text="Shows whether the backend is connected to a real Splunk instance, a reasoning model, and the data-injection path. ARGUS uses no mock data, so these must be green to run." />
          </span>
          <StatusDot ok={!!health?.splunk?.connected} label="Splunk" />
          <StatusDot ok={!!health?.llm_configured} label="AI" />
          <StatusDot ok={!!health?.hec_configured} label="Inject" />
        </div>
      </header>

      <main className="flex-1 min-h-0">
        {page === "home" ? <Landing onLaunch={() => setPage("arena")} /> : <Arena />}
      </main>

      <footer className="px-6 py-2 border-t border-edge text-xs text-muted flex items-center justify-between bg-panel">
        <span>ARGUS · runs on real Splunk data · no hardcoded results</span>
        <span className="hidden sm:inline">Splunk Agentic Ops Hackathon — Security track</span>
      </footer>
    </div>
  );
}

function NavLink({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md transition-colors ${active ? "bg-accent text-white" : "text-muted hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5" title={ok ? `${label}: connected` : `${label}: not connected`}>
      <span aria-hidden className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-support" : "bg-refute"}`} />
      <span className={ok ? "text-slate-200" : "text-muted"}>{label}</span>
    </span>
  );
}
