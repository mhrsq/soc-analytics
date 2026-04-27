import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import { useChartColors, useTooltipStyle } from "../hooks/useChartColors";
import { api } from "../api/client";
import type { SlaBreachGroup } from "../types";

type Dimension = "analyst" | "customer" | "priority" | "hour";

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "analyst", label: "Analyst" },
  { key: "customer", label: "Customer" },
  { key: "priority", label: "Priority" },
  { key: "hour", label: "Hour of Day" },
];

interface Props {
  start?: string;
  end?: string;
  bare?: boolean;
}

export function SlaBreachAnalysis({ start, end, bare = false }: Props) {
  const cc = useChartColors();
  const tooltipStyle = useTooltipStyle();

  const [dimension, setDimension] = useState<Dimension>("analyst");
  const [data, setData] = useState<SlaBreachGroup[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);

    const f = { start, end };
    api.getSlaBreachAnalysis(f, dimension)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dimension, start, end]);

  const chartHeight = data && data.length > 0 ? Math.max(200, data.length * 35) : 200;

  const inner = loading ? (
    <ChartSkeleton height={200} />
  ) : !data || data.length === 0 ? (
    <p className="text-sm py-8 text-center" style={{ color: "var(--theme-text-muted)" }}>No breach data available</p>
  ) : (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 80, left: 8, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} opacity={0.2} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: cc.tick, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="group_value"
          tick={{ fill: cc.label, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          content={({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;
            const p = payload[0].payload as SlaBreachGroup;
            return (
              <div style={tooltipStyle} className="px-3 py-2 text-xs">
                <p className="font-medium mb-1">{p.group_value}</p>
                <p>Breached: <span className="font-mono">{p.breached} / {p.total}</span></p>
                <p>Breach rate: <span className="font-mono">{p.breach_pct.toFixed(1)}%</span></p>
                {p.avg_mttd_min !== null && (
                  <p>Avg MTTD: <span className="font-mono">{p.avg_mttd_min.toFixed(0)} min</span></p>
                )}
              </div>
            );
          }}
        />
        <Bar dataKey="breached" name="SLA Breaches" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={`rgba(239,68,68,${Math.max(0.25, Math.min(0.85, entry.breach_pct / 100 + 0.25))})`}
            />
          ))}
          <LabelList
            dataKey="breach_pct"
            position="right"
            style={{ fill: cc.label, fontSize: 10 }}
            formatter={(value: number) => `${value?.toFixed(0) ?? "?"}%`}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const dimensionControls = (
    <div className="flex items-center gap-1">
      {DIMENSIONS.map((d) => (
        <button
          key={d.key}
          onClick={() => setDimension(d.key)}
          className="px-2.5 py-1 text-[11px] font-medium rounded transition-colors"
          style={{
            backgroundColor: dimension === d.key
              ? "color-mix(in srgb, var(--theme-accent) 20%, transparent)"
              : "transparent",
            color: dimension === d.key
              ? "var(--theme-accent)"
              : "var(--theme-text-muted)",
            border: "1px solid",
            borderColor: dimension === d.key
              ? "color-mix(in srgb, var(--theme-accent) 40%, transparent)"
              : "var(--theme-surface-border)",
          }}
        >
          {d.label}
        </button>
      ))}
    </div>
  );

  if (bare) return (
    <>
      <div className="mb-2">{dimensionControls}</div>
      {inner}
    </>
  );

  return (
    <Card
      title="SLA Breach Analysis"
      action={dimensionControls}
    >
      {inner}
    </Card>
  );
}
