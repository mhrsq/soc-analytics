import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import type { IncidentFunnelStep } from "../types";

interface Props {
  data: IncidentFunnelStep[] | null;
  loading: boolean;
}

const STEP_COLORS = [
  "var(--theme-accent)",
  "#f59e0b",
  "#f97316",
  "#ef4444",
];

export function IncidentFunnel({ data, loading }: Props) {
  const inner =
    loading || !data ? (
      <ChartSkeleton height={240} />
    ) : data.length === 0 ? (
      <p
        className="text-sm py-8 text-center"
        style={{ color: "var(--theme-text-muted)" }}
      >
        No data available
      </p>
    ) : (
      <div className="space-y-2.5 py-2">
        {data.map((step, i) => {
          const widthPct = Math.max(step.pct_of_total, 6);
          const color = STEP_COLORS[i] || STEP_COLORS[STEP_COLORS.length - 1];

          return (
            <div key={step.step}>
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--theme-text-secondary)" }}
                >
                  {step.step}
                </span>
                <span
                  className="text-xs font-mono tabular-nums"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  {step.count.toLocaleString()}{" "}
                  <span className="text-[10px]">({step.pct_of_total.toFixed(1)}%)</span>
                </span>
              </div>
              <div
                className="h-7 rounded overflow-hidden"
                style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-border) 40%, transparent)" }}
              >
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );

  return <Card title="Alert to Incident Funnel">{inner}</Card>;
}
