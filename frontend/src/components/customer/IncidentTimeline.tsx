import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { VolumePoint } from "../../types";

export function IncidentTimeline({ data, loading }: { data: VolumePoint[] | null; loading: boolean }) {
  if (loading) return <div className="h-full skeleton rounded" />;
  if (!data || data.length === 0) return <p className="text-sm text-center py-12" style={{ color: "var(--theme-text-muted)" }}>No data</p>;

  return (
    <div className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="custGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-surface-border)" strokeOpacity={0.5} />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => {
              const d = new Date(v);
              return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
            }}
            tick={{ fontSize: 10, fill: "var(--theme-text-muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 10, fill: "var(--theme-text-muted)" }} axisLine={false} tickLine={false} width={35} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--theme-card-bg)",
              border: "1px solid var(--theme-card-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(v: string) => new Date(v).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
          />
          <Area type="monotone" dataKey="total" stroke="var(--theme-accent)" strokeWidth={2} fill="url(#custGrad)" name="Alerts" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
