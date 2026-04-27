const BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("soc_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(),
    ...init,
  });
  if (res.status === 401) {
    // Token expired or invalid — redirect to login
    localStorage.removeItem("soc_token");
    localStorage.removeItem("soc_user");
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }
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
  SyncDetailedStatus,
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
  AssetLocation,
  AssetLocationCreate,
  SiemLocation,
  SiemLocationCreate,
  AttackArc,
  TicketAsset,
  TopologyNode,
  TopologyNodeCreate,
  TopologyLink,
  TopologyLinkCreate,
  SDPConnectionStatus,
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

  getAssetExposure: (f: Filters = {}) =>
    request<{ asset_name: string; count: number }[]>(`/metrics/asset-exposure${qs(f)}`),

  // ── Sync ──
  getSyncStatus: () => request<SyncStatus>("/sync/status"),

  getSyncDetailedStatus: () => request<SyncDetailedStatus>("/sync/status/detailed"),

  getSDPStatus: () => request<SDPConnectionStatus>("/sync/sdp-status"),

  triggerSync: (full = false) =>
    request<{ message: string; sync_type: string }>(
      `/sync/trigger?full=${full}`,
      { method: "POST" }
    ),

  // ── Dashboard Profiles ──
  getDashboardProfiles: () =>
    request<{ id: string; name: string; widgets: unknown[]; is_default: boolean; is_active: boolean }[]>("/dashboard/profiles"),

  saveDashboardProfiles: (profiles: { id: string; name: string; widgets: unknown[]; is_default: boolean; is_active?: boolean }[], activeProfileId: string | null) =>
    request<{ ok: boolean }>("/dashboard/profiles", {
      method: "PUT",
      body: JSON.stringify({ profiles, active_profile_id: activeProfileId }),
    }),

  // ── AI Chat ──
  sendChatMessage: (data: { message: string; conversation_id?: string; provider_id?: number; model_override?: string; filters?: Record<string, string> }) =>
    request<{ message: string; conversation_id: string; model_used: string | null; created_at: string }>("/chat/message", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getChatConversations: () =>
    request<{ conversation_id: string; title: string; message_count: number; last_message_at: string | null }[]>("/chat/conversations"),

  getChatMessages: (convId: string) =>
    request<{ id: number; role: string; content: string; metadata: Record<string, unknown> | null; created_at: string }[]>(`/chat/conversations/${convId}`),

  deleteChatConversation: (convId: string) =>
    request<{ ok: boolean }>(`/chat/conversations/${convId}`, { method: "DELETE" }),

  getProviderModels: (providerId: number) =>
    request<{ provider: string; models: { id: string; name: string }[] }>(`/llm/providers/${providerId}/models`),

  // ── AI (legacy) ──
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
  getFilterOptions: (f: Filters = {}) =>
    request<FilterOptions>(`/filters/options${qs({ customer: f.customer, start: f.start, end: f.end })}`),

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

  // ── Threat Map ──
  getAttacks: (f: Filters = {}, limit = 200) =>
    request<AttackArc[]>(`/threatmap/attacks${qs({ ...f, limit: String(limit) })}`),

  getAssetLocations: (customer?: string) =>
    request<AssetLocation[]>(`/threatmap/assets${qs({ customer })}`),

  upsertAssetLocation: (data: AssetLocationCreate) =>
    request<AssetLocation>("/threatmap/assets", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteAssetLocation: (id: number) =>
    request<{ message: string }>(`/threatmap/assets/${id}`, { method: "DELETE" }),

  getSiemLocations: (customer?: string) =>
    request<SiemLocation[]>(`/threatmap/siems${qs({ customer })}`),

  upsertSiemLocation: (data: SiemLocationCreate) =>
    request<SiemLocation>("/threatmap/siems", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteSiemLocation: (id: number) =>
    request<{ message: string }>(`/threatmap/siems/${id}`, { method: "DELETE" }),

  getTicketAssets: (customer?: string) =>
    request<TicketAsset[]>(`/threatmap/ticket-assets${qs({ customer })}`),

  // ── Attack Map (Wazuh) ──
  getAttackMapEvents: (minutes = 5, size = 20) =>
    request<{ items: any[] }>(`/threatmap/attack-map/events?minutes=${minutes}&size=${size}`),

  getAttackMapData: (hours = 24) =>
    request<any>(`/threatmap/attack-map/data?hours=${hours}`),

  // ── Topology ──
  getTopologyNodes: () =>
    request<TopologyNode[]>("/threatmap/topology/nodes"),

  createTopologyNode: (data: TopologyNodeCreate) =>
    request<TopologyNode>("/threatmap/topology/nodes", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateTopologyNode: (id: number, data: Partial<TopologyNodeCreate>) =>
    request<TopologyNode>(`/threatmap/topology/nodes/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteTopologyNode: (id: number) =>
    request<{ message: string }>(`/threatmap/topology/nodes/${id}`, { method: "DELETE" }),

  getTopologyLinks: () =>
    request<TopologyLink[]>("/threatmap/topology/links"),

  createTopologyLink: (data: TopologyLinkCreate) =>
    request<TopologyLink>("/threatmap/topology/links", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateTopologyLink: (id: number, data: Partial<TopologyLinkCreate>) =>
    request<TopologyLink>(`/threatmap/topology/links/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteTopologyLink: (id: number) =>
    request<{ message: string }>(`/threatmap/topology/links/${id}`, { method: "DELETE" }),

  updateTopologyPositions: (positions: { id: number; pos_x: number; pos_y: number }[]) =>
    request<{ updated: number }>("/threatmap/topology/positions", {
      method: "PUT",
      body: JSON.stringify(positions),
    }),

  // ── Auth ──
  login: (username: string, password: string) =>
    request<{ access_token: string; token_type: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  getMe: () =>
    request<AuthUser>("/auth/me"),

  getUsers: () =>
    request<AuthUser[]>("/auth/users"),

  createUser: (data: { username: string; password: string; display_name?: string; role?: string; customer?: string }) =>
    request<AuthUser>("/auth/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateUser: (id: number, data: { display_name?: string; role?: string; customer?: string; is_active?: boolean; password?: string }) =>
    request<AuthUser>(`/auth/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteUser: (id: number) =>
    request<{ ok: boolean }>(`/auth/users/${id}`, { method: "DELETE" }),
};

export interface AuthUser {
  id: number;
  username: string;
  display_name: string | null;
  role: string;
  customer: string | null;
  is_active: boolean;
}
