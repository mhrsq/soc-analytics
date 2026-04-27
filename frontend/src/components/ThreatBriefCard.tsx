import { useState, useCallback, useEffect } from "react";
import { Shield, RefreshCw } from "lucide-react";
import { api } from "../api/client";

interface Props {
  customer: string;
  start?: string;
  end?: string;
}

export function ThreatBriefCard({ customer, start, end }: Props) {
  const [brief, setBrief] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getThreatBrief({
        customer,
        start_date: start,
        end_date: end,
      });
      setBrief(result.brief);
      setGeneratedAt(result.generated_at);
      setModelUsed(result.model_used);
    } catch (e) {
      console.error("Threat brief failed", e);
    } finally {
      setLoading(false);
    }
  }, [customer, start, end]);

  // Auto-generate on mount when customer is known
  useEffect(() => {
    if (customer) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        borderColor: "color-mix(in srgb, #f59e0b 25%, var(--theme-card-border))",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-1 h-3.5 rounded-full"
            style={{ backgroundColor: "#f59e0b" }}
          />
          <h3
            className="text-sm font-semibold flex items-center gap-1.5"
            style={{ color: "var(--theme-text-secondary)" }}
          >
            <Shield className="w-3.5 h-3.5" style={{ color: "#f59e0b" }} />
            Threat Intelligence Brief
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
            background: "color-mix(in srgb, #f59e0b 12%, transparent)",
            color: "#f59e0b",
            border: "1px solid color-mix(in srgb, #f59e0b 25%, transparent)",
          }}
          title="Regenerate threat brief"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      {/* Body */}
      {loading && !brief && (
        <div className="flex items-center gap-2 py-4" style={{ color: "var(--theme-text-muted)" }}>
          <Shield className="w-4 h-4 animate-pulse" style={{ color: "#f59e0b" }} />
          <span className="text-sm">Generating threat intelligence brief...</span>
        </div>
      )}

      {!loading && !brief && (
        <p className="text-sm py-2" style={{ color: "var(--theme-text-muted)" }}>
          Click Generate to create a threat intelligence brief for the selected period.
        </p>
      )}

      {brief && (
        <div className="space-y-2.5">
          {brief
            .split(/\n\n+/)
            .map((p) => p.trim())
            .filter((p) => p && !p.match(/^---+$/) && !p.match(/^\*\*\*+$/))
            .map((p) => p.replace(/^#{1,3}\s+/, ""))
            .map((para, i) => (
              <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--theme-text-secondary)" }}>
                {para.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((part, j) => {
                  if (part.startsWith("**") && part.endsWith("**"))
                    return (
                      <strong key={j} style={{ color: "var(--theme-text-primary)", fontWeight: 600 }}>
                        {part.slice(2, -2)}
                      </strong>
                    );
                  if (part.startsWith("*") && part.endsWith("*"))
                    return <em key={j}>{part.slice(1, -1)}</em>;
                  return part;
                })}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
