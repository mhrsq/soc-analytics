import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import { useChartColors, useTooltipStyle } from "../hooks/useChartColors";
import type { CustomerItem } from "../types";

interface Props {
  data: CustomerItem[] | null;
  loading: boolean;
  bare?: boolean;
}

export function CustomerChart({ data, loading, bare }: Props) {
  const cc = useChartColors();
  const tooltipStyle = useTooltipStyle();

  const inner = loading || !data ? (
    <ChartSkeleton />
  ) : data.length === 0 ? (
    <p className="text-sm py-8 text-center" style={{ color: "var(--theme-text-muted)" }}>No data available</p>
  ) : (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barCategoryGap="20%">
        <XAxis dataKey="customer" tick={{ fill: cc.label, fontSize: 11 }} tickLine={false} axisLine={{ stroke: cc.grid }} />
        <YAxis tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
        <Tooltip contentStyle={tooltipStyle}
          formatter={(value: number) => [`${value} tickets`, "Total"]} />
        <Bar dataKey="total" fill="#9b9ba8" radius={[3, 3, 0, 0]} barSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );

  if (bare) return <div className="h-full">{inner}</div>;
  return <Card title="Tickets by Customer"><div style={{ height: 220 }}>{inner}</div></Card>;
}
