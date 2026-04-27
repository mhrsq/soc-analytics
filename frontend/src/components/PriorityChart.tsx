import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import { useChartColors, useTooltipStyle } from "../hooks/useChartColors";
import type { PriorityItem } from "../types";

interface Props {
  data: PriorityItem[] | null;
  loading: boolean;
  bare?: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
  "P1 - Critical": "#ef4444",   // red
  "P1-Critical":   "#ef4444",
  Critical:        "#ef4444",
  "P2 - High":     "#f97316",   // orange
  "P2-High":       "#f97316",
  High:            "#f97316",
  "P3 - Medium":   "#eab308",   // yellow
  "P3-Medium":     "#eab308",
  Medium:          "#eab308",
  "P4 - Low":      "#22c55e",   // green
  "P4-Low":        "#22c55e",
  Low:             "#22c55e",
  Normal:          "#3b82f6",    // blue
};

function getPriorityColor(priority: string): string {
  if (PRIORITY_COLORS[priority]) return PRIORITY_COLORS[priority];
  const p = priority.toLowerCase();
  if (p.includes("critical")) return "#ef4444";
  if (p.includes("high")) return "#f97316";
  if (p.includes("medium")) return "#eab308";
  if (p.includes("low")) return "#22c55e";
  return "#3b82f6";
}

export function PriorityChart({ data, loading, bare }: Props) {
  const cc = useChartColors();
  const tooltipStyle = useTooltipStyle();

  const inner = loading || !data ? (
    <ChartSkeleton />
  ) : data.length === 0 ? (
    <p className="text-sm py-8 text-center" style={{ color: "var(--theme-text-muted)" }}>No data available</p>
  ) : (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" barCategoryGap="20%">
        <XAxis type="number" tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="priority" tick={{ fill: cc.label, fontSize: 11 }} tickLine={false} axisLine={false} width={95} />
        <Tooltip contentStyle={tooltipStyle}
          formatter={(value: number) => [`${value} tickets`, "Count"]} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
          {data.map((entry) => (
            <Cell key={entry.priority} fill={getPriorityColor(entry.priority)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  if (bare) return <>{inner}</>;
  return <Card title="Priority Distribution">{inner}</Card>;
}
