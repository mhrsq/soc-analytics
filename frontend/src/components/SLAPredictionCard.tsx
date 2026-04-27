import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { Card } from "./Card";
import { Spinner } from "./Spinner";
import type { SlaPrediction } from "../types";

interface Props {
  customer?: string;
}

export function SLAPredictionCard({ customer }: Props) {
  const { data, loading } = useFetch<SlaPrediction>(
    () => api.getSlaPrediction(customer),
    [customer]
  );

  if (loading) {
    return (
      <Card title="SLA Forecast">
        <Spinner />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card title="SLA Forecast">
        <p className="text-xs text-center py-4" style={{ color: "var(--theme-text-muted)" }}>
          No SLA prediction data available.
        </p>
      </Card>
    );
  }

  const trend = data.trend;

  return (
    <Card title="SLA Forecast">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
            Current
          </p>
          <p className="text-2xl font-mono font-bold" style={{ color: "var(--theme-text-primary)" }}>
            {data.current_sla_pct}%
          </p>
        </div>
        <div
          className="text-2xl"
          style={{
            color:
              trend === "improving"
                ? "#22c55e"
                : trend === "declining"
                  ? "#ef4444"
                  : "#9b9ba8",
          }}
        >
          {trend === "improving" ? "↗" : trend === "declining" ? "↘" : "→"}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
            EOM Forecast
          </p>
          <p className="text-2xl font-mono font-bold" style={{ color: "var(--theme-text-primary)" }}>
            {data.predicted_eom_sla_pct}%
          </p>
        </div>
      </div>
      <p
        className="text-[11px] mt-2 text-center"
        style={{ color: "var(--theme-text-muted)" }}
      >
        Berdasarkan {data.data_points} hari data &middot; {data.days_remaining} hari tersisa
      </p>
    </Card>
  );
}
