import { useState, useEffect, useRef } from "react";
import { Calendar, Building2, Check, Clock, Pencil, Plus, RotateCcw, ChevronDown, LayoutDashboard, Star, Copy, Trash2 } from "lucide-react";
import type { FilterOptions } from "../types";
import type { DashboardProfile } from "../contexts/DashboardContext";
import { AutoRefreshControl } from "./AutoRefreshControl";

export type TimePreset = "last15m" | "last1h" | "last24h" | "last7d" | "last30d" | "all" | "custom";

const PRESETS: { key: TimePreset; label: string; desc: string }[] = [
  { key: "last15m", label: "15 min", desc: "Last 15 minutes" },
  { key: "last1h", label: "1 hour", desc: "Last 1 hour" },
  { key: "last24h", label: "24 hours", desc: "Last 24 hours" },
  { key: "last7d", label: "7 days", desc: "Last 7 days" },
  { key: "last30d", label: "30 days", desc: "Last 30 days" },
  { key: "all", label: "All time", desc: "No time filter" },
];

export function presetToRange(preset: TimePreset): { start: string; end: string } {
  if (preset === "all") return { start: "", end: "" };
  if (preset === "custom") return { start: "", end: "" };
  const now = new Date();
  const ms: Record<string, number> = {
    last15m: 15 * 60_000,
    last1h: 3600_000,
    last24h: 86400_000,
    last7d: 7 * 86400_000,
    last30d: 30 * 86400_000,
  };
  const startDate = new Date(now.getTime() - (ms[preset] ?? 86400_000));
  // Short presets (< 24h) → full ISO datetime for precision
  // Longer presets → date-only (YYYY-MM-DD) for day-level grouping
  const useDateTime = preset === "last15m" || preset === "last1h";
  const start = useDateTime ? startDate.toISOString() : startDate.toISOString().slice(0, 10);
  const end = useDateTime ? now.toISOString() : now.toISOString().slice(0, 10);
  return { start, end };
}

function presetLabel(preset: TimePreset): string {
  if (preset === "custom") return "Custom Range";
  return PRESETS.find(p => p.key === preset)?.desc ?? "Last 24 hours";
}

interface Props {
  filters: { start: string; end: string; customer: string };
  onApply: (filters: { start: string; end: string; customer: string }) => void;
  filterOptions: FilterOptions | null;
  editMode: boolean;
  onToggleEdit: () => void;
  onAddWidget: () => void;
  onReset: () => void;
  /* Profile props */
  profiles: DashboardProfile[];
  activeProfileId: string | null;
  onSwitchProfile: (id: string) => void;
  onSetAsDefault: () => void;
  onSaveToNewProfile: (name: string) => void;
  onDeleteProfile: (id: string) => void;
  onRefresh: () => void;
}

const inputCls = `rounded-lg px-3 py-1.5 text-xs focus:outline-none transition-colors duration-200 theme-input`;

export function FilterBar({ filters, onApply, filterOptions, editMode, onToggleEdit, onAddWidget, onReset, profiles, activeProfileId, onSwitchProfile, onSetAsDefault, onSaveToNewProfile, onDeleteProfile, onRefresh }: Props) {
  const [preset, setPreset] = useState<TimePreset>("last24h");
  const [draft, setDraft] = useState(filters);
  const [dirty, setDirty] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [showSaveNew, setShowSaveNew] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setTimeOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
        setShowSaveNew(false);
        setNewProfileName("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keep draft in sync when parent filters change
  useEffect(() => { setDraft(filters); }, [filters.start, filters.end, filters.customer]);

  const selectPreset = (p: TimePreset) => {
    setPreset(p);
    if (p !== "custom") {
      const range = presetToRange(p);
      const next = { ...draft, start: range.start, end: range.end };
      setDraft(next);
      onApply(next);
      setDirty(false);
      setTimeOpen(false);
    }
  };

  const handleDraftChange = (key: string, value: string) => {
    if (key === "start" || key === "end") setPreset("custom");
    setDraft(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleApply = () => {
    onApply(draft);
    setDirty(false);
    setTimeOpen(false);
  };

  return (
    <div className="rounded-xl px-2 sm:px-3 py-2 animate-fade-in-up" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-card-border)" }}>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {/* ── Time Range Dropdown ── */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setTimeOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all"
            style={{
              borderColor: timeOpen ? "var(--theme-accent)" : "var(--theme-surface-border)",
              color: "var(--theme-text-secondary)",
              backgroundColor: timeOpen ? "color-mix(in srgb, var(--theme-accent) 8%, transparent)" : "transparent",
            }}
          >
            <Clock className="w-3.5 h-3.5" style={{ color: "var(--theme-accent)" }} />
            <span>{presetLabel(preset)}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${timeOpen ? "rotate-180" : ""}`} style={{ color: "var(--theme-text-muted)" }} />
          </button>

          {/* Dropdown Panel */}
          {timeOpen && (
            <div
              className="absolute top-full left-0 mt-1.5 rounded-xl shadow-2xl z-50 w-72 overflow-hidden animate-fade-in-up"
              style={{
                backgroundColor: "var(--theme-card-bg)",
                border: "1px solid var(--theme-card-border)",
              }}
            >
              {/* Presets */}
              <div className="p-2 grid grid-cols-3 gap-1">
                {PRESETS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => selectPreset(p.key)}
                    className="px-2.5 py-2 text-[11px] font-medium rounded-lg transition-all text-center"
                    style={preset === p.key
                      ? { backgroundColor: "var(--theme-accent)", color: "#fff" }
                      : { backgroundColor: "color-mix(in srgb, var(--theme-surface-border) 20%, transparent)", color: "var(--theme-text-muted)" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="mx-3 h-px" style={{ backgroundColor: "var(--theme-surface-border)" }} />

              {/* Custom Range */}
              <div className="p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                  Custom Range
                </p>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--theme-text-muted)" }} />
                  <input
                    type="date"
                    value={draft.start}
                    onChange={e => handleDraftChange("start", e.target.value)}
                    className={inputCls + " flex-1 min-w-0"}
                    title="Start date"
                  />
                  <span className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>to</span>
                  <input
                    type="date"
                    value={draft.end}
                    onChange={e => handleDraftChange("end", e.target.value)}
                    className={inputCls + " flex-1 min-w-0"}
                    title="End date"
                  />
                </div>
                {dirty && preset === "custom" && (
                  <button
                    onClick={handleApply}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
                    style={{ backgroundColor: "var(--theme-accent)", color: "#fff" }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Apply Range
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Separator ── */}
        <div className="h-5 w-px hidden sm:block" style={{ backgroundColor: "var(--theme-surface-border)" }} />

        {/* ── Customer Select ── */}
        <div className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5" style={{ color: "var(--theme-text-muted)" }} />
          <select
            value={draft.customer}
            onChange={e => {
              const next = { ...draft, customer: e.target.value };
              setDraft(next);
              onApply(next);
              setDirty(false);
            }}
            className={inputCls}
          >
            <option value="">All Customers</option>
            {filterOptions?.customers.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* ── Separator ── */}
        <div className="h-5 w-px hidden sm:block" style={{ backgroundColor: "var(--theme-surface-border)" }} />

        {/* ── Auto Refresh ── */}
        <AutoRefreshControl onRefresh={onRefresh} />

        {/* ── Spacer ── */}
        <div className="flex-1" />

        {/* ── Profile Selector ── */}
        <div className="relative hidden sm:block" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all"
            style={{
              borderColor: profileOpen ? "var(--theme-accent)" : "var(--theme-surface-border)",
              color: "var(--theme-text-secondary)",
              backgroundColor: profileOpen ? "color-mix(in srgb, var(--theme-accent) 8%, transparent)" : "transparent",
            }}
          >
            <LayoutDashboard className="w-3.5 h-3.5" style={{ color: "var(--theme-accent)" }} />
            <span className="max-w-[100px] truncate">{activeProfile?.name ?? "Default"}</span>
            {activeProfile?.isDefault && <Star className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "var(--theme-accent)", fill: "var(--theme-accent)" }} />}
            <ChevronDown className={`w-3 h-3 transition-transform ${profileOpen ? "rotate-180" : ""}`} style={{ color: "var(--theme-text-muted)" }} />
          </button>

          {profileOpen && (
            <div
              className="absolute top-full right-0 mt-1.5 rounded-xl shadow-2xl z-50 w-64 overflow-hidden animate-fade-in-up"
              style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-card-border)" }}
            >
              <div className="p-2 space-y-0.5 max-h-52 overflow-y-auto">
                {profiles.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { onSwitchProfile(p.id); setProfileOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-all text-left group"
                    style={{
                      backgroundColor: p.id === activeProfileId ? "color-mix(in srgb, var(--theme-accent) 12%, transparent)" : "transparent",
                      color: p.id === activeProfileId ? "var(--theme-accent)" : "var(--theme-text-secondary)",
                    }}
                  >
                    <LayoutDashboard className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.isDefault && <Star className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "var(--theme-accent)", fill: "var(--theme-accent)" }} />}
                    {!p.isDefault && profiles.length > 1 && (
                      <span
                        onClick={(e) => { e.stopPropagation(); onDeleteProfile(p.id); }}
                        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded transition-opacity"
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="mx-2 h-px" style={{ backgroundColor: "var(--theme-surface-border)" }} />

              {/* Save to New Profile */}
              <div className="p-2">
                {!showSaveNew ? (
                  <button
                    onClick={() => setShowSaveNew(true)}
                    className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors"
                    style={{ color: "var(--theme-text-muted)" }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Save to New Profile
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newProfileName}
                      onChange={e => setNewProfileName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && newProfileName.trim()) {
                          onSaveToNewProfile(newProfileName.trim());
                          setNewProfileName("");
                          setShowSaveNew(false);
                          setProfileOpen(false);
                        }
                      }}
                      placeholder="Profile name…"
                      autoFocus
                      className="flex-1 px-2.5 py-1.5 text-xs rounded-md outline-none min-w-0"
                      style={{
                        backgroundColor: "var(--theme-surface-base)",
                        color: "var(--theme-text-primary)",
                        border: "1px solid var(--theme-surface-border)",
                      }}
                    />
                    <button
                      onClick={() => {
                        if (newProfileName.trim()) {
                          onSaveToNewProfile(newProfileName.trim());
                          setNewProfileName("");
                          setShowSaveNew(false);
                          setProfileOpen(false);
                        }
                      }}
                      disabled={!newProfileName.trim()}
                      className="p-1.5 rounded-md transition-colors disabled:opacity-30"
                      style={{ backgroundColor: "var(--theme-accent)", color: "#fff" }}
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-4 w-px hidden sm:block" style={{ backgroundColor: "var(--theme-surface-border)" }} />

        {/* ── Edit Dashboard Controls ── */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {editMode && (
            <>
              <button
                onClick={onAddWidget}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add</span>
              </button>
              <button
                onClick={onSetAsDefault}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                style={{
                  borderColor: activeProfile?.isDefault ? "var(--theme-accent)" : "var(--theme-surface-border)",
                  color: activeProfile?.isDefault ? "var(--theme-accent)" : "var(--theme-text-muted)",
                  backgroundColor: activeProfile?.isDefault ? "color-mix(in srgb, var(--theme-accent) 10%, transparent)" : "transparent",
                }}
                title="Set current layout as default profile"
              >
                <Star className="w-3.5 h-3.5" style={activeProfile?.isDefault ? { fill: "var(--theme-accent)" } : {}} />
                <span className="hidden sm:inline">{activeProfile?.isDefault ? "Default" : "Set Default"}</span>
              </button>
              <button
                onClick={onReset}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                style={{ borderColor: "var(--theme-surface-border)", color: "var(--theme-text-muted)" }}
                title="Reset to factory layout"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <div className="h-4 w-px" style={{ backgroundColor: "var(--theme-surface-border)" }} />
            </>
          )}
          <button
            onClick={onToggleEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all border"
            style={{
              borderColor: editMode ? "var(--theme-accent)" : "var(--theme-surface-border)",
              color: editMode ? "#fff" : "var(--theme-text-muted)",
              backgroundColor: editMode ? "var(--theme-accent)" : "transparent",
            }}
          >
            {editMode ? (
              <><Check className="w-3.5 h-3.5" /> Done</>
            ) : (
              <><Pencil className="w-3.5 h-3.5" /> Edit</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
