import { useEffect, useRef } from "react";
import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import type { MetricsSummary } from "../types";

interface Props {
  data: MetricsSummary | null;
  loading: boolean;
  bare?: boolean;
}

const TARGET = 95;

function drawGauge(canvas: HTMLCanvasElement, value: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const cx = w / 2;
  const cy = h * 0.60;
  const radius = Math.min(w, h) * 0.40;
  const lineWidth = radius * 0.20;

  const startAngle = Math.PI * 0.8;
  const endAngle = Math.PI * 2.2;
  const totalArc = endAngle - startAngle;
  const valueAngle = startAngle + totalArc * Math.min(value / 100, 1);
  const targetAngle = startAngle + totalArc * (TARGET / 100);

  const aboveTarget = value >= TARGET;
  const color = aboveTarget ? "#22c55e" : value >= 70 ? "#f59e0b" : "#ef4444";

  ctx.clearRect(0, 0, w, h);

  // ── Background track ──
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = "rgba(100,120,140,0.12)";
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.stroke();

  // ── Below-target zone tint (subtle red/orange band from 0 → target) ──
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, targetAngle);
  ctx.strokeStyle = "rgba(239,68,68,0.06)";
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.stroke();

  // ── Above-target zone tint (subtle green band from target → 100) ──
  ctx.beginPath();
  ctx.arc(cx, cy, radius, targetAngle, endAngle);
  ctx.strokeStyle = "rgba(34,197,94,0.06)";
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.stroke();

  // ── Value arc ──
  const grad = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
  grad.addColorStop(0, color + "80");
  grad.addColorStop(1, color);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, valueAngle);
  ctx.strokeStyle = grad;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.stroke();

  // ── Glow at tip ──
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.max(startAngle, valueAngle - 0.12), valueAngle);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth * 0.45;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  // ── Target threshold marker (95%) ──
  const innerR = radius - lineWidth / 2 - 3;
  const outerR = radius + lineWidth / 2 + 3;
  ctx.beginPath();
  ctx.moveTo(cx + innerR * Math.cos(targetAngle), cy + innerR * Math.sin(targetAngle));
  ctx.lineTo(cx + outerR * Math.cos(targetAngle), cy + outerR * Math.sin(targetAngle));
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.stroke();

  // Target label
  const targetLabelR = outerR + Math.max(10, radius * 0.18);
  const tLabelFont = Math.max(8, radius * 0.14);
  ctx.font = `600 ${tLabelFont}px Lato, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(
    `${TARGET}%`,
    cx + targetLabelR * Math.cos(targetAngle),
    cy + targetLabelR * Math.sin(targetAngle),
  );

  // ── Tick marks ──
  const ticks = [0, 25, 50, 75, 100];
  const tickFont = Math.max(8, radius * 0.15);
  ctx.font = `500 ${tickFont}px Lato, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ticks.forEach(t => {
    const a = startAngle + totalArc * (t / 100);
    const tickOuter = radius + lineWidth / 2 + 3;
    const labelR = tickOuter + tickFont * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx + tickOuter * Math.cos(a), cy + tickOuter * Math.sin(a));
    ctx.lineTo(cx + (tickOuter + 3) * Math.cos(a), cy + (tickOuter + 3) * Math.sin(a));
    ctx.strokeStyle = "rgba(100,120,140,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(160,180,200,0.45)";
    ctx.fillText(`${t}`, cx + labelR * Math.cos(a), cy + labelR * Math.sin(a));
  });

  // ── Center value ──
  const valFont = Math.max(18, radius * 0.50);
  ctx.font = `600 ${valFont}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(`${value.toFixed(1)}%`, cx, cy - radius * 0.08);

  // ── Status label ──
  const statusFont = Math.max(9, radius * 0.15);
  ctx.font = `500 ${statusFont}px Inter, sans-serif`;
  ctx.fillStyle = aboveTarget ? "rgba(34,197,94,0.8)" : "rgba(245,158,11,0.8)";
  ctx.fillText(
    aboveTarget ? "▲ Above Target" : "▼ Below Target",
    cx,
    cy + radius * 0.22,
  );

  // ── Sub-label ──
  const subFont = Math.max(8, radius * 0.13);
  ctx.font = `400 ${subFont}px Lato, sans-serif`;
  ctx.fillStyle = "rgba(160,180,200,0.55)";
  ctx.fillText(`Target: ${TARGET}%  SLA Compliance`, cx, cy + radius * 0.45);
}

export function SlaGauge({ data, loading, bare }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const value = data?.sla_compliance_pct ?? 0;

  useEffect(() => {
    if (!canvasRef.current || loading || !data) return;
    drawGauge(canvasRef.current, value);

    const ro = new ResizeObserver(() => {
      if (canvasRef.current) drawGauge(canvasRef.current, value);
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [value, loading, data]);

  const inner = loading || !data ? (
    <ChartSkeleton />
  ) : (
    <canvas ref={canvasRef} className="w-full h-full" />
  );

  if (bare) return <div className="h-full">{inner}</div>;
  return <Card title="SLA Achievement"><div style={{ height: 280 }}>{inner}</div></Card>;
}

// Keep old export name for backward compatibility
export const MttdChart = SlaGauge;
