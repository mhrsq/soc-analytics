import { useState } from "react";
import {
  Building2,
  ChevronDown,
  LayoutDashboard,
  Star,
  Copy,
  Trash2,
  FileText,
  Sparkles,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";
import { ConfirmDialog } from "../ConfirmDialog";
import { PERIOD_OPTIONS } from "./helpers";

export function CustomerToolbar({
  customer,
  onCustomerChange,
  periodDays,
  onPeriodChange,
  customers,
  editMode,
  onToggleEdit,
  onAddWidget,
  onReset,
  profiles,
  activeProfileId,
  onSwitchProfile,
  onSetAsDefault,
  onSaveToNewProfile,
  onDeleteProfile,
  locked,
  onAiAnalysis,
  aiLoading,
  onMonthlyReport,
}: {
  customer: string;
  onCustomerChange: (v: string) => void;
  periodDays: number;
  onPeriodChange: (v: number) => void;
  customers: string[];
  editMode: boolean;
  onToggleEdit: () => void;
  onAddWidget: () => void;
  onReset: () => void;
  profiles: { id: string; name: string; isDefault: boolean }[];
  activeProfileId: string | null;
  onSwitchProfile: (id: string) => void;
  onSetAsDefault: () => void;
  onSaveToNewProfile: (name: string) => void;
  onDeleteProfile: (id: string) => void;
  locked?: boolean;
  onAiAnalysis?: () => void;
  aiLoading?: boolean;
  onMonthlyReport?: () => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [showSaveNew, setShowSaveNew] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState(false);

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 12%, transparent)" }}>
          <Building2 className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--theme-text-primary)" }}>{customer}</h2>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>Operations Dashboard</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Customer switch */}
        {locked ? (
          <span className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ color: "var(--theme-text-secondary)" }}>
            {customer}
          </span>
        ) : (
          <div className="relative">
            <select
              value={customer}
              onChange={(e) => onCustomerChange(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
                color: "var(--theme-text-secondary)",
                border: "1px solid var(--theme-surface-border)",
              }}
            >
              <option value="">Select Customer...</option>
              {customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--theme-text-muted)" }} />
          </div>
        )}

        {/* Period selector */}
        <div className="relative">
          <select
            value={periodDays}
            onChange={(e) => onPeriodChange(Number(e.target.value))}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{
              backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
              color: "var(--theme-text-secondary)",
              border: "1px solid var(--theme-surface-border)",
            }}
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.days} value={p.days}>{p.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--theme-text-muted)" }} />
        </div>

        {/* Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
              color: "var(--theme-text-secondary)",
              border: "1px solid var(--theme-surface-border)",
            }}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{activeProfile?.name || "Default"}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {profileOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-56 rounded-lg shadow-lg z-50 py-1"
              style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-card-border)" }}
            >
              {profiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onSwitchProfile(p.id); setProfileOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:opacity-80"
                  style={{ color: p.id === activeProfileId ? "var(--theme-accent)" : "var(--theme-text-secondary)" }}
                >
                  {p.isDefault && <Star className="w-3 h-3" style={{ color: "#F59E0B" }} />}
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.id === activeProfileId && <span className="text-[10px] px-1 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)" }}>active</span>}
                </button>
              ))}
              <div className="border-t my-1" style={{ borderColor: "var(--theme-surface-border)" }} />
              <button
                onClick={() => { onSetAsDefault(); setProfileOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
                style={{ color: "var(--theme-text-muted)" }}
              >
                <Star className="w-3 h-3 inline mr-1.5" />Set as Default
              </button>
              {!showSaveNew ? (
                <button
                  onClick={() => setShowSaveNew(true)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  <Copy className="w-3 h-3 inline mr-1.5" />Save as New Profile
                </button>
              ) : (
                <div className="px-3 py-1.5 flex gap-1">
                  <input
                    autoFocus
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
                    className="flex-1 px-2 py-1 rounded text-xs"
                    style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-surface-border)" }}
                    placeholder="Profile name..."
                  />
                </div>
              )}
              {profiles.length > 1 && (
                <button
                  onClick={() => { setProfileOpen(false); setConfirmDeleteProfile(true); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80 text-red-400"
                >
                  <Trash2 className="w-3 h-3 inline mr-1.5" />Delete Profile
                </button>
              )}
            </div>
          )}
        </div>

        <ConfirmDialog
          isOpen={confirmDeleteProfile}
          onConfirm={() => {
            onDeleteProfile(activeProfileId || "");
            setConfirmDeleteProfile(false);
          }}
          onCancel={() => setConfirmDeleteProfile(false)}
          title="Delete Profile"
          message="Delete this dashboard profile? This cannot be undone."
          confirmLabel="Delete"
          variant="danger"
        />

        {/* Monthly Report */}
        {onMonthlyReport && (
          <button
            onClick={onMonthlyReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
              color: "var(--theme-text-secondary)",
              border: "1px solid var(--theme-surface-border)",
            }}
          >
            <FileText className="w-3.5 h-3.5" />
            Report
          </button>
        )}

        {/* AI Analysis */}
        {onAiAnalysis && (
          <button
            onClick={onAiAnalysis}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
            style={{
              background: "color-mix(in srgb, var(--theme-accent) 12%, transparent)",
              color: "var(--theme-accent)",
              border: "1px solid color-mix(in srgb, var(--theme-accent) 25%, transparent)",
            }}
          >
            <Sparkles className={`w-3.5 h-3.5 ${aiLoading ? "animate-pulse" : ""}`} />
            {aiLoading ? "Generating..." : "AI Analysis"}
          </button>
        )}

        {/* Edit Mode */}
        <button
          onClick={onToggleEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            backgroundColor: editMode ? "color-mix(in srgb, var(--theme-accent) 20%, transparent)" : "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)",
            color: editMode ? "var(--theme-accent)" : "var(--theme-text-muted)",
            border: `1px solid ${editMode ? "var(--theme-accent)" : "var(--theme-surface-border)"}`,
          }}
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{editMode ? "Done" : "Edit"}</span>
        </button>

        {editMode && (
          <>
            <button
              onClick={onAddWidget}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)", color: "var(--theme-accent)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add</span>
            </button>
            <button
              onClick={onReset}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ color: "var(--theme-text-muted)" }}
              title="Reset to default layout"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
