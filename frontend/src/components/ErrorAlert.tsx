import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  error: string | null;
  onRetry?: () => void;
  className?: string;
}

export function ErrorAlert({ error, onRetry, className = "" }: Props) {
  if (!error) return null;
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${className}`}
      style={{
        background: "color-mix(in srgb, #ef4444 8%, var(--theme-card-bg))",
        border: "1px solid color-mix(in srgb, #ef4444 20%, var(--theme-card-border))",
        color: "var(--theme-text-secondary)",
      }}
      role="alert"
    >
      <AlertTriangle size={16} className="shrink-0" style={{ color: "#ef4444" }} />
      <span className="flex-1 min-w-0 truncate">{error}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 flex items-center gap-1.5 text-xs font-medium rounded px-2.5 py-1 transition-colors"
          style={{
            color: "var(--theme-accent)",
            background: "color-mix(in srgb, var(--theme-accent) 10%, transparent)",
          }}
        >
          <RefreshCw size={12} />
          Retry
        </button>
      )}
    </div>
  );
}
