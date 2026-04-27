import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import { useChartColors, useTooltipStyle } from "../hooks/useChartColors";
import type { FpTrendPoint } from "../types";

interface Props {
  data: FpTrendPoint[] | null;
  loading: boolean;
}

function fmtMonth(v: string): string {
  const [y, m] = v.split("-");
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function FPRateTrendChart({ data, loading }: Props) {
  const cc = useChartColors();
  const tooltipStyle = useTooltipStyle();

  const inner = loading || !data ? (
    <ChartSkeleton height={280} />
  ) : data.length === 0 ? (
    <p className="text-sm py-8 text-center" style={{ color: "var(--theme-text-muted)" }}>No data available</p>
  ) : (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="fpRateGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
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
          content={({ active, payload, label }) => {
            if (!active || !payload || payload.length === 0) return null;
            const p = payload[0].payload as FpTrendPoint;
            return (
              <div style={tooltipStyle} className="px-3 py-2">
                <p className="font-medium mb-1">{fmtMonth(label as string)}</p>
                <p>FP Rate: <span className="font-mono">{p.fp_rate !== null ? `${p.fp_rate.toFixed(1)}%` : "—"}</span></p>
                <p>TP Count: <span className="font-mono">{p.tp_count}</span></p>
                <p>FP Count: <span className="font-mono">{p.fp_count}</span></p>
                <p>Total: <span className="font-mono">{p.total}</span></p>
              </div>
            );
          }}
        />
        <ReferenceLine
          x="2025-03"
          stroke="#f59e0b"
          strokeDasharray="5 5"
          label={{ value: "SOAR", fill: "#f59e0b", fontSize: 10, position: "insideTopRight" }}
        />
        <Area
          type="monotone"
          dataKey="fp_rate"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#fpRateGrad)"
          name="FP Rate %"
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );

  return <Card title="False Positive Rate Trend">{inner}</Card>;
}
