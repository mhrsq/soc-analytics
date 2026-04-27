import { useState, useCallback, useMemo } from "react";
import { ResponsiveGridLayout, useContainerWidth, getCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { api } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useDashboard } from "../contexts/DashboardContext";
import type { WidgetConfig, DataSource, ChartType, ValidationBreakdown } from "../types";

import { FilterBar } from "../components/FilterBar";
import { SyncBanner } from "../components/SyncBanner";
import { KPICards } from "../components/KPICards";
import { VolumeTrendChart } from "../components/VolumeTrendChart";
import { ValidationDonut } from "../components/ValidationDonut";
import { PriorityChart } from "../components/PriorityChart";
import { CustomerChart } from "../components/CustomerChart";
import { TopAlertsTable } from "../components/TopAlertsTable";
import { MttdChart } from "../components/MttdChart";
import { AnalystTable } from "../components/AnalystTable";
// AI Insights panel removed — AI Chat widget covers this
import { ChartRenderer } from "../components/ChartRenderer";
import { WidgetWrapper } from "../components/WidgetWrapper";
import { LiveTicketFeed } from "../components/LiveTicketFeed";

import { AddWidgetModal } from "../components/AddWidgetModal";
import { EditWidgetModal } from "../components/EditWidgetModal";
import { TicketDetailModal } from "../components/TicketDetailModal";
import { KPIDetailModal } from "../components/KPIDetailModal";
import type { KPIKey } from "../components/KPIDetailModal";
import { Spinner } from "../components/Spinner";
import { ErrorAlert } from "../components/ErrorAlert";

export function Dashboard() {
  // Default to last 24h
  const defaultRange = (() => {
    const now = new Date();
    return {
      start: new Date(now.getTime() - 86400_000).toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
      customer: "",
      asset_name: "",
    };
  })();

  const [filters, setFilters] = useState(defaultRange);
  const [syncing, setSyncing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editWidget, setEditWidget] = useState<WidgetConfig | null>(null);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [kpiDetail, setKpiDetail] = useState<KPIKey | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const { widgets, editMode, setEditMode, addWidget, removeWidget, updateWidget, updateLayout, resetLayout, profiles, activeProfileId, switchProfile, setAsDefault, saveToNewProfile, deleteProfile } = useDashboard();
  const { width: containerWidth, containerRef } = useContainerWidth({ initialWidth: 1200 });

  const f = {
    start: filters.start || undefined,
    end: filters.end || undefined,
    customer: filters.customer || undefined,
    asset_name: filters.asset_name || undefined,
  };

  const handleApplyFilters = useCallback((next: { start: string; end: string; customer: string; asset_name: string }) => {
    setFilters(next);
    // Store filters for AI Chat widget to read
    try { localStorage.setItem("soc_active_filters", JSON.stringify({ start: next.start, end: next.end, customer: next.customer })); } catch {}
  }, []);

  // Data fetching — all re-trigger when filters change or refreshTick bumps
  const deps = [filters.start, filters.end, filters.customer, filters.asset_name, refreshTick];
  const summary = useFetch(() => api.getSummary(f), deps);
  const volume = useFetch(() => api.getVolume(f), deps);
  const validation = useFetch(() => api.getValidation(f), deps);
  const priority = useFetch(() => api.getPriority(f), deps);
  const customers = useFetch(() => api.getCustomers(f), deps);
  const topAlerts = useFetch(() => api.getTopAlerts(f), deps);
  const mttd = useFetch(() => api.getMttd(f), deps);
  const analysts = useFetch(() => api.getAnalysts(f), deps);
  const filterOptions = useFetch(() => api.getFilterOptions({ customer: filters.customer || undefined }), [filters.customer]);
  const syncStatus = useFetch(() => api.getSyncStatus(), [syncing]);

  const firstError = summary.error || volume.error || validation.error || priority.error || customers.error || topAlerts.error || mttd.error || analysts.error || null;

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try { await api.triggerSync(false); }
    catch { /* ignore */ }
    finally { setTimeout(() => setSyncing(false), 2000); }
  }, []);

  // Auto-refresh handler — bumps the tick to re-trigger all useFetch hooks
  const handleAutoRefresh = useCallback(() => {
    setRefreshTick(t => t + 1);
  }, []);

  // Map DataSource → data for generic chart renderer
  const dataMap = useMemo<Record<DataSource, unknown[] | null>>(() => {
    // Convert ValidationBreakdown object to array for charts
    const valArr = validation.data
      ? [
          { name: "True Positive", value: (validation.data as ValidationBreakdown).true_positive },
          { name: "False Positive", value: (validation.data as ValidationBreakdown).false_positive },
          { name: "Not Specified", value: (validation.data as ValidationBreakdown).not_specified },
        ]
      : null;
    // Convert summary to single-item array for gauge/charts
    const sumArr = summary.data ? [summary.data] : null;

    return {
      volume: volume.data ?? null,
      validation: valArr,
      priority: priority.data ?? null,
      customers: customers.data ?? null,
      "top-alerts": topAlerts.data ?? null,
      mttd: mttd.data ?? null,
      analysts: analysts.data ?? null,
      summary: sumArr,
      "live-feed": null, // Live feed manages its own data fetching
    };
  }, [volume.data, validation.data, priority.data, customers.data, topAlerts.data, mttd.data, analysts.data, summary.data]);

  const loadingMap: Record<DataSource, boolean> = {
    volume: volume.loading,
    validation: validation.loading,
    priority: priority.loading,
    customers: customers.loading,
    "top-alerts": topAlerts.loading,
    mttd: mttd.loading,
    analysts: analysts.loading,
    summary: summary.loading,
    "live-feed": false,
  };

  // Grid layout for react-grid-layout
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

  // Default chart types for built-in widgets (to detect if user changed type via edit)
  const BUILTIN_CHART_TYPES: Record<string, ChartType> = {
    kpi: "gauge", volume: "area", validation: "text-stats", mttd: "gauge",
    priority: "horizontal-bar", customers: "bar", topalerts: "bar", analysts: "bar",
  };

  // Descriptive guidance tooltips for widget titles
  const WIDGET_TOOLTIPS: Record<string, string> = {
    volume: "Daily ticket volume breakdown showing True Positive, False Positive, and unvalidated alerts over time.",
    validation: "Proportion of True Positive vs False Positive vs Not Specified alerts for the selected period.",
    mttd: "SLA Achievement gauge — percentage of tickets resolved within the agreed SLA timeframe.",
    priority: "Distribution of tickets across priority levels (Critical, High, Medium, Low).",
    customers: "Ticket count per customer, helping identify which clients generate the most alerts.",
    topalerts: "Most frequently triggered alert rules ranked by occurrence count.",
    analysts: "SOC analyst workload and performance metrics including assigned, resolved tickets and average response time.",
  };

  // Render a single widget content
  function renderWidgetContent(widget: WidgetConfig) {
    const data = dataMap[widget.dataSource];
    const loading = loadingMap[widget.dataSource];

    // Built-in widgets use original components — unless chart type was changed
    const chartTypeChanged = widget.builtIn && BUILTIN_CHART_TYPES[widget.id] && widget.chartType !== BUILTIN_CHART_TYPES[widget.id];

    if (widget.builtIn && !chartTypeChanged) {
      switch (widget.id) {
        case "kpi":
          return <KPICards data={summary.data} loading={summary.loading} onCardClick={setKpiDetail} volumeData={volume.data} />;
        case "volume":
          return <VolumeTrendChart data={volume.data} loading={volume.loading} bare />;
        case "validation":
          return <ValidationDonut data={validation.data} loading={validation.loading} bare />;
        case "mttd":
          return <MttdChart data={summary.data} loading={summary.loading} bare />;
        case "priority":
          return <PriorityChart data={priority.data} loading={priority.loading} bare />;
        case "customers":
          return <CustomerChart data={customers.data} loading={customers.loading} bare />;
        case "topalerts":
          return <TopAlertsTable data={topAlerts.data} loading={topAlerts.loading} bare />;
        case "analysts":
          return <AnalystTable data={analysts.data} loading={analysts.loading} bare />;
      }
    }

    // Live ticket feed — self-contained component
    if (widget.dataSource === "live-feed") {
      return (
        <LiveTicketFeed
          filters={{ start: filters.start, end: filters.end, customer: filters.customer, asset_name: filters.asset_name }}
          bare
          onTicketClick={setTicketId}
        />
      );
    }

    // Generic chart renderer for custom widgets or changed built-in charts
    if (loading) return <Spinner />;
    if (!data) return <div className="text-xs text-surface-600 text-center py-4">No data</div>;

    return (
      <ChartRenderer
        chartType={widget.chartType}
        data={data as unknown[]}
        onClick={(entry) => {
          const e = entry as Record<string, unknown>;
          if (e?.id && typeof e.id === "number") setTicketId(e.id);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ErrorAlert error={firstError} className="mb-4" />

      {/* Sync Banner */}
      <SyncBanner syncStatus={syncStatus.data} />

      {/* Filters — sticky below nav */}
      <div className="sticky top-12 sm:top-14 z-40 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2" style={{ backgroundColor: "var(--theme-surface-base)" }}>
        <FilterBar
          filters={filters}
          onApply={handleApplyFilters}
          filterOptions={filterOptions.data}
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
          onRefresh={handleAutoRefresh}
        />
      </div>



      {/* Widget Grid */}
      <div ref={containerRef as React.Ref<HTMLDivElement>}>
        <ResponsiveGridLayout
          className="layout"
          width={containerWidth}
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={40}
          isDraggable={editMode}
          isResizable={editMode}
          draggableHandle=".drag-handle"
          onLayoutChange={handleLayoutChange}
          compactor={getCompactor("vertical")}
          margin={[16, 16]}
        >
          {widgets.map(widget => (
            <div key={widget.id} className="h-full">
              <WidgetWrapper
                widget={widget}
                editMode={editMode}
                onEdit={() => setEditWidget(widget)}
                onRemove={() => removeWidget(widget.id)}
                tooltip={WIDGET_TOOLTIPS[widget.id]}
              >
                {renderWidgetContent(widget)}
              </WidgetWrapper>
            </div>
          ))}
        </ResponsiveGridLayout>
      </div>

      {/* AI Insights removed — AI Chat widget (FAB) covers this functionality */}

      {/* Modals */}
      <AddWidgetModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addWidget} />
      <EditWidgetModal widget={editWidget} onClose={() => setEditWidget(null)} onSave={updateWidget} />
      <TicketDetailModal ticketId={ticketId} onClose={() => setTicketId(null)} />
      <KPIDetailModal
        kpiKey={kpiDetail}
        summary={summary.data}
        filters={f}
        onClose={() => setKpiDetail(null)}
        onTicketClick={(id) => { setKpiDetail(null); setTicketId(id); }}
      />
    </div>
  );
}
