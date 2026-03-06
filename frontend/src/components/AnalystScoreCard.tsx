import { AnalystSpiderChart } from "./AnalystSpiderChart";
import type { AnalystScore } from "../types";

interface Props {
  data: AnalystScore;
  rank: number;
  onClick: () => void;
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: "rgba(255, 215, 0, 0.15)", text: "#FFD700", border: "rgba(255, 215, 0, 0.4)" },
  A: { bg: "rgba(34, 197, 94, 0.15)", text: "#22C55E", border: "rgba(34, 197, 94, 0.4)" },
  B: { bg: "rgba(59, 130, 246, 0.15)", text: "#3B82F6", border: "rgba(59, 130, 246, 0.4)" },
  C: { bg: "rgba(245, 158, 11, 0.15)", text: "#F59E0B", border: "rgba(245, 158, 11, 0.4)" },
  D: { bg: "rgba(239, 68, 68, 0.15)", text: "#EF4444", border: "rgba(239, 68, 68, 0.4)" },
};

export function TierBadge({ tier, size = "md" }: { tier: string; size?: "sm" | "md" | "lg" }) {
  const c = TIER_COLORS[tier] || TIER_COLORS.D;
  const sizeClasses = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-10 h-10 text-base",
  };
  return (
    <div
      className={`${sizeClasses[size]} rounded-lg flex items-center justify-center font-bold`}
      style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {tier}
    </div>
  );
}

export function AnalystScoreCard({ data, rank, onClick }: Props) {
  const c = TIER_COLORS[data.tier] || TIER_COLORS.D;
  const initials = data.analyst
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border transition-all duration-200 hover:scale-[1.02] hover:shadow-lg cursor-pointer group"
      style={{
        backgroundColor: "var(--theme-card-bg)",
        borderColor: "var(--theme-card-border)",
      }}
    >
      {/* Header */}
      <div className="p-4 pb-0">
        <div className="flex items-center gap-3 mb-2">
          <div className="relative">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                backgroundColor: `color-mix(in srgb, ${c.text} 15%, transparent)`,
                color: c.text,
                border: `2px solid ${c.border}`,
              }}
            >
              {initials}
            </div>
            <div
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-muted)", border: "1px solid var(--theme-surface-border)" }}
            >
              #{rank}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: "var(--theme-text-primary)" }}>
              {data.analyst}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="relative group/tb cursor-help">
                <TierBadge tier={data.tier} size="sm" />
                <span className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg text-[10px] leading-tight font-normal whitespace-nowrap opacity-0 group-hover/tb:opacity-100 transition-opacity shadow-lg"
                  style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-secondary)", border: "1px solid var(--theme-surface-border)" }}>
                  {data.tier === "S" ? "Tier S: Exceptional (90-100)" : data.tier === "A" ? "Tier A: Excellent (75-89)" : data.tier === "B" ? "Tier B: Good (60-74)" : data.tier === "C" ? "Tier C: Average (40-59)" : "Tier D: Needs Improvement (<40)"}
                </span>
              </span>
              <span className="relative group/sc cursor-help">
                <span className="text-xs font-mono font-semibold" style={{ color: c.text }}>
                  {data.composite_score.toFixed(1)}
                </span>
                <span className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg text-[10px] leading-tight font-normal whitespace-nowrap opacity-0 group-hover/sc:opacity-100 transition-opacity shadow-lg"
                  style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-secondary)", border: "1px solid var(--theme-surface-border)" }}>
                  Composite score (0-100): weighted avg of 7 metrics
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Spider Chart */}
      <div className="px-2">
        <AnalystSpiderChart metrics={data.metrics} size={180} showLabels={false} color={c.text} />
      </div>

      {/* Quick Stats */}
      <div
        className="grid grid-cols-3 gap-px mx-4 mb-4 rounded-lg overflow-hidden"
        style={{ backgroundColor: "var(--theme-surface-border)" }}
      >
        {[
          { label: "Tickets", value: data.stats.total_tickets },
          { label: "SLA", value: data.stats.sla_pct != null ? `${data.stats.sla_pct}%` : "—" },
          { label: "MTTD", value: data.stats.avg_mttd_display || "—" },
        ].map((s) => (
          <div key={s.label} className="text-center py-2" style={{ backgroundColor: "var(--theme-surface-raised)" }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              {s.label}
            </p>
            <p className="text-xs font-mono font-semibold" style={{ color: "var(--theme-text-secondary)" }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </button>
  );
}
