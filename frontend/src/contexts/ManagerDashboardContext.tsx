import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";
import { api } from "../api/client";
import type { WidgetConfig, ChartType, DataSource } from "../types";
import type { DashboardProfile } from "./DashboardContext";

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "analyst-table", name: "Team Workload", chartType: "table", dataSource: "analyst-table", builtIn: true, x: 0, y: 0, w: 12, h: 8 },
  { id: "team-trend", name: "Performance Trends", chartType: "line", dataSource: "team-trend", builtIn: true, x: 0, y: 8, w: 12, h: 6 },
  { id: "sla-trend", name: "SLA Compliance Trend", chartType: "area", dataSource: "sla-trend", builtIn: true, x: 0, y: 14, w: 6, h: 6 },
  { id: "fp-trend", name: "FP Rate Trend", chartType: "area", dataSource: "fp-trend", builtIn: true, x: 6, y: 14, w: 6, h: 6 },
  { id: "customer-sla", name: "Customer SLA Matrix", chartType: "table", dataSource: "customer-sla", builtIn: true, x: 0, y: 20, w: 6, h: 7 },
  { id: "sla-breach", name: "SLA Breach Analysis", chartType: "horizontal-bar", dataSource: "sla-breach", builtIn: true, x: 6, y: 20, w: 6, h: 7 },
  { id: "mom-kpis", name: "Month-over-Month KPIs", chartType: "text-stats", dataSource: "mom-kpis", builtIn: true, x: 0, y: 27, w: 12, h: 4 },
  { id: "incident-funnel", name: "Alert to Incident Funnel", chartType: "funnel", dataSource: "incident-funnel", builtIn: true, x: 0, y: 31, w: 6, h: 6 },
  { id: "queue-health", name: "Queue Health", chartType: "horizontal-bar", dataSource: "queue-health", builtIn: true, x: 6, y: 31, w: 6, h: 6 },
  { id: "shift-perf", name: "Shift Performance", chartType: "table", dataSource: "shift-perf", builtIn: true, x: 0, y: 37, w: 12, h: 5 },
  { id: "posture-score", name: "Security Posture Score", chartType: "gauge", dataSource: "posture-score", builtIn: true, x: 0, y: 42, w: 6, h: 7 },
  { id: "fp-patterns", name: "FP Rate by Category", chartType: "horizontal-bar", dataSource: "fp-patterns", builtIn: true, x: 6, y: 42, w: 6, h: 7 },
];

interface ManagerDashboardContextValue {
  widgets: WidgetConfig[];
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  addWidget: (name: string, chartType: ChartType, dataSource: DataSource) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<WidgetConfig>) => void;
  updateLayout: (layouts: { i: string; x: number; y: number; w: number; h: number }[]) => void;
  resetLayout: () => void;
  profiles: DashboardProfile[];
  activeProfileId: string | null;
  switchProfile: (id: string) => void;
  setAsDefault: () => void;
  saveToNewProfile: (name: string) => void;
  deleteProfile: (id: string) => void;
  renameProfile: (id: string, name: string) => void;
}

const ManagerDashboardContext = createContext<ManagerDashboardContextValue | null>(null);

const STORAGE_KEY = "soc-manager-layout";
const PROFILES_KEY = "soc-manager-profiles";
const ACTIVE_PROFILE_KEY = "soc-manager-active-profile";

// -- localStorage helpers (cache layer) --
function loadLocalProfiles(): DashboardProfile[] {
  try {
    const stored = localStorage.getItem(PROFILES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as DashboardProfile[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [{ id: "default", name: "Default", widgets: DEFAULT_WIDGETS, isDefault: true, createdAt: new Date().toISOString() }];
}

function saveLocalProfiles(profiles: DashboardProfile[], activeId: string | null) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    if (activeId) localStorage.setItem(ACTIVE_PROFILE_KEY, activeId);
    const active = profiles.find(p => p.id === activeId) ?? profiles[0];
    if (active) localStorage.setItem(STORAGE_KEY, JSON.stringify({ widgets: active.widgets }));
  } catch {}
}

function loadLocalActiveId(profiles: DashboardProfile[]): string {
  try {
    const stored = localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (stored && profiles.some(p => p.id === stored)) return stored;
  } catch {}
  return profiles.find(p => p.isDefault)?.id ?? profiles[0]?.id ?? "default";
}

// -- API sync helper --
function syncToAPI(profiles: DashboardProfile[], activeId: string | null) {
  api.saveManagerDashboardProfiles(
    profiles.map(p => ({
      id: p.id,
      name: p.name,
      widgets: p.widgets as unknown[],
      is_default: p.isDefault,
    })),
    activeId
  ).catch(() => {}); // Silent fail -- localStorage is the fallback
}

export function ManagerDashboardProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<DashboardProfile[]>(loadLocalProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string>(() => loadLocalActiveId(profiles));
  const [editMode, setEditMode] = useState(false);
  const apiLoaded = useRef(false);

  // Load from API on mount (override localStorage if API has data)
  useEffect(() => {
    if (apiLoaded.current) return;
    apiLoaded.current = true;
    api.getManagerDashboardProfiles().then(serverProfiles => {
      if (!serverProfiles || serverProfiles.length === 0) return;
      const mapped: DashboardProfile[] = serverProfiles.map(p => ({
        id: p.id,
        name: p.name,
        widgets: p.widgets as WidgetConfig[],
        isDefault: p.is_default,
        createdAt: new Date().toISOString(),
      }));
      const activeFromServer = serverProfiles.find(p => p.is_active)?.id
        ?? serverProfiles.find(p => p.is_default)?.id
        ?? serverProfiles[0]?.id;
      setProfiles(mapped);
      if (activeFromServer) setActiveProfileId(activeFromServer);
      saveLocalProfiles(mapped, activeFromServer ?? null);
    }).catch(() => {}); // Offline -- use localStorage
  }, []);

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? profiles[0];
  const widgets = activeProfile?.widgets ?? DEFAULT_WIDGETS;

  const activeIdRef = useRef(activeProfileId);
  activeIdRef.current = activeProfileId;

  const persist = useCallback((nextProfiles: DashboardProfile[], nextActiveId?: string) => {
    const aid = nextActiveId ?? activeIdRef.current;
    saveLocalProfiles(nextProfiles, aid);
    syncToAPI(nextProfiles, aid);
    return nextProfiles;
  }, []);

  const updateActiveWidgets = useCallback((next: WidgetConfig[]) => {
    setProfiles(prev => {
      const updated = prev.map(p => p.id === activeIdRef.current ? { ...p, widgets: next } : p);
      return persist(updated);
    });
  }, [persist]);

  const addWidget = useCallback((name: string, chartType: ChartType, dataSource: DataSource) => {
    const maxY = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
    const newWidget: WidgetConfig = { id: uuidv4(), name, chartType, dataSource, builtIn: false, w: 6, h: 5, x: 0, y: maxY };
    updateActiveWidgets([...widgets, newWidget]);
  }, [widgets, updateActiveWidgets]);

  const removeWidget = useCallback((id: string) => {
    updateActiveWidgets(widgets.filter(w => w.id !== id));
  }, [widgets, updateActiveWidgets]);

  const updateWidget = useCallback((id: string, updates: Partial<WidgetConfig>) => {
    updateActiveWidgets(widgets.map(w => w.id === id ? { ...w, ...updates } : w));
  }, [widgets, updateActiveWidgets]);

  const updateLayout = useCallback((layouts: { i: string; x: number; y: number; w: number; h: number }[]) => {
    const next = widgets.map(w => {
      const layout = layouts.find(l => l.i === w.id);
      if (layout) return { ...w, x: layout.x, y: layout.y, w: layout.w, h: layout.h };
      return w;
    });
    updateActiveWidgets(next);
  }, [widgets, updateActiveWidgets]);

  const resetLayout = useCallback(() => {
    updateActiveWidgets(DEFAULT_WIDGETS);
  }, [updateActiveWidgets]);

  const switchProfile = useCallback((id: string) => {
    setActiveProfileId(id);
    setProfiles(prev => persist(prev, id));
  }, [persist]);

  const setAsDefault = useCallback(() => {
    setProfiles(prev => {
      const updated = prev.map(p => ({ ...p, isDefault: p.id === activeIdRef.current }));
      return persist(updated);
    });
  }, [persist]);

  const saveToNewProfile = useCallback((name: string) => {
    const newProfile: DashboardProfile = {
      id: uuidv4(), name, widgets: JSON.parse(JSON.stringify(widgets)), isDefault: false, createdAt: new Date().toISOString(),
    };
    const newId = newProfile.id;
    setProfiles(prev => {
      const updated = [...prev, newProfile];
      return persist(updated, newId);
    });
    setActiveProfileId(newId);
  }, [widgets, persist]);

  const deleteProfile = useCallback((id: string) => {
    setProfiles(prev => {
      if (prev.length <= 1) return prev;
      let updated = prev.filter(p => p.id !== id);
      if (!updated.some(p => p.isDefault) && updated.length > 0) updated[0].isDefault = true;
      const curActive = activeIdRef.current;
      const newActiveId = id === curActive ? (updated[0]?.id ?? "default") : curActive;
      if (id === curActive) setActiveProfileId(newActiveId);
      return persist(updated, newActiveId);
    });
  }, [persist]);

  const renameProfile = useCallback((id: string, name: string) => {
    setProfiles(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, name } : p);
      return persist(updated);
    });
  }, [persist]);

  return (
    <ManagerDashboardContext.Provider value={{
      widgets, editMode, setEditMode,
      addWidget, removeWidget, updateWidget, updateLayout, resetLayout,
      profiles, activeProfileId, switchProfile, setAsDefault,
      saveToNewProfile, deleteProfile, renameProfile,
    }}>
      {children}
    </ManagerDashboardContext.Provider>
  );
}

export function useManagerDashboard() {
  const ctx = useContext(ManagerDashboardContext);
  if (!ctx) throw new Error("useManagerDashboard must be used within ManagerDashboardProvider");
  return ctx;
}
