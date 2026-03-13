import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api/client";
import { Spinner } from "../components/Spinner";
import type { AttackArc, AssetLocation, SiemLocation, TopologyNode } from "../types";
import {
  Settings2, Crosshair, Shield, Server, RefreshCw,
  ChevronDown, Plus, Trash2, MapPin, X, Wifi, Database, Cloud, Monitor,
  Play, Pause, Square, Clock, SkipForward, SkipBack,
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
  siem: { icon: Wifi, color: "#FF073A" },
  router: { icon: Server, color: "#8B5CF6" },
  switch: { icon: Server, color: "#06B6D4" },
};

// ── Animated polyline with dashes ──────────────────────────────
function AnimatedArc({ positions, color, weight, opacity }: {
  positions: [number, number][];
  color: string;
  weight: number;
  opacity: number;
}) {
  return (
    <>
      <Polyline positions={positions} pathOptions={{ color, weight: weight + 3, opacity: opacity * 0.2, lineCap: "round" }} />
      <Polyline positions={positions} pathOptions={{ color, weight, opacity, dashArray: "8 6", lineCap: "round" }} />
    </>
  );
}

// ── Curved arc points between two coordinates ──────────────────
function curvedArc(
  startLat: number, startLng: number,
  endLat: number, endLng: number,
  segments = 30
): [number, number][] {
  const points: [number, number][] = [];
  const midLat = (startLat + endLat) / 2;
  const midLng = (startLng + endLng) / 2;
  const dist = Math.sqrt((endLat - startLat) ** 2 + (endLng - startLng) ** 2);
  const dx = endLng - startLng;
  const dy = endLat - startLat;
  const offsetLat = midLat + (-dx * 0.15 * Math.min(dist / 30, 1));
  const offsetLng = midLng + (dy * 0.15 * Math.min(dist / 30, 1));
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lat = (1 - t) * (1 - t) * startLat + 2 * (1 - t) * t * offsetLat + t * t * endLat;
    const lng = (1 - t) * (1 - t) * startLng + 2 * (1 - t) * t * offsetLng + t * t * endLng;
    points.push([lat, lng]);
  }
  return points;
}

// ── Map invalidation on resize ─────────────────────────────────
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const handleResize = () => map.invalidateSize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [map]);
  return null;
}

// ── Replay ticket label (appearing/disappearing) ──────────────
function ReplayLabel({ attack, visible }: { attack: AttackArc; visible: boolean }) {
  if (!visible || !attack.target_lat || !attack.target_lng) return null;
  const color = PRIORITY_COLORS[attack.priority || ""] || "#00D4FF";
  return (
    <CircleMarker center={[attack.target_lat, attack.target_lng]} radius={0} pathOptions={{ opacity: 0 }}>
      <Tooltip permanent direction="top" offset={[0, -10]} className="replay-tooltip">
        <div className="text-[10px] font-mono px-2 py-1 rounded shadow-lg"
          style={{ background: "rgba(10,10,26,0.9)", border: `1px solid ${color}40`, color, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span className="opacity-50">{attack.source_ip}</span>{" → "}
          <span className="font-semibold">{attack.target_asset || "Target"}</span>
          {attack.priority && <span className="ml-1 opacity-60">[{attack.priority}]</span>}
        </div>
      </Tooltip>
    </CircleMarker>
  );
}

// ── Main Component ─────────────────────────────────────────────
export function ThreatMapView() {
  const [attacks, setAttacks] = useState<AttackArc[]>([]);
  const [assets, setAssets] = useState<AssetLocation[]>([]);
  const [siems, setSiems] = useState<SiemLocation[]>([]);
  const [topoNodes, setTopoNodes] = useState<TopologyNode[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [customer, setCustomer] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);

  // ── Replay state ──
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayStart, setReplayStart] = useState("");
  const [replayEnd, setReplayEnd] = useState("");
  const [replayData, setReplayData] = useState<AttackArc[]>([]);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [visibleLabels, setVisibleLabels] = useState<Set<number>>(new Set());
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load customers list
  useEffect(() => {
    api.getFilterOptions().then((opts) => setCustomers(opts.customers));
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [attackData, assetData, siemData, topoData] = await Promise.all([
        api.getAttacks(customer ? { customer } : {}, 500),
        api.getAssetLocations(customer || undefined),
        api.getSiemLocations(customer || undefined),
        api.getTopologyNodes(),
      ]);
      setAttacks(attackData);
      setAssets(assetData);
      setSiems(siemData);
      setTopoNodes(topoData);
    } catch (e) {
      console.error("Failed to load threat map data:", e);
    } finally {
      setLoading(false);
    }
  }, [customer]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Build arc data ──
  const arcsData = useMemo(() => {
    return attacks
      .filter((a) => !a.is_private_ip && a.source_lat !== 0 && a.source_lng !== 0 && a.target_lat && a.target_lng)
      .map((a, i) => ({
        positions: curvedArc(a.source_lat, a.source_lng, a.target_lat!, a.target_lng!),
        color: PRIORITY_COLORS[a.priority || ""] || ARC_COLORS[i % ARC_COLORS.length],
        label: `${a.source_ip} (${a.source_city || a.source_country || "Unknown"}) → ${a.target_asset || "Target"}`,
        weight: a.priority?.startsWith("P1") ? 2.5 : a.priority?.startsWith("P2") ? 1.8 : 1.2,
        priority: a.priority,
      }));
  }, [attacks]);

  // ── Stats ──
  const stats = useMemo(() => {
    const countries = new Set(attacks.filter((a) => a.source_country).map((a) => a.source_country));
    const p1Count = attacks.filter((a) => a.priority?.startsWith("P1")).length;
    const p2Count = attacks.filter((a) => a.priority?.startsWith("P2")).length;
    const categories = new Map<string, number>();
    attacks.forEach((a) => {
      if (a.attack_category) categories.set(a.attack_category, (categories.get(a.attack_category) || 0) + 1);
    });
    const topCategory = [...categories.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      totalAttacks: attacks.length,
      countries: countries.size,
      p1Count,
      p2Count,
      topCategory: topCategory ? `${topCategory[0]} (${topCategory[1]})` : null,
      privateCount: attacks.filter((a) => a.is_private_ip).length,
    };
  }, [attacks]);

  // ── Replay logic ──
  const loadReplayData = useCallback(async () => {
    if (!replayStart || !replayEnd) return;
    try {
      const data = await api.getAttacks(
        { customer: customer || undefined, start: replayStart, end: replayEnd },
        1000
      );
      const sorted = [...data].sort((a, b) => {
        const ta = a.created_time ? new Date(a.created_time).getTime() : 0;
        const tb = b.created_time ? new Date(b.created_time).getTime() : 0;
        return ta - tb;
      });
      setReplayData(sorted);
      setReplayIndex(0);
      setVisibleLabels(new Set());
    } catch (e) {
      console.error("Failed to load replay data:", e);
    }
  }, [replayStart, replayEnd, customer]);

  // Auto-advance replay
  useEffect(() => {
    if (!replayPlaying || replayIndex >= replayData.length) {
      if (replayIndex >= replayData.length && replayPlaying) setReplayPlaying(false);
      return;
    }
    const current = replayData[replayIndex];
    const next = replayData[replayIndex + 1];
    let delay = 800;
    if (current?.created_time && next?.created_time) {
      const diff = new Date(next.created_time).getTime() - new Date(current.created_time).getTime();
      delay = Math.max(200, Math.min(3000, diff / (60 * replaySpeed)));
    }
    replayTimerRef.current = setTimeout(() => {
      setReplayIndex((i) => i + 1);
      const ticketId = current.ticket_id;
      setVisibleLabels((prev) => new Set(prev).add(ticketId));
      setTimeout(() => {
        setVisibleLabels((prev) => { const n = new Set(prev); n.delete(ticketId); return n; });
      }, 3000 / replaySpeed);
    }, delay / replaySpeed);
    return () => { if (replayTimerRef.current) clearTimeout(replayTimerRef.current); };
  }, [replayPlaying, replayIndex, replayData, replaySpeed]);

  const replayStop = () => {
    setReplayPlaying(false);
    setReplayIndex(0);
    setVisibleLabels(new Set());
    if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
  };

  const replayCurrentTime = useMemo(() => {
    if (replayData.length === 0 || replayIndex === 0) return null;
    const idx = Math.min(replayIndex, replayData.length - 1);
    return replayData[idx]?.created_time || null;
  }, [replayData, replayIndex]);

  // Arcs visible during replay (up to current index)
  const replayArcs = useMemo(() => {
    if (!replayOpen || replayData.length === 0) return [];
    return replayData.slice(0, replayIndex)
      .filter((a) => !a.is_private_ip && a.source_lat !== 0 && a.source_lng !== 0 && a.target_lat && a.target_lng)
      .map((a, i) => ({
        positions: curvedArc(a.source_lat, a.source_lng, a.target_lat!, a.target_lng!),
        color: PRIORITY_COLORS[a.priority || ""] || ARC_COLORS[i % ARC_COLORS.length],
        weight: a.priority?.startsWith("P1") ? 2.5 : 1.5,
      }));
  }, [replayOpen, replayData, replayIndex]);

  const displayArcs = replayOpen && replayData.length > 0 ? replayArcs : arcsData;

  // Set default replay date range (last 24h)
  useEffect(() => {
    if (!replayStart) {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      setReplayEnd(now.toISOString().slice(0, 16));
      setReplayStart(yesterday.toISOString().slice(0, 16));
    }
  }, [replayStart]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 56px)", background: "#0a0a1a" }}>
      {/* Leaflet Map */}
      <MapContainer
        center={[-2, 118]}
        zoom={5}
        minZoom={3}
        maxZoom={14}
        zoomControl={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%", background: "#0a0a1a" }}
      >
        <MapResizer />
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" subdomains="abcd" />

        {/* Attack arcs */}
        {displayArcs.map((arc, i) => (
          <AnimatedArc key={i} positions={arc.positions} color={arc.color} weight={arc.weight} opacity={0.7} />
        ))}

        {/* Asset markers */}
        {assets.map((a) => (
          <CircleMarker key={`asset-${a.id}`} center={[a.lat, a.lng]} radius={6}
            pathOptions={{ color: ICON_TYPES[a.icon_type]?.color || "#00D4FF", fillColor: ICON_TYPES[a.icon_type]?.color || "#00D4FF", fillOpacity: 0.7, weight: 2 }}>
            <Tooltip><span className="text-xs">🖥 {a.label || a.asset_name} ({a.customer})</span></Tooltip>
          </CircleMarker>
        ))}

        {/* SIEM markers */}
        {siems.map((s) => (
          <CircleMarker key={`siem-${s.id}`} center={[s.lat, s.lng]} radius={8}
            pathOptions={{ color: "#FF00FF", fillColor: "#FF00FF", fillOpacity: 0.6, weight: 2 }}>
            <Tooltip><span className="text-xs">📡 {s.label} ({s.location_type})</span></Tooltip>
          </CircleMarker>
        ))}

        {/* Topology node markers */}
        {topoNodes.filter((n) => n.lat != null && n.lng != null && (!customer || n.customer === customer)).map((n) => {
          const cfg = ICON_TYPES[n.node_type] || ICON_TYPES.server;
          return (
            <CircleMarker key={`topo-${n.id}`} center={[n.lat!, n.lng!]} radius={7}
              pathOptions={{ color: cfg.color, fillColor: cfg.color, fillOpacity: 0.6, weight: 2 }}>
              <Tooltip><span className="text-xs">🔷 {n.label}{n.hostname ? ` (${n.hostname})` : ""}{n.customer ? ` · ${n.customer}` : ""}</span></Tooltip>
            </CircleMarker>
          );
        })}

        {/* Attack source clusters */}
        {(() => {
          const clusters = new Map<string, { lat: number; lng: number; count: number }>();
          const src = replayOpen && replayData.length > 0 ? replayData.slice(0, replayIndex) : attacks;
          src.filter((a) => !a.is_private_ip && a.source_lat !== 0).forEach((a) => {
            const key = `${Math.round(a.source_lat * 2) / 2}:${Math.round(a.source_lng * 2) / 2}`;
            const existing = clusters.get(key);
            if (existing) existing.count++;
            else clusters.set(key, { lat: a.source_lat, lng: a.source_lng, count: 1 });
          });
          return Array.from(clusters.values()).map((c, i) => (
            <CircleMarker key={`cluster-${i}`} center={[c.lat, c.lng]}
              radius={Math.min(4 + c.count * 0.8, 18)}
              pathOptions={{
                color: c.count > 10 ? "#FF073A" : c.count > 5 ? "#FF6B35" : "#FFD700",
                fillColor: c.count > 10 ? "#FF073A" : c.count > 5 ? "#FF6B35" : "#FFD700",
                fillOpacity: 0.3, weight: 1,
              }}>
              <Tooltip><span className="text-xs">{c.count} attacks from this area</span></Tooltip>
            </CircleMarker>
          ));
        })()}

        {/* Replay ticket labels */}
        {replayOpen && replayData.slice(0, replayIndex).map((a) => (
          <ReplayLabel key={`label-${a.ticket_id}`} attack={a} visible={visibleLabels.has(a.ticket_id)} />
        ))}
      </MapContainer>

      {/* Top overlay bar */}
      <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 py-3"
        style={{ background: "linear-gradient(180deg, rgba(10,10,26,0.95) 0%, rgba(10,10,26,0) 100%)" }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white tracking-wide">THREAT MAP</h2>
          </div>
          <div className="flex items-center gap-3 ml-4 text-xs">
            <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-mono">{stats.totalAttacks} attacks</span>
            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono">{stats.countries} countries</span>
            {stats.p1Count > 0 && (
              <span className="px-2 py-0.5 rounded bg-red-600/30 text-red-300 font-mono animate-pulse">{stats.p1Count} critical</span>
            )}
            {stats.p2Count > 0 && (
              <span className="px-2 py-0.5 rounded bg-orange-600/30 text-orange-300 font-mono">{stats.p2Count} high</span>
            )}
            {stats.topCategory && (
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">Top: {stats.topCategory}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select value={customer} onChange={(e) => setCustomer(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
              style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)", color: "var(--theme-text-secondary)", border: "1px solid var(--theme-surface-border)" }}>
              <option value="">All Customers</option>
              {customers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--theme-text-muted)" }} />
          </div>
          <button onClick={loadData} className="p-1.5 rounded bg-white/5 border border-white/10 text-white/60 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setReplayOpen(!replayOpen)}
            className={`p-1.5 rounded border transition-colors ${replayOpen ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400" : "bg-white/5 border-white/10 text-white/60 hover:text-cyan-400"}`}
            title="Event Replay">
            <Clock className="w-4 h-4" />
          </button>
          <button onClick={() => setConfigOpen(!configOpen)}
            className={`p-1.5 rounded border transition-colors ${configOpen ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400" : "bg-white/5 border-white/10 text-white/60 hover:text-cyan-400"}`}
            title="Configure Assets & SIEMs">
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Replay Panel (bottom) */}
      {replayOpen && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] px-4 py-3"
          style={{ background: "linear-gradient(0deg, rgba(10,10,26,0.95) 0%, rgba(10,10,26,0) 100%)" }}>
          <div className="max-w-4xl mx-auto rounded-lg p-3"
            style={{ background: "rgba(10,10,26,0.9)", border: "1px solid rgba(0,212,255,0.15)" }}>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wider text-cyan-500/60">From</label>
                <input type="datetime-local" value={replayStart} onChange={(e) => setReplayStart(e.target.value)}
                  className="px-2 py-1 rounded text-xs bg-white/5 border border-white/10 text-white/80 focus:outline-none focus:border-cyan-500/50"
                  style={{ colorScheme: "dark" }} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wider text-cyan-500/60">To</label>
                <input type="datetime-local" value={replayEnd} onChange={(e) => setReplayEnd(e.target.value)}
                  className="px-2 py-1 rounded text-xs bg-white/5 border border-white/10 text-white/80 focus:outline-none focus:border-cyan-500/50"
                  style={{ colorScheme: "dark" }} />
              </div>
              <button onClick={loadReplayData}
                className="px-3 py-1 rounded text-xs font-medium bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-colors">
                Load
              </button>
              <div className="w-px h-6 bg-white/10" />
              <div className="flex items-center gap-1">
                <button onClick={() => setReplayIndex(Math.max(0, replayIndex - 10))} disabled={replayData.length === 0}
                  className="p-1 rounded text-white/40 hover:text-white disabled:opacity-30" title="Back 10">
                  <SkipBack className="w-4 h-4" />
                </button>
                {replayPlaying ? (
                  <button onClick={() => setReplayPlaying(false)} className="p-1.5 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors" title="Pause">
                    <Pause className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={() => { if (replayIndex >= replayData.length) setReplayIndex(0); setReplayPlaying(true); }}
                    disabled={replayData.length === 0} className="p-1.5 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-30" title="Play">
                    <Play className="w-4 h-4" />
                  </button>
                )}
                <button onClick={replayStop} disabled={replayData.length === 0}
                  className="p-1 rounded text-white/40 hover:text-red-400 disabled:opacity-30" title="Stop">
                  <Square className="w-4 h-4" />
                </button>
                <button onClick={() => setReplayIndex(Math.min(replayData.length, replayIndex + 10))} disabled={replayData.length === 0}
                  className="p-1 rounded text-white/40 hover:text-white disabled:opacity-30" title="Forward 10">
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
              <div className="relative">
                <select value={replaySpeed} onChange={(e) => setReplaySpeed(Number(e.target.value))}
                  className="appearance-none pl-2 pr-7 py-1 rounded-lg text-xs cursor-pointer"
                  style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)", color: "var(--theme-text-secondary)", border: "1px solid var(--theme-surface-border)" }}>
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                  <option value={8}>8x</option>
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: "var(--theme-text-muted)" }} />
              </div>
              <div className="flex-1 flex items-center gap-2 min-w-[120px]">
                <input type="range" min={0} max={replayData.length} value={replayIndex}
                  onChange={(e) => { setReplayPlaying(false); setReplayIndex(Number(e.target.value)); }}
                  className="flex-1 h-1 accent-cyan-400" />
                <span className="text-[10px] font-mono text-white/50 whitespace-nowrap">{replayIndex}/{replayData.length}</span>
              </div>
            </div>
            {replayCurrentTime && (
              <div className="mt-2 flex items-center gap-2">
                <Clock className="w-3 h-3 text-cyan-400/60" />
                <span className="text-xs font-mono text-cyan-400/80">{new Date(replayCurrentTime).toLocaleString()}</span>
                {replayIndex > 0 && replayIndex <= replayData.length && (
                  <span className="text-[10px] text-white/40 ml-2">
                    {replayData[Math.min(replayIndex - 1, replayData.length - 1)]?.source_ip} → {replayData[Math.min(replayIndex - 1, replayData.length - 1)]?.target_asset || "Target"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom-left: legend */}
      <div className="absolute left-4 z-[1000] rounded-lg p-3 space-y-2"
        style={{ background: "rgba(10,10,26,0.85)", border: "1px solid rgba(0,212,255,0.15)", bottom: replayOpen ? 90 : 16 }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-500/70">Priority</p>
        {Object.entries(PRIORITY_COLORS).filter((_, i) => i % 2 === 0).map(([k, c]) => (
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
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: "#8B5CF6" }} />
            <span className="text-[10px] text-white/60">Topology Node</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 opacity-50" />
            <span className="text-[10px] text-white/60">Attack Source</span>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/50">
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

  const inputCls = "w-full px-2 py-1.5 rounded-lg text-xs focus:outline-none transition-colors theme-input";
  const selectCls = `${inputCls} appearance-none pr-7 cursor-pointer`;
  const chevronCls = "absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" as const;

  return (
    <div className="absolute top-0 right-0 bottom-0 z-[1100] w-80 overflow-y-auto"
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

            <div className="relative">
              <select
                value={form.customer}
                onChange={(e) => setForm({ ...form, customer: e.target.value })}
                className={selectCls}
              >
                <option value="">Select Customer</option>
                {customers.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className={chevronCls} style={{ color: "var(--theme-text-muted)" }} />
            </div>

            {/* Show ticket assets as suggestions */}
            <div>
              <div className="relative">
                <select
                  value={form.asset_name}
                  onChange={(e) => setForm({ ...form, asset_name: e.target.value })}
                  className={selectCls}
                >
                  <option value="">Select Asset (from tickets)</option>
                  {ticketAssets.map((a) => (
                    <option key={a.asset_name} value={a.asset_name}>{a.asset_name} ({a.count} tickets)</option>
                  ))}
                </select>
                <ChevronDown className={chevronCls} style={{ color: "var(--theme-text-muted)" }} />
              </div>
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

            <div className="relative">
              <select value={form.icon_type} onChange={(e) => setForm({ ...form, icon_type: e.target.value })} className={selectCls}>
                <option value="server">🖥 Server</option>
                <option value="firewall">🛡 Firewall</option>
                <option value="endpoint">💻 Endpoint</option>
                <option value="database">🗄 Database</option>
                <option value="cloud">☁ Cloud</option>
              </select>
              <ChevronDown className={chevronCls} style={{ color: "var(--theme-text-muted)" }} />
            </div>

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

            <div className="relative">
              <select value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} className={selectCls}>
                <option value="">Shared (All Customers)</option>
                {customers.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className={chevronCls} style={{ color: "var(--theme-text-muted)" }} />
            </div>

            <input value={form.siem_label} onChange={(e) => setForm({ ...form, siem_label: e.target.value })} placeholder="SIEM Label (e.g. MTM SOC)" className={inputCls} />

            <div className="relative">
              <select value={form.location_type} onChange={(e) => setForm({ ...form, location_type: e.target.value })} className={selectCls}>
                <option value="on-prem">On-Premise (MTM Office)</option>
                <option value="customer-site">Customer Site</option>
                <option value="cloud">Cloud</option>
              </select>
              <ChevronDown className={chevronCls} style={{ color: "var(--theme-text-muted)" }} />
            </div>

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
