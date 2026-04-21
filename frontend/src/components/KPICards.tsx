import { useCallback, useEffect, useRef, useState } from "react";
import type { MetricsSummary } from "../types";
import type { KPIKey } from "./KPIDetailModal";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Activity,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

interface Props {
  data: MetricsSummary | null;
  loading: boolean;
  onCardClick?: (key: KPIKey) => void;
}

function fmt(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function pct(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return `${val.toFixed(1)}%`;
}

/** Hook: observe container and return a scale factor (1 = baseline 160px wide card) */
function useContainerScale(ref: React.RefObject<HTMLElement | null>) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      // baseline: 160px = scale 1, min 0.7, max 2
      setScale(Math.max(0.7, Math.min(2, w / 160)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

/* Animated number that counts up on mount */
function AnimatedValue({ value, style, className }: { value: string; style?: React.CSSProperties; className: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const num = parseFloat(value.replace(/[^0-9.-]/g, ""));
    if (isNaN(num) || value === "—") {
      setDisplay(value);
      return;
    }

    const suffix = value.replace(/[0-9.,\- ]/g, "");
    const isDecimal = value.includes(".");
    const duration = 600;
    const start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = num * eased;

      if (isDecimal) {
        setDisplay(`${current.toFixed(1)}${suffix}`);
      } else {
        setDisplay(`${Math.round(current).toLocaleString()}${suffix}`);
      }

      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);

  return <p ref={ref} style={style} className={className}>{display}</p>;
}

/* Single KPI card */
function KPICard({
  label, value, Icon, color, bg, borderColor, idx, tooltip, onClick,
}: {
  label: string; value: string; Icon: LucideIcon;
  color: string; bg: string; borderColor: string; idx: number; tooltip?: string; onClick?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const scale = useContainerScale(cardRef);

  // Derive sizes from scale factor
  const pad = Math.round(Math.max(6, Math.min(20, 10 * scale)));
  const labelSize = Math.round(Math.max(9, Math.min(15, 11 * scale)));
  const valueSize = Math.round(Math.max(16, Math.min(42, 22 * scale)));
  const iconSize = Math.round(Math.max(14, Math.min(32, 18 * scale)));
  const iconPad = Math.round(Math.max(4, Math.min(14, 7 * scale)));

  return (
    <div
      ref={cardRef}
      className={`relative rounded-xl transition-all duration-300 group h-full flex flex-col justify-center${tooltip ? " guide-tip guide-tip-below" : ""}${onClick ? " cursor-pointer hover:scale-[1.02] active:scale-[0.98]" : ""}`}
      data-tip={tooltip || undefined}
      onClick={onClick}
      style={{
        padding: `${pad}px`,
        backgroundColor: "var(--theme-card-bg)",
        border: "1px solid var(--theme-card-border)",
        animationDelay: `${idx * 60}ms`,
      }}
    >
      {/* Top accent bar */}
      <div className={`absolute top-0 inset-x-0 h-[2px] ${borderColor} opacity-60 group-hover:opacity-100 transition-opacity`} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className="font-medium truncate leading-tight"
            style={{ fontSize: `${labelSize}px`, color: "var(--theme-text-muted)" }}
          >
            {label}
          </p>
          <AnimatedValue
            value={value}
            style={{ fontSize: `${valueSize}px` }}
            className={`font-bold mt-1 leading-none ${color} count-up`}
          />
        </div>
        <div className={`rounded-lg ${bg} shrink-0`} style={{ padding: `${iconPad}px` }}>
          <Icon style={{ width: `${iconSize}px`, height: `${iconSize}px` }} className={color} />
        </div>
      </div>
    </div>
  );
}

/* Skeleton placeholders */
function KPISkeleton() {
  return (
    <div className="h-full grid grid-cols-2 auto-rows-fr gap-2 sm:gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-card-border)" }}>
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-7 w-16 mt-1" />
            </div>
            <div className="skeleton h-9 w-9 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

const KPI_KEYS: KPIKey[] = ["total", "open", "tp", "fp", "mttd", "sla"];

export function KPICards({ data, loading, onCardClick }: Props) {
  if (loading || !data) return <KPISkeleton />;

  const cards = [
    {
      label: "Total Tickets",
      value: data.total_tickets.toLocaleString(),
      icon: Activity,
      color: "text-cyber-blue",
      bg: "bg-cyber-blue/10",
      borderColor: "bg-cyber-blue",
      tooltip: "Total number of tickets ingested from ManageEngine SDP within the selected time range.",
    },
    {
      label: "Open Tickets",
      value: data.open_tickets.toLocaleString(),
      icon: ShieldAlert,
      color: "text-cyber-orange",
      bg: "bg-cyber-orange/10",
      borderColor: "bg-cyber-orange",
      tooltip: "Tickets still in an open or in-progress state that have not been resolved yet.",
    },
    {
      label: "True Positive",
      value: pct(data.tp_rate),
      icon: Target,
      color: (data.tp_rate ?? 0) >= 50 ? "text-cyber-green" : (data.tp_rate ?? 0) >= 20 ? "text-cyber-orange" : "text-cyber-red",
      bg: (data.tp_rate ?? 0) >= 50 ? "bg-cyber-green/10" : (data.tp_rate ?? 0) >= 20 ? "bg-cyber-orange/10" : "bg-cyber-red/10",
      borderColor: (data.tp_rate ?? 0) >= 50 ? "bg-cyber-green" : (data.tp_rate ?? 0) >= 20 ? "bg-cyber-orange" : "bg-cyber-red",
      tooltip: "Percentage of alerts confirmed as real security incidents (True Positives). Higher is better.",
    },
    {
      label: "False Positive",
      value: pct(data.fp_rate),
      icon: ShieldCheck,
      color: (data.fp_rate ?? 0) <= 50 ? "text-cyber-green" : (data.fp_rate ?? 0) <= 80 ? "text-cyber-orange" : "text-cyber-red",
      bg: (data.fp_rate ?? 0) <= 50 ? "bg-cyber-green/10" : (data.fp_rate ?? 0) <= 80 ? "bg-cyber-orange/10" : "bg-cyber-red/10",
      borderColor: (data.fp_rate ?? 0) <= 50 ? "bg-cyber-green" : (data.fp_rate ?? 0) <= 80 ? "bg-cyber-orange" : "bg-cyber-red",
      tooltip: "Percentage of alerts determined to be non-threats (False Positives). Lower is better.",
    },
    {
      label: "Avg MTTD",
      value: fmt(data.avg_mttd_seconds),
      icon: Clock,
      color: "text-cyber-teal",
      bg: "bg-cyber-teal/10",
      borderColor: "bg-cyber-teal",
      tooltip: "Mean Time to Detect — average duration from alert creation to analyst acknowledgment.",
    },
    {
      label: "SLA Compliance",
      value: pct(data.sla_compliance_pct),
      tooltip: "Percentage of tickets resolved within the agreed Service Level Agreement timeframe. Target ≥ 90%.",
      icon: TrendingUp,
      color:
        (data.sla_compliance_pct ?? 0) >= 90
          ? "text-cyber-green"
          : "text-cyber-red",
      bg:
        (data.sla_compliance_pct ?? 0) >= 90
          ? "bg-cyber-green/10"
          : "bg-cyber-red/10",
      borderColor:
        (data.sla_compliance_pct ?? 0) >= 90
          ? "bg-cyber-green"
          : "bg-cyber-red",
    },
  ];

  return (
    <div className="h-full grid grid-cols-2 sm:grid-cols-3 auto-rows-fr gap-2 sm:gap-3 stagger-children" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
      {cards.map((c, i) => (
        <KPICard
          key={c.label}
          label={c.label}
          value={c.value}
          Icon={c.icon}
          color={c.color}
          bg={c.bg}
          borderColor={c.borderColor}
          tooltip={c.tooltip}
          idx={i}
          onClick={onCardClick ? () => onCardClick(KPI_KEYS[i]) : undefined}
        />
      ))}
    </div>
  );
}
