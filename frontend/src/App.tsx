import { useEffect, useState, type ReactNode } from "react";
import { Arena } from "./views/Arena";
import { Landing } from "./views/Landing";
import { InfoTip } from "./components/ui";
import type { Health } from "./types";

type Page = "home" | "arena";

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    const poll = () =>
      fetch("/api/health")
        .then(r => r.json())
        .then(setHealth)
        .catch(() => setHealth(null));
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Brand accent line — 2px gradient across the very top */}
      <div className="h-[2px] flex-shrink-0 bg-gradient-to-r from-accent/0 via-accent to-accent/0" />

      <header className="px-5 py-2.5 border-b border-edge flex items-center gap-5 bg-panel/80 backdrop-blur-sm flex-shrink-0">
        {/* Logo */}
        <button
          onClick={() => setPage("home")}
          className="text-left group flex items-baseline gap-2 flex-shrink-0"
          aria-label="ARGUS home"
        >
          <span className="text-[17px] font-bold tracking-tight text-white group-hover:text-accent transition-colors duration-200">
            ARGUS
          </span>
          <span className="hidden sm:inline text-[13px] text-muted font-normal">
            Adversarial Detection Evolution
          </span>
        </button>

        {/* Nav */}
        <nav className="flex gap-1" role="tablist" aria-label="Pages">
          <NavTab active={page === "home"} onClick={() => setPage("home")}>Home</NavTab>
          <NavTab active={page === "arena"} onClick={() => setPage("arena")}>Arena</NavTab>
        </nav>

        {/* Status */}
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden md:flex items-center gap-1 text-[11px] text-muted select-none">
            live status
            <InfoTip
              name="Live status"
              text="ARGUS uses no mock data. These dots show real connectivity to Splunk, the AI reasoning model, and the HEC data-injection path. All three must be green before a run."
            />
          </span>
          <div className="flex items-center gap-3.5">
            <StatusDot ok={!!health?.splunk?.connected} label="Splunk" />
            <StatusDot ok={!!health?.llm_configured}    label="AI"     />
            <StatusDot ok={!!health?.hec_configured}    label="Inject" />
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        {page === "home"
          ? <Landing onLaunch={() => setPage("arena")} />
          : <Arena />
        }
      </main>

      <footer className="px-5 py-2 border-t border-edge text-[11px] text-muted flex items-center justify-between bg-panel flex-shrink-0">
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-support/70 flex-shrink-0" aria-hidden />
          ARGUS · runs on real Splunk data · zero hardcoded results
        </span>
        <span className="hidden sm:inline text-muted/50">Splunk Agentic Ops Hackathon — Security track</span>
      </footer>
    </div>
  );
}

// ─── NavTab ───────────────────────────────────────────────────────────────────

function NavTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 select-none
        ${active
          ? "text-white bg-accent/15 border border-accent/25 shadow-glow-sm"
          : "text-muted hover:text-muted-hi hover:bg-edge/60"
        }`}
    >
      {children}
    </button>
  );
}

// ─── StatusDot ────────────────────────────────────────────────────────────────

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="flex items-center gap-1.5 cursor-default"
      title={ok ? `${label}: connected` : `${label}: not connected`}
    >
      {/* Dot with optional ping */}
      <span className="relative w-2 h-2 flex-shrink-0">
        {ok && (
          <span className="absolute inset-0 rounded-full bg-support animate-ping opacity-50" aria-hidden />
        )}
        <span
          aria-hidden
          className={`absolute inset-0 rounded-full transition-colors duration-500 ${ok ? "bg-support" : "bg-muted/25 border border-muted/40"}`}
        />
      </span>
      <span className={`text-[11px] transition-colors duration-300 ${ok ? "text-muted-hi" : "text-muted/50"}`}>
        {label}
      </span>
    </span>
  );
}
