import { useEffect, useState, useRef, useCallback } from "react";
import { Radio } from "lucide-react";
import { api } from "../api/client";
import type { TicketListItem } from "../types";

interface Props {
  filters?: { start?: string; end?: string; customer?: string; asset_name?: string };
  loading?: boolean;
  bare?: boolean;
  onTicketClick?: (id: number) => void;
}

export function LiveTicketFeed({ filters, loading: extLoading, bare, onTicketClick }: Props) {
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchTickets = useCallback(async () => {
    try {
      const res = await api.getTickets({
        page_size: "10",
        sort: "created_time",
        order: "desc",
        ...(filters?.start ? { start: filters.start } : {}),
        ...(filters?.end ? { end: filters.end } : {}),
        ...(filters?.customer ? { customer: filters.customer } : {}),
      });
      setTickets(res.tickets);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filters?.start, filters?.end, filters?.customer]);

  useEffect(() => {
    setLoading(true);
    fetchTickets();
    // Auto-refresh every 30s
    intervalRef.current = setInterval(fetchTickets, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchTickets]);

  const isLoading = loading || extLoading;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--theme-accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs" style={{ color: "var(--theme-text-muted)" }}>
        No tickets found
      </div>
    );
  }

  const formatTime = (ts: string | null) => {
    if (!ts) return "—";
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / 3_600_000;
    if (diffH < 1) return `${Math.max(1, Math.floor(diffMs / 60_000))}m ago`;
    if (diffH < 24) return `${Math.floor(diffH)}h ago`;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  const inner = (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-1 pb-1.5 mb-1" style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
        <Radio className="w-3 h-3 text-green-500 animate-pulse flex-shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--theme-text-muted)" }}>
          Live Feed
        </span>
        <span className="ml-auto text-[10px] font-mono" style={{ color: "var(--theme-text-muted)" }}>
          {tickets.length} latest
        </span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto space-y-0">
        {tickets.map((t, i) => (
          <div
            key={t.id}
            onClick={() => onTicketClick?.(t.id)}
            className="flex items-start gap-2 px-1 py-1.5 rounded cursor-pointer transition-colors hover:bg-white/[0.03]"
            style={{ animation: i < 3 ? `fadeInRow 0.3s ease ${i * 0.08}s both` : undefined }}
          >
            <span className="text-[10px] font-mono tabular-nums shrink-0 w-12 pt-0.5" style={{ color: "var(--theme-text-muted)" }}>
              {formatTime(t.created_time)}
            </span>
            <span className="text-[11px] font-mono tabular-nums shrink-0 pt-0.5" style={{ color: "var(--theme-accent)" }}>
              #{t.id}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] truncate" style={{ color: "var(--theme-text-secondary)" }} title={t.subject}>
                {t.subject}
              </p>
              <p className="text-[10px] font-mono truncate" style={{ color: "var(--theme-text-muted)" }} title={t.asset_name || ""}>
                {t.asset_name || "—"}
              </p>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fadeInRow {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );

  if (bare) return <div className="h-full">{inner}</div>;
  return inner;
}
