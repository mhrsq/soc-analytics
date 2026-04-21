import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import type { ValidationBreakdown } from "../types";

interface Props {
  data: ValidationBreakdown | null;
  loading: boolean;
  bare?: boolean;
}

export function ValidationDonut({ data, loading, bare }: Props) {
  const inner = loading || !data ? (
    <ChartSkeleton />
  ) : (
    <div className="h-full flex flex-col justify-center space-y-5 py-2">
      {/* True Positive */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-[6px] h-[6px] rounded-sm shrink-0" style={{ backgroundColor: "#10b981" }} />
          <span className="text-xs" style={{ color: "var(--theme-text-secondary)" }}>True Positive</span>
          <span className="ml-auto text-lg font-semibold font-mono tabular-nums" style={{ color: "#10b981" }}>
            {data.total > 0 ? ((data.true_positive / data.total) * 100).toFixed(1) : "0.0"}%
          </span>
        </div>
        <p className="text-[11px] font-mono pl-3.5" style={{ color: "var(--theme-text-muted)" }}>
          {data.true_positive} / {data.total} tickets
        </p>
      </div>

      {/* False Positive */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-[6px] h-[6px] rounded-sm shrink-0" style={{ backgroundColor: "#9b9ba8" }} />
          <span className="text-xs" style={{ color: "var(--theme-text-secondary)" }}>False Positive</span>
          <span className="ml-auto text-lg font-semibold font-mono tabular-nums" style={{ color: "var(--theme-text-primary)" }}>
            {data.total > 0 ? ((data.false_positive / data.total) * 100).toFixed(1) : "0.0"}%
          </span>
        </div>
        <p className="text-[11px] font-mono pl-3.5" style={{ color: "var(--theme-text-muted)" }}>
          {data.false_positive} / {data.total} tickets
        </p>
      </div>

      {/* Not Specified */}
      {data.not_specified > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-[6px] h-[6px] rounded-sm shrink-0" style={{ backgroundColor: "#3e3e48" }} />
            <span className="text-xs" style={{ color: "var(--theme-text-muted)" }}>Not Specified</span>
            <span className="ml-auto text-sm font-mono tabular-nums" style={{ color: "var(--theme-text-muted)" }}>
              {data.total > 0 ? ((data.not_specified / data.total) * 100).toFixed(1) : "0.0"}%
            </span>
          </div>
        </div>
      )}
    </div>
  );

  if (bare) return <div className="h-full">{inner}</div>;
  return <Card title="Alert Quality"><div style={{ minHeight: 180 }}>{inner}</div></Card>;
}
