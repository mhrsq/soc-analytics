import { useMemo } from "react";
import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import type { CustomerSlaCell } from "../types";

interface Props {
  data: CustomerSlaCell[] | null;
  loading: boolean;
  bare?: boolean;
}

function slaColor(pct: number | null): string {
  if (pct === null) return "var(--theme-surface-raised)";
  if (pct >= 90) return "rgba(34,197,94,0.25)";
  if (pct >= 50) return "rgba(245,158,11,0.25)";
  return "rgba(239,68,68,0.25)";
}

function slaTextColor(pct: number | null): string {
  if (pct === null) return "var(--theme-text-muted)";
  if (pct >= 90) return "#4ade80";
  if (pct >= 50) return "#fbbf24";
  return "#f87171";
}

function fmtMonth(v: string): string {
  const [y, m] = v.split("-");
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function CustomerSlaHeatmap({ data, loading, bare = false }: Props) {
  const { customers, months, lookup } = useMemo(() => {
    if (!data) return { customers: [], months: [], lookup: new Map<string, number | null>() };

    const customerSet = new Set<string>();
    const monthSet = new Set<string>();
    const lookup = new Map<string, number | null>();

    for (const cell of data) {
      customerSet.add(cell.customer);
      monthSet.add(cell.month);
      lookup.set(`${cell.customer}||${cell.month}`, cell.mttd_sla_pct);
    }

    // Sort months chronologically
    const months = Array.from(monthSet).sort();
    const customers = Array.from(customerSet).sort();

    return { customers, months, lookup };
  }, [data]);

  const inner = loading || !data ? (
    <ChartSkeleton height={200} />
  ) : data.length === 0 ? (
    <p className="text-sm py-8 text-center" style={{ color: "var(--theme-text-muted)" }}>No data available</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th
              className="text-left px-3 py-2 font-medium sticky left-0 z-10 min-w-[120px]"
              style={{
                color: "var(--theme-text-muted)",
                backgroundColor: "var(--theme-card-bg)",
                borderBottom: "1px solid var(--theme-surface-border)",
              }}
            >
              Customer
            </th>
            {months.map((m) => (
              <th
                key={m}
                className="px-2 py-2 font-medium text-center whitespace-nowrap min-w-[64px]"
                style={{
                  color: "var(--theme-text-muted)",
                  borderBottom: "1px solid var(--theme-surface-border)",
                }}
              >
                {fmtMonth(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer}>
              <td
                className="px-3 py-2 font-medium sticky left-0 z-10 whitespace-nowrap"
                style={{
                  color: "var(--theme-text-secondary)",
                  backgroundColor: "var(--theme-card-bg)",
                  borderBottom: "1px solid var(--theme-surface-border)",
                }}
              >
                {customer}
              </td>
              {months.map((m) => {
                const pct = lookup.get(`${customer}||${m}`) ?? null;
                return (
                  <td
                    key={m}
                    className="px-2 py-2 text-center font-mono font-medium"
                    style={{
                      backgroundColor: slaColor(pct),
                      color: slaTextColor(pct),
                      borderBottom: "1px solid var(--theme-surface-border)",
                      borderLeft: "1px solid color-mix(in srgb, var(--theme-surface-border) 50%, transparent)",
                    }}
                    title={pct !== null ? `${customer} · ${fmtMonth(m)} · ${pct.toFixed(1)}%` : `${customer} · ${fmtMonth(m)} · No data`}
                  >
                    {pct !== null ? `${pct.toFixed(0)}%` : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (bare) return <>{inner}</>;
  return <Card title="Customer SLA Matrix" noPad>{inner}</Card>;
}
