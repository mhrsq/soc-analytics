import { useState, useEffect, useCallback } from "react";
import { X, RefreshCw, Database, CheckCircle2, XCircle, Loader2, Clock, ArrowDownToLine, Zap } from "lucide-react";
import { api } from "../api/client";
import type { SyncDetailedStatus, SDPConnectionStatus } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SyncStatusPanel({ open, onClose }: Props) {
  const [status, setStatus] = useState<SyncDetailedStatus | null>(null);
  const [sdp, setSdp] = useState<SDPConnectionStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        api.getSyncDetailedStatus(),
        api.getSDPStatus(),
      ]);
      setStatus(s);
      setSdp(d);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [open, refresh]);

  const triggerSync = async (full: boolean) => {
    setSyncing(true);
    setMsg("");
    try {
      const res = await api.triggerSync(full);
      setMsg(res.message);
      setTimeout(refresh, 2000);
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    }
    setSyncing(false);
  };

  if (!open) return null;

  const isRunning = status?.is_running;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-lg shadow-2xl border overflow-hidden"
        role="dialog"
        aria-modal="true"
        style={{ backgroundColor: "var(--theme-card-bg)", borderColor: "var(--theme-surface-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--theme-surface-border)" }}>
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>Sync Status</h2>
              <p className="text-[11px]" style={{ color: "var(--theme-text-muted)" }}>SDP Ticket Synchronization</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: "var(--theme-text-muted)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Overview Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatBox
              label="In Database"
              value={status?.total_in_db?.toLocaleString() ?? "—"}
              icon={<Database className="w-3.5 h-3.5" />}
              accent
            />
            <StatBox
              label="In SDP"
              value={sdp?.ticket_count?.toLocaleString() ?? "—"}
              icon={<ArrowDownToLine className="w-3.5 h-3.5" />}
            />
            <StatBox
              label="Status"
              value={isRunning ? "Syncing..." : "Idle"}
              icon={isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              color={isRunning ? "#f59e0b" : "#22c55e"}
            />
          </div>

          {/* Progress bar when running */}
          {isRunning && status && (
            <div>
              <div className="flex justify-between text-[11px] mb-1" style={{ color: "var(--theme-text-muted)" }}>
                <span>Sync in progress...</span>
                <span>{status.tickets_synced ?? 0} tickets</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--theme-surface-border)" }}>
                <div
                  className="h-full rounded-full transition-all bg-amber-500"
                  style={{ width: "100%", animation: "pulse 2s ease-in-out infinite" }}
                />
              </div>
            </div>
          )}

          {/* SDP Connection */}
          <div className="rounded-lg p-3 border text-xs space-y-1.5" style={{ borderColor: "var(--theme-surface-border)" }}>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--theme-text-muted)" }}>SDP Connection</span>
              <span className={sdp?.connected ? "text-emerald-400" : "text-red-400"}>
                {sdp?.connected ? "Connected" : sdp?.error ? "Error" : "Disconnected"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--theme-text-muted)" }}>Base URL</span>
              <span className="font-mono text-[10px] truncate max-w-[200px]" style={{ color: "var(--theme-text-secondary)" }} title={sdp?.base_url}>
                {sdp?.base_url}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--theme-text-muted)" }}>API Key</span>
              <span className="font-mono text-[10px]" style={{ color: "var(--theme-text-secondary)" }}>{sdp?.api_key_masked}</span>
            </div>
            {sdp?.error && (
              <div className="p-2 rounded text-[10px] text-red-400 break-all" style={{ backgroundColor: "color-mix(in srgb, var(--theme-card-bg) 80%, red 20%)" }}>
                {sdp.error}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => triggerSync(false)}
              disabled={syncing || isRunning}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
              style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)", color: "var(--theme-accent)" }}
            >
              <Zap className="w-3.5 h-3.5" />
              Incremental Sync
            </button>
            <button
              onClick={() => triggerSync(true)}
              disabled={syncing || isRunning}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
              style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)", color: "var(--theme-accent)" }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Full Sync
            </button>
          </div>

          {msg && (
            <div className="text-xs text-center py-1" style={{ color: "var(--theme-accent)" }}>{msg}</div>
          )}

          {/* Recent Sync Logs */}
          {status?.recent_logs && status.recent_logs.length > 0 && (
            <div>
              <h3 className="text-xs font-medium mb-2" style={{ color: "var(--theme-text-primary)" }}>Recent Sync History</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {status.recent_logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] border"
                    style={{ borderColor: "var(--theme-surface-border)" }}
                  >
                    {log.status === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : log.status === "running" ? (
                      <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-medium capitalize"
                          style={{ color: "var(--theme-text-primary)" }}
                        >
                          {log.sync_type}
                        </span>
                        <span style={{ color: "var(--theme-text-muted)" }}>
                          {log.tickets_synced}/{log.tickets_total} tickets
                        </span>
                        {log.errors > 0 && (
                          <span className="text-red-400">{log.errors} errors</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--theme-text-muted)" }}>
                      {log.started_at ? new Date(log.started_at).toLocaleTimeString("id-ID", { hour12: false }) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon, accent, color }: { label: string; value: string; icon: React.ReactNode; accent?: boolean; color?: string }) {
  return (
    <div className="rounded-lg p-3 border text-center" style={{ borderColor: "var(--theme-surface-border)" }}>
      <div className="flex items-center justify-center gap-1 mb-1" style={{ color: color || (accent ? "var(--theme-accent)" : "var(--theme-text-muted)") }}>
        {icon}
      </div>
      <div className="text-lg font-bold tabular-nums" style={{ color: color || (accent ? "var(--theme-accent)" : "var(--theme-text-primary)") }}>
        {value}
      </div>
      <div className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>{label}</div>
    </div>
  );
}
