import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar, ScatterChart, Scatter, Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { ChartType } from "../types";

const COLORS = ["#60a5fa", "#10b981", "#ef4444", "#f59e0b", "#9b9ba8", "#a78bfa", "#646471", "#3e3e48"];

function useChartColors() {
  return useMemo(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      grid: s.getPropertyValue("--theme-surface-border").trim() || "#334e68",
      tick: s.getPropertyValue("--theme-text-muted").trim() || "#829ab1",
      label: s.getPropertyValue("--theme-text-secondary").trim() || "#d9e2ec",
      raised: s.getPropertyValue("--theme-surface-raised").trim() || "#1a3a52",
    };
  }, []);
}

interface Props {
  chartType: ChartType;
  data: unknown[];
  height?: number | string;
  onClick?: (entry: unknown) => void;
}

const tooltipStyle = {
  backgroundColor: "var(--theme-surface-raised)",
  border: "1px solid var(--theme-surface-border)",
  borderRadius: "8px",
  color: "var(--theme-text-primary)",
  fontSize: 12,
};

// Helper: auto-detect keys for charting
function getKeys(data: unknown[]): { categoryKey: string; valueKeys: string[] } {
  if (!data.length) return { categoryKey: "", valueKeys: [] };
  const sample = data[0] as Record<string, unknown>;
  const keys = Object.keys(sample);
  const stringKeys = keys.filter(k => typeof sample[k] === "string" || k === "date" || k === "name" || k === "label");
  const numericKeys = keys.filter(k => typeof sample[k] === "number");
  const categoryKey = stringKeys.find(k => k === "date") || stringKeys.find(k => k === "name") || stringKeys.find(k => k === "label")
    || stringKeys.find(k => k === "priority") || stringKeys.find(k => k === "customer") || stringKeys.find(k => k === "analyst")
    || stringKeys.find(k => k === "rule_name") || stringKeys[0] || keys[0] || "";
  return { categoryKey, valueKeys: numericKeys.slice(0, 4) }; // max 4 series
}

export function ChartRenderer({ chartType, data, height = "100%", onClick }: Props) {
  const cc = useChartColors();

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm h-full" style={{ color: "var(--theme-text-muted)" }}>
        No data available
      </div>
    );
  }

  const { categoryKey, valueKeys } = getKeys(data);

  const handleClick = (entry: unknown) => {
    if (onClick) onClick(entry);
  };

  switch (chartType) {
    case "area":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data as Record<string, unknown>[]}>
            <defs>
              {valueKeys.map((k, i) => (
                <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} opacity={0.3} />
            <XAxis dataKey={categoryKey} tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: cc.grid }} />
            <YAxis tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={45} />
            <Tooltip contentStyle={tooltipStyle} />
            {valueKeys.map((k, i) => (
              <Area key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2}
                fill={`url(#grad-${k})`} name={k} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );

    case "line":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data as Record<string, unknown>[]}>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} opacity={0.3} />
            <XAxis dataKey={categoryKey} tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: cc.grid }} />
            <YAxis tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={45} />
            <Tooltip contentStyle={tooltipStyle} />
            {valueKeys.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2}
                dot={{ fill: COLORS[i % COLORS.length], r: 3 }} name={k} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );

    case "bar":
    case "stacked-bar":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data as Record<string, unknown>[]}>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} opacity={0.3} />
            <XAxis dataKey={categoryKey} tick={{ fill: cc.label, fontSize: 11 }} tickLine={false} axisLine={{ stroke: cc.grid }} />
            <YAxis tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={45} />
            <Tooltip contentStyle={tooltipStyle} />
            {valueKeys.map((k, i) => (
              <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]}
                stackId={chartType === "stacked-bar" ? "stack" : undefined}
                onClick={(e) => handleClick(e)} cursor="pointer" />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );

    case "horizontal-bar":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data as Record<string, unknown>[]} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} opacity={0.3} />
            <XAxis type="number" tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey={categoryKey} tick={{ fill: cc.label, fontSize: 11 }} tickLine={false}
              axisLine={false} width={80} />
            <Tooltip contentStyle={tooltipStyle} />
            {valueKeys.map((k, i) => (
              <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]} barSize={18}
                onClick={(e) => handleClick(e)} cursor="pointer" />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );

    case "pie":
    case "donut": {
      const pieData = valueKeys.length >= 1
        ? (data as Record<string, unknown>[]).map(d => ({ name: String(d[categoryKey]), value: Number(d[valueKeys[0]]) }))
        : data;
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={pieData as Record<string, unknown>[]} dataKey="value" nameKey="name"
              cx="50%" cy="50%"
              innerRadius={chartType === "donut" ? height * 0.2 : 0}
              outerRadius={height * 0.35} paddingAngle={2} strokeWidth={0}
              onClick={(e) => handleClick(e)} cursor="pointer"
            >
              {(pieData as unknown[]).map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11, color: cc.tick }} />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    case "radar": {
      const radarData = (data as Record<string, unknown>[]).map(d => ({ subject: String(d[categoryKey]), value: Number(d[valueKeys[0]] ?? 0) }));
      return (
        <ResponsiveContainer width="100%" height={height}>
          <RadarChart data={radarData}>
            <PolarGrid stroke={cc.grid} />
            <PolarAngleAxis dataKey="subject" tick={{ fill: cc.tick, fontSize: 10 }} />
            <PolarRadiusAxis tick={{ fill: cc.tick, fontSize: 10 }} />
            <Radar dataKey="value" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.3} />
          </RadarChart>
        </ResponsiveContainer>
      );
    }

    case "radial-bar": {
      const rbData = (data as Record<string, unknown>[]).slice(0, 6).map((d, i) => ({
        name: String(d[categoryKey]),
        value: Number(d[valueKeys[0]] ?? 0),
        fill: COLORS[i % COLORS.length],
      }));
      return (
        <ResponsiveContainer width="100%" height={height}>
          <RadialBarChart data={rbData} innerRadius="20%" outerRadius="90%" startAngle={180} endAngle={0}>
            <RadialBar dataKey="value" background={{ fill: cc.raised }} cornerRadius={4} />
            <Legend wrapperStyle={{ fontSize: 11, color: cc.tick }} />
            <Tooltip contentStyle={tooltipStyle} />
          </RadialBarChart>
        </ResponsiveContainer>
      );
    }

    case "scatter":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} opacity={0.3} />
            <XAxis dataKey={valueKeys[0] || "x"} name={valueKeys[0]} tick={{ fill: cc.tick, fontSize: 11 }}
              tickLine={false} axisLine={{ stroke: cc.grid }} />
            <YAxis dataKey={valueKeys[1] || valueKeys[0] || "y"} name={valueKeys[1]} tick={{ fill: cc.tick, fontSize: 11 }}
              tickLine={false} axisLine={false} width={45} />
            <Tooltip contentStyle={tooltipStyle} />
            <Scatter data={data as Record<string, unknown>[]} fill={COLORS[0]} onClick={(e) => handleClick(e)} cursor="pointer" />
          </ScatterChart>
        </ResponsiveContainer>
      );

    case "treemap": {
      const tmData = (data as Record<string, unknown>[]).map((d, i) => ({
        name: String(d[categoryKey]),
        size: Number(d[valueKeys[0]] ?? 0),
        fill: COLORS[i % COLORS.length],
      }));
      return (
        <ResponsiveContainer width="100%" height={height}>
          <Treemap data={tmData} dataKey="size" nameKey="name" stroke={cc.raised}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content={((props: any) => {
              const { x, y, width, height: h, name: nm, fill: fl } = props;
              return (
                <g>
                  <rect x={x} y={y} width={width} height={h} fill={fl} opacity={0.8} rx={4} />
                  {width > 40 && h > 20 && (
                    <text x={x + width / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central"
                      fill={cc.label} fontSize={10}>{nm}</text>
                  )}
                </g>
              );
            }) as unknown as React.ReactElement}
          />
        </ResponsiveContainer>
      );
    }

    case "funnel": {
      // Simulate funnel using horizontal bars sorted by value desc
      const sorted = [...(data as Record<string, unknown>[])].sort((a, b) => Number(b[valueKeys[0]] ?? 0) - Number(a[valueKeys[0]] ?? 0));
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={sorted} layout="vertical">
            <XAxis type="number" tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey={categoryKey} tick={{ fill: cc.label, fontSize: 11 }} tickLine={false}
              axisLine={false} width={80} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey={valueKeys[0]} radius={[0, 8, 8, 0]} barSize={20}>
              {sorted.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    case "text-stats": {
      // Text-based stats display — shows each data row as label + value
      const items = (data as Record<string, unknown>[]).slice(0, 10);
      return (
        <div className="h-full overflow-y-auto space-y-3 py-2 px-1">
          {items.map((item, i) => {
            const label = String(item[categoryKey] ?? `Item ${i + 1}`);
            const val = valueKeys[0] ? Number(item[valueKeys[0]] ?? 0) : 0;
            const total = (data as Record<string, unknown>[]).reduce((s, d) => s + Number(d[valueKeys[0]] ?? 0), 0) || 1;
            const pctVal = ((val / total) * 100).toFixed(1);
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2">
                    <span className="w-[6px] h-[6px] rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs" style={{ color: "var(--theme-text-secondary)" }}>{label}</span>
                  </div>
                  <span className="text-base font-semibold font-mono tabular-nums" style={{ color: "var(--theme-text-primary)" }}>
                    {pctVal}%
                  </span>
                </div>
                <p className="text-[11px] font-mono pl-3.5" style={{ color: "var(--theme-text-muted)" }}>
                  {val.toLocaleString()} {valueKeys[0] ?? ""}
                </p>
              </div>
            );
          })}
        </div>
      );
    }

    case "gauge":
    default:
      // Fallback to bar
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data as Record<string, unknown>[]}>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} opacity={0.3} />
            <XAxis dataKey={categoryKey} tick={{ fill: cc.label, fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: cc.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={45} />
            <Tooltip contentStyle={tooltipStyle} />
            {valueKeys.map((k, i) => (
              <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]}
                onClick={(e) => handleClick(e)} cursor="pointer" />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
  }
}
