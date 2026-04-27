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
  avg_mttr_seconds: number | null;
  avg_mttr_display: string | null;
  sla_compliance_pct: number | null;
  mttr_sla_pct: number | null;
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

export interface SyncLogEntry {
  id: number;
  sync_type: string;
  status: string;
  tickets_synced: number;
  tickets_total: number;
  errors: number;
  started_at: string | null;
  finished_at: string | null;
  details: Record<string, unknown> | null;
}

export interface SyncDetailedStatus extends SyncStatus {
  recent_logs: SyncLogEntry[];
}

export interface SDPConnectionStatus {
  connected: boolean;
  api_key_valid: boolean | null;
  base_url: string;
  api_key_masked: string;
  ticket_count: number | null;
  error: string | null;
}

export interface AIInsight {
  narrative: string;
  anomalies: string[];
  recommendations: string[];
  rec_people: string[];
  rec_process: string[];
  rec_technology: string[];
  generated_at: string;
  model_used?: string;
}

export interface FilterOptions {
  customers: string[];
  statuses: string[];
  priorities: string[];
  technicians: string[];
  validations: string[];
  asset_names: string[];
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
  asset_name: string | null;
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
  | "gauge"
  | "text-stats"
  | "table";

export type DataSource =
  | "volume"
  | "validation"
  | "priority"
  | "customers"
  | "top-alerts"
  | "mttd"
  | "analysts"
  | "summary"
  | "live-feed";

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
  textDim: string;
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
  provider: "openai" | "anthropic" | "xai" | "google" | "openrouter" | "9router";
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
  provider: "openai" | "anthropic" | "xai" | "google" | "openrouter" | "9router";
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

// ── Analyst Scoring (Manager View) ──

export interface AnalystMetrics {
  speed: number;
  detection: number;
  accuracy: number;
  volume: number;
  sla: number;
  throughput: number;
  complexity: number;
}

export interface AnalystStats {
  total_tickets: number;
  resolved: number;
  tp_count: number;
  fp_count: number;
  ns_count: number;
  avg_mttd_seconds: number | null;
  avg_mttd_display: string | null;
  avg_mttr_seconds: number | null;
  avg_mttr_display: string | null;
  sla_met: number;
  sla_total: number;
  sla_pct: number | null;
  high_priority: number;
  security_incidents: number;
}

export interface AnalystScore {
  analyst: string;
  tier: string;
  composite_score: number;
  metrics: AnalystMetrics;
  stats: AnalystStats;
}

export interface AnalystCustomerItem {
  customer: string;
  count: number;
}

export interface AnalystAlertItem {
  rule_name: string;
  count: number;
}

export interface AnalystTicketItem {
  id: number;
  subject: string;
  status: string;
  priority: string;
  validation: string | null;
  created_time: string | null;
  mttd_seconds: number | null;
  sla_met: boolean | null;
}

export interface AnalystDetail extends AnalystScore {
  top_customers: AnalystCustomerItem[];
  top_alerts: AnalystAlertItem[];
  recent_tickets: AnalystTicketItem[];
}

export interface AnalystAIReview {
  analyst: string;
  review: string;
  provider: string | null;
  generated_at: string;
}

// ── Analyst Trend (Phase 2) ──

export interface TrendPointMetrics {
  speed: number;
  detection: number;
  accuracy: number;
  volume: number;
  sla: number;
  throughput: number;
  complexity: number;
}

export interface TrendPoint {
  period: string;
  period_start: string;
  period_end: string;
  composite_score: number;
  tier: string;
  metrics: TrendPointMetrics;
  total_tickets: number;
  resolved: number;
  sla_pct: number | null;
}

export interface AnalystTrend {
  analyst: string;
  granularity: string;
  points: TrendPoint[];
}

export interface TeamTrendPoint {
  period: string;
  period_start: string;
  period_end: string;
  analysts: { analyst: string; composite_score: number; tier: string }[];
}

// ── Threat Map ──

export interface AssetLocation {
  id: number;
  customer: string;
  asset_name: string;
  label: string | null;
  lat: number;
  lng: number;
  icon_type: string;
}

export interface AssetLocationCreate {
  customer: string;
  asset_name: string;
  label?: string;
  lat: number;
  lng: number;
  icon_type?: string;
}

export interface SiemLocation {
  id: number;
  customer: string | null;
  label: string;
  location_type: string;
  lat: number;
  lng: number;
}

export interface SiemLocationCreate {
  customer?: string;
  label: string;
  location_type: string;
  lat: number;
  lng: number;
}

export interface AttackArc {
  ticket_id: number;
  source_ip: string;
  source_lat: number;
  source_lng: number;
  source_country: string | null;
  source_city: string | null;
  target_asset: string | null;
  target_lat: number | null;
  target_lng: number | null;
  priority: string | null;
  attack_category: string | null;
  validation: string | null;
  created_time: string | null;
  is_private_ip: boolean;
}

export interface TicketAsset {
  asset_name: string;
  count: number;
}
// ── Topology ──

export interface TopologyNode {
  id: number;
  label: string;
  hostname: string | null;
  customer: string | null;
  node_type: string;
  lat: number | null;
  lng: number | null;
  pos_x: number;
  pos_y: number;
  metadata: Record<string, unknown> | null;
}

export interface TopologyNodeCreate {
  label: string;
  hostname?: string;
  customer?: string;
  node_type?: string;
  lat?: number;
  lng?: number;
  pos_x?: number;
  pos_y?: number;
  metadata?: Record<string, unknown>;
}

export interface TopologyLink {
  id: number;
  source_id: number;
  target_id: number;
  link_type: string;
  label: string | null;
  bandwidth: string | null;
  metadata: Record<string, unknown> | null;
}

export interface TopologyLinkCreate {
  source_id: number;
  target_id: number;
  link_type?: string;
  label?: string;
  bandwidth?: string;
  metadata?: Record<string, unknown>;
}

// ── SLA / FP Analytics (Manager View P0) ──

export interface SlaTrendPoint {
  month: string;
  mttd_sla_pct: number | null;
  mttr_sla_pct: number | null;
  total: number;
  measured: number;
}

export interface FpTrendPoint {
  month: string;
  fp_rate: number | null;
  tp_count: number;
  fp_count: number;
  total: number;
}

export interface CustomerSlaCell {
  customer: string;
  month: string;
  mttd_sla_pct: number | null;
  total: number;
}

export interface SlaBreachGroup {
  group_value: string;
  total: number;
  breached: number;
  breach_pct: number;
  avg_mttd_min: number | null;
}

// ── Manager View P1 Analytics ──

export interface MomKpi {
  metric: string;
  current: number;
  previous: number;
  delta_pct: number | null;
}

export interface IncidentFunnelStep {
  step: string;
  count: number;
  pct_of_total: number;
}

export interface QueueBucket {
  bucket: string;
  count: number;
  oldest_id: number | null;
}

export interface ShiftPerformance {
  shift: string;
  total: number;
  avg_mttd_min: number | null;
  mttd_sla_pct: number | null;
  avg_mttr_min: number | null;
}

// ── Attack Map (Wazuh) ──
export interface AttackMapEvent {
  id: string;
  time: string;
  source_ip: string;
  source_country: string;
  source_lat: number;
  source_lng: number;
  port: string;
  protocol: string;
  rule_id: string;
  rule_desc: string;
  rule_level: number;
  agent_name: string;
  agent_ip: string;
}

export interface AttackMapCountry {
  country: string;
  count: number;
  lat: number;
  lng: number;
}

export interface AttackMapData {
  total_events: number;
  unique_ips: number;
  active_countries: number;
  top_source: string;
  countries: AttackMapCountry[];
  protocols: { port: string; protocol: string; count: number }[];
  agents: { name: string; count: number }[];
}