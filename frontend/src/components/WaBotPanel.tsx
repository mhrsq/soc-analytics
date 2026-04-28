import { useState, useEffect } from "react";
import {
  X,
  MessageSquare,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Loader2,
  Play,
} from "lucide-react";
import { api } from "../api/client";
import type {
  WaBotConfig,
  WaAnalystMapping,
  WaStreak,
  WaMessageLog,
} from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

const MODE_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "normal", label: "Normal" },
  { value: "kind", label: "Very Kind" },
  { value: "toxic", label: "Toxic" },
];

function toneBadge(tone: string): { bg: string; label: string } {
  switch (tone) {
    case "praise":
      return { bg: "#10b981", label: "Praise" };
    case "normal":
      return { bg: "var(--theme-accent)", label: "Normal" };
    case "kind":
      return { bg: "#f59e0b", label: "Kind" };
    case "toxic":
      return { bg: "#ef4444", label: "Toxic" };
    default:
      return { bg: "var(--theme-accent)", label: tone };
  }
}

function streakColor(count: number): string {
  if (count === 0) return "#10b981";
  if (count === 1) return "#f59e0b";
  if (count === 2) return "#f97316";
  return "#ef4444";
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export function WaBotPanel({ open, onClose }: Props) {
  const [config, setConfig] = useState<WaBotConfig | null>(null);
  const [mappings, setMappings] = useState<WaAnalystMapping[]>([]);
  const [technicians, setTechnicians] = useState<string[]>([]);
  const [streaks, setStreaks] = useState<WaStreak[]>([]);
  const [logs, setLogs] = useState<WaMessageLog[]>([]);
  const [activeTab, setActiveTab] = useState<"settings" | "analytics">("settings");
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  // Add form state
  const [addForm, setAddForm] = useState({ technician: "", phone: "", mode_override: "" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingMapping, setAddingMapping] = useState(false);

  // Test send state
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Config editing state (pending save)
  const [pendingConfig, setPendingConfig] = useState<Partial<WaBotConfig>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadAll();
  }, [open]);

  async function loadAll() {
    setLoading(true);
    setSaveError(null);
    setPendingConfig({});
    setTriggerMsg(null);
    setTestResult(null);
    try {
      const [cfg, maps, techs, stks, lgz] = await Promise.allSettled([
        api.getWaBotConfig(),
        api.getWaMappings(),
        api.getWaTechnicians(),
        api.getWaStreaks(),
        api.getWaLogs(20),
      ]);
      if (cfg.status === "fulfilled") setConfig(cfg.value);
      if (maps.status === "fulfilled") setMappings(maps.value);
      if (techs.status === "fulfilled") setTechnicians(techs.value);
      if (stks.status === "fulfilled") setStreaks(stks.value);
      if (lgz.status === "fulfilled") setLogs(lgz.value);
    } finally {
      setLoading(false);
    }
  }

  async function toggleEnabled() {
    if (!config) return;
    const next = !config.enabled;
    setConfig({ ...config, enabled: next });
    try {
      await api.updateWaBotConfig({ enabled: next });
    } catch (e) {
      setConfig({ ...config, enabled: !next });
      setSaveError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleSaveConfig() {
    if (!config || Object.keys(pendingConfig).length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateWaBotConfig(pendingConfig);
      setConfig({ ...config, ...pendingConfig });
      setPendingConfig({});
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function patchPending<K extends keyof WaBotConfig>(key: K, value: WaBotConfig[K]) {
    setPendingConfig((prev) => ({ ...prev, [key]: value }));
    if (config) setConfig({ ...config, [key]: value });
  }

  async function handleAddMapping() {
    if (!addForm.technician || !addForm.phone) return;
    setAddingMapping(true);
    try {
      await api.createWaMapping({
        technician: addForm.technician,
        phone: addForm.phone,
        mode_override: addForm.mode_override || undefined,
      });
      setAddForm({ technician: "", phone: "", mode_override: "" });
      setShowAddForm(false);
      const updated = await api.getWaMappings();
      setMappings(updated);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to add mapping");
    } finally {
      setAddingMapping(false);
    }
  }

  async function handleDeleteMapping(id: number) {
    try {
      await api.deleteWaMapping(id);
      setMappings((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to delete mapping");
    }
  }

  async function handleTrigger() {
    setTriggering(true);
    setTriggerMsg(null);
    try {
      const res = await api.triggerWaBot();
      setTriggerMsg(res.message || "Bot triggered successfully");
    } catch (e) {
      setTriggerMsg(e instanceof Error ? e.message : "Trigger failed");
    } finally {
      setTriggering(false);
    }
  }

  async function handleTestSend() {
    if (!testPhone) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await api.testWaSend(testPhone);
      setTestResult(`Status: ${res.status_code} — ${res.body}`);
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setTestSending(false);
    }
  }

  if (!open) return null;

  const hasPendingConfig = Object.keys(pendingConfig).length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex justify-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md h-full flex flex-col shadow-2xl animate-fade-in-up overflow-hidden"
        style={{
          backgroundColor: "var(--theme-surface-raised)",
          borderLeft: "1px solid var(--theme-surface-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--theme-surface-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>
              WhatsApp Bot
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: "var(--theme-text-muted)" }}
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Strip */}
        <div
          className="flex flex-shrink-0 px-5"
          style={{ borderBottom: "1px solid var(--theme-surface-border)" }}
        >
          {(["settings", "analytics"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="py-2.5 px-3 text-xs font-medium capitalize transition-colors border-b-2 -mb-px"
              style={{
                borderBottomColor:
                  activeTab === tab ? "var(--theme-accent)" : "transparent",
                color:
                  activeTab === tab
                    ? "var(--theme-accent)"
                    : "var(--theme-text-muted)",
              }}
            >
              {tab === "settings" ? "Settings" : "Analytics"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2
                className="w-6 h-6 animate-spin"
                style={{ color: "var(--theme-text-muted)" }}
              />
            </div>
          ) : activeTab === "settings" ? (
            <SettingsTab
              config={config}
              mappings={mappings}
              technicians={technicians}
              showToken={showToken}
              onToggleToken={() => setShowToken((v) => !v)}
              onToggleEnabled={toggleEnabled}
              onPatch={patchPending}
              hasPendingConfig={hasPendingConfig}
              saving={saving}
              onSave={handleSaveConfig}
              saveError={saveError}
              addForm={addForm}
              onAddFormChange={(k, v) => setAddForm((f) => ({ ...f, [k]: v }))}
              showAddForm={showAddForm}
              onToggleAddForm={() => setShowAddForm((v) => !v)}
              addingMapping={addingMapping}
              onAddMapping={handleAddMapping}
              onDeleteMapping={handleDeleteMapping}
              testPhone={testPhone}
              onTestPhoneChange={setTestPhone}
              testSending={testSending}
              testResult={testResult}
              onTestSend={handleTestSend}
            />
          ) : (
            <AnalyticsTab
              streaks={streaks}
              logs={logs}
              triggering={triggering}
              triggerMsg={triggerMsg}
              onTrigger={handleTrigger}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Settings Tab ────────────────────────────────────────────────────────────

interface SettingsTabProps {
  config: WaBotConfig | null;
  mappings: WaAnalystMapping[];
  technicians: string[];
  showToken: boolean;
  onToggleToken: () => void;
  onToggleEnabled: () => void;
  onPatch: <K extends keyof WaBotConfig>(key: K, value: WaBotConfig[K]) => void;
  hasPendingConfig: boolean;
  saving: boolean;
  onSave: () => void;
  saveError: string | null;
  addForm: { technician: string; phone: string; mode_override: string };
  onAddFormChange: (key: "technician" | "phone" | "mode_override", value: string) => void;
  showAddForm: boolean;
  onToggleAddForm: () => void;
  addingMapping: boolean;
  onAddMapping: () => void;
  onDeleteMapping: (id: number) => void;
  testPhone: string;
  onTestPhoneChange: (v: string) => void;
  testSending: boolean;
  testResult: string | null;
  onTestSend: () => void;
}

function SettingsTab({
  config,
  mappings,
  technicians,
  showToken,
  onToggleToken,
  onToggleEnabled,
  onPatch,
  hasPendingConfig,
  saving,
  onSave,
  saveError,
  addForm,
  onAddFormChange,
  showAddForm,
  onToggleAddForm,
  addingMapping,
  onAddMapping,
  onDeleteMapping,
  testPhone,
  onTestPhoneChange,
  testSending,
  testResult,
  onTestSend,
}: SettingsTabProps) {
  const labelStyle = { color: "var(--theme-text-primary)" };
  const mutedStyle = { color: "var(--theme-text-muted)" };
  const inputClass =
    "w-full px-2.5 py-1.5 rounded text-xs outline-none focus:ring-1";
  const inputStyle = {
    background: "var(--theme-surface-base)",
    border: "1px solid var(--theme-surface-border)",
    color: "var(--theme-text-primary)",
  };

  if (!config) {
    return (
      <div className="text-center py-10 text-xs" style={mutedStyle}>
        Config not available — backend endpoint may not be deployed yet.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Section 1 — Bot Control */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--theme-text-muted)" }}>
          Bot Control
        </p>
        <div
          className="flex items-center justify-between p-3 rounded-lg"
          style={{
            background: "var(--theme-surface-base)",
            border: "1px solid var(--theme-surface-border)",
          }}
        >
          <div>
            <p className="text-sm font-medium" style={labelStyle}>
              Bot Status
            </p>
            <p className="text-xs" style={mutedStyle}>
              Send daily WA reminders at {config.schedule_hour}:00 WIB
            </p>
          </div>
          <button
            onClick={onToggleEnabled}
            className="w-10 h-5 rounded-full transition-colors flex-shrink-0"
            style={{
              background: config.enabled
                ? "var(--theme-accent)"
                : "var(--theme-surface-border)",
            }}
            aria-label={config.enabled ? "Disable bot" : "Enable bot"}
          >
            <div
              className="w-4 h-4 bg-white rounded-full transition-transform"
              style={{
                transform: config.enabled ? "translateX(20px)" : "translateX(2px)",
                margin: "2px",
              }}
            />
          </button>
        </div>
      </div>

      {/* Section 2 — API Configuration */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--theme-text-muted)" }}>
          API Configuration
        </p>
        <div className="space-y-3 p-3 rounded-lg" style={{ background: "var(--theme-surface-base)", border: "1px solid var(--theme-surface-border)" }}>
          {/* Fonnte Token */}
          <div>
            <label className="block text-xs mb-1 font-medium" style={labelStyle}>
              Fonnte Token
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                className={inputClass + " pr-8"}
                style={inputStyle}
                value={config.fonnte_token ?? ""}
                onChange={(e) => onPatch("fonnte_token", e.target.value)}
                onBlur={onSave}
                placeholder="Enter Fonnte API token"
              />
              <button
                type="button"
                onClick={onToggleToken}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                style={mutedStyle}
                aria-label="Toggle token visibility"
              >
                {showToken ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Schedule Hour */}
          <div>
            <label className="block text-xs mb-1 font-medium" style={labelStyle}>
              Send at HH:00 WIB
            </label>
            <input
              type="number"
              min={0}
              max={23}
              className={inputClass}
              style={inputStyle}
              value={config.schedule_hour}
              onChange={(e) => onPatch("schedule_hour", Number(e.target.value))}
              onBlur={onSave}
            />
          </div>

          {/* SLA Target */}
          <div>
            <label className="block text-xs mb-1 font-medium" style={labelStyle}>
              SLA Target (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              className={inputClass}
              style={inputStyle}
              value={config.sla_target_pct}
              onChange={(e) => onPatch("sla_target_pct", Number(e.target.value))}
              onBlur={onSave}
            />
          </div>

          {/* Min Tickets */}
          <div>
            <label className="block text-xs mb-1 font-medium" style={labelStyle}>
              Skip if tickets &lt; N
            </label>
            <input
              type="number"
              min={0}
              className={inputClass}
              style={inputStyle}
              value={config.min_tickets_threshold}
              onChange={(e) => onPatch("min_tickets_threshold", Number(e.target.value))}
              onBlur={onSave}
            />
          </div>

          {saveError && (
            <p className="text-xs text-red-400">{saveError}</p>
          )}

          <button
            onClick={onSave}
            disabled={!hasPendingConfig || saving}
            className="w-full py-1.5 rounded text-xs font-medium transition-opacity disabled:opacity-40"
            style={{
              background: "var(--theme-accent)",
              color: "var(--theme-surface-base)",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Section 3 — Escalation */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--theme-text-muted)" }}>
          Escalation
        </p>
        <div className="space-y-3 p-3 rounded-lg" style={{ background: "var(--theme-surface-base)", border: "1px solid var(--theme-surface-border)" }}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-[var(--theme-accent)]"
              checked={config.escalation_auto}
              onChange={(e) => onPatch("escalation_auto", e.target.checked)}
              onBlur={onSave}
            />
            <span className="text-xs font-medium" style={labelStyle}>
              Auto escalation based on streak
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs mb-1" style={mutedStyle}>
                Day {config.streak_threshold_kind}+ streak → Very Kind
              </label>
              <input
                type="number"
                min={1}
                className={inputClass}
                style={inputStyle}
                value={config.streak_threshold_kind}
                onChange={(e) => onPatch("streak_threshold_kind", Number(e.target.value))}
                onBlur={onSave}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={mutedStyle}>
                Day {config.streak_threshold_toxic}+ streak → Toxic
              </label>
              <input
                type="number"
                min={1}
                className={inputClass}
                style={inputStyle}
                value={config.streak_threshold_toxic}
                onChange={(e) => onPatch("streak_threshold_toxic", Number(e.target.value))}
                onBlur={onSave}
              />
            </div>
          </div>
          <button
            onClick={onSave}
            disabled={!hasPendingConfig || saving}
            className="w-full py-1.5 rounded text-xs font-medium transition-opacity disabled:opacity-40"
            style={{
              background: "var(--theme-accent)",
              color: "var(--theme-surface-base)",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Section 4 — Analyst Mappings */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--theme-text-muted)" }}>
          Analyst Mappings
        </p>
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--theme-surface-border)" }}
        >
          {/* Table header */}
          <div
            className="grid grid-cols-[1fr_1fr_80px_32px] gap-2 px-3 py-2 text-[10px] font-semibold uppercase"
            style={{
              background: "var(--theme-surface-base)",
              color: "var(--theme-text-muted)",
              borderBottom: "1px solid var(--theme-surface-border)",
            }}
          >
            <span>Analyst</span>
            <span>WA Number</span>
            <span>Mode</span>
            <span />
          </div>

          {mappings.length === 0 ? (
            <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--theme-text-muted)" }}>
              No mappings yet
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--theme-surface-border)" }}>
              {mappings.map((m) => (
                <div
                  key={m.id}
                  className="grid grid-cols-[1fr_1fr_80px_32px] gap-2 px-3 py-2 items-center text-xs"
                  style={{ color: "var(--theme-text-primary)" }}
                >
                  <span className="truncate">{m.technician}</span>
                  <span className="truncate font-mono text-[10px]" style={{ color: "var(--theme-text-muted)" }}>
                    {m.phone}
                  </span>
                  <span className="truncate capitalize" style={{ color: "var(--theme-text-secondary)" }}>
                    {m.mode_override || "Auto"}
                  </span>
                  <button
                    onClick={() => onDeleteMapping(m.id)}
                    className="p-1 rounded hover:opacity-70 transition-opacity flex items-center justify-center"
                    style={{ color: "#ef4444" }}
                    aria-label="Delete mapping"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add form */}
          {showAddForm && (
            <div
              className="px-3 py-3 space-y-2"
              style={{ borderTop: "1px solid var(--theme-surface-border)", background: "var(--theme-surface-base)" }}
            >
              <div className="flex gap-2">
                <select
                  className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                  style={inputStyle}
                  value={addForm.technician}
                  onChange={(e) => onAddFormChange("technician", e.target.value)}
                >
                  <option value="">Select analyst</option>
                  {technicians.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="628xxxxxxxxxx"
                  className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                  style={inputStyle}
                  value={addForm.phone}
                  onChange={(e) => onAddFormChange("phone", e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <select
                  className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                  style={inputStyle}
                  value={addForm.mode_override}
                  onChange={(e) => onAddFormChange("mode_override", e.target.value)}
                >
                  {MODE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <button
                  onClick={onAddMapping}
                  disabled={addingMapping || !addForm.technician || !addForm.phone}
                  className="px-3 py-1.5 rounded text-xs font-medium transition-opacity disabled:opacity-40"
                  style={{ background: "var(--theme-accent)", color: "var(--theme-surface-base)" }}
                >
                  {addingMapping ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          )}

          {/* Add / Cancel button */}
          <div
            className="px-3 py-2"
            style={{ borderTop: "1px solid var(--theme-surface-border)", background: "var(--theme-surface-base)" }}
          >
            <button
              onClick={onToggleAddForm}
              className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--theme-accent)" }}
            >
              {showAddForm ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Add Mapping
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Section 5 — Test Send */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--theme-text-muted)" }}>
          Test Send
        </p>
        <div className="p-3 rounded-lg space-y-2" style={{ background: "var(--theme-surface-base)", border: "1px solid var(--theme-surface-border)" }}>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="628xxxxxxxxxx"
              className="flex-1 px-2.5 py-1.5 rounded text-xs outline-none"
              style={inputStyle}
              value={testPhone}
              onChange={(e) => onTestPhoneChange(e.target.value)}
            />
            <button
              onClick={onTestSend}
              disabled={testSending || !testPhone}
              className="px-3 py-1.5 rounded text-xs font-medium transition-opacity disabled:opacity-40 flex items-center gap-1.5"
              style={{ background: "var(--theme-accent)", color: "var(--theme-surface-base)" }}
            >
              {testSending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : null}
              {testSending ? "Sending…" : "Send Test"}
            </button>
          </div>
          {testResult && (
            <p className="text-[10px] font-mono break-all" style={{ color: "var(--theme-text-muted)" }}>
              {testResult}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Analytics Tab ────────────────────────────────────────────────────────────

interface AnalyticsTabProps {
  streaks: WaStreak[];
  logs: WaMessageLog[];
  triggering: boolean;
  triggerMsg: string | null;
  onTrigger: () => void;
}

function AnalyticsTab({ streaks, logs, triggering, triggerMsg, onTrigger }: AnalyticsTabProps) {
  const mutedStyle = { color: "var(--theme-text-muted)" };

  return (
    <div className="space-y-5">
      {/* Streak Overview */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={mutedStyle}>
          Streak Overview
        </p>
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--theme-surface-border)" }}
        >
          <div
            className="grid grid-cols-[1fr_80px_60px_80px] gap-2 px-3 py-2 text-[10px] font-semibold uppercase"
            style={{
              background: "var(--theme-surface-base)",
              color: "var(--theme-text-muted)",
              borderBottom: "1px solid var(--theme-surface-border)",
            }}
          >
            <span>Analyst</span>
            <span>SLA Yesterday</span>
            <span>Streak</span>
            <span>Mode</span>
          </div>
          {streaks.length === 0 ? (
            <div className="px-3 py-4 text-xs text-center" style={mutedStyle}>
              No streak data available
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--theme-surface-border)" }}>
              {streaks.map((s) => (
                <div
                  key={s.technician}
                  className="grid grid-cols-[1fr_80px_60px_80px] gap-2 px-3 py-2 items-center text-xs"
                  style={{ color: "var(--theme-text-primary)" }}
                >
                  <span className="truncate">{s.technician}</span>
                  <span style={mutedStyle}>
                    {s.last_sla_pct !== null ? `${s.last_sla_pct.toFixed(1)}%` : "—"}
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: streakColor(s.streak_count) }}
                  >
                    {s.streak_count}
                  </span>
                  <span style={mutedStyle} className="capitalize">
                    {s.streak_count === 0
                      ? "Normal"
                      : s.streak_count === 1
                      ? "Kind"
                      : s.streak_count >= 2
                      ? "Toxic"
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Messages */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={mutedStyle}>
          Recent Messages (last 20)
        </p>
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--theme-surface-border)" }}
        >
          {logs.length === 0 ? (
            <div className="px-3 py-6 text-xs text-center" style={mutedStyle}>
              No messages sent yet
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--theme-surface-border)" }}>
              {logs.map((log) => {
                const tone = toneBadge(log.tone);
                const isOk = log.status === "sent" || log.status === "ok";
                return (
                  <div
                    key={log.id}
                    className="px-3 py-2 space-y-1"
                    style={{ background: "var(--theme-surface-base)" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono" style={mutedStyle}>
                        {fmtTime(log.sent_at)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {/* Tone badge */}
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{ background: tone.bg + "22", color: tone.bg }}
                        >
                          {tone.label}
                        </span>
                        {/* Status badge */}
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{
                            background: isOk ? "#10b98122" : "#ef444422",
                            color: isOk ? "#10b981" : "#ef4444",
                          }}
                        >
                          {log.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium" style={{ color: "var(--theme-text-primary)" }}>
                        {log.technician}
                      </span>
                      <span style={mutedStyle}>
                        SLA {log.sla_pct.toFixed(1)}% · streak {log.streak_count}
                      </span>
                    </div>
                    <p
                      className="text-[10px] truncate"
                      style={mutedStyle}
                      title={log.message_preview}
                    >
                      {log.message_preview}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Trigger */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={mutedStyle}>
          Manual Trigger
        </p>
        <div
          className="p-3 rounded-lg space-y-2"
          style={{
            background: "var(--theme-surface-base)",
            border: "1px solid var(--theme-surface-border)",
          }}
        >
          <button
            onClick={onTrigger}
            disabled={triggering}
            className="flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-opacity disabled:opacity-50"
            style={{ background: "var(--theme-accent)", color: "var(--theme-surface-base)" }}
          >
            {triggering ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {triggering ? "Running…" : "Run Now"}
          </button>
          {triggerMsg && (
            <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
              {triggerMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
