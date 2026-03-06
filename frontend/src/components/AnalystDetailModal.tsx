import { useEffect, useState } from "react";
import { X, User, Target, Clock, Shield, TrendingUp, Zap, BarChart3, Users, AlertTriangle } from "lucide-react";
import { api } from "../api/client";
import { AnalystSpiderChart } from "./AnalystSpiderChart";
import { AnalystTrendChart } from "./AnalystTrendChart";
import { TierBadge } from "./AnalystScoreCard";
import { AnalystAIReview } from "./AnalystAIReview";
import { Spinner } from "./Spinner";
import type { AnalystDetail } from "../types";

interface Props {
  analyst: string | null;
  startDate?: string;
  endDate?: string;
  onClose: () => void;
}

const TIER_COLORS: Record<string, string> = {
  S: "#FFD700", A: "#22C55E", B: "#3B82F6", C: "#F59E0B", D: "#EF4444",
};

const METRIC_CONFIG: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "speed", label: "Speed (MTTD)", icon: <Zap className="w-3.5 h-3.5" /> },
  { key: "detection", label: "Detection (TP)", icon: <Target className="w-3.5 h-3.5" /> },
  { key: "accuracy", label: "Accuracy", icon: <Shield className="w-3.5 h-3.5" /> },
  { key: "volume", label: "Volume", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { key: "sla", label: "SLA Compliance", icon: <Clock className="w-3.5 h-3.5" /> },
  { key: "throughput", label: "Throughput", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { key: "complexity", label: "Complexity", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
];

function MetricBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-border) 60%, transparent)" }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-mono font-semibold w-8 text-right" style={{ color }}>{value.toFixed(0)}</span>
    </div>
  );
}

function StatItem({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 60%, transparent)" }}>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--theme-text-muted)" }}>{label}</p>
      <p className="text-sm font-mono font-bold" style={{ color: "var(--theme-text-primary)" }}>{value}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: "var(--theme-text-muted)" }}>{sub}</p>}
    </div>
  );
}

export function AnalystDetailModal({ analyst, startDate, endDate, onClose }: Props) {
  const [detail, setDetail] = useState<AnalystDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!analyst) return;
    setLoading(true);
    setError(null);
    api
      .getAnalystDetail(analyst, { start: startDate, end: endDate })
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [analyst, startDate, endDate]);

  if (!analyst) return null;

  const tierColor = detail ? (TIER_COLORS[detail.tier] || TIER_COLORS.D) : "var(--theme-accent)";

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-8 sm:pt-16 overflow-y-auto" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-3xl rounded-2xl border shadow-2xl"
        style={{ backgroundColor: "var(--theme-card-bg)", borderColor: "var(--theme-card-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-4" style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold"
              style={{
                backgroundColor: `color-mix(in srgb, ${tierColor} 15%, transparent)`,
                color: tierColor,
                border: `2px solid ${tierColor}`,
              }}
            >
              {analyst.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: "var(--theme-text-primary)" }}>{analyst}</h2>
              {detail && (
                <div className="flex items-center gap-2 mt-0.5">
                  <TierBadge tier={detail.tier} size="sm" />
                  <span className="text-sm font-mono font-bold" style={{ color: tierColor }}>
                    {detail.composite_score.toFixed(1)}
                  </span>
                  <span className="text-xs" style={{ color: "var(--theme-text-muted)" }}>/ 100</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:opacity-80" style={{ color: "var(--theme-text-muted)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner /></div>
          ) : error ? (
            <div className="text-sm text-center py-8" style={{ color: "#EF4444" }}>{error}</div>
          ) : detail ? (
            <div className="space-y-6">
              {/* Spider + Metrics Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Spider Chart */}
                <div>
                  <AnalystSpiderChart metrics={detail.metrics} size={260} color={tierColor} />
                </div>

                {/* Metric Bars */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--theme-text-muted)" }}>
                    Score Breakdown
                  </h4>
                  {METRIC_CONFIG.map((m) => {
                    const val = detail.metrics[m.key as keyof typeof detail.metrics];
                    return (
                      <div key={m.key} className="flex items-center gap-2">
                        <span style={{ color: tierColor }}>{m.icon}</span>
                        <span className="text-xs w-28 shrink-0" style={{ color: "var(--theme-text-secondary)" }}>{m.label}</span>
                        <MetricBar value={val} color={tierColor} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* KPI Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatItem label="Total Tickets" value={detail.stats.total_tickets.toLocaleString()} />
                <StatItem label="Resolved" value={detail.stats.resolved.toLocaleString()} sub={`${detail.stats.total_tickets > 0 ? ((detail.stats.resolved / detail.stats.total_tickets) * 100).toFixed(0) : 0}%`} />
                <StatItem label="Avg MTTD" value={detail.stats.avg_mttd_display || "—"} />
                <StatItem label="Avg MTTR" value={detail.stats.avg_mttr_display || "—"} />
                <StatItem label="SLA" value={detail.stats.sla_pct != null ? `${detail.stats.sla_pct}%` : "—"} sub={`${detail.stats.sla_met}/${detail.stats.sla_total}`} />
                <StatItem label="TP Count" value={detail.stats.tp_count} sub={`${detail.stats.total_tickets > 0 ? ((detail.stats.tp_count / detail.stats.total_tickets) * 100).toFixed(0) : 0}% rate`} />
                <StatItem label="High Priority" value={detail.stats.high_priority} />
                <StatItem label="Sec. Incidents" value={detail.stats.security_incidents} />
              </div>

              {/* Performance Trend */}
              <div className="rounded-lg p-4" style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 40%, transparent)", border: "1px solid var(--theme-surface-border)" }}>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: "var(--theme-text-muted)" }}>
                  <TrendingUp className="w-3.5 h-3.5" /> Performance Trend
                </h4>
                <AnalystTrendChart analyst={analyst} compact />
              </div>

              {/* Top Customers & Alerts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Top Customers */}
                <div className="rounded-lg p-4" style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 40%, transparent)", border: "1px solid var(--theme-surface-border)" }}>
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: "var(--theme-text-muted)" }}>
                    <Users className="w-3.5 h-3.5" /> Top Customers
                  </h4>
                  {detail.top_customers.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>No data</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.top_customers.map((c) => (
                        <div key={c.customer} className="flex items-center justify-between text-xs">
                          <span className="truncate" style={{ color: "var(--theme-text-secondary)" }}>{c.customer}</span>
                          <span className="font-mono font-semibold ml-2 shrink-0" style={{ color: "var(--theme-text-primary)" }}>{c.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top Alerts */}
                <div className="rounded-lg p-4" style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 40%, transparent)", border: "1px solid var(--theme-surface-border)" }}>
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: "var(--theme-text-muted)" }}>
                    <AlertTriangle className="w-3.5 h-3.5" /> Top Alerts
                  </h4>
                  {detail.top_alerts.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>No data</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.top_alerts.map((a) => (
                        <div key={a.rule_name} className="flex items-center justify-between text-xs">
                          <span className="truncate" style={{ color: "var(--theme-text-secondary)" }}>{a.rule_name}</span>
                          <span className="font-mono font-semibold ml-2 shrink-0" style={{ color: "var(--theme-text-primary)" }}>{a.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Tickets */}
              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--theme-surface-border)" }}>
                <h4 className="text-xs font-semibold uppercase tracking-wider px-4 py-3 flex items-center gap-1.5" style={{ color: "var(--theme-text-muted)", backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 40%, transparent)" }}>
                  Recent Tickets
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
                        {["ID", "Subject", "Status", "Priority", "SLA"].map((h) => (
                          <th key={h} className="text-left font-medium px-4 py-2" style={{ color: "var(--theme-text-muted)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recent_tickets.map((t) => (
                        <tr key={t.id} style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
                          <td className="px-4 py-2 font-mono" style={{ color: "var(--theme-text-muted)" }}>{t.id}</td>
                          <td className="px-4 py-2 max-w-[200px] truncate" style={{ color: "var(--theme-text-secondary)" }}>{t.subject}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${t.status === "Resolved" || t.status === "Closed" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="px-4 py-2" style={{ color: "var(--theme-text-secondary)" }}>{t.priority}</td>
                          <td className="px-4 py-2">
                            {t.sla_met === true ? (
                              <span className="text-emerald-400">✓</span>
                            ) : t.sla_met === false ? (
                              <span className="text-red-400">✗</span>
                            ) : (
                              <span style={{ color: "var(--theme-text-muted)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AI Review */}
              <div className="rounded-lg p-4" style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 40%, transparent)", border: "1px solid var(--theme-surface-border)" }}>
                <AnalystAIReview analyst={analyst} startDate={startDate} endDate={endDate} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
