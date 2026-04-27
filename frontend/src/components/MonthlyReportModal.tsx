import { useState } from "react";
import { X, FileText, Download } from "lucide-react";
import { api } from "../api/client";
import type { MonthlyReportResponse } from "../types";
import { ChartSkeleton } from "./Spinner";

interface Props {
  customer: string;
  onClose: () => void;
}

const MONTH_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i - 1, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    opts.push({ value, label });
  }
  return opts;
})();

export function MonthlyReportModal({ customer, onClose }: Props) {
  const [month, setMonth] = useState(MONTH_OPTIONS[0].value);
  const [report, setReport] = useState<MonthlyReportResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    setReport(null);
    try {
      const result = await api.getMonthlyReport({ customer, month });
      setReport(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)" }}
    >
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div
        className="w-full max-w-4xl rounded-xl flex flex-col"
        style={{
          height: "85vh",
          backgroundColor: "var(--theme-card-bg)",
          border: "1px solid var(--theme-card-border)",
        }}
      >
        {/* Header */}
        <div
          className="no-print flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: "var(--theme-card-border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 12%, transparent)" }}
            >
              <FileText className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: "var(--theme-text-primary)" }}>
                Monthly Security Report
              </h2>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                {customer}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:opacity-80 transition-opacity"
            style={{ color: "var(--theme-text-muted)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div
          className="no-print flex items-center gap-3 px-6 py-3 border-b shrink-0"
          style={{ borderColor: "var(--theme-card-border)" }}
        >
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="appearance-none px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{
              backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
              color: "var(--theme-text-secondary)",
              border: "1px solid var(--theme-surface-border)",
            }}
          >
            {MONTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
            style={{
              backgroundColor: "var(--theme-accent)",
              color: "#fff",
            }}
          >
            <FileText className="w-3.5 h-3.5" />
            {loading ? "Generating..." : "Generate"}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && <ChartSkeleton />}

          {!loading && !report && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <FileText className="w-10 h-10" style={{ color: "var(--theme-text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
                Select a month and click Generate to create the report.
              </p>
            </div>
          )}

          {!loading && report && (
            <div
              className="prose prose-sm max-w-none"
              style={{ color: "var(--theme-text-secondary)" }}
              dangerouslySetInnerHTML={{ __html: report.html }}
            />
          )}
        </div>

        {/* Footer */}
        {report && (
          <div
            className="no-print flex items-center justify-between px-6 py-3 border-t shrink-0"
            style={{ borderColor: "var(--theme-card-border)" }}
          >
            <span className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>
              Generated {new Date(report.generated_at).toLocaleString("id-ID")} · {report.model_used}
            </span>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
                color: "var(--theme-text-secondary)",
                border: "1px solid var(--theme-surface-border)",
              }}
            >
              <Download className="w-3.5 h-3.5" />
              Download as PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
