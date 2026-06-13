import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { GLOSSARY } from "../content";

// ─── InfoTip ─────────────────────────────────────────────────────────────────

/** Clickable ⓘ that opens a tooltip. Uses position:fixed so it is never clipped by overflow:auto parents. */
export function InfoTip({ term, name, text, direction = "up" }: { term?: string; name?: string; text?: string; direction?: "up" | "down" }) {
  const [open, setOpen] = useState(false);
  const [tipStyle, setTipStyle] = useState<CSSProperties>({});
  const [goDown, setGoDown] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const g = term ? GLOSSARY[term] : undefined;
  const title = name ?? g?.name ?? "Info";
  const body = text ?? g?.long ?? g?.short ?? "";

  useEffect(() => {
    if (!open) return;
    const hide = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", hide);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", hide); document.removeEventListener("keydown", esc); };
  }, [open]);

  const show = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      const cx = Math.min(Math.max(r.left + r.width / 2, 152), window.innerWidth - 152);
      const down = direction === "down" || r.top < 160;
      setGoDown(down);
      setTipStyle(down
        ? { top: r.bottom + 8, left: cx, transform: "translateX(-50%)" }
        : { bottom: window.innerHeight - r.top + 8, left: cx, transform: "translateX(-50%)" }
      );
      setOpen(true);
    }
  };

  return (
    <span className="relative inline-flex align-middle flex-shrink-0" ref={ref}>
      <button
        type="button"
        aria-label={`Explain: ${title}`}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); if (open) setOpen(false); else show(); }}
        className={`ml-1 inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[11px] font-semibold leading-none transition-all duration-150
          ${open
            ? "bg-accent text-on-accent border border-accent shadow-glow-sm"
            : "border border-muted/50 text-muted hover:border-muted-hi hover:text-muted-hi hover:bg-edge"
          }`}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="fixed w-72 max-w-[min(80vw,300px)] rounded-xl border border-edge-hi bg-panel-lo shadow-card text-left whitespace-normal animate-fade-in pointer-events-none"
          style={{ ...tipStyle, zIndex: 9999 }}
        >
          {/* Arrow pointing toward the trigger */}
          {goDown ? (
            <span aria-hidden className="absolute left-1/2 w-2 h-2 bg-panel-lo border-t border-l border-edge-hi"
              style={{ bottom: "100%", marginBottom: "-5px", transform: "translateX(-50%) rotate(45deg)" }}
            />
          ) : (
            <span aria-hidden className="absolute left-1/2 w-2 h-2 bg-panel-lo border-b border-r border-edge-hi"
              style={{ top: "100%", marginTop: "-5px", transform: "translateX(-50%) rotate(45deg)" }}
            />
          )}
          <div className="p-3.5">
            <span className="block text-sm font-semibold text-white mb-1.5 tracking-wide">{title}</span>
            <span className="block text-sm text-muted-hi leading-relaxed whitespace-normal break-words">{body}</span>
          </div>
        </span>
      )}
    </span>
  );
}

/** Inline term label with attached ⓘ. */
export function Term({ term, children }: { term: string; children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-0">
      {children ?? GLOSSARY[term]?.name}
      <InfoTip term={term} />
    </span>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

export type BadgeVariant = "neutral" | "good" | "bad" | "accent" | "dim";

export function Badge({ children, variant = "neutral" }: { children: ReactNode; variant?: BadgeVariant }) {
  const cls: Record<BadgeVariant, string> = {
    neutral: "bg-edge/80 text-muted-hi border-edge-hi",
    good:    "bg-support-lo/60 text-support border-support/30",
    bad:     "bg-refute-lo/60 text-refute border-refute/30",
    accent:  "bg-accent-lo text-accent border-accent/30",
    dim:     "bg-panel text-muted border-edge",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold border leading-none ${cls[variant]}`}>
      {children}
    </span>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

export function Spinner({ size = "sm", className = "" }: { size?: "sm" | "md"; className?: string }) {
  const sz = size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  return (
    <svg className={`${sz} animate-spin ${className}`} fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

export function Button({
  children, onClick, disabled, variant = "primary", title, className = "", loading = false,
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "primary" | "ghost" | "danger"; title?: string; className?: string; loading?: boolean;
}) {
  const base = "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none";
  const vars: Record<string, string> = {
    primary: "bg-accent text-on-accent hover:bg-accent/90 shadow-glow-sm hover:shadow-glow",
    ghost:   "border border-edge text-muted-hi hover:text-white hover:border-edge-hi hover:bg-edge/50",
    danger:  "border border-refute/40 text-refute hover:bg-refute-lo hover:border-refute",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading} title={title}
      className={`${base} ${vars[variant]} ${className}`}>
      {loading && <Spinner size="sm" className="text-current" />}
      {children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export type CardVariant = "default" | "accent" | "warn" | "elevated" | "subtle";

export function Card({ children, className = "", variant = "default" }: {
  children: ReactNode; className?: string; variant?: CardVariant;
}) {
  const vars: Record<CardVariant, string> = {
    default:  "bg-panel border border-edge",
    accent:   "bg-accent-lo/30 border border-accent/40 shadow-glow-sm",
    warn:     "bg-refute-lo/20 border border-refute/30",
    elevated: "bg-panel border border-edge-hi shadow-card",
    subtle:   "bg-panel-lo border border-edge/60",
  };
  return <div className={`rounded-xl p-5 ${vars[variant]} ${className}`}>{children}</div>;
}

// ─── Stat ─────────────────────────────────────────────────────────────────────

export function Stat({ label, value, tone = "default", term }: {
  label: string; value: ReactNode; tone?: "default" | "good" | "bad"; term?: string;
}) {
  const color = tone === "good" ? "text-support" : tone === "bad" ? "text-refute" : "text-white";
  return (
    <div>
      <div className="text-xs text-muted flex items-center gap-0.5">{label}{term && <InfoTip term={term} />}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

// ─── SectionHeading ───────────────────────────────────────────────────────────

export function SectionHeading({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-white tracking-tight">{children}</h2>
      {sub && <p className="text-sm text-muted mt-1 leading-relaxed">{sub}</p>}
    </div>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

/** Decorative divider with centered label - used between right-panel sections. */
export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5">
      <div className="flex-1 h-px bg-edge" />
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted/70 whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-edge" />
    </div>
  );
}
