// ── API Response Types — must match backend schemas.py exactly ──

export interface MetricsSummary {
  total_tickets: number;
  open_tickets: number;
  tp_count: number;
  fp_count: number;
  ns_count: number;
  tp_rate: number;
  fp_rate: number;
  avg_mttd_seconds: number | null;
  avg_mttd_display: string | null;
  sla_compliance_pct: number | null;
  si_count: number;
  period_start: string | null;
  period_end: string | null;
}

export interface VolumePoint {
  date: string;
  total: number;
  tp_count: number;
  fp_count: number;
  ns_count: number;
}

export interface ValidationBreakdown {
  true_positive: number;
  false_positive: number;
  not_specified: number;
  total: number;
}

export interface PriorityItem {
  priority: string;
  count: number;
}

export interface CustomerItem {
  customer: string;
  total: number;
  tp_count: number;
  fp_count: number;
  tp_rate: number;
  avg_mttd_seconds: number | null;
}

export interface AlertRuleItem {
  rule_id: string | null;
  rule_name: string;
  count: number;
  tp_count: number;
  fp_count: number;
  tp_rate: number;
}

export interface MttdPoint {
  date: string;
  avg_mttd_seconds: number | null;
  median_mttd_seconds: number | null;
  sla_compliant_pct: number | null;
  total_measured: number;
}

export interface AnalystPerformance {
  analyst: string;
  assigned: number;
  resolved: number;
  avg_mttr_seconds: number | null;
  avg_mttr_display: string | null;
  tp_found: number;
}

export interface SyncStatus {
  last_sync: string | null;
  last_sync_type: string | null;
  last_status: string | null;
  tickets_synced: number | null;
  total_in_db: number;
  is_running: boolean;
}

export interface AIInsight {
  narrative: string;
  anomalies: string[];
  recommendations: string[];
  generated_at: string;
  model_used?: string;
}

export interface FilterOptions {
  customers: string[];
  statuses: string[];
  priorities: string[];
  technicians: string[];
  validations: string[];
}

export interface DateRange {
  start: string;
  end: string;
}

// ── Ticket Detail (for modal) ──

export interface TicketDetail {
  id: number;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  technician: string | null;
  group_name: string | null;
  site_name: string | null;
  customer: string | null;
  validation: string | null;
  attack_category: string | null;
  case_type: string | null;
  asset_name: string | null;
  ip_address: string | null;
  alert_time: string | null;
  first_notif: string | null;
  created_time: string | null;
  completed_time: string | null;
  mttd_seconds: number | null;
  mttr_seconds: number | null;
  sla_met: boolean | null;
  wazuh_rule_id: string | null;
  wazuh_rule_name: string | null;
}

export interface TicketListItem {
  id: number;
  subject: string;
  status: string;
  priority: string;
  technician: string | null;
  customer: string | null;
  validation: string | null;
  case_type: string | null;
  created_time: string | null;
  mttd_seconds: number | null;
  sla_met: boolean | null;
}

export interface PaginatedTickets {
  tickets: TicketListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ── Widget / Dashboard Layout ──

export type ChartType =
  | "area"
  | "bar"
  | "horizontal-bar"
  | "line"
  | "pie"
  | "donut"
  | "radar"
  | "radial-bar"
  | "scatter"
  | "treemap"
  | "funnel"
  | "stacked-bar"
  | "gauge";

export type DataSource =
  | "volume"
  | "validation"
  | "priority"
  | "customers"
  | "top-alerts"
  | "mttd"
  | "analysts"
  | "summary";

export interface WidgetConfig {
  id: string;
  name: string;
  chartType: ChartType;
  dataSource: DataSource;
  builtIn: boolean;      // true = original dashboard widget, false = user-created
  w: number;
  h: number;
  x: number;
  y: number;
}

export interface DashboardLayout {
  widgets: WidgetConfig[];
}

// ── Theme ──

export type ThemePreset = "dark" | "midnight" | "light" | "ocean" | "emerald" | "sunset" | "custom";

export interface ThemeConfig {
  preset: ThemePreset;
  bgType: "solid" | "gradient" | "image";
  bgColor: string;
  bgGradient: string;
  bgImage: string;
  cardBg: string;
  cardBorder: string;
  accentColor: string;
  navBg: string;
  /* Extended token variables for full theme coverage */
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  surfaceBase: string;
  surfaceRaised: string;
  surfaceBorder: string;
  mode: "dark" | "light";
}

// ── Notification ──

export interface NewTicketNotification {
  id: number;
  subject: string;
  customer: string | null;
  priority: string;
  created_time: string | null;
}

// ── LLM Provider ──

export interface LlmProvider {
  id: number;
  provider: "openai" | "anthropic" | "xai" | "google";
  label: string;
  model: string;
  api_key_hint: string;
  base_url: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  last_tested: string | null;
  test_status: string;
}

export interface LlmProviderCreate {
  provider: "openai" | "anthropic" | "xai" | "google";
  label: string;
  model: string;
  api_key: string;
  base_url?: string;
  is_active?: boolean;
  is_default?: boolean;
}

export interface LlmProviderUpdate {
  label?: string;
  model?: string;
  api_key?: string;
  base_url?: string;
  is_active?: boolean;
  is_default?: boolean;
}

export interface LlmTestResult {
  success: boolean;
  message: string;
  response_preview: string | null;
  latency_ms: number | null;
}
