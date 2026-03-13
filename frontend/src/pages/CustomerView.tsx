import { useState, useMemo, useCallback } from "react";
import { ResponsiveGridLayout, useContainerWidth, getCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useCustomerDashboard } from "../contexts/CustomerDashboardContext";
import { Card } from "../components/Card";
import { Spinner } from "../components/Spinner";
import { WidgetWrapper } from "../components/WidgetWrapper";
import { AddWidgetModal } from "../components/AddWidgetModal";
import { EditWidgetModal } from "../components/EditWidgetModal";
import { ChartRenderer } from "../components/ChartRenderer";
import type { WidgetConfig, ChartType, DataSource } from "../types";
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
  ChevronDown,
  Server,
  Pencil,
  Plus,
  RotateCcw,
  LayoutDashboard,
  Star,
  Copy,
  Trash2,
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

/* helpers */

function fmt(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "\u2014";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function pct(val: number | null | undefined): string {
  if (val === null || val === undefined) return "\u2014";
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

/* sub-components */

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
        sub: data.total_tickets > 0 ? `${((data.open_tickets / data.total_tickets) * 100).toFixed(0)}% of total` : "\u2014",
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
              <p className="text-[10px] uppercase tracking-wider truncate" style={{ color: "var(--theme-text-muted)" }}>
                {k.label}
              </p>
              <p className="font-bold font-mono" style={{ fontSize: 26, lineHeight: 1.2, color: "var(--theme-text-primary)" }}>
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
          <Area type="monotone" dataKey="total" stroke="var(--theme-accent)" strokeWidth={2} fill="url(#custGrad)" name="Incidents" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PriorityBreakdown({ data, loading }: { data: PriorityItem[] | null; loading: boolean }) {
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

function TopAlertsCard({ data, loading }: { data: AlertRuleItem[] | null; loading: boolean }) {
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
            tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 25) + "\u2026" : v}
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
    () => api.getAssetExposure({ customer, start, end }),
    [customer, start, end]
  );

  if (loading) return <div className="h-full skeleton rounded" />;
  if (!data || data.length === 0) return <p className="text-sm text-center py-12" style={{ color: "var(--theme-text-muted)" }}>No asset data</p>;

  const top = data.slice(0, 10);

  return (
    <div>
      <p className="text-[10px] mb-3" style={{ color: "var(--theme-text-muted)" }}>Assets with most alerts &mdash; prioritize for hardening</p>
      <div className="space-y-2">
        {top.map((a, i) => {
          const maxCount = top[0].count;
          const pctW = maxCount > 0 ? (a.count / maxCount) * 100 : 0;
          return (
            <div key={a.asset_name} className="flex items-center gap-2">
              <span className="text-[10px] font-mono w-5 text-right shrink-0" style={{ color: "var(--theme-text-muted)" }}>
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
    </div>
  );
}

/* SLA gauge */
function SLAGauge({ value }: { value: number | null }) {
  const pctVal = value ?? 0;
  const color = pctVal >= 90 ? "#22C55E" : pctVal >= 70 ? "#F59E0B" : "#EF4444";
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference - (pctVal / 100) * circumference;

  return (
    <div className="flex flex-col items-center py-2 h-full justify-center">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--theme-surface-border)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold font-mono" style={{ color: "var(--theme-text-primary)" }}>
            {value !== null ? `${value.toFixed(0)}%` : "\u2014"}
          </span>
        </div>
      </div>
      <p className="text-[10px] mt-2" style={{ color: "var(--theme-text-muted)" }}>
        {pctVal >= 90 ? "\u2705 On Target" : pctVal >= 70 ? "\u26a0\ufe0f Below Target" : "\ud83d\udd34 Critical"}
      </p>
    </div>
  );
}

/* Customer Toolbar */

function CustomerToolbar({
  customer,
  onCustomerChange,
  periodDays,
  onPeriodChange,
  customers,
  editMode,
  onToggleEdit,
  onAddWidget,
  onReset,
  profiles,
  activeProfileId,
  onSwitchProfile,
  onSetAsDefault,
  onSaveToNewProfile,
  onDeleteProfile,
}: {
  customer: string;
  onCustomerChange: (v: string) => void;
  periodDays: number;
  onPeriodChange: (v: number) => void;
  customers: string[];
  editMode: boolean;
  onToggleEdit: () => void;
  onAddWidget: () => void;
  onReset: () => void;
  profiles: { id: string; name: string; isDefault: boolean }[];
  activeProfileId: string | null;
  onSwitchProfile: (id: string) => void;
  onSetAsDefault: () => void;
  onSaveToNewProfile: (name: string) => void;
  onDeleteProfile: (id: string) => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [showSaveNew, setShowSaveNew] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 12%, transparent)" }}>
          <Building2 className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--theme-text-primary)" }}>{customer}</h2>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>Operations Dashboard</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Customer switch */}
        <div className="relative">
          <select
            value={customer}
            onChange={(e) => onCustomerChange(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{
              backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
              color: "var(--theme-text-secondary)",
              border: "1px solid var(--theme-surface-border)",
            }}
          >
            <option value="">Select Customer...</option>
            {customers.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--theme-text-muted)" }} />
        </div>

        {/* Period selector */}
        <div className="relative">
          <select
            value={periodDays}
            onChange={(e) => onPeriodChange(Number(e.target.value))}
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
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--theme-text-muted)" }} />
        </div>

        {/* Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
              color: "var(--theme-text-secondary)",
              border: "1px solid var(--theme-surface-border)",
            }}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{activeProfile?.name || "Default"}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {profileOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-56 rounded-lg shadow-lg z-50 py-1"
              style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-card-border)" }}
            >
              {profiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onSwitchProfile(p.id); setProfileOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:opacity-80"
                  style={{ color: p.id === activeProfileId ? "var(--theme-accent)" : "var(--theme-text-secondary)" }}
                >
                  {p.isDefault && <Star className="w-3 h-3" style={{ color: "#F59E0B" }} />}
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.id === activeProfileId && <span className="text-[10px] px-1 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)" }}>active</span>}
                </button>
              ))}
              <div className="border-t my-1" style={{ borderColor: "var(--theme-surface-border)" }} />
              <button
                onClick={() => { onSetAsDefault(); setProfileOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
                style={{ color: "var(--theme-text-muted)" }}
              >
                <Star className="w-3 h-3 inline mr-1.5" />Set as Default
              </button>
              {!showSaveNew ? (
                <button
                  onClick={() => setShowSaveNew(true)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  <Copy className="w-3 h-3 inline mr-1.5" />Save as New Profile
                </button>
              ) : (
                <div className="px-3 py-1.5 flex gap-1">
                  <input
                    autoFocus
                    value={newProfileName}
                    onChange={e => setNewProfileName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newProfileName.trim()) {
                        onSaveToNewProfile(newProfileName.trim());
                        setNewProfileName("");
                        setShowSaveNew(false);
                        setProfileOpen(false);
                      }
                    }}
                    className="flex-1 px-2 py-1 rounded text-xs"
                    style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-surface-border)" }}
                    placeholder="Profile name..."
                  />
                </div>
              )}
              {profiles.length > 1 && (
                <button
                  onClick={() => { onDeleteProfile(activeProfileId || ""); setProfileOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80 text-red-400"
                >
                  <Trash2 className="w-3 h-3 inline mr-1.5" />Delete Profile
                </button>
              )}
            </div>
          )}
        </div>

        {/* Edit Mode */}
        <button
          onClick={onToggleEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            backgroundColor: editMode ? "color-mix(in srgb, var(--theme-accent) 20%, transparent)" : "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
            color: editMode ? "var(--theme-accent)" : "var(--theme-text-muted)",
            border: `1px solid ${editMode ? "var(--theme-accent)" : "var(--theme-surface-border)"}`,
          }}
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{editMode ? "Done" : "Edit"}</span>
        </button>

        {editMode && (
          <>
            <button
              onClick={onAddWidget}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)", color: "var(--theme-accent)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add</span>
            </button>
            <button
              onClick={onReset}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ color: "var(--theme-text-muted)" }}
              title="Reset to default layout"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* main page */

export function CustomerView() {
  const [customer, setCustomer] = useState("");
  const [periodDays, setPeriodDays] = useState(30);
  const [addOpen, setAddOpen] = useState(false);
  const [editWidgetState, setEditWidgetState] = useState<WidgetConfig | null>(null);

  const {
    widgets, editMode, setEditMode,
    addWidget, removeWidget, updateWidget, updateLayout, resetLayout,
    profiles, activeProfileId, switchProfile, setAsDefault, saveToNewProfile, deleteProfile,
  } = useCustomerDashboard();

  const { width: containerWidth, containerRef } = useContainerWidth({ initialWidth: 1200 });

  const range = useMemo(() => getDateRange(periodDays), [periodDays]);

  const filterOptions = useFetch<FilterOptions>(() => api.getFilterOptions(), []);

  const f = useMemo(
    () => ({ start: range.start, end: range.end, cust: customer || undefined }),
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

  const layouts = useMemo(() => ({
    lg: widgets.map(w => ({
      i: w.id, x: w.x, y: w.y, w: w.w, h: w.h,
      minW: 2, minH: 2,
      static: !editMode,
    })),
  }), [widgets, editMode]);

  const handleLayoutChange = useCallback((_: unknown, allLayouts: Record<string, { i: string; x: number; y: number; w: number; h: number }[]>) => {
    if (!editMode) return;
    const lg = allLayouts.lg;
    if (lg) updateLayout(lg);
  }, [editMode, updateLayout]);

  const BUILTIN_CHART_TYPES: Record<string, ChartType> = {
    "cust-kpi": "gauge",
    "cust-timeline": "area",
    "cust-sla": "gauge",
    "cust-priority": "donut",
    "cust-topalerts": "horizontal-bar",
    "cust-assets": "bar",
  };

  const dataMap = useMemo<Record<DataSource, unknown[] | null>>(() => {
    const sumArr = summary.data ? [summary.data] : null;
    return {
      volume: volume.data ?? null,
      validation: null,
      priority: priority.data ?? null,
      customers: null,
      "top-alerts": topAlerts.data ?? null,
      mttd: null,
      analysts: null,
      summary: sumArr,
    };
  }, [volume.data, priority.data, topAlerts.data, summary.data]);

  const loadingMap: Record<DataSource, boolean> = {
    volume: volume.loading,
    validation: false,
    priority: priority.loading,
    customers: false,
    "top-alerts": topAlerts.loading,
    mttd: false,
    analysts: false,
    summary: summary.loading,
  };

  function renderWidgetContent(widget: WidgetConfig) {
    const data = dataMap[widget.dataSource];
    const loading = loadingMap[widget.dataSource];
    const chartTypeChanged = widget.builtIn && BUILTIN_CHART_TYPES[widget.id] && widget.chartType !== BUILTIN_CHART_TYPES[widget.id];

    if (widget.builtIn && !chartTypeChanged) {
      switch (widget.id) {
        case "cust-kpi":
          return <CustomerKPIs data={summary.data} loading={summary.loading} />;
        case "cust-timeline":
          return <IncidentTimeline data={volume.data} loading={volume.loading} />;
        case "cust-sla":
          return <SLAGauge value={summary.data?.sla_compliance_pct ?? null} />;
        case "cust-priority":
          return <PriorityBreakdown data={priority.data} loading={priority.loading} />;
        case "cust-topalerts":
          return <TopAlertsCard data={topAlerts.data} loading={topAlerts.loading} />;
        case "cust-assets":
          return <AssetExposure customer={customer} start={range.start} end={range.end} />;
      }
    }

    if (loading) return <Spinner />;
    if (!data) return <div className="text-xs text-center py-4" style={{ color: "var(--theme-text-muted)" }}>No data</div>;

    return (
      <ChartRenderer
        chartType={widget.chartType}
        data={data as unknown[]}
        onClick={() => {}}
      />
    );
  }

  if (!customer) {
    return (
      <div className="py-12 sm:py-20">
        <div className="max-w-md mx-auto text-center space-y-6">
          <div className="inline-flex p-4 rounded-2xl" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 10%, transparent)" }}>
            <Building2 className="w-12 h-12" style={{ color: "var(--theme-accent)" }} />
          </div>
          <h2 className="text-xl font-bold" style={{ color: "var(--theme-text-primary)" }}>Customer Operations View</h2>
          <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>Select a customer to view their security operations dashboard.</p>
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
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--theme-text-muted)" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 sm:py-6">
      <CustomerToolbar
        customer={customer}
        onCustomerChange={handleCustomerChange}
        periodDays={periodDays}
        onPeriodChange={setPeriodDays}
        customers={filterOptions.data?.customers ?? []}
        editMode={editMode}
        onToggleEdit={() => setEditMode(!editMode)}
        onAddWidget={() => setAddOpen(true)}
        onReset={resetLayout}
        profiles={profiles}
        activeProfileId={activeProfileId}
        onSwitchProfile={switchProfile}
        onSetAsDefault={setAsDefault}
        onSaveToNewProfile={saveToNewProfile}
        onDeleteProfile={deleteProfile}
      />

      <div ref={containerRef as React.Ref<HTMLDivElement>}>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={40}
        width={containerWidth}
        margin={[16, 16]}
        draggableHandle=".drag-handle"
        onLayoutChange={handleLayoutChange}
        isDraggable={editMode}
        isResizable={editMode}
        compactor={getCompactor("vertical")}
      >
        {widgets.map((widget) => (
          <div key={widget.id}>
            <WidgetWrapper
              widget={widget}
              editMode={editMode}
              onEdit={() => setEditWidgetState(widget)}
              onRemove={() => removeWidget(widget.id)}
            >
              {renderWidgetContent(widget)}
            </WidgetWrapper>
          </div>
        ))}
      </ResponsiveGridLayout>
      </div>

      <AddWidgetModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addWidget} />
      <EditWidgetModal widget={editWidgetState} onClose={() => setEditWidgetState(null)} onSave={updateWidget} />
    </div>
  );
}
