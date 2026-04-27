import { useState, useEffect, useCallback } from "react";
import {
  X,
  Plus,
  Trash2,
  TestTube,
  Star,
  Check,
  AlertCircle,
  Loader2,
  Bot,
  Eye,
  EyeOff,
  Settings2,
} from "lucide-react";
import { api } from "../api/client";
import type { LlmProvider, LlmProviderCreate, LlmTestResult } from "../types";
import { ErrorAlert } from "./ErrorAlert";

const PROVIDERS = [
  { value: "openai", label: "OpenAI", placeholder: "gpt-4o, gpt-4.1, gpt-5.2" },
  { value: "anthropic", label: "Anthropic", placeholder: "claude-sonnet-4-20250514, claude-haiku-3" },
  { value: "xai", label: "xAI (Grok)", placeholder: "grok-3-fast, grok-3-mini" },
  { value: "google", label: "Google (Gemini)", placeholder: "gemini-2.5-flash" },
  { value: "openrouter", label: "OpenRouter", placeholder: "openai/gpt-4o" },
  { value: "9router", label: "9router", placeholder: "cc/claude-opus-4-6" },
] as const;

const DEFAULT_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  "9router": "http://localhost:20128/v1",
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LLMSettingsPanel({ open, onClose }: Props) {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; result: LlmTestResult } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getLlmProviders();
      setProviders(list);
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchProviders();
      setShowAdd(false);
      setTestResult(null);
    }
  }, [open, fetchProviders]);

  const handleTest = async (id: number) => {
    setTesting(id);
    setTestResult(null);
    try {
      const result = await api.testLlmProvider(id);
      setTestResult({ id, result });
      fetchProviders(); // refresh test_status
    } catch (err) {
      setTestResult({
        id,
        result: {
          success: false,
          message: err instanceof Error ? err.message : "Test failed",
          response_preview: null,
          latency_ms: null,
        },
      });
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (id: number) => {
    setOpError(null);
    setDeleting(id);
    try {
      await api.deleteLlmProvider(id);
      setProviders((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleSetDefault = async (id: number) => {
    setOpError(null);
    try {
      await api.updateLlmProvider(id, { is_default: true });
      fetchProviders();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Operation failed");
    }
  };

  const handleToggleActive = async (id: number, active: boolean) => {
    setOpError(null);
    try {
      await api.updateLlmProvider(id, { is_active: active });
      fetchProviders();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Operation failed");
    }
  };

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] flex justify-end" onClick={onClose}>
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
            <Settings2 className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>
              LLM Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: "var(--theme-text-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <ErrorAlert error={opError} className="mb-3" />
          {/* Providers list */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--theme-text-muted)" }} />
            </div>
          ) : providers.length === 0 && !showAdd ? (
            <div className="text-center py-10">
              <Bot className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--theme-text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
                No LLM providers configured
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--theme-text-muted)", opacity: 0.6 }}>
                Add a provider to enable AI insights
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {providers.map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  testing={testing === p.id}
                  deleting={deleting === p.id}
                  testResult={testResult?.id === p.id ? testResult.result : null}
                  onTest={() => handleTest(p.id)}
                  onDelete={() => handleDelete(p.id)}
                  onSetDefault={() => handleSetDefault(p.id)}
                  onToggleActive={(active) => handleToggleActive(p.id, active)}
                />
              ))}
            </div>
          )}

          {/* Add Form */}
          {showAdd && (
            <AddProviderForm
              onAdded={() => {
                setShowAdd(false);
                fetchProviders();
              }}
              onCancel={() => setShowAdd(false)}
            />
          )}
        </div>

        {/* Footer */}
        <div
          className="flex-shrink-0 px-5 py-3"
          style={{ borderTop: "1px solid var(--theme-surface-border)" }}
        >
          <button
            onClick={() => {
              setShowAdd(true);
              setTestResult(null);
            }}
            disabled={showAdd}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg
              transition-all disabled:opacity-40"
            style={{
              backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)",
              color: "var(--theme-accent)",
              border: "1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Provider
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Provider Card ─── */

function ProviderCard({
  provider: p,
  testing,
  deleting,
  testResult,
  onTest,
  onDelete,
  onSetDefault,
  onToggleActive,
}: {
  provider: LlmProvider;
  testing: boolean;
  deleting: boolean;
  testResult: LlmTestResult | null;
  onTest: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onToggleActive: (active: boolean) => void;
}) {
  const statusColor =
    p.test_status === "ok"
      ? "text-emerald-400"
      : p.test_status === "failed"
      ? "text-red-400"
      : "text-neutral-500";

  const providerLabel =
    PROVIDERS.find((x) => x.value === p.provider)?.label ?? p.provider;

  return (
    <div
      className="rounded-lg p-3.5 space-y-2.5"
      style={{
        backgroundColor: "var(--theme-surface-base)",
        border: `1px solid ${p.is_default ? "var(--theme-accent)" : "var(--theme-surface-border)"}`,
        opacity: p.is_active ? 1 : 0.5,
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate" style={{ color: "var(--theme-text-primary)" }}>
              {p.label}
            </span>
            {p.is_default && (
              <Star className="w-3 h-3 flex-shrink-0" style={{ color: "var(--theme-accent)", fill: "var(--theme-accent)" }} />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-mono" style={{ color: "var(--theme-text-muted)" }}>
              {providerLabel}
            </span>
            <span className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>•</span>
            <span className="text-[10px] font-mono" style={{ color: "var(--theme-text-muted)" }}>
              {p.model}
            </span>
          </div>
        </div>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor.replace("text-", "bg-")}`} title={p.test_status} />
      </div>

      {/* API key hint */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono" style={{ color: "var(--theme-text-muted)", opacity: 0.7 }}>
          Key: {p.api_key_hint}
        </span>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`p-2 rounded text-xs ${
            testResult.success
              ? "bg-emerald-500/10 border border-emerald-500/20"
              : "bg-red-500/10 border border-red-500/20"
          }`}
        >
          <div className="flex items-start gap-1.5">
            {testResult.success ? (
              <Check className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p style={{ color: testResult.success ? "#34d399" : "#f87171" }}>
                {testResult.message}
              </p>
              {testResult.response_preview && (
                <p className="mt-1 truncate" style={{ color: "var(--theme-text-muted)" }}>
                  "{testResult.response_preview}"
                </p>
              )}
              {testResult.latency_ms != null && (
                <p className="mt-0.5" style={{ color: "var(--theme-text-muted)", opacity: 0.6 }}>
                  {testResult.latency_ms}ms
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-1">
        <button
          onClick={onTest}
          disabled={testing || !p.is_active}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-all
            disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80"
          style={{
            backgroundColor: "color-mix(in srgb, var(--theme-accent) 10%, transparent)",
            color: "var(--theme-accent)",
            border: "1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent)",
          }}
        >
          {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
          Test
        </button>
        {!p.is_default && p.is_active && (
          <button
            onClick={onSetDefault}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md
              hover:opacity-80 transition-opacity"
            style={{ color: "var(--theme-text-muted)", border: "1px solid var(--theme-surface-border)" }}
          >
            <Star className="w-3 h-3" />
            Set Default
          </button>
        )}
        <button
          onClick={() => onToggleActive(!p.is_active)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md
            hover:opacity-80 transition-opacity"
          style={{ color: "var(--theme-text-muted)", border: "1px solid var(--theme-surface-border)" }}
        >
          {p.is_active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {p.is_active ? "Disable" : "Enable"}
        </button>
        <div className="flex-1" />
        <button
          onClick={onDelete}
          disabled={deleting}
          className="p-1.5 rounded-md text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all
            disabled:opacity-40"
        >
          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

/* ─── Add Provider Form ─── */

function AddProviderForm({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<LlmProviderCreate>({
    provider: "openai",
    label: "",
    model: "",
    api_key: "",
  });
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProvider = PROVIDERS.find((p) => p.value === form.provider);

  const handleSubmit = async () => {
    if (!form.label.trim() || !form.model.trim() || !form.api_key.trim()) {
      setError("All fields are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.addLlmProvider(form);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add provider");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    backgroundColor: "var(--theme-surface-base)",
    color: "var(--theme-text-primary)",
    border: "1px solid var(--theme-surface-border)",
  };

  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{
        backgroundColor: "var(--theme-surface-base)",
        border: "1px solid color-mix(in srgb, var(--theme-accent) 30%, var(--theme-surface-border))",
      }}
    >
      <p className="text-xs font-semibold" style={{ color: "var(--theme-text-primary)" }}>
        Add LLM Provider
      </p>

      {/* Provider select */}
      <div>
        <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--theme-text-muted)" }}>
          Provider
        </label>
        <select
          value={form.provider}
          onChange={(e) => {
            const newProvider = e.target.value as LlmProviderCreate["provider"];
            setForm((f) => ({
              ...f,
              provider: newProvider,
              base_url: DEFAULT_URLS[newProvider] || f.base_url || "",
            }));
          }}
          className="w-full px-3 py-2 text-xs rounded-md outline-none focus:ring-1"
          style={{ ...inputStyle, focusRingColor: "var(--theme-accent)" } as React.CSSProperties}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Label */}
      <div>
        <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--theme-text-muted)" }}>
          Display Label
        </label>
        <input
          type="text"
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          placeholder="e.g., GPT-4o Production"
          className="w-full px-3 py-2 text-xs rounded-md outline-none focus:ring-1"
          style={inputStyle}
        />
      </div>

      {/* Model */}
      <div>
        <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--theme-text-muted)" }}>
          Model ID
        </label>
        <input
          type="text"
          value={form.model}
          onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
          placeholder={selectedProvider?.placeholder ?? "model-name"}
          className="w-full px-3 py-2 text-xs rounded-md outline-none focus:ring-1"
          style={inputStyle}
        />
      </div>

      {/* API Key */}
      <div>
        <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--theme-text-muted)" }}>
          API Key
        </label>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={form.api_key}
            onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
            placeholder="sk-..."
            className="w-full px-3 py-2 pr-9 text-xs font-mono rounded-md outline-none focus:ring-1"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5"
            style={{ color: "var(--theme-text-muted)" }}
          >
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Base URL (optional) */}
      <div>
        <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--theme-text-muted)" }}>
          Base URL <span style={{ opacity: 0.5 }}>(optional, for custom endpoints)</span>
        </label>
        <input
          type="text"
          value={form.base_url ?? ""}
          onChange={(e) =>
            setForm((f) => ({ ...f, base_url: e.target.value || undefined }))
          }
          placeholder="https://api.openai.com/v1"
          className="w-full px-3 py-2 text-xs font-mono rounded-md outline-none focus:ring-1"
          style={inputStyle}
        />
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md
            transition-all disabled:opacity-50"
          style={{
            backgroundColor: "var(--theme-accent)",
            color: "#fff",
          }}
        >
          {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Add
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 text-xs font-medium rounded-md transition-opacity hover:opacity-80"
          style={{ color: "var(--theme-text-muted)", border: "1px solid var(--theme-surface-border)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
