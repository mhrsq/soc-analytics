import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { PRIORITY_COLORS } from "./helpers";
import type { PriorityItem } from "../../types";

export function PriorityBreakdown({ data, loading }: { data: PriorityItem[] | null; loading: boolean }) {
  if (loading) return <div className="h-full skeleton rounded" />;
  if (!data || data.length === 0) return <p className="text-sm text-center py-12" style={{ color: "var(--theme-text-muted)" }}>No data</p>;

  const total = data.reduce((s, d) => s + d.count, 0);
  const pieData = data.map(d => ({
    ...d,
    fill: PRIORITY_COLORS[d.priority] || "#6B7280",
    percent: total > 0 ? ((d.count / total) * 100).toFixed(1) : "0",
  }));

  return (
    <div className="flex items-center gap-4 h-full">
      <div className="flex-1 h-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="count"
              nameKey="priority"
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              stroke="none"
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--theme-card-bg)",
                border: "1px solid var(--theme-card-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 pr-2">
        {pieData.map((d) => (
          <div key={d.priority} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
            <span style={{ color: "var(--theme-text-secondary)" }} className="w-16">{d.priority}</span>
            <span className="font-mono font-medium" style={{ color: "var(--theme-text-primary)" }}>{d.count}</span>
            <span style={{ color: "var(--theme-text-muted)" }}>({d.percent}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
