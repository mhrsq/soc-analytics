import { useState, useRef, useEffect } from "react";
import { Sparkles, X } from "lucide-react";

interface Props {
  insight: string | null;
  loading?: boolean;
}

export function AiInsightButton({ insight, loading }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!insight && !loading) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ${
          loading ? "opacity-50 cursor-wait" : "hover:opacity-80"
        }`}
        style={{
          background: open
            ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)"
            : "color-mix(in srgb, var(--theme-accent) 8%, transparent)",
          color: "var(--theme-accent)",
          border: "1px solid color-mix(in srgb, var(--theme-accent) 25%, transparent)",
        }}
        disabled={loading}
        aria-label="AI insight"
      >
        <Sparkles className={`w-3 h-3 ${loading ? "animate-pulse" : ""}`} />
        <span>AI</span>
      </button>

      {open && insight && (
        <div
          className="absolute right-0 top-full mt-1.5 w-72 rounded-xl shadow-2xl z-50 p-3"
          style={{
            background: "var(--theme-card-bg)",
            border: "1px solid var(--theme-surface-border)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--theme-accent)" }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--theme-accent)" }}>
                AI Insight
              </span>
            </div>
            <button onClick={() => setOpen(false)} className="shrink-0 hover:opacity-60" style={{ color: "var(--theme-text-muted)" }}>
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--theme-text-secondary)" }}>
            {insight}
          </p>
        </div>
      )}
    </div>
  );
}
