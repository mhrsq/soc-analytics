import { useState, useMemo } from "react";
import { Card } from "./Card";
import { TierBadge } from "./AnalystScoreCard";
import { TableSkeleton } from "./Spinner";
import type { AnalystScore } from "../types";
import { Trophy, Medal, Award, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type SortKey = "rank" | "analyst" | "tier" | "score" | "tickets" | "sla" | "mttd";
type SortDir = "asc" | "desc";

const TIER_ORDER: Record<string, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };

function getSortValue(row: AnalystScore, key: SortKey, origIdx: number): number | string {
  switch (key) {
    case "rank": return origIdx;
    case "analyst": return row.analyst.toLowerCase();
    case "tier": return TIER_ORDER[row.tier] ?? 0;
    case "score": return row.composite_score;
    case "tickets": return row.stats.total_tickets;
    case "sla": return row.stats.sla_pct ?? -1;
    case "mttd": return row.stats.avg_mttd_seconds ?? 999999;
    default: return 0;
  }
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
}

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
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    if (!data) return [];
    // Build indexed array so we can reference original rank
    const indexed = data.map((row, i) => ({ row, origIdx: i }));
    if (sortKey === "rank" && sortDir === "asc") return indexed; // default order from API
    return [...indexed].sort((a, b) => {
      const va = getSortValue(a.row, sortKey, a.origIdx);
      const vb = getSortValue(b.row, sortKey, b.origIdx);
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Default direction: desc for numeric columns, asc for text
      setSortDir(key === "analyst" ? "asc" : "desc");
    }
  };

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

  const headers: { label: string; key: SortKey; tip: string; align: string; hide?: boolean }[] = [
    { label: "#", key: "rank", tip: "", align: "text-left" },
    { label: "Analyst", key: "analyst", tip: "", align: "text-left" },
    { label: "Tier", key: "tier", tip: "Performance tier: S(90+) A(75+) B(60+) C(40+) D(<40)", align: "text-center" },
    { label: "Score", key: "score", tip: "Composite score (0-100): weighted avg of 7 metrics", align: "text-center", hide: true },
    { label: "Tickets", key: "tickets", tip: "Total tickets handled in this period", align: "text-center", hide: true },
    { label: "SLA", key: "sla", tip: "% tickets responded within SLA target", align: "text-center", hide: true },
    { label: "MTTD", key: "mttd", tip: "Mean Time to Detect — avg time to first response", align: "text-center", hide: true },
  ];

  return (
    <Card title="Leaderboard" noPad>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
              {headers.map((h) => (
                <th
                  key={h.key}
                  className={`text-xs font-medium pb-2.5 px-3 sm:px-5 ${h.align} ${h.hide ? "hidden sm:table-cell" : ""} cursor-pointer select-none hover:opacity-80 transition-opacity`}
                  style={{ color: "var(--theme-text-muted)" }}
                  onClick={() => toggleSort(h.key)}
                >
                  <span className="inline-flex items-center gap-1">
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
                    <SortIcon col={h.key} sortKey={sortKey} sortDir={sortDir} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ row, origIdx: rankIdx }, i) => {
              const initials = row.analyst.split(" ").map((w: string) => w[0]).join("").slice(0, 2);
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
                      {rankIdx < 3 ? RANK_ICONS[rankIdx] : (
                        <span className="text-xs font-mono" style={{ color: "var(--theme-text-muted)" }}>
                          {rankIdx + 1}
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
