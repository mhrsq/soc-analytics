import { useState, useEffect } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Shield, Wifi, WifiOff, Palette, Settings2 } from "lucide-react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { DashboardProvider } from "./contexts/DashboardContext";
import { NotificationBell } from "./components/NotificationBell";
import { ThemePanel } from "./components/ThemePanel";
import { LLMSettingsPanel } from "./components/LLMSettingsPanel";

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="text-xs font-mono tabular-nums" style={{ color: "var(--theme-text-muted)" }}>
      {now.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
      {" "}
      <span style={{ color: "var(--theme-text-secondary)" }}>{now.toLocaleTimeString("id-ID", { hour12: false })}</span>
    </span>
  );
}

function ConnectionStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch("/api/health", { signal: AbortSignal.timeout(5000) });
        setOnline(r.ok);
      } catch { setOnline(false); }
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, []);

  return online ? (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <Wifi className="w-3.5 h-3.5 text-emerald-500/70" />
    </div>
  ) : (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      <WifiOff className="w-3.5 h-3.5 text-red-500/70" />
    </div>
  );
}

function AppShell() {
  const [themeOpen, setThemeOpen] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--theme-surface-base)" }}>
      {/* Top Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-md" style={{ borderBottom: "1px solid var(--theme-surface-border)", background: "var(--theme-nav-bg)" }}>
        {/* Subtle accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent 20%, var(--theme-accent) 50%, transparent 80%)`, opacity: 0.5 }} />
        <div className="relative mx-auto px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 12%, transparent)" }}>
              <Shield className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-xs sm:text-sm leading-tight" style={{ color: "var(--theme-text-primary)" }}>
                SOC Analytics
              </span>
              <span className="text-[10px] leading-tight hidden sm:block" style={{ color: "var(--theme-text-muted)" }}>
                MTM Managed Security
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden sm:inline"><LiveClock /></span>
            <div className="h-4 w-px hidden sm:block" style={{ backgroundColor: "var(--theme-surface-border)" }} />
            <ConnectionStatus />
            <div className="h-4 w-px hidden sm:block" style={{ backgroundColor: "var(--theme-surface-border)" }} />
            <NotificationBell />
            <div className="h-4 w-px" style={{ backgroundColor: "var(--theme-surface-border)" }} />
            <button
              onClick={() => setLlmOpen(true)}
              className="p-1.5 rounded-lg transition-opacity hover:opacity-80"
              style={{ color: "var(--theme-text-muted)" }}
              title="LLM Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <div className="h-4 w-px" style={{ backgroundColor: "var(--theme-surface-border)" }} />
            <button
              onClick={() => setThemeOpen(true)}
              className="p-1.5 rounded-lg transition-opacity hover:opacity-80"
              style={{ color: "var(--theme-text-muted)" }}
              title="Theme settings"
            >
              <Palette className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="mx-auto px-3 sm:px-6 pb-6">
        <Dashboard />
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--theme-surface-border)" }} className="mt-8">
        <div className="mx-auto px-3 sm:px-6 py-4 flex items-center justify-center">
          <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
            &copy; {new Date().getFullYear()} MTM MSSP &middot; SOC Analytics Dashboard
          </p>
        </div>
      </footer>

      {/* Settings Panels */}
      <ThemePanel open={themeOpen} onClose={() => setThemeOpen(false)} />
      <LLMSettingsPanel open={llmOpen} onClose={() => setLlmOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <DashboardProvider>
          <AppShell />
        </DashboardProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
