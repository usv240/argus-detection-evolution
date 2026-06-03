import { useEffect, useRef, useState, type ReactNode } from "react";
import { GLOSSARY } from "../content";

// Shared design-system primitives — one consistent set of components used everywhere
// (UXPin: design consistency; Laws of UX: aesthetic-usability).

/** The ⓘ button. Click to reveal a plain-language explanation of a term (progressive disclosure).
 *  Pass `term` (a GLOSSARY key) and/or explicit name/text. Accessible: keyboard + aria + Escape. */
export function InfoTip({ term, name, text }: { term?: string; name?: string; text?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const g = term ? GLOSSARY[term] : undefined;
  const title = name ?? g?.name ?? "Info";
  const body = text ?? g?.long ?? g?.short ?? "";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="relative inline-flex align-middle" ref={ref}>
      <button
        type="button"
        aria-label={`Explain: ${title}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted text-[10px] leading-none text-muted hover:text-white hover:border-white transition-colors"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-50 top-6 left-0 w-72 max-w-[80vw] rounded-lg border border-edge bg-ink shadow-xl p-3 text-left"
        >
          <span className="block text-xs font-semibold text-white mb-1">{title}</span>
          <span className="block text-xs text-slate-300 leading-relaxed">{body}</span>
        </span>
      )}
    </span>
  );
}

/** A label with an attached ⓘ — the standard way we present any jargon term. */
export function Term({ term, children }: { term: string; children?: ReactNode }) {
  return (
    <span className="inline-flex items-center">
      {children ?? GLOSSARY[term]?.name}
      <InfoTip term={term} />
    </span>
  );
}

export function Button({
  children, onClick, disabled, variant = "primary", title, className = "",
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "primary" | "ghost"; title?: string; className?: string;
}) {
  const base = "px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const styles = variant === "primary"
    ? "bg-accent text-white hover:brightness-110"
    : "border border-edge text-slate-200 hover:text-white hover:border-muted";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-panel border border-edge rounded-xl p-5 ${className}`}>{children}</div>;
}

export function Stat({ label, value, tone = "default", term }: {
  label: string; value: ReactNode; tone?: "default" | "good" | "bad"; term?: string;
}) {
  const color = tone === "good" ? "text-support" : tone === "bad" ? "text-refute" : "text-white";
  return (
    <div>
      <div className="text-xs text-muted flex items-center">{label}{term && <InfoTip term={term} />}</div>
      <div className={`text-2xl font-semibold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

export function SectionHeading({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-white">{children}</h2>
      {sub && <p className="text-sm text-muted mt-1">{sub}</p>}
    </div>
  );
}
