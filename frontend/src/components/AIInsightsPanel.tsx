import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card } from "./Card";
import { Spinner } from "./Spinner";
import { api } from "../api/client";
import type { AIInsight, LlmProvider, LlmProviderCreate, LlmProviderUpdate, LlmTestResult } from "../types";
import { Sparkles, AlertTriangle, Lightbulb, FileText, Zap, Bot, Settings2, Plus, Trash2, TestTube, Star, Check, X, Eye, EyeOff, Loader2, AlertCircle, ChevronDown } from "lucide-react";

interface Props {
  customer?: string;
  startDate?: string;
  endDate?: string;
}

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI", placeholder: "gpt-4o, gpt-4.1" },
  { value: "anthropic", label: "Anthropic", placeholder: "claude-sonnet-4-20250514" },
  { value: "xai", label: "xAI (Grok)", placeholder: "grok-3-fast" },
  { value: "google", label: "Google (Gemini)", placeholder: "gemini-2.5-flash" },
] as const;

export function AIInsightsPanel({ customer, startDate, endDate }: Props) {
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<number | undefined>(undefined);
  const [showLlmSettings, setShowLlmSettings] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; result: LlmTestResult } | null>(null);

  const fetchProviders = () => {
    api.getLlmProviders().then((list) => {
      setProviders(list);
      const active = list.filter((p) => p.is_active);
      const def = active.find((p) => p.is_default);
      if (def && !selectedProvider) setSelectedProvider(def.id);
    }).catch(() => {});
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getInsights({
        start_date: startDate,
        end_date: endDate,
        customer,
        provider_id: selectedProvider,
      });
      setInsight(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (id: number) => {
    setTesting(id);
    setTestResult(null);
    try {
      const result = await api.testLlmProvider(id);
      setTestResult({ id, result });
      fetchProviders();
    } catch (err) {
      setTestResult({ id, result: { success: false, message: err instanceof Error ? err.message : "Test failed", response_preview: null, latency_ms: null } });
    } finally {
      setTesting(null);
    }
  };

  const handleDeleteProvider = async (id: number) => {
    try {
      await api.deleteLlmProvider(id);
      setProviders(p => p.filter(x => x.id !== id));
      if (selectedProvider === id) setSelectedProvider(undefined);
    } catch { /* silent */ }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await api.updateLlmProvider(id, { is_default: true });
      fetchProviders();
    } catch { /* silent */ }
  };

  return (
    <Card
      title="AI Insights"
      action={
        <div className="flex flex-wrap items-center gap-2">
          {providers.filter(p => p.is_active).length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5">
              <Bot className="w-3 h-3" style={{ color: "var(--theme-text-muted)" }} />
              <select
                value={selectedProvider ?? ""}
                onChange={(e) => setSelectedProvider(e.target.value ? Number(e.target.value) : undefined)}
                className="text-[11px] py-1.5 pl-2 pr-6 rounded-md outline-none appearance-none cursor-pointer"
                style={{
                  backgroundColor: "var(--theme-surface-base)",
                  color: "var(--theme-text-secondary)",
                  border: "1px solid var(--theme-surface-border)",
                }}
              >
                <option value="">Auto (default)</option>
                {providers.filter(p => p.is_active).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={() => setShowLlmSettings(v => !v)}
            className={`p-2 rounded-lg border transition-all ${showLlmSettings ? "ring-1" : ""}`}
            style={{
              borderColor: showLlmSettings ? "var(--theme-accent)" : "var(--theme-surface-border)",
              color: showLlmSettings ? "var(--theme-accent)" : "var(--theme-text-muted)",
              backgroundColor: showLlmSettings ? "color-mix(in srgb, var(--theme-accent) 10%, transparent)" : "transparent",
              ringColor: "var(--theme-accent)",
            } as React.CSSProperties}
            title="Manage LLM providers"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={generate}
            disabled={loading}
            className="group flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg
              bg-gradient-to-r from-cyber-purple/20 to-cyber-blue/20
              border border-cyber-purple/30 text-cyber-purple
              hover:from-cyber-purple/30 hover:to-cyber-blue/30 hover:border-cyber-purple/50
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-300"
          >
            <Sparkles className={`w-3.5 h-3.5 ${loading ? "animate-spin" : "group-hover:scale-110 transition-transform"}`} />
            {loading ? "Analyzing..." : "Generate Insights"}
          </button>
        </div>
      }
    >
      {/* Inline LLM Provider Settings */}
      {showLlmSettings && (
        <InlineLlmSettings
          providers={providers}
          testing={testing}
          testResult={testResult}
          editingId={editingId}
          onEdit={setEditingId}
          onTest={handleTest}
          onDelete={handleDeleteProvider}
          onSetDefault={handleSetDefault}
          onRefresh={fetchProviders}
          onClose={() => { setShowLlmSettings(false); setEditingId(null); }}
        />
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="relative">
            <Spinner />
            <Zap className="absolute inset-0 m-auto w-4 h-4 text-cyber-purple animate-pulse" />
          </div>
          <p className="text-xs animate-pulse" style={{ color: "var(--theme-text-muted)" }}>Analyzing ticket patterns...</p>
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 py-6 px-4 bg-cyber-red/5 rounded-lg border border-cyber-red/15">
          <AlertTriangle className="w-5 h-5 text-cyber-red flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-cyber-red">Analysis Failed</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--theme-text-muted)" }}>{error}</p>
          </div>
        </div>
      ) : !insight ? (
        <div className="text-center py-12">
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 rounded-full blur-xl" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 10%, transparent)" }} />
            <Sparkles className="relative w-12 h-12" style={{ color: "var(--theme-text-muted)" }} />
          </div>
          <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
            Click "Generate Insights" to analyze recent ticket data with AI
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--theme-text-muted)", opacity: 0.6 }}>
            Analyzes trends, anomalies &amp; recommendations
          </p>
        </div>
      ) : (
        <div className="space-y-4 stagger-children">
          {/* Summary */}
          <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 5%, var(--theme-surface-raised))", border: "1px solid var(--theme-surface-border)" }}>
            <div className="p-1.5 rounded-md bg-cyber-blue/10">
              <FileText className="w-4 h-4 text-cyber-blue" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                Ringkasan
              </p>
              <div className="prose-ai text-sm leading-relaxed" style={{ color: "var(--theme-text-secondary)" }}>
                <Md>{insight.narrative}</Md>
              </div>
            </div>
          </div>

          {/* Anomalies */}
          {insight.anomalies.length > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-cyber-orange/5 border border-cyber-orange/15">
              <div className="p-1.5 rounded-md bg-cyber-orange/10">
                <AlertTriangle className="w-4 h-4 text-cyber-orange" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                  Anomali Terdeteksi
                </p>
                <ul className="space-y-1.5">
                  {insight.anomalies.map((a, i) => (
                    <li
                      key={i}
                      className="text-sm leading-relaxed flex items-start gap-2"
                      style={{ color: "var(--theme-text-secondary)" }}
                    >
                      <span className="w-1 h-1 rounded-full bg-cyber-orange mt-2 flex-shrink-0" />
                      <span className="prose-ai flex-1 min-w-0"><Md>{a}</Md></span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Categorized Recommendations */}
          {(insight.rec_people?.length > 0 || insight.rec_process?.length > 0 || insight.rec_technology?.length > 0) ? (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--theme-text-muted)" }}>
                <Lightbulb className="w-3.5 h-3.5 text-cyber-green" />
                Rekomendasi
              </p>
              {[
                { key: "people" as const, label: "People", items: insight.rec_people ?? [], color: "var(--theme-accent)", icon: "👤" },
                { key: "process" as const, label: "Process", items: insight.rec_process ?? [], color: "#f59e0b", icon: "⚙️" },
                { key: "technology" as const, label: "Technology", items: insight.rec_technology ?? [], color: "#06b6d4", icon: "🛠️" },
              ].filter(cat => cat.items.length > 0).map(cat => (
                <div
                  key={cat.key}
                  className="flex items-start gap-3 p-3 rounded-lg"
                  style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)", border: "1px solid var(--theme-surface-border)" }}
                >
                  <span className="text-base mt-0.5">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold mb-1" style={{ color: cat.color }}>
                      {cat.label}
                    </p>
                    <ul className="space-y-1">
                      {cat.items.map((r, i) => (
                        <li
                          key={i}
                          className="text-sm leading-relaxed flex items-start gap-2"
                          style={{ color: "var(--theme-text-secondary)" }}
                        >
                          <span className="w-1 h-1 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="prose-ai flex-1 min-w-0"><Md>{r}</Md></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          ) : insight.recommendations.length > 0 ? (
            /* Legacy flat recommendations fallback */
            <div className="flex items-start gap-3 p-4 rounded-lg bg-cyber-green/5 border border-cyber-green/15">
              <div className="p-1.5 rounded-md bg-cyber-green/10">
                <Lightbulb className="w-4 h-4 text-cyber-green" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                  Rekomendasi
                </p>
                <ul className="space-y-1.5">
                  {insight.recommendations.map((r, i) => (
                    <li
                      key={i}
                      className="text-sm leading-relaxed flex items-start gap-2"
                      style={{ color: "var(--theme-text-secondary)" }}
                    >
                      <span className="w-1 h-1 rounded-full bg-cyber-green mt-2 flex-shrink-0" />
                      <span className="prose-ai flex-1 min-w-0"><Md>{r}</Md></span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--theme-surface-border)" }}>
            {insight.model_used && (
              <p className="text-[10px] font-mono flex items-center gap-1" style={{ color: "var(--theme-text-muted)", opacity: 0.6 }}>
                <Bot className="w-3 h-3" />
                {insight.model_used}
              </p>
            )}
            <p className="text-[10px] font-mono ml-auto" style={{ color: "var(--theme-text-muted)", opacity: 0.6 }}>
              Generated: {new Date(insight.generated_at).toLocaleString("id-ID")}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Markdown renderer for AI output ─── */
function Md({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Strip wrapping <p> when inline
        p: ({ children }) => <span>{children}</span>,
        strong: ({ children }) => (
          <strong style={{ color: "var(--theme-text-primary)", fontWeight: 600 }}>{children}</strong>
        ),
        em: ({ children }) => (
          <em style={{ color: "var(--theme-accent)", fontStyle: "italic" }}>{children}</em>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock ? (
            <pre
              className="rounded-lg p-3 my-2 text-xs overflow-x-auto"
              style={{ backgroundColor: "var(--theme-surface-base)", border: "1px solid var(--theme-surface-border)" }}
            >
              <code>{children}</code>
            </pre>
          ) : (
            <code
              className="px-1.5 py-0.5 rounded text-[11px] font-mono"
              style={{ backgroundColor: "var(--theme-surface-base)", color: "var(--theme-accent)", border: "1px solid var(--theme-surface-border)" }}
            >
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-1.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-1.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: "var(--theme-accent)" }}
          >
            {children}
          </a>
        ),
        h1: ({ children }) => <h3 className="text-sm font-bold mt-3 mb-1" style={{ color: "var(--theme-text-primary)" }}>{children}</h3>,
        h2: ({ children }) => <h4 className="text-sm font-bold mt-3 mb-1" style={{ color: "var(--theme-text-primary)" }}>{children}</h4>,
        h3: ({ children }) => <h5 className="text-xs font-bold mt-2 mb-1" style={{ color: "var(--theme-text-primary)" }}>{children}</h5>,
        blockquote: ({ children }) => (
          <blockquote
            className="pl-3 my-2 text-xs italic"
            style={{ borderLeft: "2px solid var(--theme-accent)", color: "var(--theme-text-muted)" }}
          >
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="text-xs w-full" style={{ borderCollapse: "collapse" }}>{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead style={{ backgroundColor: "var(--theme-surface-base)" }}>{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-2 py-1.5 text-left font-semibold" style={{ borderBottom: "1px solid var(--theme-surface-border)", color: "var(--theme-text-primary)" }}>
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-2 py-1.5" style={{ borderBottom: "1px solid var(--theme-surface-border)", color: "var(--theme-text-secondary)" }}>
            {children}
          </td>
        ),
        hr: () => <hr className="my-3" style={{ borderColor: "var(--theme-surface-border)" }} />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

/* ─── Inline LLM Settings ─── */

function InlineLlmSettings({
  providers,
  testing,
  testResult,
  editingId,
  onEdit,
  onTest,
  onDelete,
  onSetDefault,
  onRefresh,
  onClose,
}: {
  providers: LlmProvider[];
  testing: number | null;
  testResult: { id: number; result: LlmTestResult } | null;
  editingId: number | null;
  onEdit: (id: number | null) => void;
  onTest: (id: number) => void;
  onDelete: (id: number) => void;
  onSetDefault: (id: number) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);

  const inputStyle = {
    backgroundColor: "var(--theme-surface-base)",
    color: "var(--theme-text-primary)",
    border: "1px solid var(--theme-surface-border)",
  };

  return (
    <div
      className="mb-4 rounded-lg p-4 space-y-3 animate-fade-in-up"
      style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)", border: "1px solid var(--theme-surface-border)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4" style={{ color: "var(--theme-accent)" }} />
          <span className="text-xs font-semibold" style={{ color: "var(--theme-text-primary)" }}>LLM Providers</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: "var(--theme-text-muted)" }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Provider list */}
      <div className="space-y-2">
        {providers.map(p => (
          <InlineProviderRow
            key={p.id}
            provider={p}
            isEditing={editingId === p.id}
            testing={testing === p.id}
            testResult={testResult?.id === p.id ? testResult.result : null}
            onEdit={() => onEdit(editingId === p.id ? null : p.id)}
            onTest={() => onTest(p.id)}
            onDelete={() => onDelete(p.id)}
            onSetDefault={() => onSetDefault(p.id)}
            onSaved={() => { onEdit(null); onRefresh(); }}
          />
        ))}
      </div>

      {/* Quick add */}
      {showAdd ? (
        <InlineAddProvider
          onAdded={() => { setShowAdd(false); onRefresh(); }}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all"
          style={{
            backgroundColor: "color-mix(in srgb, var(--theme-accent) 10%, transparent)",
            color: "var(--theme-accent)",
            border: "1px solid color-mix(in srgb, var(--theme-accent) 25%, transparent)",
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Provider
        </button>
      )}
    </div>
  );
}

function InlineProviderRow({
  provider: p, isEditing, testing, testResult, onEdit, onTest, onDelete, onSetDefault, onSaved,
}: {
  provider: LlmProvider; isEditing: boolean; testing: boolean; testResult: LlmTestResult | null;
  onEdit: () => void; onTest: () => void; onDelete: () => void; onSetDefault: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<LlmProviderUpdate>({ label: p.label, model: p.model });
  const [saving, setSaving] = useState(false);
  const provLabel = PROVIDER_OPTIONS.find(x => x.value === p.provider)?.label ?? p.provider;
  const statusColor = p.test_status === "ok" ? "bg-emerald-400" : p.test_status === "failed" ? "bg-red-400" : "bg-neutral-500";

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateLlmProvider(p.id, form);
      onSaved();
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const inputStyle = {
    backgroundColor: "var(--theme-surface-base)",
    color: "var(--theme-text-primary)",
    border: "1px solid var(--theme-surface-border)",
  };

  return (
    <div
      className="rounded-lg p-3 space-y-2"
      style={{
        backgroundColor: "var(--theme-surface-base)",
        border: `1px solid ${p.is_default ? "var(--theme-accent)" : "var(--theme-surface-border)"}`,
        opacity: p.is_active ? 1 : 0.55,
      }}
    >
      {/* Row */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate" style={{ color: "var(--theme-text-primary)" }}>{p.label}</span>
            {p.is_default && <Star className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "var(--theme-accent)", fill: "var(--theme-accent)" }} />}
          </div>
          <span className="text-[10px] font-mono" style={{ color: "var(--theme-text-muted)" }}>{provLabel} · {p.model}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onTest} disabled={testing || !p.is_active} className="p-1 rounded transition-opacity hover:opacity-80 disabled:opacity-30" style={{ color: "var(--theme-accent)" }} title="Test">
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
          </button>
          {!p.is_default && p.is_active && (
            <button onClick={onSetDefault} className="p-1 rounded hover:opacity-80" style={{ color: "var(--theme-text-muted)" }} title="Set as default">
              <Star className="w-3 h-3" />
            </button>
          )}
          <button onClick={onEdit} className="p-1 rounded hover:opacity-80" style={{ color: isEditing ? "var(--theme-accent)" : "var(--theme-text-muted)" }} title="Edit">
            <Settings2 className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="p-1 rounded text-red-400/60 hover:text-red-400 transition-colors" title="Delete">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`p-2 rounded text-[11px] ${testResult.success ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
          <div className="flex items-center gap-1.5">
            {testResult.success ? <Check className="w-3 h-3 text-emerald-400" /> : <AlertCircle className="w-3 h-3 text-red-400" />}
            <span style={{ color: testResult.success ? "#34d399" : "#f87171" }}>{testResult.message}</span>
            {testResult.latency_ms != null && <span style={{ color: "var(--theme-text-muted)" }}>({testResult.latency_ms}ms)</span>}
          </div>
        </div>
      )}

      {/* Edit form */}
      {isEditing && (
        <div className="space-y-2 pt-1 animate-fade-in-up" style={{ borderTop: "1px solid var(--theme-surface-border)" }}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium mb-0.5 block" style={{ color: "var(--theme-text-muted)" }}>Label</label>
              <input
                type="text"
                value={form.label ?? ""}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className="w-full px-2 py-1.5 text-xs rounded-md outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium mb-0.5 block" style={{ color: "var(--theme-text-muted)" }}>Model</label>
              <input
                type="text"
                value={form.model ?? ""}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                className="w-full px-2 py-1.5 text-xs rounded-md outline-none"
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium mb-0.5 block" style={{ color: "var(--theme-text-muted)" }}>New API Key <span style={{ opacity: 0.5 }}>(leave blank to keep current)</span></label>
            <input
              type="password"
              value={form.api_key ?? ""}
              onChange={e => setForm(f => ({ ...f, api_key: e.target.value || undefined }))}
              placeholder={p.api_key_hint}
              className="w-full px-2 py-1.5 text-xs font-mono rounded-md outline-none"
              style={inputStyle}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all disabled:opacity-50"
              style={{ backgroundColor: "var(--theme-accent)", color: "#fff" }}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Save
            </button>
            <button
              onClick={onEdit}
              className="px-3 py-1.5 text-xs font-medium rounded-md hover:opacity-80"
              style={{ color: "var(--theme-text-muted)", border: "1px solid var(--theme-surface-border)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InlineAddProvider({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<LlmProviderCreate>({ provider: "openai", label: "", model: "", api_key: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = {
    backgroundColor: "var(--theme-surface-base)",
    color: "var(--theme-text-primary)",
    border: "1px solid var(--theme-surface-border)",
  };

  const handleSubmit = async () => {
    if (!form.label.trim() || !form.model.trim() || !form.api_key.trim()) { setError("All fields required"); return; }
    setSubmitting(true); setError(null);
    try { await api.addLlmProvider(form); onAdded(); } catch (err) { setError(err instanceof Error ? err.message : "Failed"); } finally { setSubmitting(false); }
  };

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "var(--theme-surface-base)", border: "1px solid color-mix(in srgb, var(--theme-accent) 30%, var(--theme-surface-border))" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--theme-text-primary)" }}>Add Provider</p>
      <select value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value as LlmProviderCreate["provider"] }))} className="w-full px-2 py-1.5 text-xs rounded-md outline-none" style={inputStyle}>
        {PROVIDER_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Display label" className="px-2 py-1.5 text-xs rounded-md outline-none" style={inputStyle} />
        <input type="text" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder={PROVIDER_OPTIONS.find(p => p.value === form.provider)?.placeholder ?? "model"} className="px-2 py-1.5 text-xs rounded-md outline-none" style={inputStyle} />
      </div>
      <input type="password" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} placeholder="API Key (sk-...)" className="w-full px-2 py-1.5 text-xs font-mono rounded-md outline-none" style={inputStyle} />
      {error && <p className="text-[11px] text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={handleSubmit} disabled={submitting} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-50" style={{ backgroundColor: "var(--theme-accent)", color: "#fff" }}>
          {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-md hover:opacity-80" style={{ color: "var(--theme-text-muted)", border: "1px solid var(--theme-surface-border)" }}>Cancel</button>
      </div>
    </div>
  );
}
