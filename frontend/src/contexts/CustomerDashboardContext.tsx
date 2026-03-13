import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";
import type { WidgetConfig, ChartType, DataSource } from "../types";

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "cust-kpi",       name: "KPI Cards",            chartType: "gauge",          dataSource: "summary",    builtIn: true,  x: 0, y: 0,  w: 12, h: 3 },
  { id: "cust-timeline",  name: "Incident Timeline",    chartType: "area",           dataSource: "volume",     builtIn: true,  x: 0, y: 3,  w: 9,  h: 5 },
  { id: "cust-sla",       name: "SLA Performance",      chartType: "gauge",          dataSource: "summary",    builtIn: true,  x: 9, y: 3,  w: 3,  h: 5 },
  { id: "cust-priority",  name: "Priority Breakdown",   chartType: "donut",          dataSource: "priority",   builtIn: true,  x: 0, y: 8,  w: 6,  h: 5 },
  { id: "cust-topalerts", name: "Top Alert Rules",      chartType: "horizontal-bar", dataSource: "top-alerts", builtIn: true,  x: 6, y: 8,  w: 6,  h: 5 },
  { id: "cust-assets",    name: "Asset Exposure",       chartType: "bar",            dataSource: "customers",  builtIn: true,  x: 0, y: 13, w: 12, h: 5 },
];

export interface CustomerDashboardProfile {
  id: string;
  name: string;
  widgets: WidgetConfig[];
  isDefault: boolean;
  createdAt: string;
}

interface CustomerDashboardContextValue {
  widgets: WidgetConfig[];
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  addWidget: (name: string, chartType: ChartType, dataSource: DataSource) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<WidgetConfig>) => void;
  updateLayout: (layouts: { i: string; x: number; y: number; w: number; h: number }[]) => void;
  resetLayout: () => void;
  profiles: CustomerDashboardProfile[];
  activeProfileId: string | null;
  switchProfile: (id: string) => void;
  setAsDefault: () => void;
  saveToNewProfile: (name: string) => void;
  deleteProfile: (id: string) => void;
  renameProfile: (id: string, name: string) => void;
}

const CustomerDashboardContext = createContext<CustomerDashboardContextValue | null>(null);

const STORAGE_KEY = "soc-customer-layout";
const PROFILES_KEY = "soc-customer-profiles";
const ACTIVE_PROFILE_KEY = "soc-customer-active-profile";

function loadProfiles(): CustomerDashboardProfile[] {
  try {
    const stored = localStorage.getItem(PROFILES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as CustomerDashboardProfile[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  const widgets = loadLegacyLayout();
  const seed: CustomerDashboardProfile = {
    id: "default",
    name: "Default",
    widgets,
    isDefault: true,
    createdAt: new Date().toISOString(),
  };
  return [seed];
}

function loadLegacyLayout(): WidgetConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.widgets?.length > 0) return parsed.widgets;
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDGETS;
}

function saveProfiles(profiles: CustomerDashboardProfile[]) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); } catch { /* ignore */ }
}

function loadActiveProfileId(profiles: CustomerDashboardProfile[]): string {
  try {
    const stored = localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (stored && profiles.some(p => p.id === stored)) return stored;
  } catch { /* ignore */ }
  const def = profiles.find(p => p.isDefault);
  return def?.id ?? profiles[0]?.id ?? "default";
}

function saveActiveProfileId(id: string) {
  try { localStorage.setItem(ACTIVE_PROFILE_KEY, id); } catch { /* ignore */ }
}

function saveLegacyLayout(widgets: WidgetConfig[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ widgets })); } catch { /* ignore */ }
}

export function CustomerDashboardProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<CustomerDashboardProfile[]>(loadProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string>(() => loadActiveProfileId(profiles));
  const [editMode, setEditMode] = useState(false);

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? profiles[0];
  const widgets = activeProfile?.widgets ?? DEFAULT_WIDGETS;

  const updateActiveWidgets = useCallback((next: WidgetConfig[]) => {
    setProfiles(prev => {
      const updated = prev.map(p =>
        p.id === activeProfileId ? { ...p, widgets: next } : p
      );
      saveProfiles(updated);
      saveLegacyLayout(next);
      return updated;
    });
  }, [activeProfileId]);

  const addWidget = useCallback((name: string, chartType: ChartType, dataSource: DataSource) => {
    const maxY = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
    const newWidget: WidgetConfig = {
      id: uuidv4(), name, chartType, dataSource, builtIn: false,
      w: 6, h: 5, x: 0, y: maxY,
    };
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
    saveActiveProfileId(id);
    const target = profiles.find(p => p.id === id);
    if (target) saveLegacyLayout(target.widgets);
  }, [profiles]);

  const setAsDefault = useCallback(() => {
    setProfiles(prev => {
      const updated = prev.map(p => ({ ...p, isDefault: p.id === activeProfileId }));
      saveProfiles(updated);
      return updated;
    });
  }, [activeProfileId]);

  const saveToNewProfile = useCallback((name: string) => {
    const newProfile: CustomerDashboardProfile = {
      id: uuidv4(), name, widgets: [...widgets],
      isDefault: false, createdAt: new Date().toISOString(),
    };
    setProfiles(prev => {
      const updated = [...prev, newProfile];
      saveProfiles(updated);
      return updated;
    });
    setActiveProfileId(newProfile.id);
    saveActiveProfileId(newProfile.id);
  }, [widgets]);

  const deleteProfile = useCallback((id: string) => {
    setProfiles(prev => {
      if (prev.length <= 1) return prev;
      const updated = prev.filter(p => p.id !== id);
      saveProfiles(updated);
      if (activeProfileId === id) {
        const fallback = updated.find(p => p.isDefault) ?? updated[0];
        setActiveProfileId(fallback.id);
        saveActiveProfileId(fallback.id);
        saveLegacyLayout(fallback.widgets);
      }
      return updated;
    });
  }, [activeProfileId]);

  const renameProfile = useCallback((id: string, name: string) => {
    setProfiles(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, name } : p);
      saveProfiles(updated);
      return updated;
    });
  }, []);

  return (
    <CustomerDashboardContext.Provider value={{
      widgets, editMode, setEditMode,
      addWidget, removeWidget, updateWidget, updateLayout, resetLayout,
      profiles, activeProfileId,
      switchProfile, setAsDefault, saveToNewProfile, deleteProfile, renameProfile,
    }}>
      {children}
    </CustomerDashboardContext.Provider>
  );
}

export function useCustomerDashboard() {
  const ctx = useContext(CustomerDashboardContext);
  if (!ctx) throw new Error("useCustomerDashboard must be used within CustomerDashboardProvider");
  return ctx;
}
