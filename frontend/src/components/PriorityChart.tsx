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
  "P1 - Critical": "#ef4444",
  "P1 -Critical": "#ef4444",
  "Critical": "#ef4444",
  "P2 - High": "#f59e0b",
  "P2 -High": "#f59e0b",
  "High": "#f59e0b",
  "P3 - Medium": "#9b9ba8",
  "P3 -Medium": "#9b9ba8",
  "Medium": "#9b9ba8",
  "P4 - Low": "#3e3e48",
  "P4 -Low": "#3e3e48",
  "Low": "#3e3e48",
};

function getPriorityColor(priority: string): string {
  if (PRIORITY_COLORS[priority]) return PRIORITY_COLORS[priority];
  const lower = priority.toLowerCase();
  if (lower.includes("critical")) return "#ef4444";
  if (lower.includes("high")) return "#f59e0b";
  if (lower.includes("medium")) return "#9b9ba8";
  if (lower.includes("low")) return "#3e3e48";
  return "#646471";
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
