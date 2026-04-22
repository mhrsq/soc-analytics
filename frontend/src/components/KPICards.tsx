import { useEffect, useState, useMemo } from "react";
import type { MetricsSummary, VolumePoint } from "../types";
import type { KPIKey } from "./KPIDetailModal";

interface Props {
  data: MetricsSummary | null;
  loading: boolean;
  onCardClick?: (key: KPIKey) => void;
  volumeData?: VolumePoint[] | null;
}

function fmt(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "\u2014";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function pct(val: number | null | undefined): string {
  if (val === null || val === undefined) return "\u2014";
  return `${val.toFixed(1)}%`;
}

function AnimatedValue({ value, className, style }: { value: string; className?: string; style?: React.CSSProperties }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const num = parseFloat(value.replace(/[^0-9.-]/g, ""));
    if (isNaN(num) || value === "\u2014") { setDisplay(value); return; }
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
    if (val >= thresholds.green) return "#10b981";
    if (val >= thresholds.amber) return "#f59e0b";
    return "#ef4444";
  }
  if (val <= thresholds.green) return "#10b981";
  if (val <= thresholds.amber) return "#f59e0b";
  return "#ef4444";
}

/** Tiny sparkline SVG from data points */
function MiniSparkline({ data, color, width = 80, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height * 0.8) - height * 0.1;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} className="absolute bottom-0 left-0 right-0 opacity-[0.15]" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="1.5" />
      <polygon points={`0,${height} ${points.join(" ")} ${width},${height}`} fill={`url(#sg-${color.replace('#','')})`} />
    </svg>
  );
}

const KPI_KEYS: KPIKey[] = ["total", "open", "tp", "fp", "mttd", "mttr", "sla"];

export function KPICards({ data, loading, onCardClick, volumeData }: Props) {
  if (loading || !data) return <KPIStripSkeleton />;

  // Extract sparkline data from volume points
  const last7 = useMemo(() => {
    if (!volumeData || volumeData.length === 0) return null;
    const recent = volumeData.slice(-7);
    return {
      total: recent.map(d => d.total),
      fp: recent.map(d => d.fp_count),
      tp: recent.map(d => d.tp_count),
    };
  }, [volumeData]);

  // Compute deltas from sparkline data (last value vs first value trend)
  function sparkDelta(arr: number[] | null | undefined): { text: string; color: string } | null {
    if (!arr || arr.length < 2) return null;
    const first = arr[0] ?? 0;
    const last = arr[arr.length - 1] ?? 0;
    const diff = last - first;
    if (diff === 0) return { text: "0 · 7d", color: "#646471" };
    const sign = diff > 0 ? "+" : "";
    return { text: `${sign}${diff} · 7d`, color: diff > 0 ? "#ef4444" : "#10b981" };
  }

  const tpDelta = sparkDelta(last7?.tp);
  const fpDelta = sparkDelta(last7?.fp);
  const totalDelta = sparkDelta(last7?.total);

  const metrics = [
    { key: "total" as KPIKey, label: "TOTAL TICKETS", value: data.total_tickets.toLocaleString(), sparkData: last7?.total, sparkColor: "#9b9ba8" },
    { key: "open" as KPIKey, label: "OPEN", value: data.open_tickets.toLocaleString(), sparkData: null, sparkColor: "#9b9ba8" },
    { key: "tp" as KPIKey, label: "TRUE POSITIVE", value: pct(data.tp_rate), sparkData: last7?.tp, sparkColor: "#10b981" },
    { key: "fp" as KPIKey, label: "FALSE POSITIVE", value: pct(data.fp_rate), sparkData: last7?.fp, sparkColor: "#9b9ba8" },
    { key: "mttd" as KPIKey, label: "AVG MTTD", value: fmt(data.avg_mttd_seconds), sparkData: null, sparkColor: "#9b9ba8" },
    { key: "mttr" as KPIKey, label: "AVG MTTR", value: fmt(data.avg_mttr_seconds), sparkData: null, sparkColor: "#9b9ba8" },
    { key: "sla" as KPIKey, label: "SLA COMPLIANCE", value: pct(data.sla_compliance_pct), sparkData: null, sparkColor: "#9b9ba8" },
  ];

  return (
    <div className="h-full grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-px rounded-lg overflow-hidden border" style={{ borderColor: "var(--theme-card-border)", backgroundColor: "var(--theme-card-border)" }}>
      {metrics.map((m) => (
        <button
          key={m.key}
          onClick={() => onCardClick?.(m.key)}
          className="relative flex flex-col justify-center px-3 py-3 text-left transition-colors hover:bg-white/[0.02] cursor-pointer overflow-hidden"
          style={{ backgroundColor: "var(--theme-card-bg)" }}
        >
          {m.sparkData && <MiniSparkline data={m.sparkData} color={m.sparkColor} />}
          <div className="relative z-10">
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--theme-text-muted)", letterSpacing: "0.08em" }}>
              {m.label}
            </span>
          </div>
          <AnimatedValue
            value={m.value}
            className="text-base sm:text-lg font-medium font-mono tabular-nums leading-tight relative z-10"
            style={{ color: "var(--theme-text-primary)", letterSpacing: "-0.02em" }}
          />
        </button>
      ))}
    </div>
  );
}

function KPIStripSkeleton() {
  return (
    <div className="h-full grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-px rounded-lg overflow-hidden border" style={{ borderColor: "var(--theme-card-border)", backgroundColor: "var(--theme-card-border)" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col justify-center px-3 py-3 gap-1.5" style={{ backgroundColor: "var(--theme-card-bg)" }}>
          <div className="skeleton h-2.5 w-16 rounded" />
          <div className="skeleton h-5 w-12 rounded" />
        </div>
      ))}
    </div>
  );
}
