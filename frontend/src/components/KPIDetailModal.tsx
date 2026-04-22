import { useState, useEffect, useMemo } from "react";
import { api } from "../api/client";
import type { MetricsSummary, TicketListItem } from "../types";
import { Spinner } from "./Spinner";
import {
  X, ExternalLink, Activity, ShieldAlert, Target, ShieldCheck,
  Clock, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Minus,
  ChevronRight, ChevronLeft,
} from "lucide-react";

export type KPIKey = "total" | "open" | "tp" | "fp" | "mttd" | "mttr" | "sla";

interface Props {
  kpiKey: KPIKey | null;
  summary: MetricsSummary | null;
  filters: { start?: string; end?: string; customer?: string };
  onClose: () => void;
  onTicketClick?: (id: number) => void;
}

const KPI_META: Record<KPIKey, { title: string; icon: typeof Activity; color: string; description: string }> = {
  total: { title: "Total Tickets", icon: Activity, color: "text-cyber-blue", description: "All tickets ingested within the selected time range." },
  open: { title: "Open Tickets", icon: ShieldAlert, color: "text-cyber-orange", description: "Tickets still in Open, Assigned, or In Progress status." },
  tp: { title: "True Positive", icon: Target, color: "text-cyber-red", description: "Alerts confirmed as real security threats." },
  fp: { title: "False Positive", icon: ShieldCheck, color: "text-cyber-green", description: "Alerts identified as non-threats after validation." },
  mttd: { title: "Avg MTTD", icon: Clock, color: "text-cyber-teal", description: "Mean Time to Detect — from alert creation to first analyst acknowledgment." },
  mttr: { title: "Avg MTTR", icon: Clock, color: "text-cyber-orange", description: "Mean Time to Resolve — from alert time to workaround completion. SLA: Critical=2h, High=5h, Medium=8h, Low=24h." },
  sla: { title: "SLA Compliance", icon: TrendingUp, color: "text-cyber-green", description: "Percentage of tickets detected within the MTTD SLA timeframe (15 minutes)." },
};

function fmtTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return dateStr; }
}

function PriorityBadge({ priority }: { priority: string }) {
  const c = priority === "Critical" ? "bg-cyber-red/20 text-cyber-red" :
    priority === "High" ? "bg-cyber-orange/20 text-cyber-orange" :
    priority === "Medium" ? "bg-cyber-yellow/20 text-cyber-yellow" :
    "bg-cyber-green/20 text-cyber-green";
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c}`}>{priority}</span>;
}

function ValidationBadge({ v }: { v: string | null }) {
  if (!v || v === "Not Specified") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-700/40" style={{ color: "var(--theme-text-muted)" }}><Minus className="w-3 h-3 inline -mt-0.5" /> N/S</span>;
  if (v === "True Positive") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyber-red/15 text-cyber-red font-medium"><XCircle className="w-3 h-3 inline -mt-0.5" /> TP</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyber-green/15 text-cyber-green font-medium"><CheckCircle2 className="w-3 h-3 inline -mt-0.5" /> FP</span>;
}

function SLABadge({ met }: { met: boolean | null }) {
  if (met === null || met === undefined) return <span className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>—</span>;
  return met
    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyber-green/15 text-cyber-green font-medium"><CheckCircle2 className="w-3 h-3 inline -mt-0.5" /> Met</span>
    : <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyber-red/15 text-cyber-red font-medium"><XCircle className="w-3 h-3 inline -mt-0.5" /> Missed</span>;
}

// ── Stat box inside the modal ──
function StatBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-card-border)" }}>
      <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--theme-text-muted)" }}>{label}</p>
      <p className={`text-lg font-bold leading-none ${color || ""}`} style={color ? undefined : { color: "var(--theme-text-primary)" }}>{value}</p>
      {sub && <p className="text-[10px] mt-1" style={{ color: "var(--theme-text-muted)" }}>{sub}</p>}
    </div>
  );
}

export function KPIDetailModal({ kpiKey, summary, filters, onClose, onTicketClick }: Props) {
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const meta = kpiKey ? KPI_META[kpiKey] : null;
  const Icon = meta?.icon ?? Activity;

  // Build filter params for the ticket query based on KPI type
  const ticketParams = useMemo(() => {
    if (!kpiKey) return null;
    const base: Record<string, string | undefined> = {
      start: filters.start,
      end: filters.end,
      customer: filters.customer,
      page_size: String(pageSize),
      page: String(page),
    };
    switch (kpiKey) {
      case "open":
        base.status = "Open"; // Will also include Assigned, In Progress via backend
        break;
      case "tp":
        base.validation = "True Positive";
        break;
      case "fp":
        base.validation = "False Positive";
        break;
      case "mttd":
        base.has_mttd = "true";
        base.sort = "mttd_seconds";
        base.order = "desc";
        break;
      case "sla":
        base.has_sla = "true";
        break;
    }
    return base;
  }, [kpiKey, filters, page]);

  useEffect(() => {
    if (!kpiKey || !ticketParams) return;
    setLoading(true);
    api.getTickets(ticketParams)
      .then(res => {
        setTickets(res.tickets);
        setTotalTickets(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kpiKey, ticketParams]);

  // Reset page when KPI changes
  useEffect(() => { setPage(1); }, [kpiKey]);

  if (!kpiKey || !meta) return null;

  const totalPages = Math.max(1, Math.ceil(totalTickets / pageSize));

  // Summary stats for the header section
  const stats = (() => {
    if (!summary) return [];
    switch (kpiKey) {
      case "total":
        return [
          { label: "Total", value: summary.total_tickets.toLocaleString(), color: "text-cyber-blue" },
          { label: "Open", value: summary.open_tickets.toLocaleString(), color: "text-cyber-orange" },
          { label: "True Positive", value: summary.tp_count.toLocaleString(), color: "text-cyber-red" },
          { label: "False Positive", value: summary.fp_count.toLocaleString(), color: "text-cyber-green" },
          { label: "Security Incidents", value: summary.si_count.toLocaleString(), color: "text-cyber-red" },
        ];
      case "open":
        return [
          { label: "Open", value: summary.open_tickets.toLocaleString(), color: "text-cyber-orange" },
          { label: "% of Total", value: summary.total_tickets > 0 ? `${(summary.open_tickets / summary.total_tickets * 100).toFixed(1)}%` : "—", color: "text-cyber-orange" },
          { label: "Total Tickets", value: summary.total_tickets.toLocaleString(), color: "text-cyber-blue" },
        ];
      case "tp":
        return [
          { label: "True Positive", value: summary.tp_count.toLocaleString(), color: "text-cyber-red" },
          { label: "TP Rate", value: `${summary.tp_rate}%`, color: "text-cyber-red" },
          { label: "Total Validated", value: (summary.tp_count + summary.fp_count).toLocaleString(), color: "text-cyber-blue" },
          { label: "Security Incidents", value: summary.si_count.toLocaleString(), color: "text-cyber-red" },
        ];
      case "fp":
        return [
          { label: "False Positive", value: summary.fp_count.toLocaleString(), color: "text-cyber-green" },
          { label: "FP Rate", value: `${summary.fp_rate}%`, color: "text-cyber-green" },
          { label: "Total Validated", value: (summary.tp_count + summary.fp_count).toLocaleString(), color: "text-cyber-blue" },
        ];
      case "mttd":
        return [
          { label: "Avg MTTD", value: summary.avg_mttd_display ?? "No data", color: "text-cyber-teal", sub: summary.avg_mttd_seconds ? `${summary.avg_mttd_seconds.toLocaleString()}s` : undefined },
          { label: "SLA Compliance", value: summary.sla_compliance_pct !== null ? `${summary.sla_compliance_pct}%` : "No data", color: (summary.sla_compliance_pct ?? 0) >= 90 ? "text-cyber-green" : "text-cyber-red" },
          { label: "Tickets w/ MTTD", value: totalTickets.toLocaleString(), color: "text-cyber-blue" },
        ];
      case "sla":
        return [
          { label: "SLA Compliance", value: summary.sla_compliance_pct !== null ? `${summary.sla_compliance_pct}%` : "No data", color: (summary.sla_compliance_pct ?? 0) >= 90 ? "text-cyber-green" : "text-cyber-red" },
          { label: "Avg MTTD", value: summary.avg_mttd_display ?? "No data", color: "text-cyber-teal" },
          { label: "Tickets w/ SLA", value: totalTickets.toLocaleString(), color: "text-cyber-blue" },
        ];
      default:
        return [];
    }
  })();

  // Pick which columns to show in ticket table
  const showMttd = kpiKey === "mttd" || kpiKey === "sla";
  const showSla = kpiKey === "sla" || kpiKey === "mttd";
  const showValidation = kpiKey === "total" || kpiKey === "tp" || kpiKey === "fp";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl shadow-black/40 animate-fade-in-up overflow-hidden"
        style={{ backgroundColor: "var(--theme-surface-raised)", border: "1px solid var(--theme-surface-border)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 shrink-0" style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
          <div className={`p-2 rounded-lg ${meta.color.replace("text-", "bg-")}/10`}>
            <Icon className={`w-5 h-5 ${meta.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold" style={{ color: "var(--theme-text-primary)" }}>{meta.title} — Drilldown</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--theme-text-muted)" }}>{meta.description}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:opacity-70" style={{ color: "var(--theme-text-muted)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stat boxes */}
        <div className="px-6 py-3 shrink-0" style={{ borderBottom: "1px solid var(--theme-surface-border)", backgroundColor: "color-mix(in srgb, var(--theme-accent) 3%, transparent)" }}>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {stats.map(s => <StatBox key={s.label} label={s.label} value={s.value} sub={s.sub} color={s.color} />)}
          </div>
        </div>

        {/* Ticket table */}
        <div className="flex-1 overflow-auto px-6 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold" style={{ color: "var(--theme-text-muted)" }}>
              {totalTickets.toLocaleString()} ticket{totalTickets !== 1 ? "s" : ""} found
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1 rounded disabled:opacity-30 transition-opacity hover:opacity-70"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-mono" style={{ color: "var(--theme-text-muted)" }}>{page}/{totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-1 rounded disabled:opacity-30 transition-opacity hover:opacity-70"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Spinner /></div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12" style={{ color: "var(--theme-text-muted)" }}>
              <AlertTriangle className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">No tickets match this filter</p>
              {(kpiKey === "mttd" || kpiKey === "sla") && (
                <p className="text-[10px] mt-1 opacity-60">MTTD/SLA data requires alert_time & first_notif UDF fields in SDP</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--theme-text-muted)" }}>ID</th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--theme-text-muted)" }}>Subject</th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--theme-text-muted)" }}>Priority</th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--theme-text-muted)" }}>Status</th>
                    {showValidation && <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--theme-text-muted)" }}>Validation</th>}
                    {showMttd && <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--theme-text-muted)" }}>MTTD</th>}
                    {showSla && <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--theme-text-muted)" }}>SLA</th>}
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--theme-text-muted)" }}>Created</th>
                    <th className="text-center py-2 px-1 font-semibold" style={{ color: "var(--theme-text-muted)" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(t => (
                    <tr
                      key={t.id}
                      className="group transition-colors cursor-pointer"
                      style={{ borderBottom: "1px solid color-mix(in srgb, var(--theme-surface-border) 50%, transparent)" }}
                      onClick={() => onTicketClick?.(t.id)}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--theme-accent) 5%, transparent)")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <td className="py-2 px-2 font-mono" style={{ color: "var(--theme-text-muted)" }}>#{t.id}</td>
                      <td className="py-2 px-2 max-w-[200px] truncate" style={{ color: "var(--theme-text-secondary)" }}>{t.subject}</td>
                      <td className="py-2 px-2"><PriorityBadge priority={t.priority} /></td>
                      <td className="py-2 px-2" style={{ color: "var(--theme-text-muted)" }}>{t.status}</td>
                      {showValidation && <td className="py-2 px-2"><ValidationBadge v={t.validation} /></td>}
                      {showMttd && <td className="py-2 px-2 font-mono" style={{ color: t.mttd_seconds ? "var(--theme-text-secondary)" : "var(--theme-text-muted)" }}>{fmtTime(t.mttd_seconds)}</td>}
                      {showSla && <td className="py-2 px-2"><SLABadge met={t.sla_met} /></td>}
                      <td className="py-2 px-2 whitespace-nowrap" style={{ color: "var(--theme-text-muted)" }}>{fmtDate(t.created_time)}</td>
                      <td className="py-2 px-1 text-center">
                        <a
                          href={`https://sdp-ioc.mtm.id:8050/WorkOrder.do?woMode=viewWO&woID=${t.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:text-cyber-blue"
                          style={{ color: "var(--theme-text-muted)" }}
                          onClick={e => e.stopPropagation()}
                          title="Open in SDP"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderTop: "1px solid var(--theme-surface-border)" }}>
          <p className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>
            Click a row to view full ticket details · <ExternalLink className="w-3 h-3 inline -mt-0.5" /> opens in SDP
          </p>
          {totalPages > 1 && (
            <p className="text-[10px] font-mono" style={{ color: "var(--theme-text-muted)" }}>
              Page {page} of {totalPages}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
