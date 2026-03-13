import { useState, useMemo, useCallback } from "react";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { Card } from "../components/Card";
import { Spinner } from "../components/Spinner";
import type {
  MetricsSummary,
  VolumePoint,
  PriorityItem,
  AlertRuleItem,
  FilterOptions,
} from "../types";
import {
  Building2,
  Shield,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ChevronDown,
  Calendar,
  Server,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";

/* ────────────── helpers ────────────── */

function fmt(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function pct(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return `${val.toFixed(1)}%`;
}

const PERIOD_OPTIONS = [
  { label: "Last 7 Days", days: 7 },
  { label: "Last 14 Days", days: 14 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
  { label: "All Time", days: 0 },
];

function getDateRange(days: number) {
  if (days === 0) return { start: undefined, end: undefined };
  const now = new Date();
  const start = new Date(now.getTime() - days * 86400_000);
  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "#EF4444",
  High: "#F97316",
  Medium: "#F59E0B",
  Low: "#22C55E",
  Normal: "#3B82F6",
};

/* ────────────── sub-components ────────────── */

function CustomerKPIs({ data, loading }: { data: MetricsSummary | null; loading: boolean }) {
  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: "Total Incidents",
        value: data.total_tickets.toLocaleString(),
        icon: <Shield className="w-5 h-5" />,
        color: "var(--theme-accent)",
        sub: `${data.open_tickets} open`,
      },
      {
        label: "Active Incidents",
        value: data.open_tickets.toLocaleString(),
        icon: <ShieldAlert className="w-5 h-5" />,
        color: "#F59E0B",
        sub: data.total_tickets > 0 ? `${((data.open_tickets / data.total_tickets) * 100).toFixed(0)}% of total` : "—",
      },
      {
        label: "Avg Response Time",
        value: fmt(data.avg_mttd_seconds),
        icon: <Clock className="w-5 h-5" />,
        color: "#3B82F6",
        sub: "Mean Time to Detect",
      },
      {
        label: "SLA Compliance",
        value: pct(data.sla_compliance_pct),
        icon: <CheckCircle2 className="w-5 h-5" />,
        color: (data.sla_compliance_pct ?? 0) >= 90 ? "#22C55E" : (data.sla_compliance_pct ?? 0) >= 70 ? "#F59E0B" : "#EF4444",
        sub: "Within SLA threshold",
      },
      {
        label: "Security Incidents",
        value: data.si_count.toLocaleString(),
        icon: <AlertTriangle className="w-5 h-5" />,
        color: "#EF4444",
        sub: "Confirmed threats",
      },
    ];
  }, [data]);

  if (loading) return <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, i) => <Card key={i}><div className="h-20 skeleton rounded" /></Card>)}</div>;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {kpis.map((k) => (
        <Card key={k.label}>
          <div className="flex items-start gap-3">
            <div
              className="p-2 rounded-lg shrink-0"
              style={{
                backgroundColor: `color-mix(in srgb, ${k.color} 12%, transparent)`,
                color: k.color,
              }}
            >
              {k.icon}
            </div>
            <div className="min-w-0">
              <p
                className="text-[10px] uppercase tracking-wider truncate"
                style={{ color: "var(--theme-text-muted)" }}
              >
                {k.label}
              </p>
              <p
                className="font-bold font-mono"
                style={{ fontSize: 26, lineHeight: 1.2, color: "var(--theme-text-primary)" }}
              >
                {k.value}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
                {k.sub}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function IncidentTimeline({ data, loading }: { data: VolumePoint[] | null; loading: boolean }) {
  if (loading) return <Card title="Incident Timeline"><div className="h-64 skeleton rounded" /></Card>;
  if (!data || data.length === 0) return <Card title="Incident Timeline"><p className="text-sm text-center py-12" style={{ color: "var(--theme-text-muted)" }}>No data</p></Card>;

  return (
    <Card title="Incident Timeline">
      <div className="h-64">
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
            <YAxis
              tick={{ fontSize: 10, fill: "var(--theme-text-muted)" }}
              axisLine={false}
              tickLine={false}
              width={35}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--theme-card-bg)",
                border: "1px solid var(--theme-card-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v: string) => new Date(v).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="var(--theme-accent)"
              strokeWidth={2}
              fill="url(#custGrad)"
              name="Incidents"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function PriorityBreakdown({ data, loading }: { data: PriorityItem[] | null; loading: boolean }) {
  if (loading) return <Card title="Priority Breakdown"><div className="h-64 skeleton rounded" /></Card>;
  if (!data || data.length === 0) return <Card title="Priority Breakdown"><p className="text-sm text-center py-12" style={{ color: "var(--theme-text-muted)" }}>No data</p></Card>;

  const total = data.reduce((s, d) => s + d.count, 0);
  const pieData = data.map(d => ({
    ...d,
    fill: PRIORITY_COLORS[d.priority] || "#6B7280",
    percent: total > 0 ? ((d.count / total) * 100).toFixed(1) : "0",
  }));

  return (
    <Card title="Priority Breakdown">
      <div className="flex items-center gap-4 h-64">
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
    </Card>
  );
}

function TopAlertsCard({ data, loading }: { data: AlertRuleItem[] | null; loading: boolean }) {
  if (loading) return <Card title="Top Alert Rules"><div className="h-64 skeleton rounded" /></Card>;
  if (!data || data.length === 0) return <Card title="Top Alert Rules"><p className="text-sm text-center py-12" style={{ color: "var(--theme-text-muted)" }}>No data</p></Card>;

  const top = data.slice(0, 8);

  return (
    <Card title="Top Alert Rules">
      <div className="h-64">
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
    </Card>
  );
}

function AssetExposure({
  customer,
  start,
  end,
}: {
  customer: string;
  start?: string;
  end?: string;
}) {
  const { data, loading } = useFetch<{ asset_name: string; count: number }[]>(
    () =>
      api.getAssetExposure({
        customer,
        start,
        end,
      }),
    [customer, start, end]
  );

  if (loading) return <Card title="Asset Exposure"><div className="h-64 skeleton rounded" /></Card>;
  if (!data || data.length === 0) return <Card title="Asset Exposure"><p className="text-sm text-center py-12" style={{ color: "var(--theme-text-muted)" }}>No asset data</p></Card>;

  const top = data.slice(0, 10);

  return (
    <Card title="Asset Exposure">
      <p className="text-[10px] mb-3" style={{ color: "var(--theme-text-muted)" }}>Assets with most alerts — prioritize for hardening</p>
      <div className="space-y-2">
        {top.map((a, i) => {
          const maxCount = top[0].count;
          const pctW = maxCount > 0 ? (a.count / maxCount) * 100 : 0;
          return (
            <div key={a.asset_name} className="flex items-center gap-2">
              <span
                className="text-[10px] font-mono w-5 text-right shrink-0"
                style={{ color: "var(--theme-text-muted)" }}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Server className="w-3 h-3 shrink-0" style={{ color: "var(--theme-accent)" }} />
                    <span className="text-xs truncate" style={{ color: "var(--theme-text-secondary)" }}>
                      {a.asset_name}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-medium ml-2 shrink-0" style={{ color: "var(--theme-text-primary)" }}>
                    {a.count}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--theme-surface-border)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pctW}%`,
                      backgroundColor: i < 3 ? "#EF4444" : "var(--theme-accent)",
                      opacity: 1 - i * 0.06,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ────────────── SLA gauge ────────────── */
function SLAGauge({ value }: { value: number | null }) {
  const pctVal = value ?? 0;
  const color = pctVal >= 90 ? "#22C55E" : pctVal >= 70 ? "#F59E0B" : "#EF4444";
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference - (pctVal / 100) * circumference;

  return (
    <Card>
      <div className="flex flex-col items-center py-2">
        <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: "var(--theme-text-muted)" }}>SLA Performance</p>
        <div className="relative w-28 h-28">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--theme-surface-border)" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold font-mono" style={{ color: "var(--theme-text-primary)" }}>
              {value !== null ? `${value.toFixed(0)}%` : "—"}
            </span>
          </div>
        </div>
        <p className="text-[10px] mt-2" style={{ color: "var(--theme-text-muted)" }}>
          {pctVal >= 90 ? "✅ On Target" : pctVal >= 70 ? "⚠️ Below Target" : "🔴 Critical"}
        </p>
      </div>
    </Card>
  );
}

/* ────────────── main page ────────────── */

export function CustomerView() {
  const [customer, setCustomer] = useState("");
  const [periodDays, setPeriodDays] = useState(30);

  const range = useMemo(() => getDateRange(periodDays), [periodDays]);

  const filterOptions = useFetch<FilterOptions>(() => api.getFilterOptions(), []);

  const f = useMemo(
    () => ({
      start: range.start,
      end: range.end,
      customer: customer || undefined,
    }),
    [range.start, range.end, customer]
  );

  const deps = [range.start, range.end, customer];

  const summary = useFetch(() => (customer ? api.getSummary(f) : Promise.resolve(null)), deps);
  const volume = useFetch(() => (customer ? api.getVolume(f) : Promise.resolve(null)), deps);
  const priority = useFetch(() => (customer ? api.getPriority(f) : Promise.resolve(null)), deps);
  const topAlerts = useFetch(() => (customer ? api.getTopAlerts(f) : Promise.resolve(null)), deps);

  const handleCustomerChange = useCallback((val: string) => {
    setCustomer(val);
  }, []);

  if (!customer) {
    return (
      <div className="py-12 sm:py-20">
        <div className="max-w-md mx-auto text-center space-y-6">
          <div
            className="inline-flex p-4 rounded-2xl"
            style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 10%, transparent)" }}
          >
            <Building2 className="w-12 h-12" style={{ color: "var(--theme-accent)" }} />
          </div>
          <h2 className="text-xl font-bold" style={{ color: "var(--theme-text-primary)" }}>
            Customer Operations View
          </h2>
          <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
            Select a customer to view their security operations dashboard.
          </p>
          <div className="relative inline-block">
            <select
              value={customer}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 rounded-xl text-sm font-medium cursor-pointer min-w-[250px]"
              style={{
                backgroundColor: "var(--theme-card-bg)",
                color: "var(--theme-text-primary)",
                border: "1px solid var(--theme-card-border)",
              }}
            >
              <option value="">Select Customer...</option>
              {filterOptions.data?.customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: "var(--theme-text-muted)" }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4 sm:py-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 12%, transparent)" }}
          >
            <Building2 className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--theme-text-primary)" }}>
              {customer}
            </h2>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              Operations Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Customer switch */}
          <div className="relative">
            <select
              value={customer}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
                color: "var(--theme-text-secondary)",
                border: "1px solid var(--theme-surface-border)",
              }}
            >
              <option value="">Select Customer...</option>
              {filterOptions.data?.customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown
              className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: "var(--theme-text-muted)" }}
            />
          </div>

          {/* Period selector */}
          <div className="relative">
            <select
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
                color: "var(--theme-text-secondary)",
                border: "1px solid var(--theme-surface-border)",
              }}
            >
              {PERIOD_OPTIONS.map((p) => (
                <option key={p.days} value={p.days}>{p.label}</option>
              ))}
            </select>
            <ChevronDown
              className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: "var(--theme-text-muted)" }}
            />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <CustomerKPIs data={summary.data} loading={summary.loading} />

      {/* Row: Timeline + SLA gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <IncidentTimeline data={volume.data} loading={volume.loading} />
        </div>
        <div className="lg:col-span-1">
          <SLAGauge value={summary.data?.sla_compliance_pct ?? null} />
        </div>
      </div>

      {/* Row: Priority + Top Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PriorityBreakdown data={priority.data} loading={priority.loading} />
        <TopAlertsCard data={topAlerts.data} loading={topAlerts.loading} />
      </div>

      {/* Asset Exposure */}
      <AssetExposure customer={customer} start={range.start} end={range.end} />
    </div>
  );
}
