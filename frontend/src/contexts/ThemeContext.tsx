import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { ThemeConfig, ThemePreset } from "../types";

const darkBase = {
  bgType: "solid" as const,
  bgGradient: "",
  bgImage: "",
  mode: "dark" as const,
};

const lightBase = {
  bgType: "solid" as const,
  bgGradient: "",
  bgImage: "",
  mode: "light" as const,
};

const PRESETS: Record<ThemePreset, ThemeConfig> = {
  dark: {
    ...darkBase,
    preset: "dark",
    bgColor: "#0a0a0c",
    cardBg: "#141418",
    cardBorder: "#26262e",
    accentColor: "#a5a5b8",
    navBg: "rgba(10,10,12,0.96)",
    textPrimary: "#e8e8ec",
    textSecondary: "#9b9ba8",
    textMuted: "#646471",
    textDim: "#3e3e48",
    surfaceBase: "#0a0a0c",
    surfaceRaised: "#1b1b21",
    surfaceBorder: "#26262e",
  },
  midnight: {
    ...darkBase,
    preset: "midnight",
    bgColor: "#09090b",
    cardBg: "#111113",
    cardBorder: "#27272a",
    accentColor: "#818cf8",
    navBg: "rgba(9,9,11,0.95)",
    textPrimary: "#e4e4e7",
    textSecondary: "#a1a1aa",
    textMuted: "#52525b",
    textDim: "#3f3f46",
    surfaceBase: "#09090b",
    surfaceRaised: "#18181b",
    surfaceBorder: "#27272a",
  },
  light: {
    ...lightBase,
    preset: "light",
    bgColor: "#f8fafc",
    cardBg: "rgba(255,255,255,0.90)",
    cardBorder: "rgba(226,232,240,0.8)",
    accentColor: "#2563eb",
    navBg: "rgba(255,255,255,0.92)",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    textMuted: "#94a3b8",
    textDim: "#cbd5e1",
    surfaceBase: "#f8fafc",
    surfaceRaised: "#ffffff",
    surfaceBorder: "#e2e8f0",
  },
  ocean: {
    ...darkBase,
    preset: "ocean",
    bgColor: "#0a0c10",
    cardBg: "#10141a",
    cardBorder: "#1e2836",
    accentColor: "#06b6d4",
    navBg: "rgba(10,12,16,0.95)",
    textPrimary: "#e2e8f0",
    textSecondary: "#8899aa",
    textMuted: "#4d6070",
    textDim: "#2a3848",
    surfaceBase: "#0a0c10",
    surfaceRaised: "#141a22",
    surfaceBorder: "#1e2836",
  },
  emerald: {
    ...darkBase,
    preset: "emerald",
    bgColor: "#090b0a",
    cardBg: "#101412",
    cardBorder: "#1e2a22",
    accentColor: "#10b981",
    navBg: "rgba(9,11,10,0.95)",
    textPrimary: "#e2e8e4",
    textSecondary: "#88a898",
    textMuted: "#4d6858",
    textDim: "#2a3e30",
    surfaceBase: "#090b0a",
    surfaceRaised: "#141a16",
    surfaceBorder: "#1e2a22",
  },
  sunset: {
    ...darkBase,
    preset: "sunset",
    bgColor: "#0b0a09",
    cardBg: "#141210",
    cardBorder: "#2a2420",
    accentColor: "#f97316",
    navBg: "rgba(11,10,9,0.95)",
    textPrimary: "#e8e4e0",
    textSecondary: "#a8988a",
    textMuted: "#685848",
    textDim: "#3e3428",
    surfaceBase: "#0b0a09",
    surfaceRaised: "#1a1614",
    surfaceBorder: "#2a2420",
  },
  custom: {
    ...darkBase,
    preset: "custom",
    bgColor: "#0a0a0c",
    cardBg: "#141418",
    cardBorder: "#26262e",
    accentColor: "#a5a5b8",
    navBg: "rgba(10,10,12,0.96)",
    textPrimary: "#e8e8ec",
    textSecondary: "#9b9ba8",
    textMuted: "#646471",
    textDim: "#3e3e48",
    surfaceBase: "#0a0a0c",
    surfaceRaised: "#1b1b21",
    surfaceBorder: "#26262e",
  },
};

interface ThemeContextValue {
  theme: ThemeConfig;
  setTheme: (t: ThemeConfig) => void;
  applyPreset: (p: ThemePreset) => void;
  presets: Record<ThemePreset, ThemeConfig>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "soc-theme";

function migrateTheme(stored: Record<string, unknown>): ThemeConfig | null {
  // Migrate from old format that had "cyber-dark" preset and no mode/text fields
  if (stored.preset === "cyber-dark" || !stored.textPrimary || !stored.mode) {
    return null; // Force reset to default
  }
  return stored as unknown as ThemeConfig;
}

function loadTheme(): ThemeConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const migrated = migrateTheme(parsed);
      if (migrated) return migrated;
    }
  } catch { /* ignore */ }
  return PRESETS["dark"];
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeConfig>(loadTheme);

  const setTheme = (t: ThemeConfig) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  };

  const applyPreset = (p: ThemePreset) => {
    setTheme({ ...PRESETS[p] });
  };

  // Apply CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--theme-card-bg", theme.cardBg);
    root.style.setProperty("--theme-card-border", theme.cardBorder);
    root.style.setProperty("--theme-accent", theme.accentColor);
    root.style.setProperty("--theme-nav-bg", theme.navBg);
    root.style.setProperty("--theme-text-primary", theme.textPrimary);
    root.style.setProperty("--theme-text-secondary", theme.textSecondary);
    root.style.setProperty("--theme-text-muted", theme.textMuted);
    root.style.setProperty("--theme-text-dim", theme.textDim);
    root.style.setProperty("--theme-surface-base", theme.surfaceBase);
    root.style.setProperty("--theme-surface-raised", theme.surfaceRaised);
    root.style.setProperty("--theme-surface-border", theme.surfaceBorder);

    // Toggle light/dark class on html
    if (theme.mode === "light") {
      root.classList.add("light-mode");
      root.classList.remove("dark-mode");
    } else {
      root.classList.add("dark-mode");
      root.classList.remove("light-mode");
    }

    const body = document.body;
    if (theme.bgType === "image" && theme.bgImage) {
      body.style.background = `url(${theme.bgImage}) center/cover fixed no-repeat`;
      body.style.backgroundColor = theme.bgColor;
    } else if (theme.bgType === "gradient") {
      body.style.background = theme.bgGradient;
      body.style.backgroundAttachment = "fixed";
    } else {
      body.style.background = theme.bgColor;
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, applyPreset, presets: PRESETS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
