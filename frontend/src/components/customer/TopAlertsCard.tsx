import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { AlertRuleItem } from "../../types";

export function TopAlertsCard({ data, loading }: { data: AlertRuleItem[] | null; loading: boolean }) {
  if (loading) return <div className="h-full skeleton rounded" />;
  if (!data || data.length === 0) return <p className="text-sm text-center py-12" style={{ color: "var(--theme-text-muted)" }}>No data</p>;

  const top = data.slice(0, 8);

  return (
    <div className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={top} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-surface-border)" strokeOpacity={0.3} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "var(--theme-text-muted)" }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="rule_name"
            tick={{ fontSize: 10, fill: "var(--theme-text-secondary)" }}
            width={180}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 25) + "…" : v}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--theme-card-bg)",
              border: "1px solid var(--theme-card-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" fill="var(--theme-accent)" radius={[0, 4, 4, 0]} name="Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
