import { useState } from "react";
import { X, Palette, Sun, Image, Sparkles } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import type { ThemePreset, ThemeConfig } from "../types";

const PRESET_META: { key: ThemePreset; label: string; colors: string[] }[] = [
  { key: "dark", label: "Dark", colors: ["#0f172a", "#1e293b", "#3b82f6"] },
  { key: "midnight", label: "Midnight", colors: ["#0f0c29", "#302b63", "#818cf8"] },
  { key: "light", label: "Light", colors: ["#f8fafc", "#ffffff", "#2563eb"] },
  { key: "ocean", label: "Ocean", colors: ["#0c1222", "#0f2942", "#06b6d4"] },
  { key: "emerald", label: "Emerald", colors: ["#071410", "#0f2e20", "#10b981"] },
  { key: "sunset", label: "Sunset", colors: ["#1a0a12", "#2d1520", "#f97316"] },
  { key: "custom", label: "Custom", colors: ["#0f172a", "#1e293b", "#3b82f6"] },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ThemePanel({ open, onClose }: Props) {
  const { theme, setTheme, applyPreset } = useTheme();
  const [custom, setCustom] = useState<ThemeConfig>({ ...theme });

  if (!open) return null;

  const handlePreset = (preset: ThemePreset) => {
    if (preset === "custom") {
      setCustom(c => ({ ...c, preset: "custom" }));
      applyPreset("custom");
    } else {
      applyPreset(preset);
    }
  };

  const updateCustom = (key: keyof ThemeConfig, value: string) => {
    const next = { ...custom, preset: "custom" as ThemePreset, [key]: value };
    setCustom(next);
    setTheme(next);
  };

  const isCustom = theme.preset === "custom";

  return (
    <div className="fixed inset-0 z-[80] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm h-full flex flex-col shadow-2xl animate-fade-in-up overflow-hidden"
        style={{ backgroundColor: "var(--theme-surface-raised)", borderLeft: "1px solid var(--theme-surface-border)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
            <h3 className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>Theme Settings</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-opacity hover:opacity-70" style={{ color: "var(--theme-text-muted)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Presets */}
          <div>
            <label className="text-xs font-medium flex items-center gap-1.5" style={{ color: "var(--theme-text-muted)" }}>
              <Sparkles className="w-3 h-3" /> Presets
            </label>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {PRESET_META.map(p => (
                <button
                  key={p.key}
                  onClick={() => handlePreset(p.key)}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg border transition-all"
                  style={{
                    borderColor: theme.preset === p.key ? "var(--theme-accent)" : "var(--theme-surface-border)",
                    backgroundColor: theme.preset === p.key ? "color-mix(in srgb, var(--theme-accent) 12%, transparent)" : "color-mix(in srgb, var(--theme-surface-raised) 60%, transparent)",
                  }}
                >
                  {/* Color preview */}
                  <div className="flex gap-0.5">
                    {p.colors.map((c, i) => (
                      <div key={i} className="w-4 h-4 rounded-full border border-surface-600/30" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-[10px] font-medium" style={{ color: theme.preset === p.key ? "var(--theme-accent)" : "var(--theme-text-muted)" }}>
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom colors */}
          <div>
            <label className="text-xs font-medium flex items-center gap-1.5" style={{ color: "var(--theme-text-muted)" }}>
              <Sun className="w-3 h-3" /> Custom Colors
            </label>
            <p className="text-[10px] mt-1 mb-3" style={{ color: "var(--theme-text-muted)", opacity: 0.6 }}>Changes auto-switch to Custom preset</p>

            <div className="space-y-3">
              {/* Background Type */}
              <div>
                <label className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>Background Type</label>
                <div className="flex gap-2 mt-1">
                  {(["solid", "gradient", "image"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => updateCustom("bgType", t)}
                      className="flex-1 px-2 py-1.5 text-[10px] rounded-lg border transition-all capitalize"
                      style={{
                        borderColor: (isCustom ? custom.bgType : theme.bgType) === t ? "var(--theme-accent)" : "var(--theme-surface-border)",
                        color: (isCustom ? custom.bgType : theme.bgType) === t ? "var(--theme-accent)" : "var(--theme-text-muted)",
                        backgroundColor: (isCustom ? custom.bgType : theme.bgType) === t ? "color-mix(in srgb, var(--theme-accent) 10%, transparent)" : "transparent",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Background Color */}
              <ColorPicker
                label="Background Color"
                value={isCustom ? custom.bgColor : theme.bgColor}
                onChange={v => updateCustom("bgColor", v)}
              />

              {/* Gradient */}
              <div>
                <label className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>Gradient CSS</label>
                <input
                  type="text"
                  value={isCustom ? custom.bgGradient : theme.bgGradient}
                  onChange={e => updateCustom("bgGradient", e.target.value)}
                  placeholder="linear-gradient(135deg, #000 0%, #333 100%)"
                  className="mt-1 w-full px-2.5 py-1.5 text-[11px] rounded-lg focus:outline-none font-mono"
                  style={{ backgroundColor: "var(--theme-surface-base)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-secondary)" }}
                />
              </div>

              {/* Image URL */}
              <div>
                <label className="text-[10px] flex items-center gap-1" style={{ color: "var(--theme-text-muted)" }}>
                  <Image className="w-3 h-3" /> Background Image URL
                </label>
                <input
                  type="text"
                  value={isCustom ? custom.bgImage : theme.bgImage}
                  onChange={e => updateCustom("bgImage", e.target.value)}
                  placeholder="https://example.com/bg.jpg"
                  className="mt-1 w-full px-2.5 py-1.5 text-[11px] rounded-lg focus:outline-none font-mono"
                  style={{ backgroundColor: "var(--theme-surface-base)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-secondary)" }}
                />
              </div>

              <div className="h-px" style={{ backgroundColor: "var(--theme-surface-border)" }} />

              {/* Card colors */}
              <ColorPicker
                label="Card Background"
                value={isCustom ? custom.cardBg : theme.cardBg}
                onChange={v => updateCustom("cardBg", v)}
              />
              <ColorPicker
                label="Card Border"
                value={isCustom ? custom.cardBorder : theme.cardBorder}
                onChange={v => updateCustom("cardBorder", v)}
              />
              <ColorPicker
                label="Accent Color"
                value={isCustom ? custom.accentColor : theme.accentColor}
                onChange={v => updateCustom("accentColor", v)}
              />
              <ColorPicker
                label="Nav Background"
                value={isCustom ? custom.navBg : theme.navBg}
                onChange={v => updateCustom("navBg", v)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>{label}</label>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="color"
          value={value.startsWith("#") ? value : "#0a1929"}
          onChange={e => onChange(e.target.value)}
          className="w-8 h-8 rounded-lg bg-transparent cursor-pointer"
          style={{ border: "1px solid var(--theme-surface-border)" }}
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-2.5 py-1.5 text-[11px] rounded-lg focus:outline-none font-mono"
          style={{ backgroundColor: "var(--theme-surface-base)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-secondary)" }}
        />
      </div>
    </div>
  );
}
