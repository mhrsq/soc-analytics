import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import type { PostureScore } from "../types";

interface Props {
  data: PostureScore | null;
  loading: boolean;
  bare?: boolean;
}

const GRADE_COLORS: Record<string, string> = {
  S: "var(--theme-accent)",
  A: "#10b981",
  B: "#f59e0b",
  C: "#f97316",
  D: "#ef4444",
};

interface SubMetric {
  label: string;
  value: number;
}

function getSubMetrics(data: PostureScore): SubMetric[] {
  return [
    { label: "MTTD SLA", value: data.mttd_sla_pct },
    { label: "MTTR SLA", value: data.mttr_sla_pct },
    { label: "FP Reduction", value: 100 - data.fp_rate },
    { label: "Resolution", value: data.resolution_rate },
    { label: "Low Incidents", value: Math.max(0, 100 - data.incident_rate * 100) },
  ];
}

function metricBarColor(value: number): string {
  if (value >= 80) return "#10b981";
  if (value >= 60) return "#f59e0b";
  if (value >= 40) return "#f97316";
  return "#ef4444";
}

export function PostureScoreCard({ data, loading, bare = false }: Props) {
  if (loading || !data) {
    const skeleton = <ChartSkeleton height={240} />;
    if (bare) return skeleton;
    return (
      <Card title="Security Posture Score">
        {skeleton}
      </Card>
    );
  }

  const gradeColor = GRADE_COLORS[data.grade] || "#6b7280";
  const subMetrics = getSubMetrics(data);

  const inner = (
    <div className="flex flex-col items-center gap-4">
      {/* Grade + Score */}
      <div className="flex flex-col items-center gap-1 py-2">
        <span
          className="text-5xl font-black leading-none"
          style={{ color: gradeColor }}
        >
          {data.grade}
        </span>
        <span
          className="text-2xl font-bold font-mono tabular-nums"
          style={{ color: "var(--theme-text-primary)" }}
        >
          {data.score.toFixed(1)}
        </span>
        <span
          className="text-[10px] uppercase tracking-wider"
          style={{ color: "var(--theme-text-muted)" }}
        >
          Composite Score
        </span>
      </div>

      {/* Sub-metric bars */}
      <div className="w-full space-y-2.5">
        {subMetrics.map((m) => {
          const clamped = Math.max(0, Math.min(100, m.value));
          return (
            <div key={m.label} className="flex items-center gap-3">
              <span
                className="text-[11px] w-24 text-right shrink-0"
                style={{ color: "var(--theme-text-secondary)" }}
              >
                {m.label}
              </span>
              <div
                className="flex-1 h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: "var(--theme-surface-border)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${clamped}%`,
                    backgroundColor: metricBarColor(clamped),
                  }}
                />
              </div>
              <span
                className="text-[11px] font-mono tabular-nums w-10 text-right shrink-0"
                style={{ color: "var(--theme-text-muted)" }}
              >
                {clamped.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (bare) return <>{inner}</>;
  return <Card title="Security Posture Score">{inner}</Card>;
}
