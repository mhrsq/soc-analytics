import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";
import type { WidgetConfig, ChartType, DataSource, DashboardLayout } from "../types";

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "kpi",        name: "KPI Strip",             chartType: "gauge",          dataSource: "summary",    builtIn: true,  x: 0, y: 0,  w: 12, h: 2 },
  { id: "volume",     name: "Ticket Volume Trend",   chartType: "area",           dataSource: "volume",     builtIn: true,  x: 0, y: 2,  w: 8,  h: 5 },
  { id: "validation", name: "TP vs FP Ratio",        chartType: "donut",          dataSource: "validation", builtIn: true,  x: 8, y: 2,  w: 4,  h: 5 },
  { id: "priority",   name: "Priority Distribution", chartType: "horizontal-bar", dataSource: "priority",   builtIn: true,  x: 0, y: 7,  w: 4,  h: 5 },
  { id: "customers",  name: "Tickets by Customer",   chartType: "bar",            dataSource: "customers",  builtIn: true,  x: 4, y: 7,  w: 4,  h: 5 },
  { id: "topalerts",  name: "Top Alert Rules",       chartType: "bar",            dataSource: "top-alerts", builtIn: true,  x: 8, y: 7,  w: 4,  h: 5 },
  { id: "analysts",   name: "Analyst Performance",   chartType: "bar",            dataSource: "analysts",   builtIn: true,  x: 0, y: 12, w: 12, h: 5 },
];

/* ── Profile types ── */
export interface DashboardProfile {
  id: string;
  name: string;
  widgets: WidgetConfig[];
  isDefault: boolean;
  createdAt: string;
}

interface DashboardContextValue {
  widgets: WidgetConfig[];
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  addWidget: (name: string, chartType: ChartType, dataSource: DataSource) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<WidgetConfig>) => void;
  updateLayout: (layouts: { i: string; x: number; y: number; w: number; h: number }[]) => void;
  resetLayout: () => void;
  /* Profile management */
  profiles: DashboardProfile[];
  activeProfileId: string | null;
  switchProfile: (id: string) => void;
  setAsDefault: () => void;
  saveToNewProfile: (name: string) => void;
  deleteProfile: (id: string) => void;
  renameProfile: (id: string, name: string) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

const STORAGE_KEY = "soc-dashboard-layout";
const PROFILES_KEY = "soc-dashboard-profiles";
const ACTIVE_PROFILE_KEY = "soc-dashboard-active-profile";

function loadProfiles(): DashboardProfile[] {
  try {
    const stored = localStorage.getItem(PROFILES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as DashboardProfile[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  // Seed with a "Default" profile from existing layout
  const widgets = loadLegacyLayout();
  const seed: DashboardProfile = {
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
      const parsed: DashboardLayout = JSON.parse(stored);
      if (parsed.widgets?.length > 0) return parsed.widgets;
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDGETS;
}

function saveProfiles(profiles: DashboardProfile[]) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); } catch { /* ignore */ }
}

function loadActiveProfileId(profiles: DashboardProfile[]): string {
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

/** Also keep legacy key in sync so old code/tab still works */
function saveLegacyLayout(widgets: WidgetConfig[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ widgets })); } catch { /* ignore */ }
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<DashboardProfile[]>(loadProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string>(() => loadActiveProfileId(profiles));
  const [editMode, setEditMode] = useState(false);

  // Derive widgets from active profile
  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? profiles[0];
  const widgets = activeProfile?.widgets ?? DEFAULT_WIDGETS;

  // Helper: update widgets for the active profile
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
      id: uuidv4(),
      name,
      chartType,
      dataSource,
      builtIn: false,
      w: 6,
      h: 5,
      x: 0,
      y: maxY,
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

  /* ── Profile operations ── */

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
    const newProfile: DashboardProfile = {
      id: uuidv4(),
      name,
      widgets: JSON.parse(JSON.stringify(widgets)), // deep clone
      isDefault: false,
      createdAt: new Date().toISOString(),
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
      if (prev.length <= 1) return prev; // cannot delete last profile
      const updated = prev.filter(p => p.id !== id);
      // if deleted the default, make the first one default
      if (!updated.some(p => p.isDefault) && updated.length > 0) {
        updated[0].isDefault = true;
      }
      saveProfiles(updated);
      // if active was deleted, switch to default
      if (id === activeProfileId) {
        const def = updated.find(p => p.isDefault) ?? updated[0];
        setActiveProfileId(def.id);
        saveActiveProfileId(def.id);
        saveLegacyLayout(def.widgets);
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
    <DashboardContext.Provider
      value={{
        widgets, editMode, setEditMode,
        addWidget, removeWidget, updateWidget, updateLayout, resetLayout,
        profiles, activeProfileId, switchProfile, setAsDefault, saveToNewProfile, deleteProfile, renameProfile,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
