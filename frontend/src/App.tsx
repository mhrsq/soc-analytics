import { useState, useEffect } from "react";
import { Dashboard } from "./pages/Dashboard";
import { ManagerView } from "./pages/ManagerView";
import { CustomerView } from "./pages/CustomerView";
import { ThreatMapView } from "./pages/ThreatMapView";
import { TopologyEditor } from "./pages/TopologyEditor";
import { UserManagement } from "./components/UserManagement";
import { Wifi, WifiOff, Palette, Settings2, LayoutDashboard, Users, Building2, Globe, Shield, LogOut, Network } from "lucide-react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { DashboardProvider } from "./contexts/DashboardContext";
import { CustomerDashboardProvider } from "./contexts/CustomerDashboardContext";
import { NotificationBell } from "./components/NotificationBell";
import { ThemePanel } from "./components/ThemePanel";
import { LLMSettingsPanel } from "./components/LLMSettingsPanel";
import type { AuthUser } from "./api/client";

type Page = "dashboard" | "manager" | "customer" | "threatmap" | "topology" | "users";

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
  const [page, setPage] = useState<Page>("dashboard");
  const [authChecked, setAuthChecked] = useState(false);

  // Auth: read user from localStorage (set by Nginx login page)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem("soc_user");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  // Verify token on mount — redirect to /login if not authenticated
  useEffect(() => {
    const token = localStorage.getItem("soc_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((user) => {
        localStorage.setItem("soc_user", JSON.stringify(user));
        setCurrentUser(user);
        setAuthChecked(true);
      })
      .catch(() => {
        localStorage.removeItem("soc_token");
        localStorage.removeItem("soc_user");
        window.location.href = "/login";
      });
  }, []);

  const isAdmin = currentUser?.role === "superadmin" || currentUser?.role === "admin";

  // Show nothing while verifying auth
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--theme-surface-base)" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: "var(--theme-accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem("soc_token");
    localStorage.removeItem("soc_user");
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--theme-surface-base)" }}>
      {/* Top Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-md" style={{ borderBottom: "1px solid var(--theme-surface-border)", background: "var(--theme-nav-bg)" }}>
        {/* Subtle accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent 20%, var(--theme-accent) 50%, transparent 80%)`, opacity: 0.5 }} />
        <div className="relative mx-auto px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <img src="/mtm-logo.png" alt="MTM" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" />
            <div className="flex flex-col">
              <span className="font-semibold text-xs sm:text-sm leading-tight" style={{ color: "var(--theme-text-primary)" }}>
                SOC Analytics
              </span>
              <span className="text-[10px] leading-tight hidden sm:block" style={{ color: "var(--theme-text-muted)" }}>
                MTM Managed Security
              </span>
            </div>
            {/* Page Toggle */}
            <div className="flex ml-2 sm:ml-4 rounded-lg overflow-hidden" style={{ border: "1px solid var(--theme-surface-border)" }}>
              <button
                onClick={() => setPage("dashboard")}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium transition-all"
                style={{
                  backgroundColor: page === "dashboard" ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
                  color: page === "dashboard" ? "var(--theme-accent)" : "var(--theme-text-muted)",
                }}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Main Dashboard</span>
              </button>
              <button
                onClick={() => setPage("manager")}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium transition-all"
                style={{
                  backgroundColor: page === "manager" ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
                  color: page === "manager" ? "var(--theme-accent)" : "var(--theme-text-muted)",
                }}
              >
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Manager</span>
              </button>
              <button
                onClick={() => setPage("customer")}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium transition-all"
                style={{
                  backgroundColor: page === "customer" ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
                  color: page === "customer" ? "var(--theme-accent)" : "var(--theme-text-muted)",
                }}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Customer View</span>
              </button>
              <button
                onClick={() => setPage("threatmap")}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium transition-all"
                style={{
                  backgroundColor: page === "threatmap" ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
                  color: page === "threatmap" ? "var(--theme-accent)" : "var(--theme-text-muted)",
                }}
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Threat Map</span>
              </button>
              <button
                onClick={() => setPage("topology")}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium transition-all"
                style={{
                  backgroundColor: page === "topology" ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
                  color: page === "topology" ? "var(--theme-accent)" : "var(--theme-text-muted)",
                }}
              >
                <Network className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Topology</span>
              </button>
              {isAdmin && (
                <button
                  onClick={() => setPage("users")}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium transition-all"
                  style={{
                    backgroundColor: page === "users" ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
                    color: page === "users" ? "var(--theme-accent)" : "var(--theme-text-muted)",
                  }}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Users</span>
                </button>
              )}
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
            {currentUser && (
              <>
                <div className="h-4 w-px" style={{ backgroundColor: "var(--theme-surface-border)" }} />
                <span className="text-[11px] hidden md:inline" style={{ color: "var(--theme-text-muted)" }}>
                  {currentUser.display_name || currentUser.username}
                </span>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg transition-opacity hover:opacity-80"
                  style={{ color: "var(--theme-text-muted)" }}
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      {page === "threatmap" ? (
        <ThreatMapView />
      ) : page === "topology" ? (
        <TopologyEditor />
      ) : (
        <>
          <main className="mx-auto px-3 sm:px-6 pb-6">
            {page === "dashboard" ? <Dashboard /> : page === "manager" ? <ManagerView /> : page === "users" ? <UserManagement /> : <CustomerView />}
          </main>
          <footer style={{ borderTop: "1px solid var(--theme-surface-border)" }} className="mt-8">
            <div className="mx-auto px-3 sm:px-6 py-4 flex items-center justify-center">
              <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
                &copy; {new Date().getFullYear()} MTM MSSP &middot; SOC Analytics Dashboard
              </p>
            </div>
          </footer>
        </>
      )}

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
          <CustomerDashboardProvider>
            <AppShell />
          </CustomerDashboardProvider>
        </DashboardProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
