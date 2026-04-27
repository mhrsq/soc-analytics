export function SLAGauge({ value }: { value: number | null }) {
  const pctVal = value ?? 0;
  const color = pctVal >= 90 ? "#22C55E" : pctVal >= 70 ? "#F59E0B" : "#EF4444";
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference - (pctVal / 100) * circumference;

  return (
    <div className="flex flex-col items-center py-2 h-full justify-center">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--theme-surface-border)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold font-mono" style={{ color: "var(--theme-text-primary)" }}>
            {value !== null ? `${value.toFixed(0)}%` : "—"}
          </span>
        </div>
      </div>
      <p className="text-[10px] mt-2" style={{ color: "var(--theme-text-muted)" }}>
        {pctVal >= 90 ? "✅ On Target" : pctVal >= 70 ? "⚠️ Below Target" : "🔴 Critical"}
      </p>
    </div>
  );
}
