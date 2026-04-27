import { Card } from "./Card";
import type { MomKpi } from "../types";

interface Props {
  data: MomKpi[] | null;
  loading: boolean;
}

const LABEL_MAP: Record<string, string> = {
  total: "Total Alerts",
  fp_rate: "FP Rate",
  mttd_sla: "MTTD SLA",
  mttr_sla: "MTTR SLA",
  incidents: "Incidents",
};

/** Metrics where a lower number is better (green for decrease). */
const LOWER_IS_BETTER = new Set(["fp_rate"]);

/** Metrics where higher is better (green for increase). */
const HIGHER_IS_BETTER = new Set(["mttd_sla", "mttr_sla"]);

/** Metrics shown as percentages. */
const PCT_METRICS = new Set(["fp_rate", "mttd_sla", "mttr_sla"]);

function fmtValue(metric: string, value: number): string {
  if (PCT_METRICS.has(metric)) return `${value.toFixed(1)}%`;
  return Math.round(value).toLocaleString();
}

function getDeltaColor(metric: string, delta: number): string {
  if (delta === 0) return "var(--theme-text-muted)";
  if (LOWER_IS_BETTER.has(metric)) {
    return delta < 0 ? "#10b981" : "#ef4444";
  }
  if (HIGHER_IS_BETTER.has(metric)) {
    return delta > 0 ? "#10b981" : "#ef4444";
  }
  // Neutral metrics (total, incidents) — just show direction without strong color
  return "var(--theme-text-secondary)";
}

function getDeltaArrow(delta: number): string {
  if (delta > 0) return "▲";
  if (delta < 0) return "▼";
  return "—";
}

function SkeletonCards() {
  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 min-w-[140px] rounded-lg p-3"
          style={{
            backgroundColor: "var(--theme-surface-raised)",
            border: "1px solid var(--theme-surface-border)",
          }}
        >
          <div className="skeleton h-3 w-16 rounded mb-3" />
          <div className="skeleton h-6 w-20 rounded mb-2" />
          <div className="skeleton h-3 w-24 rounded" />
        </div>
      ))}
    </div>
  );
}

export function MomKpiCards({ data, loading }: Props) {
  return (
    <Card title="Month-over-Month">
      {loading || !data ? (
        <SkeletonCards />
      ) : (
        <div className="flex flex-wrap gap-3">
          {data.map((kpi) => {
            const label = LABEL_MAP[kpi.metric] || kpi.metric;
            const deltaColor = kpi.delta_pct !== null ? getDeltaColor(kpi.metric, kpi.delta_pct) : "var(--theme-text-muted)";
            const arrow = kpi.delta_pct !== null ? getDeltaArrow(kpi.delta_pct) : "";

            return (
              <div
                key={kpi.metric}
                className="flex-1 min-w-[140px] rounded-lg p-3"
                style={{
                  backgroundColor: "var(--theme-surface-raised)",
                  border: "1px solid var(--theme-surface-border)",
                }}
              >
                <p
                  className="text-[10px] font-medium uppercase tracking-wider mb-1"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  {label}
                </p>
                <p
                  className="text-xl font-bold font-mono tabular-nums"
                  style={{ color: "var(--theme-text-primary)" }}
                >
                  {fmtValue(kpi.metric, kpi.current)}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--theme-text-muted)" }}
                  >
                    prev: {fmtValue(kpi.metric, kpi.previous)}
                  </span>
                  {kpi.delta_pct !== null && (
                    <span
                      className="text-[10px] font-semibold font-mono"
                      style={{ color: deltaColor }}
                    >
                      {arrow} {Math.abs(kpi.delta_pct).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
