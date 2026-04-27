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

  const totalTickets = data?.reduce((s, d) => s + d.total, 0) ?? 0;
  const fpTotal = data?.reduce((s, d) => s + d.fp_count, 0) ?? 0;
  const tpTotal = data?.reduce((s, d) => s + d.tp_count, 0) ?? 0;

  const inner = loading || !data ? (
    <ChartSkeleton />
  ) : data.length === 0 ? (
    <p className="text-sm py-8 text-center" style={{ color: "var(--theme-text-muted)" }}>No data available</p>
  ) : (
    <>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-2xl font-semibold font-mono" style={{ color: "var(--theme-text-primary)" }}>{totalTickets.toLocaleString()}</span>
        <span className="text-xs" style={{ color: "var(--theme-text-muted)" }}>total</span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="fpGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#9b9ba8" stopOpacity={0.1} />
              <stop offset="95%" stopColor="#9b9ba8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="tpGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} opacity={0.2} />
          <XAxis
            dataKey="date"
            tick={{ fill: cc.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => {
              const d = new Date(v);
              return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
            }}
          />
          <YAxis tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={35} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(v: string) => new Date(v).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
          />
          <Area type="monotone" dataKey="fp_count" stroke="#9b9ba8" strokeWidth={1.5} fill="url(#fpGrad)" name="False Positive" />
          <Area type="monotone" dataKey="tp_count" stroke="#10b981" strokeWidth={1.5} fill="url(#tpGrad)" name="True Positive" />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-2 text-[11px]" style={{ color: "var(--theme-text-muted)" }}>
        <span className="flex items-center gap-1.5"><span className="w-2 h-0.5 rounded-full" style={{ backgroundColor: "#9b9ba8" }} />False Positive {fpTotal.toLocaleString()}</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-0.5 rounded-full" style={{ backgroundColor: "#10b981" }} />True Positive {tpTotal.toLocaleString()}</span>
      </div>
    </>
  );

  if (bare) return <div className="h-full">{inner}</div>;
  return <Card title="Ticket Volume"><div style={{ height: 280 }}>{inner}</div></Card>;
}
