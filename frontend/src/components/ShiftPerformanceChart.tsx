import { Card } from "./Card";
import { TableSkeleton } from "./Spinner";
import type { ShiftPerformance } from "../types";

interface Props {
  data: ShiftPerformance[] | null;
  loading: boolean;
  bare?: boolean;
}

function slaColor(pct: number | null): string {
  if (pct === null) return "var(--theme-text-muted)";
  if (pct >= 50) return "#10b981";
  if (pct >= 25) return "#f59e0b";
  return "#ef4444";
}

function fmtMin(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(1)}m`;
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(1)}%`;
}

export function ShiftPerformanceChart({ data, loading, bare = false }: Props) {
  const inner =
    loading || !data ? (
      <TableSkeleton rows={4} cols={4} />
    ) : data.length === 0 ? (
      <p
        className="text-sm py-8 text-center"
        style={{ color: "var(--theme-text-muted)" }}
      >
        No shift data available
      </p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
              <th
                className="px-4 py-2.5 text-left font-medium uppercase tracking-wider text-[10px]"
                style={{ color: "var(--theme-text-muted)" }}
              >
                Metric
              </th>
              {data.map((s) => (
                <th
                  key={s.shift}
                  className="px-4 py-2.5 text-center font-medium uppercase tracking-wider text-[10px]"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  {s.shift}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Total tickets */}
            <tr style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
              <td
                className="px-4 py-2.5 font-medium"
                style={{ color: "var(--theme-text-secondary)" }}
              >
                Total Tickets
              </td>
              {data.map((s) => (
                <td
                  key={s.shift}
                  className="px-4 py-2.5 text-center font-mono tabular-nums"
                  style={{ color: "var(--theme-text-primary)" }}
                >
                  {s.total.toLocaleString()}
                </td>
              ))}
            </tr>

            {/* Avg MTTD */}
            <tr style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
              <td
                className="px-4 py-2.5 font-medium"
                style={{ color: "var(--theme-text-secondary)" }}
              >
                Avg MTTD
              </td>
              {data.map((s) => (
                <td
                  key={s.shift}
                  className="px-4 py-2.5 text-center font-mono tabular-nums"
                  style={{ color: "var(--theme-text-secondary)" }}
                >
                  {fmtMin(s.avg_mttd_min)}
                </td>
              ))}
            </tr>

            {/* MTTD SLA % */}
            <tr style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
              <td
                className="px-4 py-2.5 font-medium"
                style={{ color: "var(--theme-text-secondary)" }}
              >
                MTTD SLA %
              </td>
              {data.map((s) => (
                <td
                  key={s.shift}
                  className="px-4 py-2.5 text-center font-mono tabular-nums font-semibold"
                  style={{ color: slaColor(s.mttd_sla_pct) }}
                >
                  {fmtPct(s.mttd_sla_pct)}
                </td>
              ))}
            </tr>

            {/* Avg MTTR */}
            <tr>
              <td
                className="px-4 py-2.5 font-medium"
                style={{ color: "var(--theme-text-secondary)" }}
              >
                Avg MTTR
              </td>
              {data.map((s) => (
                <td
                  key={s.shift}
                  className="px-4 py-2.5 text-center font-mono tabular-nums"
                  style={{ color: "var(--theme-text-secondary)" }}
                >
                  {fmtMin(s.avg_mttr_min)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    );

  if (bare) return <>{inner}</>;
  return <Card title="Shift Performance">{inner}</Card>;
}
