/**
 * BitBait-style Live Attack Map
 * Uses react-simple-maps for SVG world map + animated Bézier attack arcs
 * Data from Wazuh Indexer (OpenSearch) via /api/threatmap/attack-map/*
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps";
import { Shield, RefreshCw, Globe, MapPin, TrendingUp, Zap, ZoomIn, ZoomOut, Crosshair } from "lucide-react";
import { api } from "../api/client";
import type { AttackMapEvent, AttackMapData, AttackMapCountry } from "../types";
import { ErrorAlert } from "./ErrorAlert";

const GEO_URL = "/geo/countries-110m.json";

// Protocol colors (BitBait-inspired)
const PROTO_COLORS: Record<string, string> = {
  ssh: "#ef4444", http: "#f97316", https: "#f97316", rdp: "#3b82f6",
  telnet: "#eab308", ftp: "#8b5cf6", smb: "#a855f7", dns: "#22c55e",
  sip: "#ec4899", vnc: "#06b6d4", tcp: "#9b9ba8", mysql: "#f59e0b",
  postgres: "#3b82f6",
};
const getProtoColor = (proto: string) => PROTO_COLORS[proto?.toLowerCase()] || "#9b9ba8";

// Country centroid lookup for arc targets (our assets are in Indonesia)
const TARGET_POS: [number, number] = [107.6, -6.9]; // Jakarta-ish

// ── Arc types ──
interface Arc {
  id: string;
  from: [number, number]; // [lng, lat]
  to: [number, number];
  protocol: string;
  sourceIp: string;
  country: string;
  port: string;
  createdAt: number;
  phase: "travel" | "impact" | "fade";
  progress: number;
  opacity: number;
}

// ── Bézier helpers ──
function bezierControl(from: [number, number], to: [number, number]): [number, number] {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(0.15 * dist, 15);
  if (dist < 0.01) return [mx, my];
  return [mx + (-dy / dist) * offset, my + (dx / dist) * offset];
}

function bezierPoint(from: [number, number], ctrl: [number, number], to: [number, number], t: number): [number, number] {
  const s = 1 - t;
  return [s * s * from[0] + 2 * s * t * ctrl[0] + t * t * to[0], s * s * from[1] + 2 * s * t * ctrl[1] + t * t * to[1]];
}

// Heat color (log scale): cream → pink → red
function heatColor(count: number, maxCount: number): string {
  if (!count || !maxCount) return "#1a1a22";
  const scale = Math.log(count + 1) / Math.log(maxCount + 1);
  const a = Math.max(0.15, scale);
  const r = Math.round(26 + 100 * a);
  const g = Math.round(26 - 10 * a);
  const b = Math.round(34 - 10 * a);
  return `rgb(${r},${g},${b})`;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5) return "now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════
interface Props {
  customer?: string;
}

export function AttackMap({ customer }: Props) {
  const [mapData, setMapData] = useState<AttackMapData | null>(null);
  const [events, setEvents] = useState<AttackMapEvent[]>([]);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([20, 10]);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hoveredGeo, setHoveredGeo] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [selectedGeo, setSelectedGeo] = useState<string | null>(null);
  const arcIdCounter = useRef(0);
  const seenIds = useRef(new Set<string>());
  const animRef = useRef<number | null>(null);

  // ── Poll summary data every 15s ──
  const loadSummary = useCallback(async () => {
    try {
      const data = await api.getAttackMapData(24);
      setMapData(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load attack map data");
    }
  }, []);

  useEffect(() => {
    loadSummary();
    const id = setInterval(loadSummary, 15000);
    return () => clearInterval(id);
  }, [loadSummary]);

  // ── Poll events every 3s ──
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api.getAttackMapEvents(2, 15);
        const newEvents = res.items.filter(e => !seenIds.current.has(e.id));
        newEvents.forEach(e => seenIds.current.add(e.id));

        if (newEvents.length > 0) {
          setEvents(prev => [...newEvents, ...prev].slice(0, 50));
          setLastUpdate(new Date().toISOString());

          // Create arcs for new events (max 8 per poll, staggered)
          const newArcs: Arc[] = newEvents.slice(0, 8).map((e, i) => ({
            id: `arc-${arcIdCounter.current++}`,
            from: [e.source_lng, e.source_lat],
            to: TARGET_POS,
            protocol: e.protocol,
            sourceIp: e.source_ip,
            country: e.source_country,
            port: e.port,
            createdAt: Date.now() + i * 400,
            phase: "travel" as const,
            progress: 0,
            opacity: 1,
          }));
          setArcs(prev => [...prev, ...newArcs].slice(-50));
        }

        // Prune old seen IDs (keep last 500)
        if (seenIds.current.size > 500) {
          const arr = Array.from(seenIds.current);
          seenIds.current = new Set(arr.slice(-300));
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load attack map events");
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  // ── Animation loop (throttled to ~15fps for performance) ──
  useEffect(() => {
    let lastFrame = 0;
    const tick = (timestamp: number) => {
      // Throttle to ~15fps (66ms between frames)
      if (timestamp - lastFrame < 66) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrame = timestamp;
      const now = Date.now();
      setArcs(prev => {
        const updated = prev.map(arc => {
          const elapsed = now - arc.createdAt;
          if (elapsed < 0) return arc;
          if (elapsed < 2000) return { ...arc, phase: "travel" as const, progress: elapsed / 2000, opacity: 1 };
          if (elapsed < 3000) return { ...arc, phase: "impact" as const, progress: 1, opacity: 1 };
          if (elapsed < 5500) return { ...arc, phase: "fade" as const, progress: 1, opacity: 1 - (elapsed - 3000) / 2500 };
          return { ...arc, opacity: 0 };
        }).filter(a => a.opacity > 0);
        return updated;
      });
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  // Country heat map
  const countryMap = useMemo(() => {
    const m = new Map<string, number>();
    mapData?.countries.forEach(c => m.set(c.country, c.count));
    return m;
  }, [mapData]);
  const maxCountryCount = useMemo(() => Math.max(1, ...Array.from(countryMap.values())), [countryMap]);

  // Unique protocols for legend
  const protocolLegend = useMemo(() => {
    const seen = new Set<string>();
    const items: { proto: string; color: string }[] = [];
    for (const e of events) {
      const p = e.protocol?.toLowerCase() || "tcp";
      if (!seen.has(p)) {
        seen.add(p);
        items.push({ proto: p, color: getProtoColor(p) });
      }
    }
    return items.slice(0, 8);
  }, [events]);

  // Country stats for selected geography
  const countryStats = useMemo(() => {
    if (!selectedGeo) return null;
    const evts = events.filter(e => e.source_country === selectedGeo);
    const total = evts.length;

    const ruleMap = new Map<string, { desc: string; count: number; level: number }>();
    const portMap = new Map<number, number>();
    const protoMap = new Map<string, number>();

    for (const e of evts) {
      if (e.rule_id) {
        const prev = ruleMap.get(e.rule_id);
        ruleMap.set(e.rule_id, {
          desc: e.rule_desc || prev?.desc || e.rule_id,
          count: (prev?.count ?? 0) + 1,
          level: Math.max(prev?.level ?? 0, e.rule_level ?? 0),
        });
      }
      if (e.port) portMap.set(Number(e.port), (portMap.get(Number(e.port)) ?? 0) + 1);
      if (e.protocol) protoMap.set(e.protocol, (protoMap.get(e.protocol) ?? 0) + 1);
    }

    return {
      total,
      topRules: [...ruleMap.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      topPorts: [...portMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      topProtos: [...protoMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [selectedGeo, events]);

  return (
    <div className="relative w-full flex flex-col" style={{ height: "calc(100vh - 56px)", background: "var(--theme-surface-base)" }}>

      {/* ── Header bar — normal flow, not absolute ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between flex-wrap gap-x-3 gap-y-2 px-3 py-2 z-20"
        style={{ borderBottom: "1px solid var(--theme-surface-border)", background: "var(--theme-nav-bg)" }}
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4" style={{ color: "var(--theme-text-secondary)" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>Live Attack Map</h2>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#ef4444" }} />
            <span className="text-[10px] font-mono" style={{ color: "#ef4444" }}>Live</span>
            <span className="text-[10px] font-mono ml-1" style={{ color: "var(--theme-text-dim)" }}>{lastUpdate ? timeAgo(lastUpdate) : "—"}</span>
          </div>
        </div>

        {/* KPI cards */}
        <div className="flex gap-2 flex-wrap">
          {[
            { icon: Shield, label: "Events (24h)", value: fmtCount(mapData?.total_events || 0) },
            { icon: MapPin, label: "Countries", value: String(mapData?.active_countries || 0) },
            { icon: TrendingUp, label: "Top Source", value: mapData?.top_source || "—" },
            { icon: Zap, label: "Unique IPs", value: fmtCount(mapData?.unique_ips || 0) },
          ].map(kpi => (
            <div key={kpi.label} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 80%, transparent)", border: "1px solid var(--theme-surface-border)" }}>
              <kpi.icon className="w-3.5 h-3.5" style={{ color: "var(--theme-text-muted)" }} />
              <div>
                <div className="text-[9px] uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>{kpi.label}</div>
                <div className="text-sm font-semibold font-mono" style={{ color: "var(--theme-text-primary)" }}>{kpi.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SVG Map ── */}
      <div className="flex-1 relative overflow-hidden">
        <ComposableMap
          projectionConfig={{ scale: 147, center: [0, 0] }}
          style={{ width: "100%", height: "100%", background: "var(--theme-surface-base)" }}
        >
          <ZoomableGroup zoom={zoom} center={center} onMoveEnd={({ coordinates, zoom: z }) => { setCenter(coordinates as [number, number]); setZoom(z); }} minZoom={1} maxZoom={8}>
            {/* Country polygons */}
            <Geographies geography={GEO_URL}>
              {({ geographies }) => geographies.map(geo => {
                const name = geo.properties.name;
                const count = countryMap.get(name) || 0;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={selectedGeo === name ? "rgba(59,130,246,0.35)" : count > 0 ? heatColor(count, maxCountryCount) : "var(--theme-card-bg)"}
                    stroke="var(--theme-surface-border)"
                    strokeWidth={0.3}
                    onMouseEnter={(evt) => {
                      setHoveredGeo(name);
                      const e = evt as unknown as React.MouseEvent;
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseMove={(evt) => {
                      const e = evt as unknown as React.MouseEvent;
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => setHoveredGeo(null)}
                    onClick={() => setSelectedGeo(prev => prev === name ? null : name)}
                    style={{
                      default: { outline: "none", cursor: "pointer" },
                      hover: { fill: selectedGeo === name ? "rgba(59,130,246,0.5)" : count > 0 ? heatColor(count * 1.5, maxCountryCount) : "var(--theme-surface-raised)", outline: "none", cursor: "pointer" },
                      pressed: { outline: "none" },
                    }}
                  />
                );
              })}
            </Geographies>

            {/* Target marker (our assets — Jakarta) */}
            <Marker coordinates={TARGET_POS}>
              <circle r={3} fill="#10b981" opacity={0.8} />
              <circle r={6} fill="none" stroke="#10b981" strokeWidth={0.5} opacity={0.4}>
                <animate attributeName="r" from="3" to="10" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
              </circle>
            </Marker>

            {/* Attack arcs */}
            {arcs.map(arc => {
              if (arc.opacity <= 0) return null;
              const ctrl = bezierControl(arc.from, arc.to);
              const color = getProtoColor(arc.protocol);

              if (arc.phase === "travel") {
                // Draw trail dots + head
                const dots: [number, number][] = [];
                const trailLength = 8;
                for (let i = 0; i < trailLength; i++) {
                  const t = arc.progress - (i * 0.03);
                  if (t > 0) dots.push(bezierPoint(arc.from, ctrl, arc.to, t));
                }
                const head = bezierPoint(arc.from, ctrl, arc.to, arc.progress);
                return (
                  <g key={arc.id} opacity={arc.opacity}>
                    {dots.map((d, i) => (
                      <Marker key={i} coordinates={d as [number, number]}>
                        <circle r={0.5} fill={color} opacity={1 - i * 0.1} />
                      </Marker>
                    ))}
                    <Marker coordinates={head as [number, number]}>
                      <circle r={2} fill={color} opacity={0.9} />
                      <circle r={4} fill={color} opacity={0.2} />
                    </Marker>
                  </g>
                );
              }

              if (arc.phase === "impact") {
                return (
                  <Marker key={arc.id} coordinates={arc.to}>
                    <circle r={3} fill={color} opacity={arc.opacity * 0.8} />
                    <circle r={0} fill="none" stroke={color} strokeWidth={0.8} opacity={arc.opacity}>
                      <animate attributeName="r" from="3" to="12" dur="1s" fill="freeze" />
                      <animate attributeName="opacity" from="0.8" to="0" dur="1s" fill="freeze" />
                    </circle>
                  </Marker>
                );
              }

              // Fade
              return (
                <Marker key={arc.id} coordinates={arc.to}>
                  <circle r={2} fill={color} opacity={arc.opacity * 0.5} />
                </Marker>
              );
            })}

            {/* Country attack markers (top 20) */}
            {mapData?.countries.slice(0, 20).map(c => c.lat && c.lng && (
              <Marker key={c.country} coordinates={[c.lng, c.lat]}>
                <circle r={Math.min(1 + Math.log(c.count + 1) * 0.5, 5)} fill="#ef4444" opacity={0.3} />
              </Marker>
            ))}
          </ZoomableGroup>
        </ComposableMap>

        {/* Country hover tooltip */}
        {hoveredGeo && (
          <div
            className="fixed text-xs px-2.5 py-1.5 rounded-lg pointer-events-none z-50 shadow-lg"
            style={{
              left: tooltipPos.x + 14,
              top: tooltipPos.y - 35,
              background: "var(--theme-nav-bg)",
              border: "1px solid var(--theme-surface-border)",
              color: "var(--theme-text-primary)",
              backdropFilter: "blur(8px)",
            }}
          >
            <span className="font-medium">{hoveredGeo}</span>
            <span className="ml-2" style={{ color: "var(--theme-text-secondary)" }}>
              {(countryMap.get(hoveredGeo) ?? 0).toLocaleString()} attacks
            </span>
          </div>
        )}

        {/* Error alert */}
        {loadError && (
          <div className="absolute top-2 left-3 right-3 z-30">
            <ErrorAlert error={loadError} onRetry={loadSummary} />
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute top-2 left-3 z-10 flex flex-col gap-1">
          {[
            { icon: ZoomIn, action: () => setZoom(z => Math.min(z * 1.5, 8)) },
            { icon: ZoomOut, action: () => setZoom(z => Math.max(z / 1.5, 1)) },
            { icon: Crosshair, action: () => { setZoom(1); setCenter([20, 10]); } },
          ].map((btn, i) => (
            <button key={i} onClick={btn.action} className="p-1.5 rounded-lg" style={{ backgroundColor: "var(--theme-nav-bg)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-secondary)" }}>
              <btn.icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Threat gradient legend */}
        <div className="absolute bottom-24 left-3 z-10 px-2 py-1.5 rounded-lg text-[9px]" style={{ backgroundColor: "var(--theme-nav-bg)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-muted)" }}>
          <div className="mb-1">Threat</div>
          <div className="flex items-center gap-1">
            <span>Low</span>
            <div className="w-16 h-1.5 rounded-full" style={{ background: "linear-gradient(to right, #1a1a22, #5a1a1a, #8a2020)" }} />
            <span>High</span>
          </div>
        </div>

        {/* Protocol legend */}
        {protocolLegend.length > 0 && (
          <div className="absolute bottom-24 right-3 z-10 px-2 py-1.5 rounded-lg text-[9px]" style={{ backgroundColor: "var(--theme-nav-bg)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-muted)" }}>
            <div className="mb-1">Protocol</div>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              {protocolLegend.map(p => (
                <span key={p.proto} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.proto.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Country stats panel (inside map div, right side) */}
        {selectedGeo && countryStats && (
          <div
            className="absolute top-2 right-3 w-72 max-h-[calc(100%-2rem)] overflow-y-auto rounded-xl z-30 shadow-2xl"
            style={{
              background: "var(--theme-nav-bg)",
              border: "1px solid var(--theme-surface-border)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="sticky top-0 flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--theme-surface-border)", background: "var(--theme-nav-bg)" }}>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>{selectedGeo}</h3>
                <p className="text-xs" style={{ color: "var(--theme-text-secondary)" }}>{countryStats.total.toLocaleString()} attacks</p>
              </div>
              <button onClick={() => setSelectedGeo(null)} className="text-xs px-2 py-1 rounded hover:opacity-70" style={{ color: "var(--theme-text-muted)" }}>✕</button>
            </div>

            {/* Top Rules */}
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
              <h4 className="text-[10px] uppercase font-semibold mb-2" style={{ color: "var(--theme-text-muted)" }}>Top Rules</h4>
              <div className="space-y-1.5">
                {countryStats.topRules.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded shrink-0 font-mono"
                      style={{
                        background: r.level >= 10 ? "rgba(239,68,68,0.15)" : r.level >= 7 ? "rgba(245,158,11,0.15)" : "rgba(100,120,140,0.1)",
                        color: r.level >= 10 ? "#ef4444" : r.level >= 7 ? "#f59e0b" : "var(--theme-text-muted)",
                      }}
                    >
                      L{r.level}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] truncate" style={{ color: "var(--theme-text-primary)" }} title={r.desc}>{r.desc}</p>
                      <p className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>{r.count} hits</p>
                    </div>
                  </div>
                ))}
                {countryStats.topRules.length === 0 && (
                  <p className="text-[11px]" style={{ color: "var(--theme-text-dim)" }}>No rule data</p>
                )}
              </div>
            </div>

            {/* Top Ports */}
            <div className="px-4 py-3">
              <h4 className="text-[10px] uppercase font-semibold mb-2" style={{ color: "var(--theme-text-muted)" }}>Top Ports</h4>
              <div className="flex flex-wrap gap-1.5">
                {countryStats.topPorts.map(([port, count]) => (
                  <span key={port} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--theme-surface-raised)", color: "var(--theme-text-secondary)" }}>
                    :{port} <span style={{ color: "var(--theme-text-muted)" }}>({count})</span>
                  </span>
                ))}
                {countryStats.topPorts.length === 0 && (
                  <p className="text-[11px]" style={{ color: "var(--theme-text-dim)" }}>No port data</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom panel: Countries + Live Feed ── */}
      <div className="h-44 flex border-t shrink-0" style={{ backgroundColor: "var(--theme-surface-base)", borderColor: "var(--theme-surface-border)" }}>
        {/* Top Attacking Countries */}
        <div className="w-72 shrink-0 border-r overflow-y-auto" style={{ borderColor: "var(--theme-surface-border)" }}>
          <div className="sticky top-0 px-3 py-1.5 text-[10px] uppercase tracking-wider font-medium" style={{ backgroundColor: "var(--theme-surface-base)", borderBottom: "1px solid var(--theme-surface-border)", color: "var(--theme-text-muted)" }}>
            <TrendingUp className="w-3 h-3 inline mr-1" />Top Attacking Countries
            <span className="ml-1 font-mono">{mapData?.active_countries || 0}</span>
          </div>
          {mapData?.countries.slice(0, 15).map((c, i) => (
            <div key={c.country} className="flex items-center gap-2 px-3 py-1 text-[11px] hover:bg-white/[0.02]">
              <span className="w-4 font-mono shrink-0" style={{ color: "var(--theme-text-dim)" }}>{i + 1}</span>
              <span className="truncate" style={{ color: "var(--theme-text-primary)" }}>{c.country}</span>
              <span className="ml-auto font-mono shrink-0" style={{ color: "var(--theme-text-secondary)" }}>{fmtCount(c.count)}</span>
              <span className="text-[9px] w-10 text-right" style={{ color: "var(--theme-text-dim)" }}>
                {mapData ? (c.count / mapData.total_events * 100).toFixed(1) + "%" : ""}
              </span>
            </div>
          ))}
        </div>

        {/* Live Attack Feed */}
        <div className="flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 px-3 py-1.5 text-[10px] uppercase tracking-wider font-medium flex items-center gap-1.5" style={{ backgroundColor: "var(--theme-surface-base)", borderBottom: "1px solid var(--theme-surface-border)", color: "var(--theme-text-muted)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#ef4444" }} />
            Live Attack Feed
            <span className="ml-auto font-mono">{events.length} events</span>
          </div>
          {events.map((e, i) => (
            <div key={`${e.id}-${i}`} className="flex items-start gap-2 px-3 py-1 text-[11px] hover:bg-white/[0.02]">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: getProtoColor(e.protocol) }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono w-28 shrink-0 truncate" style={{ color: "var(--theme-text-secondary)" }}>{e.source_ip}</span>
                  <span style={{ color: "var(--theme-text-dim)" }}>→</span>
                  <span className="font-mono shrink-0" style={{ color: "var(--theme-text-muted)" }}>:{e.port}</span>
                  <span className="text-[10px] px-1 rounded shrink-0" style={{ backgroundColor: getProtoColor(e.protocol) + "20", color: getProtoColor(e.protocol) }}>{e.protocol}</span>
                  {e.rule_level > 0 && (
                    <span className="text-[9px] px-1 rounded font-mono shrink-0" style={{
                      background: e.rule_level >= 10 ? "rgba(239,68,68,0.15)" : e.rule_level >= 7 ? "rgba(245,158,11,0.15)" : "rgba(100,120,140,0.1)",
                      color: e.rule_level >= 10 ? "#ef4444" : e.rule_level >= 7 ? "#f59e0b" : "var(--theme-text-muted)",
                    }}>
                      L{e.rule_level}
                    </span>
                  )}
                  <span className="truncate" style={{ color: "var(--theme-text-dim)" }}>{e.agent_name}</span>
                  <span className="ml-auto font-mono shrink-0 text-[10px]" style={{ color: "var(--theme-text-dim)" }}>{timeAgo(e.time)}</span>
                </div>
                {e.rule_desc && (
                  <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--theme-text-dim)", maxWidth: "300px" }} title={e.rule_desc}>
                    {e.rule_desc}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
