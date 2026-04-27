import { Server } from "lucide-react";
import { api } from "../../api/client";
import { useFetch } from "../../hooks/useFetch";

export function AssetExposure({
  customer,
  start,
  end,
}: {
  customer: string;
  start?: string;
  end?: string;
}) {
  const { data, loading } = useFetch<{ asset_name: string; count: number }[]>(
    () => api.getAssetExposure({ customer, start, end }),
    [customer, start, end]
  );

  if (loading) return <div className="h-full skeleton rounded" />;
  if (!data || data.length === 0) return <p className="text-sm text-center py-12" style={{ color: "var(--theme-text-muted)" }}>No asset data</p>;

  const top = data.slice(0, 10);

  return (
    <div>
      <p className="text-[10px] mb-3" style={{ color: "var(--theme-text-muted)" }}>Assets with most alerts &mdash; prioritize for hardening</p>
      <div className="space-y-2">
        {top.map((a, i) => {
          const maxCount = top[0].count;
          const pctW = maxCount > 0 ? (a.count / maxCount) * 100 : 0;
          return (
            <div key={a.asset_name} className="flex items-center gap-2">
              <span className="text-[10px] font-mono w-5 text-right shrink-0" style={{ color: "var(--theme-text-muted)" }}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Server className="w-3 h-3 shrink-0" style={{ color: "var(--theme-accent)" }} />
                    <span className="text-xs truncate" style={{ color: "var(--theme-text-secondary)" }}>
                      {a.asset_name}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-medium ml-2 shrink-0" style={{ color: "var(--theme-text-primary)" }}>
                    {a.count}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--theme-surface-border)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pctW}%`,
                      backgroundColor: i < 3 ? "#EF4444" : "var(--theme-accent)",
                      opacity: 1 - i * 0.06,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
