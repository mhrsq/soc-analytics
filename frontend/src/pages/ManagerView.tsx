import { useState, useMemo, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { Card } from "../components/Card";
import { Spinner } from "../components/Spinner";
import { AnalystLeaderboard } from "../components/AnalystLeaderboard";
import { AnalystScoreCard } from "../components/AnalystScoreCard";
import { AnalystDetailModal } from "../components/AnalystDetailModal";
import { TeamTrendChart } from "../components/AnalystTrendChart";
import type { AnalystScore } from "../types";
import { Users, Trophy, TrendingUp, Target, ChevronDown, BarChart3, Settings2, Eye, EyeOff, Info } from "lucide-react";

const STORAGE_KEY = "soc-manager-excluded-analysts";
function loadExcluded(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")); } catch { return new Set(); }
}
function saveExcluded(s: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
}

// Period presets
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

function TeamKPIs({ data }: { data: AnalystScore[] }) {
  const avgScore = data.length > 0 ? data.reduce((s, d) => s + d.composite_score, 0) / data.length : 0;
  const tierCounts = data.reduce((acc, d) => { acc[d.tier] = (acc[d.tier] || 0) + 1; return acc; }, {} as Record<string, number>);
  const totalTickets = data.reduce((s, d) => s + d.stats.total_tickets, 0);
  const totalResolved = data.reduce((s, d) => s + d.stats.resolved, 0);

  const kpis = [
    { label: "Total Analysts", value: data.length, icon: <Users className="w-4 h-4" />, color: "var(--theme-accent)" },
    { label: "Avg Score", value: avgScore.toFixed(1), icon: <Target className="w-4 h-4" />, color: avgScore >= 75 ? "#22C55E" : avgScore >= 60 ? "#3B82F6" : "#F59E0B" },
    { label: "Total Tickets", value: totalTickets.toLocaleString(), icon: <TrendingUp className="w-4 h-4" />, color: "var(--theme-accent)" },
    { label: "Resolved", value: `${totalResolved.toLocaleString()} (${totalTickets > 0 ? ((totalResolved / totalTickets) * 100).toFixed(0) : 0}%)`, icon: <Trophy className="w-4 h-4" />, color: "#22C55E" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map((k) => (
        <Card key={k.label}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${k.color} 12%, transparent)`, color: k.color }}>
              {k.icon}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>{k.label}</p>
              <p className="font-bold font-mono" style={{ fontSize: 28, lineHeight: 1.2, color: "var(--theme-text-primary)" }}>{k.value}</p>
            </div>
          </div>
          {/* Tier badges for Analysts card */}
          {k.label === "Total Analysts" && Object.keys(tierCounts).length > 0 && (
            <div className="flex gap-1.5 mt-2">
              {["S", "A", "B", "C", "D"].filter((t) => tierCounts[t]).map((t) => {
                const colors: Record<string, string> = { S: "#FFD700", A: "#22C55E", B: "#3B82F6", C: "#F59E0B", D: "#EF4444" };
                const tierLabels: Record<string, string> = { S: "Tier S: Exceptional (90-100)", A: "Tier A: Excellent (75-89)", B: "Tier B: Good (60-74)", C: "Tier C: Average (40-59)", D: "Tier D: Needs Improvement (<40)" };
                return (
                  <Tip key={t} text={tierLabels[t]}>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `color-mix(in srgb, ${colors[t]} 15%, transparent)`, color: colors[t] }}>
                      {t}×{tierCounts[t]}
                    </span>
                  </Tip>
                );
              })}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

type ViewMode = "cards" | "table";

/* Tooltip wrapper */
function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative group/tip cursor-help">
      {children}
      <span className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg text-[10px] leading-tight font-normal whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity shadow-lg"
        style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-secondary)", border: "1px solid var(--theme-surface-border)" }}>
        {text}
      </span>
    </span>
  );
}

export function ManagerView() {
  const [periodDays, setPeriodDays] = useState(30);
  const [selectedAnalyst, setSelectedAnalyst] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [excluded, setExcluded] = useState<Set<string>>(loadExcluded);
  const [showExcludePanel, setShowExcludePanel] = useState(false);

  const range = useMemo(() => getDateRange(periodDays), [periodDays]);

  const { data: rawData, loading } = useFetch<AnalystScore[]>(
    () => api.getAnalystScores({ start: range.start, end: range.end }),
    [range.start, range.end]
  );

  // All unique analyst names seen (for the exclude panel)
  const allAnalysts = useMemo(() => {
    if (!rawData) return [];
    return rawData.map((a) => a.analyst).sort();
  }, [rawData]);

  // Filter out excluded analysts
  const data = useMemo(() => {
    if (!rawData) return null;
    return rawData.filter((a) => !excluded.has(a.analyst));
  }, [rawData, excluded]);

  const toggleExclude = useCallback((name: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      saveExcluded(next);
      return next;
    });
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6 py-4 sm:py-6">
      {/* Period Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold" style={{ color: "var(--theme-text-primary)" }}>
          Analyst Performance
        </h2>
        <div className="flex items-center gap-2">
          {/* Analyst Filter Button */}
          <div className="relative">
            <button
              onClick={() => setShowExcludePanel(!showExcludePanel)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: excluded.size > 0 ? "color-mix(in srgb, #F59E0B 15%, transparent)" : "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
                color: excluded.size > 0 ? "#F59E0B" : "var(--theme-text-muted)",
                border: `1px solid ${excluded.size > 0 ? "#F59E0B40" : "var(--theme-surface-border)"}`,
              }}
            >
              <Settings2 className="w-3.5 h-3.5" />
              {excluded.size > 0 && <span>{excluded.size} hidden</span>}
            </button>

            {/* Exclude Panel Dropdown */}
            {showExcludePanel && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExcludePanel(false)} />
                <div
                  className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl shadow-2xl p-4 space-y-3"
                  style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-card-border)" }}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>Manage Analysts</h4>
                    {excluded.size > 0 && (
                      <button
                        onClick={() => { setExcluded(new Set()); saveExcluded(new Set()); }}
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ color: "var(--theme-accent)", backgroundColor: "color-mix(in srgb, var(--theme-accent) 10%, transparent)" }}
                      >
                        Show All
                      </button>
                    )}
                  </div>
                  <p className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>Toggle analysts off to hide them from scoring &amp; charts (e.g. resigned staff).</p>
                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                    {allAnalysts.map((name) => {
                      const isExcluded = excluded.has(name);
                      return (
                        <button
                          key={name}
                          onClick={() => toggleExclude(name)}
                          className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs transition-all text-left"
                          style={{
                            backgroundColor: isExcluded ? "color-mix(in srgb, #EF4444 8%, transparent)" : "color-mix(in srgb, var(--theme-surface-raised) 40%, transparent)",
                            color: isExcluded ? "var(--theme-text-muted)" : "var(--theme-text-primary)",
                            opacity: isExcluded ? 0.5 : 1,
                          }}
                        >
                          {isExcluded ? <EyeOff className="w-3.5 h-3.5 shrink-0 text-red-400" /> : <Eye className="w-3.5 h-3.5 shrink-0" style={{ color: "#22C55E" }} />}
                          <span className={`truncate ${isExcluded ? "line-through" : ""}`}>{name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--theme-surface-border)" }}>
            {(["cards", "table"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="px-3 py-1.5 text-xs font-medium transition-all capitalize"
                style={{
                  backgroundColor: viewMode === mode ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
                  color: viewMode === mode ? "var(--theme-accent)" : "var(--theme-text-muted)",
                }}
              >
                {mode === "cards" ? "Cards" : "Table"}
              </button>
            ))}
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
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--theme-text-muted)" }} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : !data || data.length === 0 ? (
        <Card>
          <div className="text-center py-16">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: "var(--theme-text-muted)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--theme-text-muted)" }}>
              No analyst performance data available for this period
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--theme-text-muted)" }}>
              Analysts need at least 5 tickets to appear in the scoring
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Team KPIs */}
          <TeamKPIs data={data} />

          {/* Leaderboard or Cards */}
          {viewMode === "table" ? (
            <AnalystLeaderboard data={data} loading={false} onSelect={setSelectedAnalyst} />
          ) : (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {data.map((analyst, i) => (
                  <AnalystScoreCard
                    key={analyst.analyst}
                    data={analyst}
                    rank={i + 1}
                    onClick={() => setSelectedAnalyst(analyst.analyst)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Team Performance Trends */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
              <h3 className="text-lg font-semibold" style={{ color: "var(--theme-text)" }}>
                Performance Trends
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--theme-accent-dim)", color: "var(--theme-accent)" }}>
                Weekly Snapshots
              </span>
            </div>
            <TeamTrendChart
              selectedAnalysts={data.map((a) => a.analyst)}
              granularity="weekly"
            />
          </Card>
        </>
      )}

      {/* Detail Modal */}
      <AnalystDetailModal
        analyst={selectedAnalyst}
        startDate={range.start}
        endDate={range.end}
        onClose={() => setSelectedAnalyst(null)}
      />
    </div>
  );
}
