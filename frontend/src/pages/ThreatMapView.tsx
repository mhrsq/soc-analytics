import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Globe from "react-globe.gl";
import { api } from "../api/client";
import { Spinner } from "../components/Spinner";
import type { AttackArc, AssetLocation, SiemLocation } from "../types";
import {
  Settings2, Crosshair, Shield, Server, Radio, RefreshCw,
  ChevronDown, Plus, Trash2, MapPin, X, Wifi, Database, Cloud, Monitor,
} from "lucide-react";

// ── Color Palette (cyberpunk) ──────────────────────────────────
const PRIORITY_COLORS: Record<string, string> = {
  "P1-Critical": "#FF073A",
  "P1 - Critical": "#FF073A",
  "P2-High": "#FF6B35",
  "P2 - High": "#FF6B35",
  "P3-Medium": "#FFD700",
  "P3 - Medium": "#FFD700",
  "P4-Low": "#00FF88",
  "P4 - Low": "#00FF88",
};

const ARC_COLORS = ["#FF073A", "#FF6B35", "#00D4FF", "#FF00FF", "#FFD700", "#00FF88"];

const ICON_TYPES: Record<string, { icon: typeof Server; color: string }> = {
  server: { icon: Server, color: "#00D4FF" },
  firewall: { icon: Shield, color: "#FF6B35" },
  endpoint: { icon: Monitor, color: "#00FF88" },
  database: { icon: Database, color: "#FFD700" },
  cloud: { icon: Cloud, color: "#FF00FF" },
};

// ── Main Component ─────────────────────────────────────────────
export function ThreatMapView() {
  const globeRef = useRef<any>(null);
  const [attacks, setAttacks] = useState<AttackArc[]>([]);
  const [assets, setAssets] = useState<AssetLocation[]>([]);
  const [siems, setSiems] = useState<SiemLocation[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [customer, setCustomer] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);

  // Load customers list
  useEffect(() => {
    api.getFilterOptions().then((opts) => setCustomers(opts.customers));
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [attackData, assetData, siemData] = await Promise.all([
        api.getAttacks(customer ? { customer } : {}, 300),
        api.getAssetLocations(customer || undefined),
        api.getSiemLocations(customer || undefined),
      ]);
      setAttacks(attackData);
      setAssets(assetData);
      setSiems(siemData);
    } catch (e) {
      console.error("Failed to load threat map data:", e);
    } finally {
      setLoading(false);
    }
  }, [customer]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-rotate control
  useEffect(() => {
    if (globeRef.current) {
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = 0.3;
      }
    }
  }, [autoRotate]);

  // Initial camera position
  useEffect(() => {
    if (globeRef.current) {
      // Center on Indonesia (roughly)
      globeRef.current.pointOfView({ lat: -2, lng: 118, altitude: 2.5 }, 1000);
    }
  }, []);

  // ── Build arc data for globe ──
  const arcsData = useMemo(() => {
    return attacks
      .filter((a) => !a.is_private_ip && a.source_lat !== 0 && a.source_lng !== 0)
      .map((a, i) => ({
        startLat: a.source_lat,
        startLng: a.source_lng,
        endLat: a.target_lat ?? -6.2, // Default to Jakarta if no target
        endLng: a.target_lng ?? 106.8,
        color: PRIORITY_COLORS[a.priority || ""] || ARC_COLORS[i % ARC_COLORS.length],
        label: `${a.source_ip} (${a.source_city || a.source_country || "Unknown"}) → ${a.target_asset || "Target"}`,
        stroke: a.priority?.startsWith("P1") ? 1.5 : a.priority?.startsWith("P2") ? 1.0 : 0.5,
        priority: a.priority,
        dashGap: a.validation === "True Positive" ? 0 : 0.5,
      }));
  }, [attacks]);

  // ── Build points for assets + SIEMs ──
  const pointsData = useMemo(() => {
    const pts: { lat: number; lng: number; size: number; color: string; label: string; type: string }[] = [];

    assets.forEach((a) => {
      pts.push({
        lat: a.lat,
        lng: a.lng,
        size: 0.4,
        color: ICON_TYPES[a.icon_type]?.color || "#00D4FF",
        label: `🖥 ${a.label || a.asset_name} (${a.customer})`,
        type: "asset",
      });
    });

    siems.forEach((s) => {
      pts.push({
        lat: s.lat,
        lng: s.lng,
        size: 0.6,
        color: "#FF00FF",
        label: `📡 ${s.label} (${s.location_type})`,
        type: "siem",
      });
    });

    return pts;
  }, [assets, siems]);

  // ── Build rings for attack source clusters ──
  const ringsData = useMemo(() => {
    // Group attacks by approximate location
    const clusters = new Map<string, { lat: number; lng: number; count: number }>();
    attacks
      .filter((a) => !a.is_private_ip && a.source_lat !== 0)
      .forEach((a) => {
        const key = `${Math.round(a.source_lat)}:${Math.round(a.source_lng)}`;
        const existing = clusters.get(key);
        if (existing) {
          existing.count++;
        } else {
          clusters.set(key, { lat: a.source_lat, lng: a.source_lng, count: 1 });
        }
      });

    return Array.from(clusters.values()).map((c) => ({
      lat: c.lat,
      lng: c.lng,
      maxR: Math.min(2 + c.count * 0.3, 6),
      propagationSpeed: 1 + c.count * 0.2,
      repeatPeriod: Math.max(800 - c.count * 50, 400),
      color: c.count > 10 ? "#FF073A" : c.count > 5 ? "#FF6B35" : "#FFD700",
    }));
  }, [attacks]);

  // ── Private IP attacks (shown as self-arcs at asset location) ──
  const privateArcs = useMemo(() => {
    return attacks
      .filter((a) => a.is_private_ip && a.target_lat && a.target_lng)
      .map((a) => ({
        startLat: a.target_lat!,
        startLng: a.target_lng! - 0.5,
        endLat: a.target_lat!,
        endLng: a.target_lng! + 0.5,
        color: "#00D4FF",
        label: `${a.source_ip} (Internal) → ${a.target_asset || "Target"}`,
        stroke: 0.5,
        dashGap: 1,
      }));
  }, [attacks]);

  const allArcs = useMemo(() => [...arcsData, ...privateArcs], [arcsData, privateArcs]);

  // ── Stats ──
  const stats = useMemo(() => {
    const countries = new Set(attacks.filter((a) => a.source_country).map((a) => a.source_country));
    const p1Count = attacks.filter((a) => a.priority?.startsWith("P1")).length;
    return {
      totalAttacks: attacks.length,
      countries: countries.size,
      p1Count,
      privateCount: attacks.filter((a) => a.is_private_ip).length,
    };
  }, [attacks]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 56px)", background: "#0a0a1a" }}>
      {/* Globe */}
      <Globe
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        atmosphereColor="#00D4FF"
        atmosphereAltitude={0.15}
        // Arcs
        arcsData={allArcs}
        arcColor="color"
        arcStroke="stroke"
        arcDashLength={0.6}
        arcDashGap="dashGap"
        arcDashAnimateTime={2000}
        arcLabel="label"
        // Points (assets + SIEMs)
        pointsData={pointsData}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={0.01}
        pointRadius="size"
        pointColor="color"
        pointLabel="label"
        // Rings (attack source pulses)
        ringsData={ringsData}
        ringColor="color"
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        // Hex (heatmap of attack density)
        // Performance
        animateIn={true}
        width={typeof window !== "undefined" ? window.innerWidth : 1200}
        height={typeof window !== "undefined" ? window.innerHeight - 56 : 700}
      />

      {/* Top overlay bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: "linear-gradient(180deg, rgba(10,10,26,0.95) 0%, rgba(10,10,26,0) 100%)" }}>

        {/* Left: title + stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white tracking-wide">THREAT MAP</h2>
          </div>
          <div className="flex items-center gap-3 ml-4 text-xs">
            <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-mono">
              {stats.totalAttacks} attacks
            </span>
            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono">
              {stats.countries} countries
            </span>
            {stats.p1Count > 0 && (
              <span className="px-2 py-0.5 rounded bg-red-600/30 text-red-300 font-mono animate-pulse">
                {stats.p1Count} critical
              </span>
            )}
          </div>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2">
          {/* Customer filter */}
          <div className="relative">
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="appearance-none pl-3 pr-7 py-1.5 rounded text-xs font-medium cursor-pointer bg-white/5 border border-white/10 text-white/80 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40 pointer-events-none" />
          </div>

          <button
            onClick={loadData}
            className="p-1.5 rounded bg-white/5 border border-white/10 text-white/60 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-1.5 rounded border transition-colors ${autoRotate ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400" : "bg-white/5 border-white/10 text-white/40"}`}
            title="Auto-rotate"
          >
            <Radio className="w-4 h-4" />
          </button>

          <button
            onClick={() => setConfigOpen(!configOpen)}
            className={`p-1.5 rounded border transition-colors ${configOpen ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400" : "bg-white/5 border-white/10 text-white/60 hover:text-cyan-400"}`}
            title="Configure Assets & SIEMs"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom-left: legend */}
      <div className="absolute bottom-4 left-4 z-10 rounded-lg p-3 space-y-2"
        style={{ background: "rgba(10,10,26,0.85)", border: "1px solid rgba(0,212,255,0.15)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-500/70">Priority</p>
        {Object.entries(PRIORITY_COLORS).map(([k, c]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-3 h-0.5 rounded-full" style={{ background: c }} />
            <span className="text-[10px] text-white/60">{k}</span>
          </div>
        ))}
        <div className="border-t border-white/5 pt-1.5 mt-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-[10px] text-white/60">Asset</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
            <span className="text-[10px] text-white/60">SIEM</span>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
          <Spinner />
        </div>
      )}

      {/* Config Panel */}
      {configOpen && (
        <ConfigPanel
          customer={customer}
          customers={customers}
          assets={assets}
          siems={siems}
          onClose={() => setConfigOpen(false)}
          onRefresh={loadData}
        />
      )}
    </div>
  );
}


// ── Config Panel (Asset & SIEM management) ─────────────────────
interface ConfigPanelProps {
  customer: string;
  customers: string[];
  assets: AssetLocation[];
  siems: SiemLocation[];
  onClose: () => void;
  onRefresh: () => void;
}

function ConfigPanel({ customer, customers, assets, siems, onClose, onRefresh }: ConfigPanelProps) {
  const [tab, setTab] = useState<"assets" | "siems">("assets");
  const [ticketAssets, setTicketAssets] = useState<{ asset_name: string; count: number }[]>([]);
  const [addMode, setAddMode] = useState(false);

  // Form state
  const [form, setForm] = useState({
    customer: customer || "",
    asset_name: "",
    label: "",
    lat: "",
    lng: "",
    icon_type: "server",
    location_type: "on-prem",
    siem_label: "",
  });

  useEffect(() => {
    api.getTicketAssets(customer || undefined).then(setTicketAssets);
  }, [customer]);

  const handleSaveAsset = async () => {
    if (!form.customer || !form.asset_name || !form.lat || !form.lng) return;
    await api.upsertAssetLocation({
      customer: form.customer,
      asset_name: form.asset_name,
      label: form.label || undefined,
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      icon_type: form.icon_type,
    });
    setAddMode(false);
    setForm({ ...form, asset_name: "", label: "", lat: "", lng: "" });
    onRefresh();
  };

  const handleSaveSiem = async () => {
    if (!form.siem_label || !form.lat || !form.lng) return;
    await api.upsertSiemLocation({
      customer: form.customer || undefined,
      label: form.siem_label,
      location_type: form.location_type,
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
    });
    setAddMode(false);
    setForm({ ...form, siem_label: "", lat: "", lng: "" });
    onRefresh();
  };

  const handleDelete = async (type: "asset" | "siem", id: number) => {
    if (type === "asset") await api.deleteAssetLocation(id);
    else await api.deleteSiemLocation(id);
    onRefresh();
  };

  const inputCls = "w-full px-2 py-1.5 rounded text-xs bg-white/5 border border-white/10 text-white/90 placeholder-white/30 focus:outline-none focus:border-cyan-500/50";

  return (
    <div className="absolute top-0 right-0 bottom-0 z-30 w-80 overflow-y-auto"
      style={{ background: "rgba(10,10,26,0.95)", borderLeft: "1px solid rgba(0,212,255,0.15)" }}>

      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/5">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-cyan-400" />
          Map Configuration
        </h3>
        <button onClick={onClose} className="text-white/40 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5">
        {(["assets", "siems"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setAddMode(false); }}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${tab === t ? "text-cyan-400 border-b-2 border-cyan-400" : "text-white/40 hover:text-white/60"}`}
          >
            {t === "assets" ? "Assets" : "SIEMs"}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3">
        {/* Add button */}
        {!addMode && (
          <button
            onClick={() => setAddMode(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add {tab === "assets" ? "Asset Location" : "SIEM Location"}
          </button>
        )}

        {/* Add form */}
        {addMode && tab === "assets" && (
          <div className="space-y-2 p-3 rounded bg-white/3 border border-white/5">
            <p className="text-[10px] uppercase tracking-wider text-cyan-500/60 font-semibold">New Asset</p>

            <select
              value={form.customer}
              onChange={(e) => setForm({ ...form, customer: e.target.value })}
              className={inputCls}
            >
              <option value="">Select Customer</option>
              {customers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Show ticket assets as suggestions */}
            <div>
              <select
                value={form.asset_name}
                onChange={(e) => setForm({ ...form, asset_name: e.target.value })}
                className={inputCls}
              >
                <option value="">Select Asset (from tickets)</option>
                {ticketAssets.map((a) => (
                  <option key={a.asset_name} value={a.asset_name}>{a.asset_name} ({a.count} tickets)</option>
                ))}
              </select>
              <input
                value={form.asset_name}
                onChange={(e) => setForm({ ...form, asset_name: e.target.value })}
                placeholder="Or type asset name manually"
                className={`${inputCls} mt-1`}
              />
            </div>

            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Display label (optional)" className={inputCls} />

            <div className="grid grid-cols-2 gap-2">
              <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="Latitude" type="number" step="any" className={inputCls} />
              <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="Longitude" type="number" step="any" className={inputCls} />
            </div>

            <select value={form.icon_type} onChange={(e) => setForm({ ...form, icon_type: e.target.value })} className={inputCls}>
              <option value="server">🖥 Server</option>
              <option value="firewall">🛡 Firewall</option>
              <option value="endpoint">💻 Endpoint</option>
              <option value="database">🗄 Database</option>
              <option value="cloud">☁ Cloud</option>
            </select>

            <div className="flex gap-2">
              <button onClick={handleSaveAsset} className="flex-1 py-1.5 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors">
                Save
              </button>
              <button onClick={() => setAddMode(false)} className="flex-1 py-1.5 rounded text-xs font-medium bg-white/5 text-white/50 hover:bg-white/10 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {addMode && tab === "siems" && (
          <div className="space-y-2 p-3 rounded bg-white/3 border border-white/5">
            <p className="text-[10px] uppercase tracking-wider text-cyan-500/60 font-semibold">New SIEM</p>

            <select value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} className={inputCls}>
              <option value="">Shared (All Customers)</option>
              {customers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <input value={form.siem_label} onChange={(e) => setForm({ ...form, siem_label: e.target.value })} placeholder="SIEM Label (e.g. MTM SOC)" className={inputCls} />

            <select value={form.location_type} onChange={(e) => setForm({ ...form, location_type: e.target.value })} className={inputCls}>
              <option value="on-prem">On-Premise (MTM Office)</option>
              <option value="customer-site">Customer Site</option>
              <option value="cloud">Cloud</option>
            </select>

            <div className="grid grid-cols-2 gap-2">
              <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="Latitude" type="number" step="any" className={inputCls} />
              <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="Longitude" type="number" step="any" className={inputCls} />
            </div>

            <div className="flex gap-2">
              <button onClick={handleSaveSiem} className="flex-1 py-1.5 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors">
                Save
              </button>
              <button onClick={() => setAddMode(false)} className="flex-1 py-1.5 rounded text-xs font-medium bg-white/5 text-white/50 hover:bg-white/10 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Existing items list */}
        {tab === "assets" && (
          <div className="space-y-1.5">
            {assets.length === 0 && !addMode && (
              <p className="text-center text-xs text-white/30 py-4">No asset locations configured</p>
            )}
            {assets.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-2 rounded bg-white/3 border border-white/5 group">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ICON_TYPES[a.icon_type]?.color || "#00D4FF" }} />
                  <div className="min-w-0">
                    <p className="text-xs text-white/80 truncate">{a.label || a.asset_name}</p>
                    <p className="text-[10px] text-white/30 truncate">{a.customer} · {a.lat.toFixed(4)}, {a.lng.toFixed(4)}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete("asset", a.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "siems" && (
          <div className="space-y-1.5">
            {siems.length === 0 && !addMode && (
              <p className="text-center text-xs text-white/30 py-4">No SIEM locations configured</p>
            )}
            {siems.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded bg-white/3 border border-white/5 group">
                <div className="flex items-center gap-2 min-w-0">
                  <Wifi className="w-3.5 h-3.5 flex-shrink-0 text-fuchsia-400" />
                  <div className="min-w-0">
                    <p className="text-xs text-white/80 truncate">{s.label}</p>
                    <p className="text-[10px] text-white/30 truncate">{s.location_type} · {s.lat.toFixed(4)}, {s.lng.toFixed(4)}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete("siem", s.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
