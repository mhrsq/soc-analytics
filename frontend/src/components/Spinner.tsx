export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-8 ${className}`}>
      <div className="relative">
        <div className="w-8 h-8 border-2 border-cyber-blue/20 rounded-full" />
        <div className="absolute inset-0 w-8 h-8 border-2 border-transparent border-t-cyber-blue rounded-full animate-spin" />
      </div>
    </div>
  );
}

/* Skeleton block for chart loading states */
export function ChartSkeleton({ height }: { height?: number }) {
  return (
    <div className={`flex flex-col gap-3 py-2 ${height == null ? "h-full" : ""}`}>
      <div className="flex items-end gap-2 justify-center flex-1" style={height != null ? { height } : undefined}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="skeleton rounded-sm"
            style={{
              width: "10%",
              height: `${30 + Math.random() * 60}%`,
              animationDelay: `${i * 100}ms`,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between px-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-2.5 w-10 rounded" />
        ))}
      </div>
    </div>
  );
}

/* Skeleton rows for table loading */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2.5 py-2">
      {/* Header */}
      <div className="flex gap-4 pb-2 border-b border-surface-700/30">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="skeleton h-3 rounded flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4" style={{ animationDelay: `${r * 60}ms` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-4 rounded flex-1" style={{ opacity: 0.7 + Math.random() * 0.3 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
