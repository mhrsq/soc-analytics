import { useState, useCallback, useEffect } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { api } from "../api/client";

interface Props {
  start?: string;
  end?: string;
  customer?: string;
  bare?: boolean;
}

export function ExecSummaryCard({ start, end, customer, bare: _bare }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getExecSummary({
        start_date: start,
        end_date: end,
        customer,
      });
      setSummary(result.summary);
      setGeneratedAt(result.generated_at);
      setModelUsed(result.model_used);
    } catch (e) {
      console.error("Executive summary failed", e);
    } finally {
      setLoading(false);
    }
  }, [start, end, customer]);

  // Auto-generate on mount when using the default 24h range (no explicit dates provided)
  useEffect(() => {
    if (!start && !end) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh every 3 hours
  useEffect(() => {
    const id = setInterval(generate, 3 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [generate]);

  const formattedAt = generatedAt
    ? new Date(generatedAt).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className="rounded-lg border p-4 mb-2"
      style={{
        backgroundColor: "var(--theme-card-bg)",
        borderColor: "var(--theme-card-border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-1 h-3.5 rounded-full"
            style={{ backgroundColor: "var(--theme-accent)" }}
          />
          <h3
            className="text-sm font-semibold flex items-center gap-1.5"
            style={{ color: "var(--theme-text-secondary)" }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--theme-accent)" }} />
            Executive Summary
          </h3>
          {formattedAt && (
            <span className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>
              — generated {formattedAt}
              {modelUsed && ` · ${modelUsed}`}
            </span>
          )}
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-50"
          style={{
            background: "color-mix(in srgb, var(--theme-accent) 12%, transparent)",
            color: "var(--theme-accent)",
            border: "1px solid color-mix(in srgb, var(--theme-accent) 25%, transparent)",
          }}
          title="Regenerate executive summary"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      {/* Body */}
      {loading && !summary && (
        <div className="flex items-center gap-2 py-4" style={{ color: "var(--theme-text-muted)" }}>
          <Sparkles className="w-4 h-4 animate-pulse" style={{ color: "var(--theme-accent)" }} />
          <span className="text-sm">Generating executive summary...</span>
        </div>
      )}

      {!loading && !summary && (
        <p className="text-sm py-2" style={{ color: "var(--theme-text-muted)" }}>
          Click Generate to create an executive summary for the selected period.
        </p>
      )}

      {summary && (
        <div className="space-y-2">
          {summary.split(/\n\n+/).map((para, i) => (
            <p
              key={i}
              className="text-sm leading-relaxed"
              style={{ color: "var(--theme-text-secondary)" }}
            >
              {para.trim()}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
