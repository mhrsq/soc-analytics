import type { SyncStatus } from "../types";
import { Database, AlertCircle } from "lucide-react";

interface Props {
  syncStatus: SyncStatus | null;
}

export function SyncBanner({ syncStatus }: Props) {
  if (!syncStatus || syncStatus.total_in_db > 0) return null;

  return (
    <div className="relative overflow-hidden rounded-lg p-4 flex items-center gap-3 animate-fade-in-up"
      style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 5%, var(--theme-surface-raised))", border: "1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent)" }}>
      {/* Animated gradient sweep */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[.03] to-transparent animate-pulse" />
      <div className="relative flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 10%, transparent)" }}>
          <Database className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
        </div>
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: "var(--theme-text-primary)" }}>
            <AlertCircle className="w-3.5 h-3.5 text-cyber-orange" />
            Database Empty — Initial Sync Required
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
            Data is being synced from SDP locally. If you just deployed, wait for the local sync to complete or click "Sync" to trigger from server.
          </p>
        </div>
      </div>
    </div>
  );
}
