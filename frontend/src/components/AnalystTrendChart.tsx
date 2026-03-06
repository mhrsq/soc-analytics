import { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Area, ComposedChart,
} from "recharts";
import { api } from "../api/client";
import { Spinner } from "./Spinner";
import { useChartColors, useTooltipStyle } from "../hooks/useChartColors";
import type { TrendPoint, TeamTrendPoint } from "../types";
import { TrendingUp, Calendar, Users, ChevronDown } from "lucide-react";

const TIER_COLORS: Record<string, string> = {
  S: "#FFD700", A: "#22C55E", B: "#3B82F6", C: "#F59E0B", D: "#EF4444",
};

// Distinct colors for comparison overlay (up to 10 analysts)
const ANALYST_COLORS = [
  "#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#A855F7",
  "#14B8A6", "#EC4899", "#F97316", "#06B6D4", "#84CC16",
];

interface SingleTrendProps {
  analyst: string;
  granularity?: "weekly" | "monthly";
  /** Compact mode for embedding in detail modal */
  compact?: boolean;
}

/** Single analyst trend line */
export function AnalystTrendChart({ analyst, granularity = "weekly", compact = false }: SingleTrendProps) {
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<"composite" | "speed" | "detection" | "accuracy" | "volume" | "sla" | "throughput" | "complexity">("composite");
  const cc = useChartColors();
  const tooltipStyle = useTooltipStyle();

  useEffect(() => {
    setLoading(true);
    api
      .getAnalystTrend(analyst, granularity, compact ? 12 : 26)
      .then((r) => setPoints(r.points))
      .catch(() => setPoints([]))
      .finally(() => setLoading(false));
  }, [analyst, granularity, compact]);

  const chartData = useMemo(() => {
    return points.map((p) => ({
      period: p.period.replace(/^\d{4}-/, ""),
      fullPeriod: p.period,
      score: metric === "composite" ? p.composite_score : p.metrics[metric],
      tickets: p.total_tickets,
      tier: p.tier,
      sla: p.sla_pct,
      ...p.metrics,
    }));
  }, [points, metric]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (points.length < 2) {
    return (
      <div className="text-center py-6">
        <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: "var(--theme-text-muted)" }} />
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
          Not enough historical data yet. Snapshots are taken weekly.
        </p>
      </div>
    );
  }

  const metricOptions = [
    { value: "composite", label: "Composite" },
    { value: "speed", label: "Speed" },
    { value: "detection", label: "Detection" },
    { value: "accuracy", label: "Accuracy" },
    { value: "volume", label: "Volume" },
    { value: "sla", label: "SLA" },
    { value: "throughput", label: "Throughput" },
    { value: "complexity", label: "Complexity" },
  ];

  return (
    <div>
      {/* Metric selector */}
      {!compact && (
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--theme-text-muted)" }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
            Performance Trend
          </span>
          <div className="ml-auto relative">
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as typeof metric)}
              className="appearance-none pl-2 pr-6 py-1 rounded text-[11px] font-medium cursor-pointer"
              style={{
                backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 60%, transparent)",
                color: "var(--theme-text-secondary)",
                border: "1px solid var(--theme-surface-border)",
              }}
            >
              {metricOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: "var(--theme-text-muted)" }} />
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={compact ? 160 : 240}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: compact ? -20 : 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} opacity={0.3} />
          <XAxis
            dataKey="period"
            tick={{ fill: cc.tick, fontSize: compact ? 9 : 10 }}
            axisLine={{ stroke: cc.grid }}
            tickLine={false}
            interval={compact ? "preserveStartEnd" : 0}
            angle={compact ? 0 : -30}
            textAnchor={compact ? "middle" : "end"}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: cc.tick, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={compact ? 25 : 35}
          />
          {/* Tier threshold lines */}
          {!compact && (
            <>
              <ReferenceLine y={90} stroke={TIER_COLORS.S} strokeDasharray="3 3" opacity={0.3} />
              <ReferenceLine y={75} stroke={TIER_COLORS.A} strokeDasharray="3 3" opacity={0.3} />
              <ReferenceLine y={60} stroke={TIER_COLORS.B} strokeDasharray="3 3" opacity={0.3} />
              <ReferenceLine y={40} stroke={TIER_COLORS.C} strokeDasharray="3 3" opacity={0.3} />
            </>
          )}
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number) => [value.toFixed(1), metric === "composite" ? "Score" : metric]}
            labelFormatter={(label) => `Period: ${label}`}
          />
          <Area
            type="monotone"
            dataKey="score"
            fill={cc.accent}
            fillOpacity={0.08}
            stroke="none"
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={cc.accent}
            strokeWidth={2}
            dot={{ r: 3, fill: cc.accent, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: cc.accent, stroke: cc.raised, strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}


// ── Team Comparison Chart ──────────────────────────────────────

interface ComparisonProps {
  /** Pre-selected analysts to show (if empty, shows all) */
  selectedAnalysts?: string[];
  granularity?: "weekly" | "monthly";
}

export function TeamTrendChart({ selectedAnalysts, granularity = "weekly" }: ComparisonProps) {
  const [data, setData] = useState<TeamTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedAnalysts || []));
  const cc = useChartColors();
  const tooltipStyle = useTooltipStyle();

  useEffect(() => {
    setLoading(true);
    api
      .getTeamTrend(granularity)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [granularity]);

  // Derive all analyst names
  const allAnalysts = useMemo(() => {
    const names = new Set<string>();
    data.forEach((d) => d.analysts.forEach((a) => names.add(a.analyst)));
    return Array.from(names).sort();
  }, [data]);

  // Initialize selected if empty
  useEffect(() => {
    if (selected.size === 0 && allAnalysts.length > 0) {
      setSelected(new Set(allAnalysts.slice(0, 5)));
    }
  }, [allAnalysts, selected.size]);

  // Transform data for Recharts (each analyst as a separate dataKey)
  const chartData = useMemo(() => {
    return data.map((d) => {
      const point: Record<string, string | number> = {
        period: d.period.replace(/^\d{4}-/, ""),
        fullPeriod: d.period,
      };
      d.analysts.forEach((a) => {
        point[a.analyst] = a.composite_score;
      });
      return point;
    });
  }, [data]);

  const toggleAnalyst = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Spinner /></div>;
  }

  if (data.length < 2) {
    return (
      <div className="text-center py-8">
        <Users className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: "var(--theme-text-muted)" }} />
        <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
          Not enough trend data yet. Snapshots are taken weekly.
        </p>
      </div>
    );
  }

  const activeAnalysts = allAnalysts.filter((a) => selected.has(a));

  return (
    <div>
      {/* Analyst toggle chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {allAnalysts.map((name, i) => {
          const color = ANALYST_COLORS[i % ANALYST_COLORS.length];
          const active = selected.has(name);
          return (
            <button
              key={name}
              onClick={() => toggleAnalyst(name)}
              className="text-[10px] font-medium px-2 py-1 rounded-full transition-all"
              style={{
                backgroundColor: active ? `color-mix(in srgb, ${color} 20%, transparent)` : "transparent",
                color: active ? color : "var(--theme-text-muted)",
                border: `1px solid ${active ? color : "var(--theme-surface-border)"}`,
                opacity: active ? 1 : 0.5,
              }}
            >
              {name.split(" ")[0]}
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} opacity={0.3} />
          <XAxis
            dataKey="period"
            tick={{ fill: cc.tick, fontSize: 10 }}
            axisLine={{ stroke: cc.grid }}
            tickLine={false}
            angle={-30}
            textAnchor="end"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: cc.tick, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          {/* Tier lines */}
          <ReferenceLine y={90} stroke={TIER_COLORS.S} strokeDasharray="3 3" opacity={0.2} />
          <ReferenceLine y={75} stroke={TIER_COLORS.A} strokeDasharray="3 3" opacity={0.2} />
          <ReferenceLine y={60} stroke={TIER_COLORS.B} strokeDasharray="3 3" opacity={0.2} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend
            wrapperStyle={{ fontSize: 10, color: cc.tick }}
            iconType="circle"
            iconSize={6}
          />
          {activeAnalysts.map((name, i) => {
            const idx = allAnalysts.indexOf(name);
            const color = ANALYST_COLORS[idx % ANALYST_COLORS.length];
            return (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                name={name.split(" ")[0]}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
                activeDot={{ r: 4, fill: color, stroke: cc.raised, strokeWidth: 2 }}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
