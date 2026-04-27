import { useMemo } from "react";
import { BellRing, BellDot, ShieldCheck, Clock, CheckCircle2 } from "lucide-react";
import { Card } from "../Card";
import { fmt, pct } from "./helpers";
import type { MetricsSummary } from "../../types";

export function CustomerKPIs({ data, loading }: { data: MetricsSummary | null; loading: boolean }) {
  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: "Total Alerts",
        value: data.total_tickets.toLocaleString(),
        icon: <BellRing className="w-5 h-5" />,
        color: "var(--theme-accent)",
        sub: `${data.open_tickets} open`,
      },
      {
        label: "Active Alerts",
        value: data.open_tickets.toLocaleString(),
        icon: <BellDot className="w-5 h-5" />,
        color: "#F59E0B",
        sub: data.total_tickets > 0 ? `${((data.open_tickets / data.total_tickets) * 100).toFixed(0)}% of total` : "—",
      },
      {
        label: "Avg Response Time",
        value: fmt(data.avg_mttd_seconds),
        icon: <Clock className="w-5 h-5" />,
        color: "#3B82F6",
        sub: "Mean Time to Detect",
      },
      {
        label: "SLA Compliance",
        value: pct(data.sla_compliance_pct),
        icon: <CheckCircle2 className="w-5 h-5" />,
        color: (data.sla_compliance_pct ?? 0) >= 90 ? "#22C55E" : (data.sla_compliance_pct ?? 0) >= 70 ? "#F59E0B" : "#EF4444",
        sub: "Within SLA threshold",
      },
      {
        label: "Incidents",
        value: data.si_count.toLocaleString(),
        icon: <ShieldCheck className="w-5 h-5" />,
        color: "#EF4444",
        sub: "True positive only",
      },
    ];
  }, [data]);

  if (loading) return <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, i) => <Card key={i}><div className="h-20 skeleton rounded" /></Card>)}</div>;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {kpis.map((k) => (
        <Card key={k.label}>
          <div className="flex items-start gap-3">
            <div
              className="p-2 rounded-lg shrink-0"
              style={{
                backgroundColor: `color-mix(in srgb, ${k.color} 12%, transparent)`,
                color: k.color,
              }}
            >
              {k.icon}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider truncate" style={{ color: "var(--theme-text-muted)" }}>
                {k.label}
              </p>
              <p className="font-bold font-mono" style={{ fontSize: 26, lineHeight: 1.2, color: "var(--theme-text-primary)" }}>
                {k.value}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
                {k.sub}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
