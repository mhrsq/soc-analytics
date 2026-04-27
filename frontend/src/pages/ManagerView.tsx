import { useState, useMemo, useCallback } from "react";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { Card } from "../components/Card";
import { Spinner } from "../components/Spinner";
import { AnalystDetailModal } from "../components/AnalystDetailModal";
import { TicketDetailModal } from "../components/TicketDetailModal";
import { TeamTrendChart } from "../components/AnalystTrendChart";
import { SLATrendChart } from "../components/SLATrendChart";
import { FPRateTrendChart } from "../components/FPRateTrendChart";
import { CustomerSlaHeatmap } from "../components/CustomerSlaHeatmap";
import { SlaBreachAnalysis } from "../components/SlaBreachAnalysis";
import type { AnalystScore } from "../types";
import { Users, ChevronDown, BarChart3, AlertTriangle, Minus } from "lucide-react";
import { ErrorAlert } from "../components/ErrorAlert";

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

  const range = useMemo(() => getDateRange(periodMonths), [periodMonths]);
  const { data: rawData, loading, error } = useFetch<AnalystScore[]>(
    () => api.getAnalystScores({ start: range.start, end: range.end }),
    [range.start, range.end]
  );

  const slaTrend = useFetch(() => api.getSlaTrend({ start: range.start, end: range.end }), [range.start, range.end]);
  const fpTrend = useFetch(() => api.getFpTrend({ start: range.start, end: range.end }), [range.start, range.end]);
  const customerSla = useFetch(() => api.getCustomerSlaMatrix({ start: range.start, end: range.end }), [range.start, range.end]);

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
    if (sortCol !== col) return <span className="opacity-30 ml-0.5">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  const totalTeamTickets = useMemo(() => data?.reduce((s, d) => s + d.stats.total_tickets, 0) ?? 0, [data]);
  const avgPct = data && data.length > 0 ? 100 / data.length : 0;

  return (
    <div className="space-y-4 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--theme-text-primary)" }}>
            Team Workload
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
            {data ? `${data.length} analysts · ${totalTeamTickets.toLocaleString()} tickets` : "Loading..."}
          </p>
        </div>
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

      <ErrorAlert error={error} />

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : !data || data.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: "var(--theme-text-muted)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--theme-text-muted)" }}>
              No analyst data for this period
            </p>
            <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: "var(--theme-text-muted)" }}>
              Analysts need at least 5 resolved tickets. Try "All Time".
            </p>
            <button
              onClick={() => setPeriodMonths(0)}
              className="mt-3 px-3 py-1.5 text-xs rounded-lg font-medium"
              style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)", color: "var(--theme-accent)" }}
            >
              View All Time
            </button>
          </div>
        </Card>
      ) : (
        <>
          {/* Workload Table */}
          <Card noPad>
            <div className="overflow-x-auto">
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
          </Card>

          {/* Performance Trends */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" style={{ color: "var(--theme-text-muted)" }} />
                <h3 className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>
                  Performance Trends
                </h3>
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
                      const data = await res.json();
                      setBackfillMsg(data.message || "Backfill triggered");
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
            <TeamTrendChart selectedAnalysts={data.map((a) => a.analyst)} granularity="weekly" />
          </Card>

          {/* P0 Analytics Widgets — 2 rows, each split 50/50 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <SLATrendChart data={slaTrend.data} loading={slaTrend.loading} />
            <FPRateTrendChart data={fpTrend.data} loading={fpTrend.loading} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <CustomerSlaHeatmap data={customerSla.data} loading={customerSla.loading} />
            <SlaBreachAnalysis start={range.start} end={range.end} />
          </div>
        </>
      )}

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
