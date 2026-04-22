import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { TicketDetail } from "../types";
import { Spinner } from "./Spinner";
import {
  X, ExternalLink, Shield, Clock, User, Building2, AlertTriangle,
  Hash, Server, Globe, Calendar, CheckCircle2, XCircle, Minus,
} from "lucide-react";

interface Props {
  ticketId: number | null;
  onClose: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "Closed" ? "bg-surface-600" :
    status === "Resolved" ? "bg-cyber-green/20 text-cyber-green" :
    "bg-cyber-blue/20 text-cyber-blue";
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${color}`}>{status}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const color = priority === "Critical" ? "bg-cyber-red/20 text-cyber-red" :
    priority === "High" ? "bg-cyber-orange/20 text-cyber-orange" :
    priority === "Medium" ? "bg-cyber-yellow/20 text-cyber-yellow" :
    "bg-cyber-green/20 text-cyber-green";
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${color}`}>{priority}</span>;
}

function ValidationBadge({ validation }: { validation: string | null }) {
  if (!validation || validation === "Not Specified") {
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-700/50 text-surface-400">
        <Minus className="w-3 h-3" /> Not Specified
      </span>
    );
  }
  if (validation === "True Positive") {
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-cyber-red/15 text-cyber-red">
        <XCircle className="w-3 h-3" /> True Positive
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-cyber-green/15 text-cyber-green">
      <CheckCircle2 className="w-3 h-3" /> False Positive
    </span>
  );
}

function fmtTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

function DetailRow({ icon: Icon, label, value, mono }: {
  icon: React.ElementType; label: string; value: React.ReactNode; mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 last:border-0" style={{ borderBottom: "1px solid var(--theme-surface-border, transparent)", borderBottomWidth: 1, opacity: 0.5 ? undefined : undefined }}>
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--theme-text-muted)" }} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-medium" style={{ color: "var(--theme-text-muted)" }}>{label}</p>
        <div className={`text-sm mt-0.5 ${mono ? "font-mono" : ""}`} style={{ color: "var(--theme-text-secondary)" }}>
          {value || "—"}
        </div>
      </div>
    </div>
  );
}

export function TicketDetailModal({ ticketId, onClose }: Props) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    api.getTicketDetail(ticketId)
      .then(setTicket)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticketId]);

  if (!ticketId) return null;

  const sdpUrl = `https://sdp-ioc.mtm.id:8050/WorkOrder.do?woMode=viewWO&woID=${ticketId}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl shadow-black/40 animate-fade-in-up overflow-hidden"
        style={{ backgroundColor: "var(--theme-surface-raised)", border: "1px solid var(--theme-surface-border)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 10%, transparent)" }}>
              <Shield className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-mono" style={{ color: "var(--theme-text-muted)" }}>Ticket #{ticketId}</p>
              <h3 className="text-sm font-semibold truncate max-w-[400px]" style={{ color: "var(--theme-text-primary)" }}>
                {loading ? "Loading..." : ticket?.subject || "—"}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={sdpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-cyber-blue/10 border border-cyber-blue/25 text-cyber-blue
                hover:bg-cyber-blue/20 hover:border-cyber-blue/40 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in SDP
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
              style={{ color: "var(--theme-text-muted)" }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <Spinner />
          ) : error ? (
            <div className="flex items-center gap-3 py-6 px-4 bg-cyber-red/5 rounded-lg border border-cyber-red/15">
              <AlertTriangle className="w-5 h-5 text-cyber-red flex-shrink-0" />
              <p className="text-sm text-cyber-red">{error}</p>
            </div>
          ) : ticket ? (
            <div className="space-y-4">
              {/* Badges row */}
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
                <ValidationBadge validation={ticket.validation} />
                {ticket.sla_met !== null && (
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    ticket.sla_met ? "bg-cyber-green/15 text-cyber-green" : "bg-cyber-red/15 text-cyber-red"
                  }`}>
                    SLA {ticket.sla_met ? "Met" : "Breached"}
                  </span>
                )}
              </div>

              {/* Description */}
              {ticket.description && (
                <div className="p-3 rounded-lg" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-card-border)" }}>
                  <p className="text-[10px] font-medium mb-1" style={{ color: "var(--theme-text-muted)" }}>Description</p>
                  <div className="text-xs leading-relaxed line-clamp-6 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_b]:font-semibold [&_a]:text-blue-400 [&_a]:underline" style={{ color: "var(--theme-text-secondary)" }}
                    dangerouslySetInnerHTML={{ __html: ticket.description
                      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
                      .replace(/javascript\s*:/gi, '')
                      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
                      .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
                      .replace(/<embed[^>]*>/gi, '')
                    }} />
                </div>
              )}

              {/* Details grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                <DetailRow icon={User} label="Technician" value={ticket.technician} />
                <DetailRow icon={Building2} label="Customer" value={ticket.customer} />
                <DetailRow icon={Hash} label="Wazuh Rule" value={
                  ticket.wazuh_rule_id ? (
                    <span>
                      <span className="text-cyber-blue">{ticket.wazuh_rule_id}</span>
                      {ticket.wazuh_rule_name && <span className="text-surface-400 ml-1">— {ticket.wazuh_rule_name}</span>}
                    </span>
                  ) : null
                } />
                <DetailRow icon={AlertTriangle} label="Attack Category" value={ticket.attack_category} />
                <DetailRow icon={Shield} label="Case Type" value={ticket.case_type} />
                <DetailRow icon={Server} label="Asset" value={ticket.asset_name} />
                <DetailRow icon={Globe} label="IP Address" value={ticket.ip_address} mono />
                <DetailRow icon={User} label="Group" value={ticket.group_name} />
              </div>

              {/* Timestamps */}
              <div className="mt-2 p-3 rounded-lg" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-card-border)" }}>
                <p className="text-[10px] font-medium mb-2" style={{ color: "var(--theme-text-muted)" }}>Timeline</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>Alert Time</p>
                    <p className="text-xs font-mono" style={{ color: "var(--theme-text-secondary)" }}>{fmtDate(ticket.alert_time)}</p>
                  </div>
                  <div>
                    <p className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>First Notification</p>
                    <p className="text-xs font-mono" style={{ color: "var(--theme-text-secondary)" }}>{fmtDate(ticket.first_notif)}</p>
                  </div>
                  <div>
                    <p className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>Created</p>
                    <p className="text-xs font-mono" style={{ color: "var(--theme-text-secondary)" }}>{fmtDate(ticket.created_time)}</p>
                  </div>
                  <div>
                    <p className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>Completed</p>
                    <p className="text-xs font-mono" style={{ color: "var(--theme-text-secondary)" }}>{fmtDate(ticket.completed_time)}</p>
                  </div>
                </div>
              </div>

              {/* Response metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg text-center" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-card-border)" }}>
                  <Clock className="w-4 h-4 mx-auto mb-1" style={{ color: "var(--theme-accent)" }} />
                  <p className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>MTTD</p>
                  <p className="text-lg font-bold font-mono" style={{ color: "var(--theme-accent)" }}>{fmtTime(ticket.mttd_seconds)}</p>
                </div>
                <div className="p-3 rounded-lg text-center" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-card-border)" }}>
                  <Clock className="w-4 h-4 text-cyber-teal mx-auto mb-1" />
                  <p className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>MTTR</p>
                  <p className="text-lg font-bold text-cyber-teal font-mono">{fmtTime(ticket.mttr_seconds)}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
