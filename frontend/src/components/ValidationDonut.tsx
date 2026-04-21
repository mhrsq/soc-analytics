import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import { useTooltipStyle } from "../hooks/useChartColors";
import type { ValidationBreakdown } from "../types";

interface Props {
  data: ValidationBreakdown | null;
  loading: boolean;
  bare?: boolean;
}

const COLORS: Record<string, string> = {
  "True Positive": "#00e676",
  "False Positive": "#ff9100",
  "Not Specified": "#627d98",
};

function toChartData(data: ValidationBreakdown) {
  const total = data.total || 1;
  return [
    { label: "True Positive", value: data.true_positive, pct: +(data.true_positive / total * 100).toFixed(1) },
    { label: "False Positive", value: data.false_positive, pct: +(data.false_positive / total * 100).toFixed(1) },
    { label: "Not Specified", value: data.not_specified, pct: +(data.not_specified / total * 100).toFixed(1) },
  ].filter((d) => d.value > 0);
}

export function ValidationDonut({ data, loading, bare }: Props) {
  const tooltipStyle = useTooltipStyle();
  const chartData = data ? toChartData(data) : [];

  const inner = loading || !data ? (
    <ChartSkeleton />
  ) : chartData.length === 0 ? (
    <p className="text-sm py-8 text-center" style={{ color: "var(--theme-text-muted)" }}>No data available</p>
  ) : (
    <div className="flex items-center gap-4 h-full">
      <ResponsiveContainer width="55%" height="100%">
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="label" cx="50%" cy="50%"
            innerRadius={55} outerRadius={85} paddingAngle={2} strokeWidth={0}>
            {chartData.map((entry) => (
              <Cell key={entry.label} fill={COLORS[entry.label] ?? "#00b0ff"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number, name: string) => [`${value.toLocaleString()} tickets`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2">
        {chartData.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[item.label] ?? "#00b0ff" }} />
            <span className="text-xs flex-1 truncate" style={{ color: "var(--theme-text-muted)" }}>{item.label}</span>
            <span className="text-xs font-mono" style={{ color: "var(--theme-text-secondary)" }}>{item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (bare) return <div className="h-full">{inner}</div>;
  return <Card title="TP vs FP Ratio"><div style={{ height: 220 }}>{inner}</div></Card>;
}
