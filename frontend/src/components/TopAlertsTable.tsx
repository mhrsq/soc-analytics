import { Card } from "./Card";
import { TableSkeleton } from "./Spinner";
import type { AlertRuleItem } from "../types";

interface Props {
  data: AlertRuleItem[] | null;
  loading: boolean;
  bare?: boolean;
}

export function TopAlertsTable({ data, loading, bare }: Props) {
  const hasRuleId = data?.some(r => r.rule_id != null) ?? false;

  const inner = loading || !data ? (
    <TableSkeleton rows={5} cols={4} />
  ) : data.length === 0 ? (
    <p className="text-sm py-8 text-center" style={{ color: "var(--theme-text-muted)" }}>No data available</p>
  ) : (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
            {hasRuleId && (
              <th className="text-left text-xs font-medium pb-2.5 pr-4" style={{ color: "var(--theme-text-muted)" }}>Rule ID</th>
            )}
            <th className="text-left text-xs font-medium pb-2.5 pr-4" style={{ color: "var(--theme-text-muted)" }}>
              {hasRuleId ? "Rule Name" : "Category"}
            </th>
            <th className="text-right text-xs font-medium pb-2.5 pr-4" style={{ color: "var(--theme-text-muted)" }}>Count</th>
            <th className="text-right text-xs font-medium pb-2.5" style={{ color: "var(--theme-text-muted)" }}>TP Rate</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.rule_id ?? row.rule_name ?? i} className="transition-colors"
              style={{ borderBottom: "1px solid var(--theme-surface-border)", backgroundColor: i % 2 === 0 ? "color-mix(in srgb, var(--theme-surface-raised) 30%, transparent)" : undefined }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--theme-accent) 5%, transparent)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "color-mix(in srgb, var(--theme-surface-raised) 30%, transparent)" : "transparent")}>
              {hasRuleId && (
                <td className="py-2.5 pr-4 font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>{row.rule_id ?? "—"}</td>
              )}
              <td className="py-2.5 pr-4 truncate max-w-[250px]" style={{ color: "var(--theme-text-secondary)" }} title={row.rule_name}>{row.rule_name}</td>
              <td className="py-2.5 pr-4 text-right font-mono font-semibold" style={{ color: "var(--theme-text-primary)" }}>{row.count.toLocaleString()}</td>
              <td className="py-2.5 text-right">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  row.tp_rate >= 50 ? "bg-signal-red/15 text-signal-red ring-1 ring-signal-red/20"
                    : row.tp_rate > 0 ? "bg-signal-amber/15 text-signal-amber ring-1 ring-signal-amber/20"
                    : "text-surface-500"
                }`}>{row.tp_rate.toFixed(1)}%</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (bare) return <>{inner}</>;
  return <Card title={hasRuleId ? "Top Alert Rules" : "Top Alert Categories"}>{inner}</Card>;
}
