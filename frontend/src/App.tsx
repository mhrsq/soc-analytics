import { useState, useEffect } from "react";
import { Dashboard } from "./pages/Dashboard";
import { ManagerView } from "./pages/ManagerView";
import { CustomerView } from "./pages/CustomerView";
import { ThreatsPage } from "./pages/ThreatsPage";
import { UserManagement } from "./components/UserManagement";
import { Wifi, WifiOff, Palette, Settings2, LayoutDashboard, Users, Building2, Globe, Shield, LogOut, Network, ServerCrash, Server, KeyRound, Database, MessageSquare } from "lucide-react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { DashboardProvider } from "./contexts/DashboardContext";
import { CustomerDashboardProvider } from "./contexts/CustomerDashboardContext";
import { ManagerDashboardProvider } from "./contexts/ManagerDashboardContext";
import { NotificationBell } from "./components/NotificationBell";
import { ThemePanel } from "./components/ThemePanel";
import { LLMSettingsPanel } from "./components/LLMSettingsPanel";
import { SyncStatusPanel } from "./components/SyncStatusPanel";
import { WaBotPanel } from "./components/WaBotPanel";
import { AIChatWidget } from "./components/AIChatWidget";
import { api, type AuthUser } from "./api/client";
import { ConfirmDialog } from "./components/ConfirmDialog";
import type { SDPConnectionStatus } from "./types";

type Page = "dashboard" | "manager" | "customer" | "threatmap" | "users";

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

function SDPStatusIndicator() {
  const [status, setStatus] = useState<SDPConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const data = await api.getSDPStatus();
        setStatus(data);
      } catch {
        setStatus(null);
      }
      setLoading(false);
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
        <Server className="w-3.5 h-3.5 text-yellow-500/70" />
      </div>
    );
  }

  const isOk = status?.connected && status?.api_key_valid === true;
  const isAuthErr = status && status.api_key_valid === false;
  const isConnErr = status && !status.connected && status.api_key_valid === null;

  const statusLabel = isOk ? "Connected" : isAuthErr ? "API Key Invalid" : isConnErr ? "Unreachable" : "Error";
  const statusColor = isOk ? "text-emerald-400" : isAuthErr ? "text-red-400" : "text-amber-400";

  return (
    <div className="relative" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <button className="flex items-center gap-1.5 cursor-default">
        {isOk ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <KeyRound className="w-3.5 h-3.5 text-emerald-500/70" />
          </>
        ) : isAuthErr ? (
          <>
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <KeyRound className="w-3.5 h-3.5 text-red-500/70" />
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <ServerCrash className="w-3.5 h-3.5 text-amber-500/70" />
          </>
        )}
      </button>
      {showTooltip && (
        <div
          className="absolute top-full right-0 mt-2 w-72 rounded-lg p-3 shadow-xl z-50 text-xs border"
          style={{
            backgroundColor: "var(--theme-card-bg)",
            borderColor: "var(--theme-surface-border)",
            color: "var(--theme-text-secondary)",
          }}
        >
          <div className="font-semibold mb-2 text-sm" style={{ color: "var(--theme-text-primary)" }}>
            SDP Connection Status
          </div>
          {!status ? (
            <div className="text-red-400">Unable to check SDP status</div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span>Status</span>
                <span className={`${statusColor} font-medium`}>
                  {statusLabel}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Base URL</span>
                <span className="font-mono text-[10px] truncate ml-2 max-w-[160px]" title={status.base_url}>
                  {status.base_url}
                </span>
              </div>
              <div className="flex justify-between">
                <span>API Key</span>
                <span className="font-mono text-[10px]">{status.api_key_masked}</span>
              </div>
              {status.ticket_count !== null && (
                <div className="flex justify-between">
                  <span>SDP Tickets</span>
                  <span className="font-medium" style={{ color: "var(--theme-accent)" }}>{status.ticket_count?.toLocaleString()}</span>
                </div>
              )}
              {status.error && (
                <div className="mt-1 p-1.5 rounded text-[10px] break-all" style={{ backgroundColor: "color-mix(in srgb, var(--theme-card-bg) 80%, red 20%)" }}>
                  {status.error}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AppShell() {
  const [themeOpen, setThemeOpen] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [waBotOpen, setWaBotOpen] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [authChecked, setAuthChecked] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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
  const isCustomer = currentUser?.role === "customer";
  const customerScope = isCustomer ? currentUser?.customer || undefined : undefined;

  useEffect(() => {
    if (isCustomer && page !== "customer" && page !== "threatmap") {
      setPage("customer");
    }
  }, [isCustomer, page]);

  useEffect(() => {
    const titles: Record<Page, string> = {
      dashboard: "Dashboard",
      manager: "Manager View",
      customer: "Client View",
      threatmap: "Threats",
      users: "User Management",
    };
    document.title = `${titles[page]} — SOC Analytics`;
  }, [page]);

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
              {!isCustomer && (
                <button
                  onClick={() => setPage("dashboard")}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium transition-all"
                  style={{
                    backgroundColor: page === "dashboard" ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
                    color: page === "dashboard" ? "var(--theme-accent)" : "var(--theme-text-muted)",
                  }}
                  aria-label="Main Dashboard"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Main Dashboard</span>
                </button>
              )}
              {!isCustomer && (
                <button
                  onClick={() => setPage("manager")}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium transition-all"
                  style={{
                    backgroundColor: page === "manager" ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
                    color: page === "manager" ? "var(--theme-accent)" : "var(--theme-text-muted)",
                  }}
                  aria-label="Manager View"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Manager</span>
                </button>
              )}
              <button
                onClick={() => setPage("customer")}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium transition-all"
                style={{
                  backgroundColor: page === "customer" ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
                  color: page === "customer" ? "var(--theme-accent)" : "var(--theme-text-muted)",
                }}
                aria-label="Client View"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Client View</span>
              </button>
              <button
                onClick={() => setPage("threatmap")}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium transition-all"
                style={{
                  backgroundColor: page === "threatmap" ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
                  color: page === "threatmap" ? "var(--theme-accent)" : "var(--theme-text-muted)",
                }}
                aria-label="Threats"
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Threats</span>
              </button>
              {isAdmin && (
                <button
                  onClick={() => setPage("users")}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium transition-all"
                  style={{
                    backgroundColor: page === "users" ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
                    color: page === "users" ? "var(--theme-accent)" : "var(--theme-text-muted)",
                  }}
                  aria-label="User Management"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Users</span>
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="hidden sm:inline text-[11px] font-mono tabular-nums" style={{ color: "var(--theme-text-muted)" }}><LiveClock /></span>
            <div className="h-4 w-px hidden sm:block" style={{ backgroundColor: "var(--theme-surface-border)" }} />
            <button
              onClick={() => setSyncOpen(true)}
              className="p-1.5 rounded transition-colors hover:bg-white/[0.05]"
              style={{ color: "var(--theme-text-muted)" }}
              title="Sync Status"
              aria-label="Sync Status"
            >
              <Database className="w-3.5 h-3.5" />
            </button>
            <NotificationBell />
            <div className="h-4 w-px" style={{ backgroundColor: "var(--theme-surface-border)" }} />
            {currentUser?.role === "superadmin" && (
              <button
                onClick={() => setWaBotOpen(true)}
                className="p-1.5 rounded transition-colors hover:bg-white/[0.05]"
                style={{ color: "var(--theme-text-muted)" }}
                title="WhatsApp Bot"
                aria-label="WhatsApp Bot Settings"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => { setLlmOpen(true); }}
              className="p-1.5 rounded transition-colors hover:bg-white/[0.05]"
              style={{ color: "var(--theme-text-muted)" }}
              title="Settings"
              aria-label="Settings"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setThemeOpen(true)}
              className="p-1.5 rounded transition-colors hover:bg-white/[0.05]"
              style={{ color: "var(--theme-text-muted)" }}
              title="Theme"
              aria-label="Theme"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
            {currentUser && (
              <>
                <div className="h-4 w-px" style={{ backgroundColor: "var(--theme-surface-border)" }} />
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors hover:bg-white/[0.05]"
                  style={{ color: "var(--theme-text-muted)" }}
                  title="Logout"
                  aria-label="Logout"
                >
                  <span className="text-[11px] hidden md:inline">
                    {currentUser.display_name || currentUser.username}
                  </span>
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      {page === "threatmap" ? (
        <ThreatsPage customerScope={customerScope} />
      ) : (
        <>
          <main className="mx-auto px-3 sm:px-6 pb-6">
            {page === "dashboard" ? <Dashboard /> : page === "manager" ? <ManagerDashboardProvider><ManagerView /></ManagerDashboardProvider> : page === "customer" ? <CustomerView customerScope={customerScope} /> : page === "users" ? <UserManagement /> : <Dashboard />}
          </main>
        </>
      )}

      {/* Settings Panels */}
      <ThemePanel open={themeOpen} onClose={() => setThemeOpen(false)} />
      <LLMSettingsPanel open={llmOpen} onClose={() => setLlmOpen(false)} />
      <SyncStatusPanel open={syncOpen} onClose={() => setSyncOpen(false)} />
      <WaBotPanel open={waBotOpen} onClose={() => setWaBotOpen(false)} />

      {/* AI Chat Widget — floating FAB */}
      <AIChatWidget activePage={page} />

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
        title="Logout"
        message="Are you sure you want to logout?"
        confirmLabel="Logout"
        cancelLabel="Stay"
        variant="info"
      />
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
