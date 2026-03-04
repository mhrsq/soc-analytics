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
    bgColor: "#0f172a",
    cardBg: "rgba(30,41,59,0.80)",
    cardBorder: "rgba(51,65,85,0.5)",
    accentColor: "#3b82f6",
    navBg: "rgba(15,23,42,0.92)",
    textPrimary: "#f1f5f9",
    textSecondary: "#94a3b8",
    textMuted: "#64748b",
    surfaceBase: "#0f172a",
    surfaceRaised: "#1e293b",
    surfaceBorder: "#334155",
  },
  midnight: {
    ...darkBase,
    preset: "midnight",
    bgType: "gradient",
    bgColor: "#0f0c29",
    bgGradient: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    cardBg: "rgba(15,12,41,0.80)",
    cardBorder: "rgba(55,48,107,0.5)",
    accentColor: "#818cf8",
    navBg: "rgba(15,12,41,0.92)",
    textPrimary: "#e2e8f0",
    textSecondary: "#a5b4cb",
    textMuted: "#7b8ba5",
    surfaceBase: "#0f0c29",
    surfaceRaised: "#1c1853",
    surfaceBorder: "#37306b",
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
    surfaceBase: "#f8fafc",
    surfaceRaised: "#ffffff",
    surfaceBorder: "#e2e8f0",
  },
  ocean: {
    ...darkBase,
    preset: "ocean",
    bgType: "gradient",
    bgColor: "#0c1222",
    bgGradient: "linear-gradient(135deg, #0c1222 0%, #0f2942 50%, #0a3040 100%)",
    cardBg: "rgba(12,24,50,0.80)",
    cardBorder: "rgba(30,64,100,0.5)",
    accentColor: "#06b6d4",
    navBg: "rgba(12,18,34,0.92)",
    textPrimary: "#e2e8f0",
    textSecondary: "#7db4c9",
    textMuted: "#4d7f94",
    surfaceBase: "#0c1222",
    surfaceRaised: "#0f2942",
    surfaceBorder: "#1e4064",
  },
  emerald: {
    ...darkBase,
    preset: "emerald",
    bgType: "gradient",
    bgColor: "#071410",
    bgGradient: "linear-gradient(135deg, #071410 0%, #0f2e20 50%, #0a2318 100%)",
    cardBg: "rgba(10,32,22,0.80)",
    cardBorder: "rgba(22,70,48,0.5)",
    accentColor: "#10b981",
    navBg: "rgba(7,20,16,0.92)",
    textPrimary: "#e2e8f0",
    textSecondary: "#7bc4a5",
    textMuted: "#4d8f72",
    surfaceBase: "#071410",
    surfaceRaised: "#0f2e20",
    surfaceBorder: "#164630",
  },
  sunset: {
    ...darkBase,
    preset: "sunset",
    bgType: "gradient",
    bgColor: "#1a0a12",
    bgGradient: "linear-gradient(135deg, #1a0a12 0%, #2d1520 50%, #3d1c10 100%)",
    cardBg: "rgba(35,16,24,0.80)",
    cardBorder: "rgba(70,35,48,0.5)",
    accentColor: "#f97316",
    navBg: "rgba(26,10,18,0.92)",
    textPrimary: "#e2e8f0",
    textSecondary: "#c9a07b",
    textMuted: "#8f6e4d",
    surfaceBase: "#1a0a12",
    surfaceRaised: "#2d1520",
    surfaceBorder: "#462330",
  },
  custom: {
    ...darkBase,
    preset: "custom",
    bgColor: "#0f172a",
    cardBg: "rgba(30,41,59,0.80)",
    cardBorder: "rgba(51,65,85,0.5)",
    accentColor: "#3b82f6",
    navBg: "rgba(15,23,42,0.92)",
    textPrimary: "#f1f5f9",
    textSecondary: "#94a3b8",
    textMuted: "#64748b",
    surfaceBase: "#0f172a",
    surfaceRaised: "#1e293b",
    surfaceBorder: "#334155",
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
