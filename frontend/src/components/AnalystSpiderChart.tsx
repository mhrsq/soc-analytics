import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useChartColors, useTooltipStyle } from "../hooks/useChartColors";
import type { AnalystMetrics } from "../types";

interface Props {
  metrics: AnalystMetrics;
  size?: number;
  showLabels?: boolean;
  color?: string;
}

const AXIS_LABELS: Record<keyof AnalystMetrics, string> = {
  speed: "Speed",
  detection: "Detection",
  accuracy: "Accuracy",
  volume: "Volume",
  sla: "SLA",
  throughput: "Throughput",
  complexity: "Complexity",
};

export function AnalystSpiderChart({ metrics, size = 250, showLabels = true, color }: Props) {
  const cc = useChartColors();
  const tooltipStyle = useTooltipStyle();
  const fill = color || cc.accent;

  const data = Object.entries(AXIS_LABELS).map(([key, label]) => ({
    axis: label,
    value: metrics[key as keyof AnalystMetrics],
    fullMark: 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={size}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
        <PolarGrid stroke={cc.grid} strokeOpacity={0.4} />
        {showLabels && (
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: cc.tick, fontSize: 11, fontWeight: 500 }}
          />
        )}
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={false}
          axisLine={false}
        />
        <Radar
          dataKey="value"
          stroke={fill}
          fill={fill}
          fillOpacity={0.2}
          strokeWidth={2}
          dot={{ r: 3, fill, strokeWidth: 0 }}
          animationDuration={600}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number) => [`${value.toFixed(1)}`, "Score"]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
