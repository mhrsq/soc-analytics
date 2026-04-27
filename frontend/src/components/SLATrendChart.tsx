import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import { useChartColors, useTooltipStyle } from "../hooks/useChartColors";
import type { SlaTrendPoint } from "../types";

interface Props {
  data: SlaTrendPoint[] | null;
  loading: boolean;
}

function fmtMonth(v: string): string {
  const [y, m] = v.split("-");
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function SLATrendChart({ data, loading }: Props) {
  const cc = useChartColors();
  const tooltipStyle = useTooltipStyle();

  const inner = loading || !data ? (
    <ChartSkeleton height={280} />
  ) : data.length === 0 ? (
    <p className="text-sm py-8 text-center" style={{ color: "var(--theme-text-muted)" }}>No data available</p>
  ) : (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data}>
        <defs>
          <linearGradient id="mttdSlaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={cc.accent} stopOpacity={0.2} />
            <stop offset="95%" stopColor={cc.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} opacity={0.2} />
        <XAxis
          dataKey="month"
          tick={{ fill: cc.tick, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtMonth}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: cc.tick, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={fmtMonth}
          formatter={(value: unknown, name: string) => {
            const v = value as number | null;
            return [v !== null ? `${v.toFixed(1)}%` : "—", name];
          }}
        />
        <ReferenceLine
          y={99}
          stroke="#ef4444"
          strokeDasharray="5 5"
          label={{ value: "Target 99%", fill: "#ef4444", fontSize: 10, position: "insideTopRight" }}
        />
        <Area
          type="monotone"
          dataKey="mttd_sla_pct"
          stroke={cc.accent}
          strokeWidth={2}
          fill="url(#mttdSlaGrad)"
          name="MTTD SLA %"
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="mttr_sla_pct"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
          name="MTTR SLA %"
          connectNulls
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: cc.tick }}
          iconType="line"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );

  return <Card title="SLA Compliance Trend">{inner}</Card>;
}
