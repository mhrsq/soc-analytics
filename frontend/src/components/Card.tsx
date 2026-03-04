import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  noPad?: boolean;
}

export function Card({ title, children, className = "", action, noPad }: CardProps) {
  return (
    <div
      className={`
        rounded-xl border transition-all duration-200
        ${noPad ? "" : "p-3 sm:p-5"}
        ${className}
      `}
      style={{
        backgroundColor: "var(--theme-card-bg)",
        borderColor: "var(--theme-card-border)",
      }}
    >
      {(title || action) && (
        <div className={`flex items-center justify-between mb-3 ${noPad ? "px-3 sm:px-5 pt-3 sm:pt-4" : ""}`}>
          {title && (
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--theme-text-secondary)" }}>
              <span className="w-1 h-3.5 rounded-full" style={{ backgroundColor: "var(--theme-accent)" }} />
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
