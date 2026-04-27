import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import type { ValidationBreakdown } from "../types";

interface Props {
  data: ValidationBreakdown | null;
  loading: boolean;
  bare?: boolean;
}

const SEGMENTS = [
  { key: "true_positive", label: "True Positive", color: "#10b981" },
  { key: "false_positive", label: "False Positive", color: "#9b9ba8" },
  { key: "not_specified", label: "Not Specified", color: "var(--theme-text-dim)" },
] as const;

export function ValidationDonut({ data, loading, bare }: Props) {
  const inner = loading || !data ? (
    <ChartSkeleton />
  ) : (() => {
    const total = data.total || 1;
    const tp = (data.true_positive / total) * 100;
    const fp = (data.false_positive / total) * 100;
    const circumference = 2 * Math.PI * 40;

    return (
      <div className="h-full flex items-center gap-4 py-2">
        {/* Ring chart */}
        <div className="relative w-28 h-28 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--theme-surface-border)" strokeWidth="10" />
            {/* Not Specified arc (bottom layer) */}
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--theme-text-dim)" strokeWidth="10"
              strokeDasharray={circumference} strokeDashoffset={0} />
            {/* FP arc */}
            <circle cx="50" cy="50" r="40" fill="none" stroke="#9b9ba8" strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - (tp + fp) / 100)}
              strokeLinecap="round" className="transition-all duration-700" />
            {/* TP arc (top layer) */}
            <circle cx="50" cy="50" r="40" fill="none" stroke="#10b981" strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - tp / 100)}
              strokeLinecap="round" className="transition-all duration-700" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold font-mono" style={{ color: "var(--theme-text-primary)" }}>
              {data.total}
            </span>
            <span className="text-[9px]" style={{ color: "var(--theme-text-muted)" }}>total</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3">
          {SEGMENTS.map(seg => {
            const val = data[seg.key];
            if (seg.key === "not_specified" && val === 0) return null;
            const pctVal = data.total > 0 ? ((val / data.total) * 100).toFixed(1) : "0.0";
            return (
              <div key={seg.key}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                  <span className="text-xs" style={{ color: "var(--theme-text-secondary)" }}>{seg.label}</span>
                  <span className="ml-auto text-sm font-semibold font-mono tabular-nums" style={{ color: seg.color }}>
                    {pctVal}%
                  </span>
                </div>
                <p className="text-[10px] font-mono pl-4" style={{ color: "var(--theme-text-muted)" }}>
                  {val} tickets
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  if (bare) return <div className="h-full">{inner}</div>;
  return <Card title="Alert Quality"><div style={{ minHeight: 180 }}>{inner}</div></Card>;
}
