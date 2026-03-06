const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

function qs(params: Record<string, string | undefined>): string {
  const filtered = Object.entries(params).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ""
  );
  if (filtered.length === 0) return "";
  return "?" + new URLSearchParams(filtered).toString();
}

// ── Types ──
import type {
  MetricsSummary,
  VolumePoint,
  ValidationBreakdown,
  PriorityItem,
  CustomerItem,
  AlertRuleItem,
  MttdPoint,
  AnalystPerformance,
  SyncStatus,
  AIInsight,
  FilterOptions,
  TicketDetail,
  PaginatedTickets,
  LlmProvider,
  LlmProviderCreate,
  LlmProviderUpdate,
  LlmTestResult,
  AnalystScore,
  AnalystDetail,
  AnalystAIReview,
  AnalystTrend,
  TeamTrendPoint,
} from "../types";

interface Filters {
  start?: string;
  end?: string;
  customer?: string;
  [key: string]: string | undefined;
}

// ── Metrics ──

export const api = {
  getSummary: (f: Filters = {}) =>
    request<MetricsSummary>(`/metrics/summary${qs(f)}`),

  getVolume: (f: Filters = {}) =>
    request<VolumePoint[]>(`/metrics/volume${qs(f)}`),

  getValidation: (f: Filters = {}) =>
    request<ValidationBreakdown>(`/metrics/validation${qs(f)}`),

  getPriority: (f: Filters = {}) =>
    request<PriorityItem[]>(`/metrics/priority${qs(f)}`),

  getCustomers: (f: Filters = {}) =>
    request<CustomerItem[]>(`/metrics/customers${qs(f)}`),

  getTopAlerts: (f: Filters = {}) =>
    request<AlertRuleItem[]>(`/metrics/top-alerts${qs(f)}`),

  getMttd: (f: Filters = {}) =>
    request<MttdPoint[]>(`/metrics/mttd${qs(f)}`),

  getAnalysts: (f: Filters = {}) =>
    request<AnalystPerformance[]>(`/metrics/analysts${qs(f)}`),

  // ── Sync ──
  getSyncStatus: () => request<SyncStatus>("/sync/status"),

  triggerSync: (full = false) =>
    request<{ message: string; sync_type: string }>(
      `/sync/trigger?full=${full}`,
      { method: "POST" }
    ),

  // ── AI ──
  getInsights: (opts: { period?: string; customer?: string; provider_id?: number; start_date?: string; end_date?: string }) =>
    request<AIInsight>("/ai/insights", {
      method: "POST",
      body: JSON.stringify(opts),
    }),

  // ── LLM Providers ──
  getLlmProviders: () =>
    request<LlmProvider[]>("/llm/providers"),

  addLlmProvider: (data: LlmProviderCreate) =>
    request<LlmProvider>("/llm/providers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateLlmProvider: (id: number, data: LlmProviderUpdate) =>
    request<LlmProvider>(`/llm/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteLlmProvider: (id: number) =>
    request<{ ok: boolean }>(`/llm/providers/${id}`, { method: "DELETE" }),

  testLlmProvider: (id: number) =>
    request<LlmTestResult>(`/llm/providers/${id}/test`, { method: "POST" }),

  // ── Tickets ──
  getTickets: (params: Record<string, string | undefined> = {}) =>
    request<PaginatedTickets>(`/tickets${qs(params)}`),

  getTicketDetail: (id: number) =>
    request<TicketDetail>(`/tickets/${id}`),

  // ── Filters ──
  getFilterOptions: () => request<FilterOptions>("/filters/options"),

  // ── Polling for new tickets ──
  getRecentTickets: (since: string) =>
    request<PaginatedTickets>(`/tickets${qs({ start: since, page_size: "10" })}`),

  getRecentlySynced: (since: string) =>
    request<{ tickets: { id: number; subject: string; priority: string; customer: string | null; created_time: string | null; synced_at: string | null }[]; count: number }>(
      `/tickets/recent${qs({ since })}`
    ),

  // ── Analyst Scoring (Manager View) ──
  getAnalystScores: (f: Filters = {}) =>
    request<AnalystScore[]>(`/analysts/scores${qs(f)}`),

  getAnalystDetail: (name: string, f: Filters = {}) =>
    request<AnalystDetail>(`/analysts/${encodeURIComponent(name)}/detail${qs(f)}`),

  getAnalystAIReview: (name: string, opts: { provider_id?: number; start_date?: string; end_date?: string }) =>
    request<AnalystAIReview>(`/analysts/${encodeURIComponent(name)}/ai-review`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),

  // ── Analyst Trend (Phase 2) ──
  getAnalystTrend: (name: string, granularity = "weekly", limit = 26) =>
    request<AnalystTrend>(
      `/analysts/${encodeURIComponent(name)}/trend${qs({ granularity, limit: String(limit) })}`
    ),

  getTeamTrend: (granularity = "weekly", limit = 26) =>
    request<TeamTrendPoint[]>(
      `/analysts/team/trend${qs({ granularity, limit: String(limit) })}`
    ),

  backfillSnapshots: (weeks = 26, granularity = "weekly") =>
    request<{ message: string }>(`/analysts/snapshots/backfill${qs({ weeks: String(weeks), granularity })}`, {
      method: "POST",
    }),
};
