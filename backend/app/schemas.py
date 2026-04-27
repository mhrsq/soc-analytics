"""Pydantic schemas for API request/response."""

from datetime import date, datetime
from typing import Optional, Union
from pydantic import BaseModel


# --- Metrics ---

class MetricsSummary(BaseModel):
    total_tickets: int
    open_tickets: int
    tp_count: int
    fp_count: int
    ns_count: int
    tp_rate: float
    fp_rate: float
    avg_mttd_seconds: Optional[float]
    avg_mttd_display: Optional[str]
    avg_mttr_seconds: Optional[float]
    avg_mttr_display: Optional[str]
    sla_compliance_pct: Optional[float]
    mttr_sla_pct: Optional[float]
    si_count: int  # Security Incidents
    period_start: Optional[date]
    period_end: Optional[date]


class VolumePoint(BaseModel):
    date: Union[datetime, date]  # date for daily, datetime for hourly
    total: int
    tp_count: int
    fp_count: int
    ns_count: int


class ValidationBreakdown(BaseModel):
    true_positive: int
    false_positive: int
    not_specified: int
    total: int


class PriorityItem(BaseModel):
    priority: str
    count: int


class CustomerItem(BaseModel):
    customer: str
    total: int
    tp_count: int
    fp_count: int
    tp_rate: float
    avg_mttd_seconds: Optional[float]


class AlertRuleItem(BaseModel):
    rule_id: Optional[str]
    rule_name: str
    count: int
    tp_count: int
    fp_count: int
    tp_rate: float


class MttdPoint(BaseModel):
    date: date
    avg_mttd_seconds: Optional[float]
    median_mttd_seconds: Optional[float]
    sla_compliant_pct: Optional[float]
    total_measured: int


class AnalystPerformance(BaseModel):
    analyst: str
    assigned: int
    resolved: int
    avg_mttd_seconds: Optional[float] = None
    avg_mttd_display: Optional[str] = None
    avg_mttr_seconds: Optional[float]
    avg_mttr_display: Optional[str]
    tp_found: int


# --- Tickets ---

class TicketListItem(BaseModel):
    id: int
    subject: str
    status: str
    priority: str
    technician: Optional[str]
    customer: Optional[str]
    validation: Optional[str]
    case_type: Optional[str]
    created_time: Optional[datetime]
    mttd_seconds: Optional[int]
    sla_met: Optional[bool]
    asset_name: Optional[str] = None


class TicketDetail(BaseModel):
    id: int
    subject: str
    description: Optional[str]
    status: str
    priority: str
    technician: Optional[str]
    group_name: Optional[str]
    site_name: Optional[str]
    customer: Optional[str]
    validation: Optional[str]
    attack_category: Optional[str]
    case_type: Optional[str]
    asset_name: Optional[str]
    ip_address: Optional[str]
    alert_time: Optional[datetime]
    first_notif: Optional[datetime]
    created_time: Optional[datetime]
    completed_time: Optional[datetime]
    mttd_seconds: Optional[int]
    mttr_seconds: Optional[int]
    sla_met: Optional[bool]
    wazuh_rule_id: Optional[str]
    wazuh_rule_name: Optional[str]


class PaginatedTickets(BaseModel):
    tickets: list[TicketListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


# --- Sync ---

class SyncStatus(BaseModel):
    last_sync: Optional[datetime]
    last_sync_type: Optional[str]
    last_status: Optional[str]
    tickets_synced: Optional[int]
    total_in_db: int
    is_running: bool


class SDPConnectionStatus(BaseModel):
    connected: bool
    api_key_valid: Optional[bool] = None
    base_url: str
    api_key_masked: str
    ticket_count: Optional[int] = None
    error: Optional[str] = None


class SyncLogEntry(BaseModel):
    id: int
    sync_type: str
    status: str
    tickets_synced: int
    tickets_total: int
    errors: int
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    details: Optional[dict] = None

    class Config:
        from_attributes = True


class SyncDetailedStatus(BaseModel):
    last_sync: Optional[datetime]
    last_sync_type: Optional[str]
    last_status: Optional[str]
    tickets_synced: Optional[int]
    total_in_db: int
    is_running: bool
    recent_logs: list[SyncLogEntry]


class SyncTriggerResponse(BaseModel):
    message: str
    sync_id: Optional[int]


# --- AI ---

class AIInsightRequest(BaseModel):
    period: str = "7d"  # 1d, 7d, 30d (used as fallback if start/end not given)
    customer: Optional[str] = None
    provider_id: Optional[int] = None  # Which LLM provider to use (None = default)
    start_date: Optional[str] = None  # ISO date string e.g. "2026-03-01"
    end_date: Optional[str] = None    # ISO date string e.g. "2026-03-04"


class AIInsight(BaseModel):
    narrative: str
    anomalies: list[str]
    recommendations: list[str]  # legacy flat list (empty when categorized)
    rec_people: list[str] = []
    rec_process: list[str] = []
    rec_technology: list[str] = []
    generated_at: datetime
    model_used: Optional[str] = None


# --- LLM Providers ---

class LlmProviderCreate(BaseModel):
    provider: str           # openai, anthropic, xai, google
    label: str
    model: str
    api_key: str
    base_url: Optional[str] = None
    is_default: bool = False


class LlmProviderUpdate(BaseModel):
    label: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class LlmProviderOut(BaseModel):
    id: int
    provider: str
    label: str
    model: str
    api_key_hint: str        # masked key e.g. "sk-...abc"
    base_url: Optional[str]
    is_active: bool
    is_default: bool
    created_at: Optional[datetime]
    last_tested: Optional[datetime]
    test_status: Optional[str]


class LlmTestResult(BaseModel):
    success: bool
    message: str
    response_preview: Optional[str] = None
    latency_ms: Optional[int] = None


# --- Filters ---

class DateRange(BaseModel):
    start: Optional[date] = None
    end: Optional[date] = None


# --- Analyst Scoring (Manager View) ---

class AnalystMetrics(BaseModel):
    speed: float
    detection: float
    accuracy: float
    volume: float
    sla: float
    throughput: float
    complexity: float


class AnalystStats(BaseModel):
    total_tickets: int
    resolved: int
    tp_count: int
    fp_count: int
    ns_count: int
    avg_mttd_seconds: Optional[float]
    avg_mttd_display: Optional[str]
    avg_mttr_seconds: Optional[float]
    avg_mttr_display: Optional[str]
    sla_met: int
    sla_total: int
    sla_pct: Optional[float]
    high_priority: int
    security_incidents: int


class AnalystScore(BaseModel):
    analyst: str
    tier: str
    composite_score: float
    metrics: AnalystMetrics
    stats: AnalystStats


class AnalystCustomerItem(BaseModel):
    customer: str
    count: int


class AnalystAlertItem(BaseModel):
    rule_name: str
    count: int


class AnalystTicketItem(BaseModel):
    id: int
    subject: str
    status: str
    priority: str
    validation: Optional[str]
    created_time: Optional[str]
    mttd_seconds: Optional[int]
    sla_met: Optional[bool]


class AnalystDetail(BaseModel):
    analyst: str
    tier: str
    composite_score: float
    metrics: AnalystMetrics
    stats: AnalystStats
    top_customers: list[AnalystCustomerItem]
    top_alerts: list[AnalystAlertItem]
    recent_tickets: list[AnalystTicketItem]


class AnalystAIReviewRequest(BaseModel):
    provider_id: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class AnalystAIReview(BaseModel):
    analyst: str
    review: str
    provider: Optional[str] = None
    generated_at: datetime


# --- Analyst Trend (Phase 2) ---

class TrendPointMetrics(BaseModel):
    speed: float
    detection: float
    accuracy: float
    volume: float
    sla: float
    throughput: float
    complexity: float


class TrendPoint(BaseModel):
    period: str                        # e.g. "2026-W09" or "2026-03"
    period_start: str                  # ISO date
    period_end: str                    # ISO date
    composite_score: float
    tier: str
    metrics: TrendPointMetrics
    total_tickets: int
    resolved: int
    sla_pct: Optional[float]


class AnalystTrend(BaseModel):
    analyst: str
    granularity: str
    points: list[TrendPoint]


class TeamTrendPoint(BaseModel):
    period: str
    period_start: str
    period_end: str
    analysts: list[dict]               # [{analyst, composite_score, tier}]


# --- Threat Map ---

class AssetLocationCreate(BaseModel):
    customer: str
    asset_name: str
    label: Optional[str] = None
    lat: float
    lng: float
    icon_type: str = "server"


class AssetLocationOut(BaseModel):
    id: int
    customer: str
    asset_name: str
    label: Optional[str]
    lat: float
    lng: float
    icon_type: str


class SiemLocationCreate(BaseModel):
    customer: Optional[str] = None
    label: str
    location_type: str  # on-prem, customer-site, cloud
    lat: float
    lng: float


class SiemLocationOut(BaseModel):
    id: int
    customer: Optional[str]
    label: str
    location_type: str
    lat: float
    lng: float


class GeoPoint(BaseModel):
    lat: float
    lng: float
    country: Optional[str] = None
    city: Optional[str] = None
    isp: Optional[str] = None


class AttackArc(BaseModel):
    ticket_id: int
    source_ip: str
    source_lat: float
    source_lng: float
    source_country: Optional[str] = None
    source_city: Optional[str] = None
    target_asset: Optional[str] = None
    target_lat: Optional[float] = None
    target_lng: Optional[float] = None
    priority: Optional[str] = None
    attack_category: Optional[str] = None
    validation: Optional[str] = None
    created_time: Optional[datetime] = None
    is_private_ip: bool = False

# --- Topology ---

class TopologyNodeCreate(BaseModel):
    label: str
    hostname: Optional[str] = None
    customer: Optional[str] = None
    node_type: str = "server"
    lat: Optional[float] = None
    lng: Optional[float] = None
    pos_x: float = 0
    pos_y: float = 0
    metadata: Optional[dict] = None


class TopologyNodeUpdate(BaseModel):
    label: Optional[str] = None
    hostname: Optional[str] = None
    customer: Optional[str] = None
    node_type: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    metadata: Optional[dict] = None


class TopologyNodeOut(BaseModel):
    id: int
    label: str
    hostname: Optional[str]
    customer: Optional[str]
    node_type: str
    lat: Optional[float]
    lng: Optional[float]
    pos_x: float
    pos_y: float
    metadata: Optional[dict] = None


class TopologyLinkCreate(BaseModel):
    source_id: int
    target_id: int
    link_type: str = "ethernet"
    label: Optional[str] = None
    bandwidth: Optional[str] = None
    metadata: Optional[dict] = None


class TopologyLinkUpdate(BaseModel):
    link_type: Optional[str] = None
    label: Optional[str] = None
    bandwidth: Optional[str] = None
    metadata: Optional[dict] = None


class TopologyLinkOut(BaseModel):
    id: int
    source_id: int
    target_id: int
    link_type: str
    label: Optional[str]
    bandwidth: Optional[str]
    metadata: Optional[dict] = None


# --- P0 Analytics Widgets ---

class SlaTrendPoint(BaseModel):
    month: str
    mttd_sla_pct: Optional[float] = None
    mttr_sla_pct: Optional[float] = None
    total: int
    measured: int


class FpTrendPoint(BaseModel):
    month: str
    fp_rate: Optional[float] = None
    tp_count: int
    fp_count: int
    total: int


class CustomerSlaCell(BaseModel):
    customer: str
    month: str
    mttd_sla_pct: Optional[float] = None
    total: int


class SlaBreachGroup(BaseModel):
    group_value: str
    total: int
    breached: int
    breach_pct: float
    avg_mttd_min: Optional[float] = None


# --- P1 Analytics Widgets ---

class MomKpi(BaseModel):
    metric: str          # "total", "fp_rate", "mttd_sla", "mttr_sla", "incidents"
    current: float
    previous: float
    delta_pct: Optional[float]   # percentage change; None when previous == 0


class IncidentFunnelStep(BaseModel):
    step: str            # "total_alerts", "security_events", "true_positives", "security_incidents"
    count: int
    pct_of_total: float


class QueueBucket(BaseModel):
    bucket: str          # "<1h", "1-4h", "4-12h", "12-24h", "1-3d", "3-7d", ">7d"
    count: int
    oldest_id: Optional[int]


class ShiftPerformance(BaseModel):
    shift: str               # "Night (00-08)", "Morning (08-16)", "Evening (16-24)"
    total: int
    avg_mttd_min: Optional[float]
    mttd_sla_pct: Optional[float]
    avg_mttr_min: Optional[float]


# --- P2 Analytics Widgets ---

class FpPatternItem(BaseModel):
    category: str
    total: int
    fp_count: int
    tp_count: int
    fp_rate: float


class PostureScore(BaseModel):
    score: float          # 0-100 composite
    mttd_sla_pct: float
    mttr_sla_pct: float
    fp_rate: float
    resolution_rate: float
    incident_rate: float
    grade: str            # S/A/B/C/D


# --- Widget Insights ---

class ExecSummaryRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    customer: Optional[str] = None
    provider_id: Optional[int] = None


class ExecSummaryResponse(BaseModel):
    summary: str
    generated_at: str
    model_used: str


class WidgetInsightsRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    customer: Optional[str] = None
    provider_id: Optional[int] = None
    # Metric data summaries (frontend sends what it has)
    sla_trend: Optional[list[dict]] = None
    fp_trend: Optional[list[dict]] = None
    mom_kpis: Optional[list[dict]] = None
    analyst_scores: Optional[list[dict]] = None
    customer_sla: Optional[list[dict]] = None
    posture_score: Optional[dict] = None
    shift_perf: Optional[list[dict]] = None
    funnel: Optional[list[dict]] = None


class WidgetInsightsResponse(BaseModel):
    insights: dict[str, str]   # widget_key → 1-2 sentence insight in Bahasa Indonesia
    model_used: str