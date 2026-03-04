import { Card } from "./Card";
import { TableSkeleton } from "./Spinner";
import type { AnalystPerformance } from "../types";

interface Props {
  data: AnalystPerformance[] | null;
  loading: boolean;
  bare?: boolean;
}

export function AnalystTable({ data, loading, bare }: Props) {
  const inner = loading || !data ? (
    <TableSkeleton rows={5} cols={5} />
  ) : data.length === 0 ? (
    <p className="text-sm py-8 text-center" style={{ color: "var(--theme-text-muted)" }}>No data available</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
            {["Analyst", "Assigned", "Resolved", "Avg MTTR", "TP Found"].map((h) => (
              <th key={h} className={`text-xs font-medium pb-2.5 pr-3 ${h === "Analyst" ? "text-left" : "text-right"}`} style={{ color: "var(--theme-text-muted)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const resolvePct = row.assigned > 0 ? (row.resolved / row.assigned) * 100 : 0;
            return (
              <tr key={row.analyst} className="transition-colors"
                style={{ borderBottom: "1px solid var(--theme-surface-border)", backgroundColor: i % 2 === 0 ? "color-mix(in srgb, var(--theme-surface-raised) 30%, transparent)" : undefined }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--theme-accent) 5%, transparent)")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "color-mix(in srgb, var(--theme-surface-raised) 30%, transparent)" : "transparent")}>
                <td className="py-3 pr-3 font-medium" style={{ color: "var(--theme-text-primary)" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)", color: "var(--theme-text-muted)", border: "1px solid var(--theme-surface-border)" }}>
                      {row.analyst.split(" ").map(w => w[0]).join("").slice(0, 2)}
                    </div>
                    <span className="truncate">{row.analyst}</span>
                  </div>
                </td>
                <td className="py-3 pr-3 text-right font-mono" style={{ color: "var(--theme-text-secondary)" }}>{row.assigned.toLocaleString()}</td>
                <td className="py-3 pr-3 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <div className="w-10 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-border) 50%, transparent)" }}>
                      <div className={`h-full rounded-full transition-all duration-500 ${resolvePct >= 90 ? "bg-cyber-green" : resolvePct >= 70 ? "bg-cyber-yellow" : "bg-cyber-red"}`}
                        style={{ width: `${Math.min(resolvePct, 100)}%` }} />
                    </div>
                    <span className="font-mono text-xs" style={{ color: "var(--theme-text-secondary)" }}>{row.resolved.toLocaleString()}</span>
                  </div>
                </td>
                <td className="py-3 pr-3 text-right font-mono text-cyber-teal text-xs">{row.avg_mttr_display ?? "—"}</td>
                <td className="py-3 text-right font-mono text-xs text-cyber-blue">{row.tp_found.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (bare) return <>{inner}</>;
  return <Card title="Analyst Performance">{inner}</Card>;
}
