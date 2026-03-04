import { useMemo } from "react";

/** Reads CSS custom-property theme tokens and returns concrete hex values
 *  that Recharts SVG elements can consume (they don't support var()). */
export function useChartColors() {
  return useMemo(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      grid: s.getPropertyValue("--theme-surface-border").trim() || "#334e68",
      tick: s.getPropertyValue("--theme-text-muted").trim() || "#829ab1",
      label: s.getPropertyValue("--theme-text-secondary").trim() || "#d9e2ec",
      raised: s.getPropertyValue("--theme-surface-raised").trim() || "#1a3a52",
      accent: s.getPropertyValue("--theme-accent").trim() || "#3b82f6",
    };
  }, []);
}

export function useTooltipStyle() {
  const cc = useChartColors();
  return {
    backgroundColor: cc.raised,
    border: `1px solid ${cc.grid}`,
    borderRadius: "8px",
    color: cc.label,
    fontSize: 12,
  };
}
