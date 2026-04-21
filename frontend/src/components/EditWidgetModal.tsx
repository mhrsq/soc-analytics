import { useState, useEffect } from "react";
import { X, Save, BarChart3, PieChart, TrendingUp, Activity, Radar, Layers } from "lucide-react";
import type { ChartType, DataSource, WidgetConfig } from "../types";

interface Props {
  widget: WidgetConfig | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<WidgetConfig>) => void;
}

const CHART_OPTIONS: { value: ChartType; label: string; icon: React.ElementType }[] = [
  { value: "area", label: "Area", icon: TrendingUp },
  { value: "line", label: "Line", icon: Activity },
  { value: "bar", label: "Bar", icon: BarChart3 },
  { value: "horizontal-bar", label: "H-Bar", icon: BarChart3 },
  { value: "stacked-bar", label: "Stacked", icon: Layers },
  { value: "pie", label: "Pie", icon: PieChart },
  { value: "donut", label: "Donut", icon: PieChart },
  { value: "text-stats", label: "Text Stats", icon: Activity },
  { value: "radar", label: "Radar", icon: Radar },
  { value: "radial-bar", label: "Radial", icon: PieChart },
  { value: "gauge", label: "Gauge", icon: PieChart },
  { value: "scatter", label: "Scatter", icon: Activity },
  { value: "treemap", label: "Treemap", icon: Layers },
  { value: "funnel", label: "Funnel", icon: BarChart3 },
];

const DATA_OPTIONS: { value: DataSource; label: string }[] = [
  { value: "volume", label: "Ticket Volume" },
  { value: "validation", label: "Alert Quality (TP/FP)" },
  { value: "priority", label: "Priority Distribution" },
  { value: "customers", label: "Tickets by Customer" },
  { value: "top-alerts", label: "Top Alert Rules" },
  { value: "mttd", label: "MTTD / SLA" },
  { value: "analysts", label: "Analyst Performance" },
  { value: "summary", label: "SLA Achievement Gauge" },
];

export function EditWidgetModal({ widget, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [dataSource, setDataSource] = useState<DataSource>("volume");

  useEffect(() => {
    if (widget) {
      setName(widget.name);
      setChartType(widget.chartType);
      setDataSource(widget.dataSource);
    }
  }, [widget]);

  if (!widget) return null;

  const handleSave = () => {
    onSave(widget.id, { name: name.trim() || widget.name, chartType, dataSource });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl shadow-2xl shadow-black/40 animate-fade-in-up overflow-hidden"
        style={{ backgroundColor: "var(--theme-surface-raised)", border: "1px solid var(--theme-surface-border)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>Edit Widget</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-opacity hover:opacity-70" style={{ color: "var(--theme-text-muted)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--theme-text-muted)" }}>Widget Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg theme-input"
            />
          </div>

          {/* Chart Type */}
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--theme-text-muted)" }}>Chart Type</label>
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {CHART_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setChartType(opt.value)}
                  className="flex flex-col items-center gap-0.5 p-2 rounded-lg border text-[10px] transition-all"
                  style={{
                    borderColor: chartType === opt.value ? "var(--theme-accent)" : "var(--theme-surface-border)",
                    backgroundColor: chartType === opt.value ? "color-mix(in srgb, var(--theme-accent) 12%, transparent)" : "transparent",
                    color: chartType === opt.value ? "var(--theme-accent)" : "var(--theme-text-muted)",
                  }}
                >
                  <opt.icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Data Source */}
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--theme-text-muted)" }}>Data Source</label>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {DATA_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDataSource(opt.value)}
                  className="p-2 rounded-lg border text-xs font-medium transition-all text-left"
                  style={{
                    borderColor: dataSource === opt.value ? "var(--theme-accent)" : "var(--theme-surface-border)",
                    backgroundColor: dataSource === opt.value ? "color-mix(in srgb, var(--theme-accent) 12%, transparent)" : "transparent",
                    color: dataSource === opt.value ? "var(--theme-accent)" : "var(--theme-text-muted)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--theme-surface-border)" }}>
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-lg transition-colors" style={{ border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-muted)" }}>
            Cancel
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent)", color: "var(--theme-accent)" }}>
            <Save className="w-3.5 h-3.5" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
