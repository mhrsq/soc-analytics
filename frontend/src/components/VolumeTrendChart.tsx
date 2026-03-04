import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import { useChartColors, useTooltipStyle } from "../hooks/useChartColors";
import type { VolumePoint } from "../types";

interface Props {
  data: VolumePoint[] | null;
  loading: boolean;
  bare?: boolean;
}

export function VolumeTrendChart({ data, loading, bare }: Props) {
  const cc = useChartColors();
  const tooltipStyle = useTooltipStyle();

  const inner = loading || !data ? (
    <ChartSkeleton />
  ) : data.length === 0 ? (
    <p className="text-sm py-8 text-center" style={{ color: "var(--theme-text-muted)" }}>No data available</p>
  ) : (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00b0ff" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#00b0ff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} opacity={0.3} />
        <XAxis dataKey="date" tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: cc.grid }} />
        <YAxis tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="total" stroke="#00b0ff" strokeWidth={2} fill="url(#volumeGrad)" name="Tickets" />
      </AreaChart>
    </ResponsiveContainer>
  );

  if (bare) return <div className="h-full">{inner}</div>;
  return <Card title="Ticket Volume Trend"><div style={{ height: 280 }}>{inner}</div></Card>;
}
