import { useState, useMemo, useCallback } from "react";
import { ResponsiveGridLayout, useContainerWidth, getCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useManagerDashboard } from "../contexts/ManagerDashboardContext";
import { Spinner } from "../components/Spinner";
import { AnalystDetailModal } from "../components/AnalystDetailModal";
import { TicketDetailModal } from "../components/TicketDetailModal";
import { TeamTrendChart } from "../components/AnalystTrendChart";
import { SLATrendChart } from "../components/SLATrendChart";
import { FPRateTrendChart } from "../components/FPRateTrendChart";
import { CustomerSlaHeatmap } from "../components/CustomerSlaHeatmap";
import { SlaBreachAnalysis } from "../components/SlaBreachAnalysis";
import { MomKpiCards } from "../components/MomKpiCards";
import { IncidentFunnel } from "../components/IncidentFunnel";
import { QueueHealth } from "../components/QueueHealth";
import { ShiftPerformanceChart } from "../components/ShiftPerformanceChart";
import { PostureScoreCard } from "../components/PostureScoreCard";
import { FPPatternChart } from "../components/FPPatternChart";
import { ClassifierPanel } from "../components/ClassifierPanel";
import { AiInsightButton } from "../components/AiInsightButton";
import { WidgetWrapper } from "../components/WidgetWrapper";
import { AddWidgetModal } from "../components/AddWidgetModal";
import type { DataSourceOption } from "../components/AddWidgetModal";
import { EditWidgetModal } from "../components/EditWidgetModal";
import { ChartRenderer } from "../components/ChartRenderer";
import { ErrorAlert } from "../components/ErrorAlert";
import type { AnalystScore, WidgetInsightsRequest, WidgetConfig } from "../types";
import { Users, ChevronDown, BarChart3, AlertTriangle, Minus, Sparkles, Pencil, Plus, RotateCcw } from "lucide-react";

const STORAGE_KEY = "soc-manager-excluded-analysts";
function loadExcluded(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")); } catch { return new Set(); }
}

const PERIOD_OPTIONS = [
  { label: "Last 1 Month", months: 1 },
  { label: "Last 2 Months", months: 2 },
  { label: "Last 3 Months", months: 3 },
  { label: "All Time", months: 0 },
];

function getDateRange(months: number) {
  if (months === 0) return { start: undefined, end: undefined };
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  const start = new Date(end.getFullYear(), end.getMonth() - months + 1, 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function fmt(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

type WorkloadFlag = "overloaded" | "imbalanced" | "underutilized" | null;

function getWorkloadFlag(pct: number, avg: number): WorkloadFlag {
  if (pct > 40) return "overloaded";
  if (avg > 0 && pct > avg * 2) return "imbalanced";
  if (pct < 10 && pct > 0) return "underutilized";
  return null;
}

const FLAG_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  overloaded: { bg: "rgba(239,68,68,0.1)", text: "#ef4444", label: "Overloaded" },
  imbalanced: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b", label: "Imbalanced" },
  underutilized: { bg: "rgba(161,161,170,0.1)", text: "#a1a1aa", label: "Underutilized" },
};

const MANAGER_DATA_SOURCES: DataSourceOption[] = [
  { value: "sla-trend", label: "SLA Trend", desc: "Monthly MTTD/MTTR SLA compliance trend" },
  { value: "fp-trend", label: "FP Rate Trend", desc: "Monthly false positive rate trend" },
  { value: "customer-sla", label: "Customer SLA Matrix", desc: "Per-customer monthly SLA heatmap" },
  { value: "sla-breach", label: "SLA Breach Analysis", desc: "Breach breakdown by analyst/customer/shift" },
  { value: "mom-kpis", label: "Month-over-Month KPIs", desc: "Current vs previous period comparison" },
  { value: "incident-funnel", label: "Incident Funnel", desc: "Alert>Event>TP>Incident conversion" },
  { value: "queue-health", label: "Queue Health", desc: "Open ticket age distribution" },
  { value: "shift-perf", label: "Shift Performance", desc: "Night/morning/evening shift comparison" },
  { value: "posture-score", label: "Security Posture Score", desc: "Composite 0-100 security health score" },
  { value: "fp-patterns", label: "FP Rate by Category", desc: "FP rate per attack category" },
  { value: "volume", label: "Ticket Volume", desc: "Daily ticket counts with TP/FP breakdown" },
  { value: "priority", label: "Priority Distribution", desc: "Tickets by priority P1-P4" },
  { value: "top-alerts", label: "Top Alert Rules", desc: "Most frequent Wazuh alert rules" },
  { value: "analysts", label: "Analyst Performance", desc: "Per-analyst workload and metrics" },
];

const SORT_MAP: Record<string, (a: AnalystScore) => string | number> = {
  analyst: (a) => a.analyst.toLowerCase(),
  composite_score: (a) => a.composite_score,
  total_tickets: (a) => a.stats.total_tickets,
  resolved: (a) => a.stats.resolved,
  open: (a) => a.stats.total_tickets - a.stats.resolved,
  avg_mttd: (a) => a.stats.avg_mttd_seconds ?? Infinity,
  avg_mttr: (a) => a.stats.avg_mttr_seconds ?? Infinity,
  sla_pct: (a) => a.stats.sla_pct ?? 0,
};

export function ManagerView() {
  const [periodMonths, setPeriodMonths] = useState(1);
  const [selectedAnalyst, setSelectedAnalyst] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [excluded] = useState<Set<string>>(loadExcluded);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string>("composite_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const {
    widgets, editMode, setEditMode,
    addWidget, removeWidget, updateWidget, updateLayout, resetLayout,
  } = useManagerDashboard();
  const { width: containerWidth, containerRef } = useContainerWidth({ initialWidth: 1200 });
  const [addOpen, setAddOpen] = useState(false);
  const [editWidgetState, setEditWidgetState] = useState<WidgetConfig | null>(null);

  const range = useMemo(() => getDateRange(periodMonths), [periodMonths]);
  const { data: rawData, loading, error } = useFetch<AnalystScore[]>(
    () => api.getAnalystScores({ start: range.start, end: range.end }),
    [range.start, range.end]
  );

  const slaTrend = useFetch(() => api.getSlaTrend({ start: range.start, end: range.end }), [range.start, range.end]);
  const fpTrend = useFetch(() => api.getFpTrend({ start: range.start, end: range.end }), [range.start, range.end]);
  const customerSla = useFetch(() => api.getCustomerSlaMatrix({ start: range.start, end: range.end }), [range.start, range.end]);

  const momKpis = useFetch(() => api.getMomKpis({ start: range.start, end: range.end }), [range.start, range.end]);
  const funnel = useFetch(() => api.getIncidentFunnel({ start: range.start, end: range.end }), [range.start, range.end]);
  const queueHealth = useFetch(() => api.getQueueHealth({}), []);
  const shiftPerf = useFetch(() => api.getShiftPerformance({ start: range.start, end: range.end }), [range.start, range.end]);

  const fpPatterns = useFetch(() => api.getFpPatterns({ start: range.start, end: range.end }), [range.start, range.end]);
  const posture = useFetch(() => api.getPostureScore({ start: range.start, end: range.end }), [range.start, range.end]);

  const isAdmin = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("soc_user") || "{}");
      return u.role === "superadmin" || u.role === "admin";
    } catch { return false; }
  }, []);

  const [widgetInsights, setWidgetInsights] = useState<Record<string, string>>({});
  const [insightsLoading, setInsightsLoading] = useState(false);

  const data = useMemo(() => {
    if (!rawData) return null;
    return rawData.filter((a) => !excluded.has(a.analyst));
  }, [rawData, excluded]);

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      const fn = SORT_MAP[sortCol];
      if (!fn) return 0;
      const av = fn(a);
      const bv = fn(b);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortCol, sortDir]);

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const sortIcon = (col: string) => {
    if (sortCol !== col) return <span className="opacity-30 ml-0.5">{"↕"}</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  const totalTeamTickets = useMemo(() => data?.reduce((s, d) => s + d.stats.total_tickets, 0) ?? 0, [data]);
  const avgPct = data && data.length > 0 ? 100 / data.length : 0;

  const generateInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const req: WidgetInsightsRequest = {
        start_date: range.start,
        end_date: range.end,
        sla_trend: (slaTrend.data as unknown as Record<string, unknown>[]) ?? undefined,
        fp_trend: (fpTrend.data as unknown as Record<string, unknown>[]) ?? undefined,
        mom_kpis: (momKpis.data as unknown as Record<string, unknown>[]) ?? undefined,
        analyst_scores: (data as unknown as Record<string, unknown>[]) ?? undefined,
        customer_sla: (customerSla.data as unknown as Record<string, unknown>[]) ?? undefined,
        posture_score: (posture.data as unknown as Record<string, unknown>) ?? undefined,
        shift_perf: (shiftPerf.data as unknown as Record<string, unknown>[]) ?? undefined,
        funnel: (funnel.data as unknown as Record<string, unknown>[]) ?? undefined,
      };
      const result = await api.getWidgetInsights(req);
      setWidgetInsights(result.insights);
    } catch (e) {
      console.error("Widget insights failed", e);
    } finally {
      setInsightsLoading(false);
    }
  }, [range, slaTrend.data, fpTrend.data, momKpis.data, data, customerSla.data, posture.data, shiftPerf.data, funnel.data]);

  // -- Data map for custom (non-built-in) widgets --
  const dataMap = useMemo<Partial<Record<string, unknown[] | null>>>(() => ({
    "sla-trend": slaTrend.data as unknown[] | null,
    "fp-trend": fpTrend.data as unknown[] | null,
    "customer-sla": customerSla.data as unknown[] | null,
    "mom-kpis": momKpis.data as unknown[] | null,
    "incident-funnel": funnel.data as unknown[] | null,
    "queue-health": queueHealth.data as unknown[] | null,
    "shift-perf": shiftPerf.data as unknown[] | null,
    "fp-patterns": fpPatterns.data as unknown[] | null,
    "posture-score": posture.data ? [posture.data] as unknown[] : null,
    "analysts": (data ?? null) as unknown[] | null,
    "volume": slaTrend.data as unknown[] | null,
    "priority": null,
    "top-alerts": null,
    "validation": null,
    "customers": null,
    "mttd": null,
    "summary": null,
    "live-feed": null,
    "analyst-table": null,
    "team-trend": null,
    "sla-breach": null,
  }), [slaTrend.data, fpTrend.data, customerSla.data, momKpis.data, funnel.data, queueHealth.data, shiftPerf.data, fpPatterns.data, posture.data, data]);

  // -- Grid layouts --
  const layouts = useMemo(() => ({
    lg: widgets.map(w => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h, minW: 3, minH: 3, static: !editMode })),
  }), [widgets, editMode]);

  const handleLayoutChange = useCallback((_: unknown, allLayouts: Record<string, { i: string; x: number; y: number; w: number; h: number }[]>) => {
    if (!editMode) return;
    const lg = allLayouts.lg;
    if (lg) updateLayout(lg);
  }, [editMode, updateLayout]);

  // -- Widget insight key mapping --
  const INSIGHT_KEY_MAP: Record<string, string> = {
    "sla-trend": "sla_trend",
    "fp-trend": "fp_trend",
    "customer-sla": "customer_sla",
    "mom-kpis": "mom_kpis",
    "incident-funnel": "funnel",
    "shift-perf": "shift_perf",
    "posture-score": "posture_score",
    "fp-patterns": "fp_trend",
    "analyst-table": "analyst_scores",
    "team-trend": "team_trend",
  };

  // Default chart types for built-in widgets (detect when user changed the chart type)
  const BUILTIN_CHART_TYPES: Record<string, string> = {
    "analyst-table": "table", "team-trend": "line", "sla-trend": "area", "fp-trend": "area",
    "customer-sla": "table", "sla-breach": "horizontal-bar", "mom-kpis": "text-stats",
    "incident-funnel": "funnel", "queue-health": "horizontal-bar", "shift-perf": "table",
    "posture-score": "gauge", "fp-patterns": "horizontal-bar",
  };

  // -- Render widget content --
  function renderWidgetContent(widget: WidgetConfig) {
    // If user changed chart type from default → render via ChartRenderer instead
    const chartTypeChanged = widget.builtIn && BUILTIN_CHART_TYPES[widget.id] && widget.chartType !== BUILTIN_CHART_TYPES[widget.id];
    if (widget.builtIn && !chartTypeChanged) {
      switch (widget.id) {
        case "analyst-table": {
          if (loading) return <div className="flex items-center justify-center h-full"><Spinner /></div>;
          if (!data || data.length === 0) return (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Users className="w-8 h-8 opacity-30" style={{ color: "var(--theme-text-muted)" }} />
              <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>No analyst data for this period</p>
              <button
                onClick={() => setPeriodMonths(0)}
                className="px-2 py-1 text-[10px] rounded font-medium"
                style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)", color: "var(--theme-accent)" }}
              >
                View All Time
              </button>
            </div>
          );
          return (
            <div className="h-full overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
                    {([
                      ["Analyst", "analyst"],
                      ["Assigned", "total_tickets"],
                      ["Resolved", "resolved"],
                      ["Open", "open"],
                      ["MTTD", "avg_mttd"],
                      ["MTTR", "avg_mttr"],
                      ["SLA", "sla_pct"],
                      ["Workload", "total_tickets"],
                      ["", null],
                    ] as const).map(([h, col]) => (
                      <th
                        key={h || "_flag"}
                        className={`px-4 py-2.5 text-left font-medium uppercase tracking-wider text-[10px]${col ? " cursor-pointer select-none hover:opacity-80" : ""}`}
                        style={{ color: "var(--theme-text-muted)" }}
                        onClick={col ? () => toggleSort(col) : undefined}
                      >
                        {h}{col ? sortIcon(col) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((a) => {
                    const pct = totalTeamTickets > 0 ? (a.stats.total_tickets / totalTeamTickets) * 100 : 0;
                    const openCount = a.stats.total_tickets - a.stats.resolved;
                    const flag = getWorkloadFlag(pct, avgPct);
                    const slaPct = a.stats.sla_pct;

                    return (
                      <tr
                        key={a.analyst}
                        className="transition-colors hover:bg-white/[0.02] cursor-pointer"
                        style={{ borderBottom: "1px solid var(--theme-surface-border)" }}
                        onClick={() => setSelectedAnalyst(a.analyst)}
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-xs" style={{ color: "var(--theme-text-primary)" }}>
                            {a.analyst}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums" style={{ color: "var(--theme-text-primary)" }}>
                          {a.stats.total_tickets}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums" style={{ color: "var(--theme-text-primary)" }}>
                          {a.stats.resolved}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums" style={{ color: openCount > 0 ? "#f59e0b" : "var(--theme-text-muted)" }}>
                          {openCount}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums" style={{ color: "var(--theme-text-secondary)" }}>
                          {fmt(a.stats.avg_mttd_seconds)}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums" style={{ color: "var(--theme-text-secondary)" }}>
                          {fmt(a.stats.avg_mttr_seconds)}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums" style={{ color: slaPct !== null && slaPct < 90 ? "#ef4444" : "var(--theme-text-secondary)" }}>
                          {slaPct !== null ? `${slaPct.toFixed(0)}%` : "—"}
                        </td>
                        <td className="px-4 py-3 w-48">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--theme-surface-border)" }}>
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(pct, 100)}%`,
                                  backgroundColor: flag === "overloaded" ? "#ef4444" : flag === "imbalanced" ? "#f59e0b" : "var(--theme-accent)",
                                }}
                              />
                            </div>
                            <span className="text-[10px] font-mono w-8 text-right" style={{ color: "var(--theme-text-muted)" }}>
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {flag && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                              style={{ backgroundColor: FLAG_STYLES[flag].bg, color: FLAG_STYLES[flag].text }}
                            >
                              {flag === "overloaded" && <AlertTriangle className="w-3 h-3" />}
                              {flag === "underutilized" && <Minus className="w-3 h-3" />}
                              {FLAG_STYLES[flag].label}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }
        case "team-trend": {
          return (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5" style={{ color: "var(--theme-text-muted)" }} />
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-muted)" }}>
                    Weekly
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {backfillMsg && (
                    <span className="text-[10px]" style={{ color: "var(--theme-text-secondary)" }}>
                      {backfillMsg}
                    </span>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/analysts/snapshots/backfill?weeks=26", { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("soc_token")}` } });
                        const bfData = await res.json();
                        setBackfillMsg(bfData.message || "Backfill triggered");
                        setTimeout(() => setBackfillMsg(null), 5000);
                      } catch (e) {
                        setBackfillMsg("Backfill failed: " + (e instanceof Error ? e.message : "Unknown error"));
                        setTimeout(() => setBackfillMsg(null), 5000);
                      }
                    }}
                    className="text-[10px] px-2 py-1 rounded transition-colors hover:bg-white/[0.05]"
                    style={{ color: "var(--theme-text-muted)", border: "1px solid var(--theme-surface-border)" }}
                  >
                    Backfill snapshots
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <TeamTrendChart selectedAnalysts={data?.map((a) => a.analyst)} granularity="weekly" />
              </div>
            </div>
          );
        }
        case "sla-trend": return <SLATrendChart data={slaTrend.data} loading={slaTrend.loading} bare />;
        case "fp-trend": return <FPRateTrendChart data={fpTrend.data} loading={fpTrend.loading} bare />;
        case "customer-sla": return <CustomerSlaHeatmap data={customerSla.data} loading={customerSla.loading} bare />;
        case "sla-breach": return <SlaBreachAnalysis start={range.start} end={range.end} bare />;
        case "mom-kpis": return <MomKpiCards data={momKpis.data} loading={momKpis.loading} bare />;
        case "incident-funnel": return <IncidentFunnel data={funnel.data} loading={funnel.loading} bare />;
        case "queue-health": return <QueueHealth data={queueHealth.data} loading={queueHealth.loading} bare />;
        case "shift-perf": return <ShiftPerformanceChart data={shiftPerf.data} loading={shiftPerf.loading} bare />;
        case "posture-score": return <PostureScoreCard data={posture.data} loading={posture.loading} bare />;
        case "fp-patterns": return <FPPatternChart data={fpPatterns.data} loading={fpPatterns.loading} bare />;
      }
    }
    // Custom widget -- use ChartRenderer with data from dataMap
    const wData = dataMap[widget.dataSource];
    if (!wData) return <div className="text-xs text-center py-4" style={{ color: "var(--theme-text-muted)" }}>No data</div>;
    return <ChartRenderer chartType={widget.chartType} data={wData as unknown[]} />;
  }

  return (
    <div className="space-y-4 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={generateInsights}
            disabled={insightsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
            style={{
              background: "color-mix(in srgb, var(--theme-accent) 12%, transparent)",
              color: "var(--theme-accent)",
              border: "1px solid color-mix(in srgb, var(--theme-accent) 25%, transparent)",
            }}
          >
            <Sparkles className={`w-3.5 h-3.5 ${insightsLoading ? "animate-pulse" : ""}`} />
            {insightsLoading ? "Generating..." : "AI Analysis"}
          </button>
          <button
            onClick={() => setEditMode(!editMode)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: editMode
                ? "color-mix(in srgb, var(--theme-accent) 20%, transparent)"
                : "color-mix(in srgb, var(--theme-accent) 8%, transparent)",
              color: "var(--theme-accent)",
              border: `1px solid color-mix(in srgb, var(--theme-accent) ${editMode ? "40" : "20"}%, transparent)`,
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            {editMode ? "Done" : "Edit"}
          </button>
          {editMode && (
            <>
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: "color-mix(in srgb, var(--theme-accent) 8%, transparent)",
                  color: "var(--theme-accent)",
                  border: "1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent)",
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
              <button
                onClick={resetLayout}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: "color-mix(in srgb, var(--theme-accent) 8%, transparent)",
                  color: "var(--theme-accent)",
                  border: "1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent)",
                }}
                title="Reset to default layout"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <div className="relative">
            <select
              value={periodMonths}
              onChange={(e) => setPeriodMonths(Number(e.target.value))}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: "var(--theme-surface-raised)",
                color: "var(--theme-text-secondary)",
                border: "1px solid var(--theme-surface-border)",
              }}
            >
              {PERIOD_OPTIONS.map((p) => (
                <option key={p.months} value={p.months}>{p.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--theme-text-muted)" }} />
          </div>
        </div>
      </div>

      <ErrorAlert error={error} />

      {/* Grid Layout */}
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
          {widgets.map(w => (
            <div key={w.id}>
              <WidgetWrapper
                widget={w}
                editMode={editMode}
                onEdit={() => setEditWidgetState(w)}
                onRemove={() => removeWidget(w.id)}
              >
                <div className="relative h-full">
                  {renderWidgetContent(w)}
                  {widgetInsights[INSIGHT_KEY_MAP[w.id] ?? w.id] && (
                    <div className="absolute top-1 right-1 z-10">
                      <AiInsightButton insight={widgetInsights[INSIGHT_KEY_MAP[w.id] ?? w.id] ?? null} loading={insightsLoading} />
                    </div>
                  )}
                </div>
              </WidgetWrapper>
            </div>
          ))}
        </ResponsiveGridLayout>
      </div>

      {/* Modals */}
      <AddWidgetModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addWidget} dataSources={MANAGER_DATA_SOURCES} />
      <EditWidgetModal widget={editWidgetState} onClose={() => setEditWidgetState(null)} onSave={updateWidget} />
      <AnalystDetailModal
        analyst={selectedAnalyst}
        startDate={range.start}
        endDate={range.end}
        onClose={() => setSelectedAnalyst(null)}
        onTicketClick={(id) => setTicketId(id)}
      />
      <TicketDetailModal ticketId={ticketId} onClose={() => setTicketId(null)} />
    </div>
  );
}
