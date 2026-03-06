import { Card } from "./Card";
import { TierBadge } from "./AnalystScoreCard";
import { TableSkeleton } from "./Spinner";
import type { AnalystScore } from "../types";
import { Trophy, Medal, Award } from "lucide-react";

interface Props {
  data: AnalystScore[] | null;
  loading: boolean;
  onSelect: (analyst: string) => void;
}

const RANK_ICONS = [
  <Trophy className="w-4 h-4 text-yellow-400" />,
  <Medal className="w-4 h-4 text-gray-300" />,
  <Award className="w-4 h-4 text-amber-600" />,
];

function ScoreBar({ score, tier }: { score: number; tier: string }) {
  const colors: Record<string, string> = {
    S: "#FFD700", A: "#22C55E", B: "#3B82F6", C: "#F59E0B", D: "#EF4444",
  };
  const c = colors[tier] || colors.D;
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-border) 50%, transparent)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: c }}
        />
      </div>
      <span className="text-xs font-mono font-semibold w-8 text-right" style={{ color: c }}>
        {score.toFixed(0)}
      </span>
    </div>
  );
}

export function AnalystLeaderboard({ data, loading, onSelect }: Props) {
  if (loading || !data) {
    return <Card title="Leaderboard"><TableSkeleton rows={6} cols={6} /></Card>;
  }

  if (data.length === 0) {
    return (
      <Card title="Leaderboard">
        <p className="text-sm py-8 text-center" style={{ color: "var(--theme-text-muted)" }}>
          No analyst data available for this period
        </p>
      </Card>
    );
  }

  return (
    <Card title="Leaderboard" noPad>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
              {[
                { label: "#", tip: "" },
                { label: "Analyst", tip: "" },
                { label: "Tier", tip: "Performance tier: S(90+) A(75+) B(60+) C(40+) D(<40)" },
                { label: "Score", tip: "Composite score (0-100): weighted avg of 7 metrics" },
                { label: "Tickets", tip: "Total tickets handled in this period" },
                { label: "SLA", tip: "% tickets responded within SLA target" },
                { label: "MTTD", tip: "Mean Time to Detect — avg time to first response" },
              ].map((h, i) => (
                <th
                  key={h.label}
                  className={`text-xs font-medium pb-2.5 px-3 sm:px-5 ${i <= 1 ? "text-left" : "text-center"} ${i >= 3 ? "hidden sm:table-cell" : ""}`}
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  {h.tip ? (
                    <span className="relative group/hdr cursor-help inline-flex items-center gap-1">
                      {h.label}
                      <svg className="w-3 h-3 opacity-40 group-hover/hdr:opacity-70" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1" fill="none"/><text x="8" y="12" textAnchor="middle" fontSize="10" fill="currentColor">i</text></svg>
                      <span className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg text-[10px] leading-tight font-normal whitespace-nowrap opacity-0 group-hover/hdr:opacity-100 transition-opacity shadow-lg"
                        style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-secondary)", border: "1px solid var(--theme-surface-border)" }}>
                        {h.tip}
                      </span>
                    </span>
                  ) : h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const initials = row.analyst.split(" ").map((w) => w[0]).join("").slice(0, 2);
              return (
                <tr
                  key={row.analyst}
                  className="transition-colors cursor-pointer"
                  style={{
                    borderBottom: "1px solid var(--theme-surface-border)",
                    backgroundColor: i % 2 === 0 ? "color-mix(in srgb, var(--theme-surface-raised) 30%, transparent)" : undefined,
                  }}
                  onClick={() => onSelect(row.analyst)}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--theme-accent) 8%, transparent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "color-mix(in srgb, var(--theme-surface-raised) 30%, transparent)" : "transparent")}
                >
                  <td className="py-3 px-3 sm:px-5 w-10">
                    <div className="flex items-center justify-center">
                      {i < 3 ? RANK_ICONS[i] : (
                        <span className="text-xs font-mono" style={{ color: "var(--theme-text-muted)" }}>
                          {i + 1}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 sm:px-5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{
                          backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)",
                          color: "var(--theme-text-muted)",
                          border: "1px solid var(--theme-surface-border)",
                        }}
                      >
                        {initials}
                      </div>
                      <span className="font-medium truncate" style={{ color: "var(--theme-text-primary)" }}>
                        {row.analyst}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 sm:px-5 text-center">
                    <span className="relative group/tb cursor-help inline-block">
                      <TierBadge tier={row.tier} size="sm" />
                      <span className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg text-[10px] leading-tight font-normal whitespace-nowrap opacity-0 group-hover/tb:opacity-100 transition-opacity shadow-lg"
                        style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-secondary)", border: "1px solid var(--theme-surface-border)" }}>
                        {row.tier === "S" ? "Exceptional (90-100)" : row.tier === "A" ? "Excellent (75-89)" : row.tier === "B" ? "Good (60-74)" : row.tier === "C" ? "Average (40-59)" : "Needs Improvement (<40)"}
                      </span>
                    </span>
                  </td>
                  <td className="py-3 px-3 sm:px-5 text-center hidden sm:table-cell">
                    <ScoreBar score={row.composite_score} tier={row.tier} />
                  </td>
                  <td className="py-3 px-3 sm:px-5 text-center font-mono text-xs hidden sm:table-cell" style={{ color: "var(--theme-text-secondary)" }}>
                    {row.stats.total_tickets.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 sm:px-5 text-center font-mono text-xs hidden sm:table-cell" style={{ color: row.stats.sla_pct != null && row.stats.sla_pct >= 80 ? "#22C55E" : "#F59E0B" }}>
                    {row.stats.sla_pct != null ? `${row.stats.sla_pct}%` : "—"}
                  </td>
                  <td className="py-3 px-3 sm:px-5 text-center font-mono text-xs hidden sm:table-cell" style={{ color: "var(--theme-text-secondary)" }}>
                    {row.stats.avg_mttd_display || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
