import { useState } from "react";
import { X, Plus, BarChart3, PieChart, TrendingUp, Activity, Radar, Layers } from "lucide-react";
import type { ChartType, DataSource } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, chartType: ChartType, dataSource: DataSource) => void;
}

const CHART_OPTIONS: { value: ChartType; label: string; icon: React.ElementType; desc: string }[] = [
  { value: "area", label: "Area Chart", icon: TrendingUp, desc: "Filled area for trends over time" },
  { value: "line", label: "Line Chart", icon: Activity, desc: "Line for continuous data trends" },
  { value: "bar", label: "Bar Chart", icon: BarChart3, desc: "Vertical bars for comparison" },
  { value: "horizontal-bar", label: "Horizontal Bar", icon: BarChart3, desc: "Horizontal bars for ranked data" },
  { value: "stacked-bar", label: "Stacked Bar", icon: Layers, desc: "Stacked bars for composition" },
  { value: "pie", label: "Pie Chart", icon: PieChart, desc: "Pie slices for proportions" },
  { value: "donut", label: "Donut Chart", icon: PieChart, desc: "Donut ring for proportions" },
  { value: "radar", label: "Radar Chart", icon: Radar, desc: "Spider chart for multi-dimensional" },
  { value: "radial-bar", label: "Radial Bar", icon: PieChart, desc: "Circular progress bars" },
  { value: "scatter", label: "Scatter Plot", icon: Activity, desc: "Dots for correlation analysis" },
  { value: "treemap", label: "Treemap", icon: Layers, desc: "Nested rectangles for hierarchy" },
  { value: "funnel", label: "Funnel Chart", icon: BarChart3, desc: "Funnel for stage analysis" },
  { value: "text-stats", label: "Text Stats", icon: Activity, desc: "Text-based ratio/percentage display" },
  { value: "gauge", label: "Gauge", icon: PieChart, desc: "Circular gauge for single metric (e.g. SLA)" },
  { value: "table", label: "Table", icon: Activity, desc: "Table view for live data feeds" },
];

const DATA_OPTIONS: { value: DataSource; label: string; desc: string }[] = [
  { value: "volume", label: "Ticket Volume", desc: "Daily ticket counts with TP/FP breakdown" },
  { value: "validation", label: "Alert Quality (TP/FP)", desc: "True Positive vs False Positive ratio" },
  { value: "priority", label: "Priority Distribution", desc: "Tickets by priority level (P1–P4)" },
  { value: "customers", label: "Tickets by Customer", desc: "Ticket count per customer" },
  { value: "top-alerts", label: "Top Alert Rules", desc: "Most frequent Wazuh alert rules" },
  { value: "mttd", label: "MTTD / SLA", desc: "Mean Time To Detect trend" },
  { value: "analysts", label: "Analyst Performance", desc: "Per-analyst workload and metrics" },
  { value: "summary", label: "SLA Achievement Gauge", desc: "SLA compliance gauge (needs Gauge chart type)" },
  { value: "live-feed", label: "Live Ticket Feed", desc: "Latest 10 tickets with timestamp, ID, name, and asset" },
];

export function AddWidgetModal({ open, onClose, onAdd }: Props) {
  const [name, setName] = useState("");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [dataSource, setDataSource] = useState<DataSource>("volume");

  if (!open) return null;

  const handleAdd = () => {
    const finalName = name.trim() || `${CHART_OPTIONS.find(c => c.value === chartType)?.label} — ${DATA_OPTIONS.find(d => d.value === dataSource)?.label}`;
    onAdd(finalName, chartType, dataSource);
    setName("");
    setChartType("bar");
    setDataSource("volume");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl shadow-2xl shadow-black/40 animate-fade-in-up overflow-hidden"
        style={{ backgroundColor: "var(--theme-surface-raised)", border: "1px solid var(--theme-surface-border)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
            <h3 className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>Add Custom Widget</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-opacity hover:opacity-70" style={{ color: "var(--theme-text-muted)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Widget Name */}
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--theme-text-muted)" }}>Widget Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Auto-generated if empty"
              className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg theme-input"
            />
          </div>

          {/* Chart Type */}
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--theme-text-muted)" }}>Chart Type</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {CHART_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setChartType(opt.value)}
                  className="flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-all"
                  style={{
                    borderColor: chartType === opt.value ? "var(--theme-accent)" : "var(--theme-surface-border)",
                    backgroundColor: chartType === opt.value ? "color-mix(in srgb, var(--theme-accent) 12%, transparent)" : "transparent",
                    color: chartType === opt.value ? "var(--theme-accent)" : "var(--theme-text-muted)",
                  }}
                >
                  <opt.icon className="w-4 h-4" />
                  <span className="font-medium text-[11px] text-center leading-tight">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Data Source */}
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--theme-text-muted)" }}>Data Source</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {DATA_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDataSource(opt.value)}
                  className="flex flex-col items-start p-2.5 rounded-lg border text-xs transition-all"
                  style={{
                    borderColor: dataSource === opt.value ? "var(--theme-accent)" : "var(--theme-surface-border)",
                    backgroundColor: dataSource === opt.value ? "color-mix(in srgb, var(--theme-accent) 12%, transparent)" : "transparent",
                    color: dataSource === opt.value ? "var(--theme-accent)" : "var(--theme-text-muted)",
                  }}
                >
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-[10px] opacity-70 mt-0.5">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--theme-surface-border)" }}>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg transition-colors"
            style={{ border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-muted)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors"
            style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent)", color: "var(--theme-accent)" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Widget
          </button>
        </div>
      </div>
    </div>
  );
}
