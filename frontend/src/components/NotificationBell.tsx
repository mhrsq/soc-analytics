import { useState, useRef, useEffect } from "react";
import { Bell, BellOff, Volume2, VolumeX, X, ExternalLink, Trash2 } from "lucide-react";
import { useNotifications } from "../contexts/NotificationContext";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function priorityColor(p: string) {
  if (p === "Critical") return "bg-cyber-red/20 text-cyber-red";
  if (p === "High") return "bg-cyber-orange/20 text-cyber-orange";
  if (p === "Medium") return "bg-cyber-yellow/20 text-cyber-yellow";
  return "bg-cyber-green/20 text-cyber-green";
}

export function NotificationBell() {
  const {
    notifications, unreadCount, soundEnabled, toggleSound,
    markAllRead, dismissNotification, clearAll, isPolling,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleOpen = () => {
    setOpen(v => !v);
    if (!open && unreadCount > 0) markAllRead();
  };

  return (
    <div className="relative" ref={dropRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-lg transition-opacity hover:opacity-80"
        style={{ color: "var(--theme-text-muted)" }}
      >
        {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold rounded-full bg-cyber-red text-white animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        {isPolling && (
          <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-cyber-blue animate-ping" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[400px] flex flex-col rounded-xl shadow-2xl shadow-black/40 animate-fade-in-up z-50 overflow-hidden" style={{ backgroundColor: "var(--theme-surface-raised)", border: "1px solid var(--theme-surface-border)" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--theme-text-secondary)" }}>Notifications</span>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSound}
                className="p-1 rounded transition-colors"
                style={{ color: soundEnabled ? "var(--theme-accent)" : "var(--theme-text-muted)" }}
                title={soundEnabled ? "Mute notifications" : "Unmute notifications"}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="p-1 rounded transition-colors hover:text-cyber-red"
                  style={{ color: "var(--theme-text-muted)" }}
                  title="Clear all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8" style={{ color: "var(--theme-text-muted)" }}>
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">No new tickets</p>
                <p className="text-[10px] mt-1" style={{ opacity: 0.6 }}>Checking every 3 minutes</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3 transition-colors group"
                  style={{ borderBottom: "1px solid var(--theme-surface-border)" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--theme-accent) 5%, transparent)")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${priorityColor(n.priority)}`}>
                        {n.priority}
                      </span>
                      <span className="text-[10px] font-mono" style={{ color: "var(--theme-text-muted)" }}>#{n.id}</span>
                      <span className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>{timeAgo(n.created_time)}</span>
                    </div>
                    <p className="text-xs truncate" style={{ color: "var(--theme-text-secondary)" }}>{n.subject}</p>
                    {n.customer && (
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--theme-text-muted)" }}>{n.customer}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={`https://sdp-ioc.mtm.id:8050/WorkOrder.do?woMode=viewWO&woID=${n.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded hover:text-cyber-blue transition-colors"
                      style={{ color: "var(--theme-text-muted)" }}
                      title="Open in SDP"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={() => dismissNotification(n.id)}
                      className="p-1 rounded hover:text-cyber-red transition-colors"
                      style={{ color: "var(--theme-text-muted)" }}
                      title="Dismiss"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
