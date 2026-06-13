import { useEffect, useState, type ReactNode } from "react";
import { Arena } from "./views/Arena";
import { Landing } from "./views/Landing";
import type { Health } from "./types";

type Page = "home" | "arena";
type Theme = "dark" | "light";

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [health, setHealth] = useState<Health | null>(null);
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem("argus-theme") as Theme) || "light"
  );

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
    localStorage.setItem("argus-theme", theme);
  }, [theme]);

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
      {/* Brand accent line */}
      <div className="h-[2px] flex-shrink-0 bg-gradient-to-r from-accent/0 via-accent to-accent/0" />

      <header className="px-5 py-2.5 border-b border-edge flex flex-wrap items-center gap-x-5 gap-y-2 bg-panel/80 backdrop-blur-sm flex-shrink-0 z-10">
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

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-4">
          <LiveStatusCluster health={health} />

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="w-7 h-7 rounded-lg border border-edge flex items-center justify-center text-muted hover:text-muted-hi hover:border-edge-hi transition-colors duration-150"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <main className="flex-1 lg:min-h-0">
        {page === "home"
          ? <Landing onLaunch={() => setPage("arena")} health={health} />
          : <Arena />
        }
      </main>

      <footer className="px-5 py-2 border-t border-edge text-[11px] text-muted flex items-center justify-between bg-panel flex-shrink-0">
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-support/70 flex-shrink-0" aria-hidden />
          ARGUS · runs on real Splunk data, end to end
        </span>
        <span className="hidden sm:inline text-muted/50">Red AI vs Blue AI, live on real Splunk data</span>
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

// ─── LiveStatusCluster ────────────────────────────────────────────────────────

/** Single live/connected pulse - green when ok, dim grey when not. */
function LiveDot({ ok }: { ok: boolean }) {
  return (
    <span className="relative w-2 h-2 flex-shrink-0">
      {ok && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-50" aria-hidden />}
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full transition-colors duration-500 ${ok ? "bg-emerald-500" : "bg-muted/25 border border-muted/40"}`}
      />
    </span>
  );
}

/** One combined "live status" indicator - hover to see the per-connection breakdown. */
function LiveStatusCluster({ health }: { health: Health | null }) {
  const items: { label: string; ok: boolean; desc: string }[] = [
    {
      label: "Splunk",
      ok: !!health?.splunk?.connected,
      desc: "Connection to the Splunk REST API - the search and saved-search deploy path.",
    },
    {
      label: "AI",
      ok: !!health?.llm_configured,
      desc: "Anthropic API key configured - Red & Blue agent reasoning runs live.",
    },
    {
      label: "Inject",
      ok: !!health?.hec_configured,
      desc: "HTTP Event Collector configured - synthetic attack variants are written as real events.",
    },
  ];
  if (health?.mcp_url_set) {
    items.push({
      label: "MCP",
      ok: !!health?.mcp_tool_diversity?.ok,
      desc: health?.mcp_tool_diversity?.ok
        ? `MCP tools exercised: ${(health.mcp_tool_diversity.tools_used || []).join(", ")} - ${health.mcp_tool_diversity.index_count ?? 0} indexes discovered via splunk_get_indexes`
        : `MCP tool-diversity probe failed${health?.mcp_tool_diversity?.error ? ": " + health.mcp_tool_diversity.error : ""}`,
    });
  }

  const okCount = items.filter(i => i.ok).length;
  const allOk = okCount === items.length;

  return (
    <div className="relative hidden md:block group">
      <div className="flex items-center gap-1.5 px-2 py-1 -mx-2 rounded-lg text-[11px] text-muted cursor-default select-none hover:text-muted-hi hover:bg-edge/40 transition-colors duration-150">
        <LiveDot ok={allOk} />
        live status
        <span className="tabular-nums text-muted/70">{okCount}/{items.length}</span>
      </div>

      {/* Hover panel - per-connection breakdown */}
      <div className="absolute right-0 top-full mt-1 w-72 rounded-xl border border-edge-hi bg-panel-lo shadow-card p-3.5 z-50
        opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-150">
        <p className="text-[11px] text-muted-hi leading-relaxed mb-3">
          ARGUS uses no mock data - these show real connectivity, live, right now.
        </p>
        <div className="space-y-2.5">
          {items.map(it => (
            <div key={it.label} className="flex items-start gap-2.5">
              <span className="mt-1"><LiveDot ok={it.ok} /></span>
              <div className="min-w-0">
                <div className={`text-xs font-semibold ${it.ok ? "text-white" : "text-muted"}`}>{it.label}</div>
                <div className="text-[11px] text-muted leading-snug mt-0.5">{it.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
