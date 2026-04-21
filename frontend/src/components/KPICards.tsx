import { useEffect, useState } from "react";
import type { MetricsSummary } from "../types";
import type { KPIKey } from "./KPIDetailModal";

interface Props {
  data: MetricsSummary | null;
  loading: boolean;
  onCardClick?: (key: KPIKey) => void;
}

function fmt(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function pct(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return `${val.toFixed(1)}%`;
}

function AnimatedValue({ value, className, style }: { value: string; className?: string; style?: React.CSSProperties }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const num = parseFloat(value.replace(/[^0-9.-]/g, ""));
    if (isNaN(num) || value === "—") { setDisplay(value); return; }
    const suffix = value.replace(/[0-9.,\- ]/g, "");
    const isDecimal = value.includes(".");
    const duration = 500;
    const start = performance.now();
    const animate = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = num * eased;
      setDisplay(isDecimal ? `${cur.toFixed(1)}${suffix}` : `${Math.round(cur).toLocaleString()}${suffix}`);
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);
  return <span className={className} style={style}>{display}</span>;
}

function signalColor(val: number | null | undefined, thresholds: { green: number; amber: number }, higher = true): string {
  if (val === null || val === undefined) return "var(--theme-text-primary)";
  if (higher) {
    if (val >= thresholds.green) return "#22c55e";
    if (val >= thresholds.amber) return "#f59e0b";
    return "#ef4444";
  }
  if (val <= thresholds.green) return "#22c55e";
  if (val <= thresholds.amber) return "#f59e0b";
  return "#ef4444";
}

const KPI_KEYS: KPIKey[] = ["total", "open", "tp", "fp", "mttd", "sla"];

export function KPICards({ data, loading, onCardClick }: Props) {
  if (loading || !data) return <KPIStripSkeleton />;

  const metrics = [
    { key: "total" as KPIKey, label: "Tickets", value: data.total_tickets.toLocaleString(), color: "var(--theme-text-primary)" },
    { key: "open" as KPIKey, label: "Open", value: data.open_tickets.toLocaleString(), color: data.open_tickets > 0 ? "#f59e0b" : "var(--theme-text-primary)" },
    { key: "tp" as KPIKey, label: "TP Rate", value: pct(data.tp_rate), color: signalColor(data.tp_rate, { green: 50, amber: 20 }, true) },
    { key: "fp" as KPIKey, label: "FP Rate", value: pct(data.fp_rate), color: signalColor(data.fp_rate, { green: 50, amber: 80 }, false) },
    { key: "mttd" as KPIKey, label: "MTTD", value: fmt(data.avg_mttd_seconds), color: "var(--theme-text-primary)" },
    { key: "sla" as KPIKey, label: "SLA", value: pct(data.sla_compliance_pct), color: signalColor(data.sla_compliance_pct, { green: 90, amber: 75 }, true) },
  ];

  return (
    <div className="h-full flex items-center rounded-lg border px-2 sm:px-4" style={{ backgroundColor: "var(--theme-card-bg)", borderColor: "var(--theme-card-border)" }}>
      {metrics.map((m, i) => (
        <div key={m.key} className="flex items-center">
          {i > 0 && <div className="w-px h-8 mx-2 sm:mx-3 shrink-0" style={{ backgroundColor: "var(--theme-surface-border)" }} />}
          <button onClick={() => onCardClick?.(m.key)} className="flex flex-col items-center px-1 sm:px-2 py-2 rounded-md transition-colors hover:bg-white/[0.03] cursor-pointer min-w-0">
            <AnimatedValue value={m.value} className="text-sm sm:text-base font-semibold font-mono tabular-nums leading-none" style={{ color: m.color }} />
            <span className="text-[10px] sm:text-[11px] mt-0.5 leading-none whitespace-nowrap" style={{ color: "var(--theme-text-muted)" }}>{m.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

function KPIStripSkeleton() {
  return (
    <div className="h-full flex items-center rounded-lg border px-4 gap-6" style={{ backgroundColor: "var(--theme-card-bg)", borderColor: "var(--theme-card-border)" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className="skeleton h-5 w-10 rounded" />
          <div className="skeleton h-3 w-8 rounded" />
        </div>
      ))}
    </div>
  );
}
