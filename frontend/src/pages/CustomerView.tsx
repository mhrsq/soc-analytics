import { useState, useMemo, useCallback, useEffect } from "react";
import { ResponsiveGridLayout, useContainerWidth, getCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useCustomerDashboard } from "../contexts/CustomerDashboardContext";
import { Spinner } from "../components/Spinner";
import { WidgetWrapper } from "../components/WidgetWrapper";
import { AddWidgetModal } from "../components/AddWidgetModal";
import { EditWidgetModal } from "../components/EditWidgetModal";
import { ChartRenderer } from "../components/ChartRenderer";
import { ErrorAlert } from "../components/ErrorAlert";
import { ExecSummaryCard } from "../components/ExecSummaryCard";
import { AiInsightButton } from "../components/AiInsightButton";
import { ThreatBriefCard } from "../components/ThreatBriefCard";
import { SLAPredictionCard } from "../components/SLAPredictionCard";
import { MonthlyReportModal } from "../components/MonthlyReportModal";
import { CustomerKPIs } from "../components/customer/CustomerKPIs";
import { IncidentTimeline } from "../components/customer/IncidentTimeline";
import { PriorityBreakdown } from "../components/customer/PriorityBreakdown";
import { TopAlertsCard } from "../components/customer/TopAlertsCard";
import { AssetExposure } from "../components/customer/AssetExposure";
import { SLAGauge } from "../components/customer/SLAGauge";
import { CustomerToolbar } from "../components/customer/CustomerToolbar";
import type { WidgetConfig, ChartType, DataSource } from "../types";
import type {
  FilterOptions,
  WidgetInsightsRequest,
} from "../types";
import { Building2, ChevronDown } from "lucide-react";

function getDateRange(days: number) {
  if (days === 0) return { start: undefined, end: undefined };
  const now = new Date();
  const start = new Date(now.getTime() - days * 86400_000);
  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

/* main page */

interface CustomerViewProps {
  customerScope?: string;
}

export function CustomerView({ customerScope }: CustomerViewProps) {
  const [customer, setCustomer] = useState(customerScope || "");
  const [periodDays, setPeriodDays] = useState(30);
  const [addOpen, setAddOpen] = useState(false);
  const [editWidgetState, setEditWidgetState] = useState<WidgetConfig | null>(null);
  const [widgetInsights, setWidgetInsights] = useState<Record<string, string>>({});
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const {
    widgets, editMode, setEditMode,
    addWidget, removeWidget, updateWidget, updateLayout, resetLayout,
    profiles, activeProfileId, switchProfile, setAsDefault, saveToNewProfile, deleteProfile,
  } = useCustomerDashboard();

  const { width: containerWidth, containerRef } = useContainerWidth({ initialWidth: 1200 });

  useEffect(() => {
    if (customerScope) setCustomer(customerScope);
  }, [customerScope]);

  const range = useMemo(() => getDateRange(periodDays), [periodDays]);

  useEffect(() => {
    if (customer) {
      localStorage.setItem("soc_active_filters", JSON.stringify({
        customer,
        start: range.start || "",
        end: range.end || "",
        active_page: "customer",
      }));
    }
  }, [customer, range]);

  const filterOptions = useFetch<FilterOptions>(() => api.getFilterOptions(), []);

  const f = useMemo(
    () => ({ start: range.start, end: range.end, customer: customer || undefined }),
    [range.start, range.end, customer]
  );
  const deps = [range.start, range.end, customer];

  const summary = useFetch(() => (customer ? api.getSummary(f) : Promise.resolve(null)), deps);
  const volume = useFetch(() => (customer ? api.getVolume(f) : Promise.resolve(null)), deps);
  const priority = useFetch(() => (customer ? api.getPriority(f) : Promise.resolve(null)), deps);
  const topAlerts = useFetch(() => (customer ? api.getTopAlerts(f) : Promise.resolve(null)), deps);

  const firstError = summary.error || volume.error || priority.error || topAlerts.error || null;

  const handleCustomerChange = useCallback((val: string) => {
    setCustomer(val);
  }, []);

  const generateInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const req: WidgetInsightsRequest = {
        start_date: range.start,
        end_date: range.end,
        customer: customer || undefined,
        sla_trend: summary.data ? [summary.data] as unknown as Record<string, unknown>[] : undefined,
        fp_trend: volume.data as unknown as Record<string, unknown>[] ?? undefined,
        mom_kpis: priority.data as unknown as Record<string, unknown>[] ?? undefined,
        funnel: topAlerts.data as unknown as Record<string, unknown>[] ?? undefined,
      };
      const result = await api.getWidgetInsights(req);
      setWidgetInsights(result.insights);
    } catch (e) {
      console.error("Widget insights failed", e);
    } finally {
      setInsightsLoading(false);
    }
  }, [range, customer, summary.data, volume.data, priority.data, topAlerts.data]);

  const layouts = useMemo(() => ({
    lg: widgets.map(w => ({
      i: w.id, x: w.x, y: w.y, w: w.w, h: w.h,
      minW: 2, minH: 2,
      static: !editMode,
    })),
  }), [widgets, editMode]);

  const handleLayoutChange = useCallback((_: unknown, allLayouts: Record<string, { i: string; x: number; y: number; w: number; h: number }[]>) => {
    if (!editMode) return;
    const lg = allLayouts.lg;
    if (lg) updateLayout(lg);
  }, [editMode, updateLayout]);

  const BUILTIN_CHART_TYPES: Record<string, ChartType> = {
    "cust-kpi": "gauge",
    "cust-timeline": "area",
    "cust-sla": "gauge",
    "cust-priority": "donut",
    "cust-topalerts": "horizontal-bar",
    "cust-assets": "bar",
  };

  const dataMap = useMemo<Record<DataSource, unknown[] | null>>(() => {
    const sumArr = summary.data ? [summary.data] : null;
    return {
      volume: volume.data ?? null,
      validation: null,
      priority: priority.data ?? null,
      customers: null,
      "top-alerts": topAlerts.data ?? null,
      mttd: null,
      analysts: null,
      summary: sumArr,
      "live-feed": null,
      "sla-trend": null,
      "fp-trend": null,
      "customer-sla": null,
      "sla-breach": null,
      "mom-kpis": null,
      "incident-funnel": null,
      "queue-health": null,
      "shift-perf": null,
      "posture-score": null,
      "fp-patterns": null,
      "analyst-table": null,
      "team-trend": null,
    };
  }, [volume.data, priority.data, topAlerts.data, summary.data]);

  const loadingMap: Record<DataSource, boolean> = {
    volume: volume.loading,
    validation: false,
    priority: priority.loading,
    customers: false,
    "top-alerts": topAlerts.loading,
    mttd: false,
    analysts: false,
    summary: summary.loading,
    "live-feed": false,
    "sla-trend": false,
    "fp-trend": false,
    "customer-sla": false,
    "sla-breach": false,
    "mom-kpis": false,
    "incident-funnel": false,
    "queue-health": false,
    "shift-perf": false,
    "posture-score": false,
    "fp-patterns": false,
    "analyst-table": false,
    "team-trend": false,
  };

  function renderWidgetContent(widget: WidgetConfig) {
    const data = dataMap[widget.dataSource];
    const loading = loadingMap[widget.dataSource];
    const chartTypeChanged = widget.builtIn && BUILTIN_CHART_TYPES[widget.id] && widget.chartType !== BUILTIN_CHART_TYPES[widget.id];

    if (widget.builtIn && !chartTypeChanged) {
      switch (widget.id) {
        case "cust-kpi":
          return <CustomerKPIs data={summary.data} loading={summary.loading} />;
        case "cust-timeline":
          return <IncidentTimeline data={volume.data} loading={volume.loading} />;
        case "cust-sla":
          return <SLAGauge value={summary.data?.sla_compliance_pct ?? null} />;
        case "cust-priority":
          return <PriorityBreakdown data={priority.data} loading={priority.loading} />;
        case "cust-topalerts":
          return <TopAlertsCard data={topAlerts.data} loading={topAlerts.loading} />;
        case "cust-assets":
          return <AssetExposure customer={customer} start={range.start} end={range.end} />;
      }
    }

    if (loading) return <Spinner />;
    if (!data) return <div className="text-xs text-center py-4" style={{ color: "var(--theme-text-muted)" }}>No data</div>;

    return (
      <ChartRenderer
        chartType={widget.chartType}
        data={data as unknown[]}
        onClick={() => {}}
      />
    );
  }

  return (
    <div ref={containerRef as React.Ref<HTMLDivElement>}>
      {!customer ? (
        <div className="py-12 sm:py-20">
          <div className="max-w-md mx-auto text-center space-y-6">
            <div className="inline-flex p-4 rounded-2xl" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 10%, transparent)" }}>
              <Building2 className="w-12 h-12" style={{ color: "var(--theme-accent)" }} />
            </div>
            <h2 className="text-xl font-bold" style={{ color: "var(--theme-text-primary)" }}>Customer Operations View</h2>
            <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>Select a customer to view their security operations dashboard.</p>
            <div className="relative inline-block">
              <select
                value={customer}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2.5 rounded-xl text-sm font-medium cursor-pointer min-w-[250px]"
                style={{
                  backgroundColor: "var(--theme-card-bg)",
                  color: "var(--theme-text-primary)",
                  border: "1px solid var(--theme-card-border)",
                }}
              >
                <option value="">Select Customer...</option>
                {filterOptions.data?.customers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--theme-text-muted)" }} />
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-4 sm:py-6">
          <ErrorAlert error={firstError} className="mb-4" />

          <CustomerToolbar
            customer={customer}
            onCustomerChange={handleCustomerChange}
            periodDays={periodDays}
            onPeriodChange={setPeriodDays}
            customers={filterOptions.data?.customers ?? []}
            editMode={editMode}
            onToggleEdit={() => setEditMode(!editMode)}
            onAddWidget={() => setAddOpen(true)}
            onReset={resetLayout}
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSwitchProfile={switchProfile}
            onSetAsDefault={setAsDefault}
            onSaveToNewProfile={saveToNewProfile}
            onDeleteProfile={deleteProfile}
            locked={!!customerScope}
            onAiAnalysis={generateInsights}
            aiLoading={insightsLoading}
            onMonthlyReport={() => setReportOpen(true)}
          />

          <ExecSummaryCard start={range.start} end={range.end} customer={customer} />

          {/* Phase 2 AI components */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <ThreatBriefCard customer={customer} start={range.start} end={range.end} />
            </div>
            <div>
              <SLAPredictionCard customer={customer} />
            </div>
          </div>

          <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={40}
            width={containerWidth}
            margin={[16, 16]}
            draggableHandle=".drag-handle"
            onLayoutChange={handleLayoutChange}
            isDraggable={editMode}
            isResizable={editMode}
            compactor={getCompactor("vertical")}
          >
            {widgets.map((widget) => (
              <div key={widget.id}>
                <WidgetWrapper
                  widget={widget}
                  editMode={editMode}
                  onEdit={() => setEditWidgetState(widget)}
                  onRemove={() => removeWidget(widget.id)}
                >
                  <div className="relative h-full">
                    {renderWidgetContent(widget)}
                    {(widgetInsights[widget.id] || insightsLoading || Object.keys(widgetInsights).length > 0) && (
                      <div className="absolute top-1 right-1 z-10">
                        <AiInsightButton insight={widgetInsights[widget.id] ?? null} loading={insightsLoading} />
                      </div>
                    )}
                  </div>
                </WidgetWrapper>
              </div>
            ))}
          </ResponsiveGridLayout>

          <AddWidgetModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addWidget} />
          <EditWidgetModal widget={editWidgetState} onClose={() => setEditWidgetState(null)} onSave={updateWidget} />
        </div>
      )}

      {reportOpen && <MonthlyReportModal customer={customer} onClose={() => setReportOpen(false)} />}
    </div>
  );
}
