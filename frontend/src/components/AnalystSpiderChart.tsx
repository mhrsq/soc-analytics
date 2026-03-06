import { useState, useRef, useEffect, useCallback } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useChartColors, useTooltipStyle } from "../hooks/useChartColors";
import type { AnalystMetrics } from "../types";

interface Props {
  metrics: AnalystMetrics;
  size?: number;
  showLabels?: boolean;
  color?: string;
}

/** Label, description, and weight for each metric axis */
const AXIS_META: Record<keyof AnalystMetrics, { label: string; desc: string; weight: string }> = {
  speed: {
    label: "Speed",
    desc: "Rata-rata waktu deteksi (MTTD). Makin cepat detect alert, makin tinggi skor.",
    weight: "20%",
  },
  detection: {
    label: "Detection",
    desc: "True Positive rate — persentase alert yang memang real threat.",
    weight: "15%",
  },
  accuracy: {
    label: "Accuracy",
    desc: "Seberapa banyak tiket yang sudah divalidasi (TP/FP) vs belum divalidasi.",
    weight: "15%",
  },
  volume: {
    label: "Volume",
    desc: "Jumlah tiket yang di-handle relatif terhadap rata-rata tim.",
    weight: "15%",
  },
  sla: {
    label: "SLA",
    desc: "Persentase tiket yang response-nya memenuhi SLA (≤15 menit).",
    weight: "20%",
  },
  throughput: {
    label: "Throughput",
    desc: "Resolution rate — persentase tiket yang sudah di-resolve dari total assigned.",
    weight: "10%",
  },
  complexity: {
    label: "Complexity",
    desc: "Proporsi tiket high-priority & security incident yang di-handle.",
    weight: "5%",
  },
};

const AXIS_LABELS: Record<keyof AnalystMetrics, string> = Object.fromEntries(
  Object.entries(AXIS_META).map(([k, v]) => [k, v.label]),
) as Record<keyof AnalystMetrics, string>;

/** Reverse lookup: label → key */
const LABEL_TO_KEY: Record<string, keyof AnalystMetrics> = Object.fromEntries(
  Object.entries(AXIS_META).map(([k, v]) => [v.label, k as keyof AnalystMetrics]),
) as Record<string, keyof AnalystMetrics>;

/* ── Floating tooltip bubble for axis labels ── */
function AxisTooltipPopup({
  anchor,
  metaKey,
  onClose,
}: {
  anchor: { x: number; y: number } | null;
  metaKey: keyof AnalystMetrics | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [anchor, onClose]);

  if (!anchor || !metaKey) return null;
  const meta = AXIS_META[metaKey];

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: anchor.x,
        top: anchor.y - 8,
        transform: "translate(-50%, -100%)",
        zIndex: 9999,
        maxWidth: 260,
        padding: "8px 12px",
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.45,
        background: "rgba(15,23,42,0.95)",
        color: "#e2e8f0",
        boxShadow: "0 4px 20px rgba(0,0,0,.35)",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2, fontSize: 13 }}>
        {meta.label}{" "}
        <span style={{ fontWeight: 400, opacity: 0.6 }}>({meta.weight})</span>
      </div>
      <div style={{ opacity: 0.85 }}>{meta.desc}</div>
    </div>
  );
}

/* ── Custom tick with hover ── */
function AxisTick({
  x,
  y,
  payload,
  fill: tickFill,
  onHover,
}: {
  x: number;
  y: number;
  payload: { value: string };
  fill: string;
  onHover: (label: string | null, rect: DOMRect | null) => void;
}) {
  const textRef = useRef<SVGTextElement>(null);
  return (
    <text
      ref={textRef}
      x={x}
      y={y}
      fill={tickFill}
      fontSize={11}
      fontWeight={500}
      textAnchor="middle"
      dominantBaseline="central"
      style={{ cursor: "help" }}
      onMouseEnter={() => {
        const r = textRef.current?.getBoundingClientRect() ?? null;
        onHover(payload.value, r);
      }}
      onMouseLeave={() => onHover(null, null)}
    >
      {payload.value}
    </text>
  );
}

export function AnalystSpiderChart({ metrics, size = 250, showLabels = true, color }: Props) {
  const cc = useChartColors();
  const tooltipStyle = useTooltipStyle();
  const fill = color || cc.accent;

  const [hoverAnchor, setHoverAnchor] = useState<{ x: number; y: number } | null>(null);
  const [hoverKey, setHoverKey] = useState<keyof AnalystMetrics | null>(null);

  const handleAxisHover = useCallback(
    (label: string | null, rect: DOMRect | null) => {
      if (!label || !rect) {
        setHoverAnchor(null);
        setHoverKey(null);
        return;
      }
      setHoverAnchor({ x: rect.x + rect.width / 2, y: rect.y });
      setHoverKey(LABEL_TO_KEY[label] ?? null);
    },
    [],
  );

  const data = Object.entries(AXIS_LABELS).map(([key, label]) => ({
    axis: label,
    value: metrics[key as keyof AnalystMetrics],
    fullMark: 100,
  }));

  return (
    <div style={{ position: "relative" }}>
      <ResponsiveContainer width="100%" height={size}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid stroke={cc.grid} strokeOpacity={0.4} />
          {showLabels && (
            <PolarAngleAxis
              dataKey="axis"
              tick={(props: any) => (
                <AxisTick {...props} fill={cc.tick} onHover={handleAxisHover} />
              )}
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
      {showLabels && (
        <AxisTooltipPopup
          anchor={hoverAnchor}
          metaKey={hoverKey}
          onClose={() => { setHoverAnchor(null); setHoverKey(null); }}
        />
      )}
    </div>
  );
}
