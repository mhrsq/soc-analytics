import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import { useChartColors, useTooltipStyle } from "../hooks/useChartColors";
import type { FpPatternItem } from "../types";

interface Props {
  data: FpPatternItem[] | null;
  loading: boolean;
}

function barColor(fpRate: number): string {
  if (fpRate >= 60) return "#ef4444";
  if (fpRate >= 30) return "#f59e0b";
  return "#10b981";
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function FPPatternChart({ data, loading }: Props) {
  const cc = useChartColors();
  const tooltipStyle = useTooltipStyle();

  const chartData = data
    ? [...data].sort((a, b) => b.fp_rate - a.fp_rate)
    : [];

  const chartHeight = Math.max(200, chartData.length * 32);

  const inner =
    loading || !data ? (
      <ChartSkeleton height={280} />
    ) : chartData.length === 0 ? (
      <p
        className="text-sm py-8 text-center"
        style={{ color: "var(--theme-text-muted)" }}
      >
        No FP pattern data available
      </p>
    ) : (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ left: 10, right: 80, top: 5, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={cc.grid}
            opacity={0.2}
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: cc.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <YAxis
            dataKey="category"
            type="category"
            tick={{ fill: cc.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={130}
            tickFormatter={(v: string) => truncate(v, 25)}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const p = payload[0].payload as FpPatternItem;
              return (
                <div style={tooltipStyle} className="px-3 py-2 text-xs">
                  <p className="font-medium mb-1">{p.category}</p>
                  <p>
                    FP Rate:{" "}
                    <span className="font-mono">{p.fp_rate.toFixed(1)}%</span>
                  </p>
                  <p>
                    Total: <span className="font-mono">{p.total}</span>
                  </p>
                  <p>
                    FP Count: <span className="font-mono">{p.fp_count}</span>
                  </p>
                  <p>
                    TP Count: <span className="font-mono">{p.tp_count}</span>
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="fp_rate" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {chartData.map((entry) => (
              <Cell key={entry.category} fill={barColor(entry.fp_rate)} />
            ))}
            <LabelList
              dataKey="fp_rate"
              position="right"
              style={{ fill: cc.label, fontSize: 10, fontFamily: "monospace" }}
              formatter={(value: number) => {
                const item = chartData.find((d) => d.fp_rate === value);
                return item
                  ? `${value.toFixed(0)}% (${item.fp_count}/${item.total})`
                  : `${value.toFixed(0)}%`;
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );

  return <Card title="FP Rate by Category">{inner}</Card>;
}
