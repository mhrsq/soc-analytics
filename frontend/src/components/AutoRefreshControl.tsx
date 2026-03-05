import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, ChevronDown, Check } from "lucide-react";

/* ── Preset intervals (in seconds) ── */
const PRESETS = [
  { label: "Off", seconds: 0 },
  { label: "10s", seconds: 10 },
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "2m", seconds: 120 },
  { label: "5m", seconds: 300 },
];

const STORAGE_KEY = "soc-auto-refresh";

function loadSaved(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v !== null) return Number(v);
  } catch { /* ignore */ }
  return 0; // off by default
}

function saveSetting(seconds: number) {
  try { localStorage.setItem(STORAGE_KEY, String(seconds)); } catch { /* ignore */ }
}

function formatInterval(seconds: number): string {
  if (seconds === 0) return "Off";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

interface Props {
  /** Called every time the interval fires. Parent should refresh data. */
  onRefresh: () => void;
}

export function AutoRefreshControl({ onRefresh }: Props) {
  const [intervalSec, setIntervalSec] = useState(loadSaved);
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"s" | "m">("s");
  const [countdown, setCountdown] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doRefresh = useCallback(() => {
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 800);
  }, [onRefresh]);

  // Main interval timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (intervalSec > 0) {
      setCountdown(intervalSec);

      // Countdown ticker (every second)
      countdownRef.current = setInterval(() => {
        setCountdown(prev => (prev <= 1 ? intervalSec : prev - 1));
      }, 1000);

      // Actual refresh
      timerRef.current = setInterval(() => {
        doRefresh();
        setCountdown(intervalSec);
      }, intervalSec * 1000);
    } else {
      setCountdown(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [intervalSec, doRefresh]);

  const selectInterval = (seconds: number) => {
    setIntervalSec(seconds);
    saveSetting(seconds);
    setOpen(false);
    if (seconds > 0) {
      setCountdown(seconds);
    }
  };

  const applyCustom = () => {
    const num = parseInt(customValue, 10);
    if (isNaN(num) || num <= 0) return;
    const seconds = customUnit === "m" ? num * 60 : num;
    // Clamp: min 5s, max 30m
    const clamped = Math.max(5, Math.min(1800, seconds));
    selectInterval(clamped);
    setCustomValue("");
  };

  const isPreset = PRESETS.some(p => p.seconds === intervalSec);
  const activeLabel = intervalSec === 0 ? "Auto Refresh" : formatInterval(intervalSec);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all group"
        style={{
          borderColor: intervalSec > 0
            ? "color-mix(in srgb, var(--theme-accent) 40%, transparent)"
            : open ? "var(--theme-accent)" : "var(--theme-surface-border)",
          color: intervalSec > 0 ? "var(--theme-accent)" : "var(--theme-text-muted)",
          backgroundColor: intervalSec > 0
            ? "color-mix(in srgb, var(--theme-accent) 8%, transparent)"
            : open ? "color-mix(in srgb, var(--theme-accent) 8%, transparent)" : "transparent",
        }}
        title={intervalSec > 0 ? `Refreshing every ${formatInterval(intervalSec)}` : "Auto Refresh"}
      >
        <RefreshCw
          className={`w-3.5 h-3.5 transition-transform ${spinning ? "animate-spin" : ""}`}
        />
        <span className="hidden sm:inline">{activeLabel}</span>
        {intervalSec > 0 && (
          <span
            className="text-[10px] tabular-nums opacity-60 min-w-[2ch] text-center"
            title="Next refresh in"
          >
            {formatInterval(countdown)}
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--theme-text-muted)" }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full right-0 mt-1.5 rounded-xl shadow-2xl z-50 w-56 overflow-hidden animate-fade-in-up"
          style={{
            backgroundColor: "var(--theme-card-bg)",
            border: "1px solid var(--theme-card-border)",
          }}
        >
          {/* Presets */}
          <div className="p-2">
            <p
              className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 px-1"
              style={{ color: "var(--theme-text-muted)" }}
            >
              Refresh Interval
            </p>
            <div className="grid grid-cols-3 gap-1">
              {PRESETS.map(p => (
                <button
                  key={p.seconds}
                  onClick={() => selectInterval(p.seconds)}
                  className="px-2.5 py-2 text-[11px] font-medium rounded-lg transition-all text-center"
                  style={
                    intervalSec === p.seconds
                      ? { backgroundColor: "var(--theme-accent)", color: "#fff" }
                      : {
                          backgroundColor: "color-mix(in srgb, var(--theme-surface-border) 20%, transparent)",
                          color: "var(--theme-text-muted)",
                        }
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="mx-3 h-px" style={{ backgroundColor: "var(--theme-surface-border)" }} />

          {/* Custom Input */}
          <div className="p-3 space-y-2">
            <p
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--theme-text-muted)" }}
            >
              Custom Interval
            </p>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={customUnit === "m" ? 30 : 1800}
                placeholder="e.g. 15"
                value={customValue}
                onChange={e => setCustomValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyCustom()}
                className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg outline-none tabular-nums"
                style={{
                  backgroundColor: "var(--theme-surface-base)",
                  color: "var(--theme-text-primary)",
                  border: "1px solid var(--theme-surface-border)",
                }}
              />
              {/* Unit Toggle */}
              <div
                className="flex rounded-lg overflow-hidden border"
                style={{ borderColor: "var(--theme-surface-border)" }}
              >
                <button
                  onClick={() => setCustomUnit("s")}
                  className="px-2 py-1.5 text-[11px] font-medium transition-colors"
                  style={
                    customUnit === "s"
                      ? { backgroundColor: "var(--theme-accent)", color: "#fff" }
                      : { backgroundColor: "transparent", color: "var(--theme-text-muted)" }
                  }
                >
                  sec
                </button>
                <button
                  onClick={() => setCustomUnit("m")}
                  className="px-2 py-1.5 text-[11px] font-medium transition-colors"
                  style={
                    customUnit === "m"
                      ? { backgroundColor: "var(--theme-accent)", color: "#fff" }
                      : { backgroundColor: "transparent", color: "var(--theme-text-muted)" }
                  }
                >
                  min
                </button>
              </div>
              {/* Apply */}
              <button
                onClick={applyCustom}
                disabled={!customValue || parseInt(customValue, 10) <= 0}
                className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                style={{ backgroundColor: "var(--theme-accent)", color: "#fff" }}
                title="Apply custom interval"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px]" style={{ color: "var(--theme-text-muted)", opacity: 0.6 }}>
              Min 5 seconds · Max 30 minutes
            </p>
            {!isPreset && intervalSec > 0 && (
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px]"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--theme-accent) 8%, transparent)",
                  color: "var(--theme-accent)",
                }}
              >
                <RefreshCw className="w-3 h-3" />
                Active: every {formatInterval(intervalSec)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
