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
  const arcIdCounter = useRef(0);
  const seenIds = useRef(new Set<string>());
  const animRef = useRef<number | null>(null);

  // ── Poll summary data every 15s ──
  const loadSummary = useCallback(async () => {
    try {
      const data = await api.getAttackMapData(24);
      setMapData(data);
    } catch {}
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
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  // ── Animation loop (30ms tick) ──
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      setArcs(prev => prev.map(arc => {
        const elapsed = now - arc.createdAt;
        if (elapsed < 0) return arc; // Not yet started (stagger)
        if (elapsed < 2000) {
          return { ...arc, phase: "travel", progress: elapsed / 2000, opacity: 1 };
        } else if (elapsed < 3000) {
          return { ...arc, phase: "impact", progress: 1, opacity: 1 };
        } else if (elapsed < 5500) {
          return { ...arc, phase: "fade", progress: 1, opacity: 1 - (elapsed - 3000) / 2500 };
        }
        return { ...arc, opacity: 0 };
      }).filter(a => a.opacity > 0));
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

  return (
    <div className="relative w-full flex flex-col" style={{ height: "calc(100vh - 56px)", background: "#0a0a0c" }}>

      {/* ── Header ── */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e" }}>
          <Globe className="w-4 h-4" style={{ color: "#9b9ba8" }} />
          <h2 className="text-sm font-semibold" style={{ color: "#e8e8ec" }}>Live Attack Map</h2>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#ef4444" }} />
            <span className="text-[10px] font-mono" style={{ color: "#ef4444" }}>Live</span>
            <span className="text-[10px] font-mono ml-1" style={{ color: "#3e3e48" }}>{lastUpdate ? timeAgo(lastUpdate) : "—"}</span>
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
            <div key={kpi.label} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e" }}>
              <kpi.icon className="w-3.5 h-3.5" style={{ color: "#646471" }} />
              <div>
                <div className="text-[9px] uppercase tracking-wider" style={{ color: "#646471" }}>{kpi.label}</div>
                <div className="text-sm font-semibold font-mono" style={{ color: "#e8e8ec" }}>{kpi.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SVG Map ── */}
      <div className="flex-1 relative overflow-hidden">
        <ComposableMap
          projectionConfig={{ scale: 147, center: [0, 0] }}
          style={{ width: "100%", height: "100%", background: "#0a0a0c" }}
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
                    fill={count > 0 ? heatColor(count, maxCountryCount) : "#141418"}
                    stroke="#26262e"
                    strokeWidth={0.3}
                    style={{
                      default: { outline: "none" },
                      hover: { fill: count > 0 ? heatColor(count * 1.5, maxCountryCount) : "#1b1b21", outline: "none" },
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

        {/* Zoom controls */}
        <div className="absolute top-16 right-3 z-10 flex flex-col gap-1">
          {[
            { icon: ZoomIn, action: () => setZoom(z => Math.min(z * 1.5, 8)) },
            { icon: ZoomOut, action: () => setZoom(z => Math.max(z / 1.5, 1)) },
            { icon: Crosshair, action: () => { setZoom(1); setCenter([20, 10]); } },
          ].map((btn, i) => (
            <button key={i} onClick={btn.action} className="p-1.5 rounded-lg" style={{ backgroundColor: "rgba(10,10,12,0.9)", border: "1px solid #26262e", color: "#9b9ba8" }}>
              <btn.icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Threat gradient legend */}
        <div className="absolute bottom-24 left-3 z-10 px-2 py-1.5 rounded-lg text-[9px]" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e", color: "#646471" }}>
          <div className="mb-1">Threat</div>
          <div className="flex items-center gap-1">
            <span>Low</span>
            <div className="w-16 h-1.5 rounded-full" style={{ background: "linear-gradient(to right, #1a1a22, #5a1a1a, #8a2020)" }} />
            <span>High</span>
          </div>
        </div>

        {/* Protocol legend */}
        {protocolLegend.length > 0 && (
          <div className="absolute bottom-24 right-3 z-10 px-2 py-1.5 rounded-lg text-[9px]" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e", color: "#646471" }}>
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
      </div>

      {/* ── Bottom panel: Countries + Live Feed ── */}
      <div className="h-44 flex border-t shrink-0" style={{ backgroundColor: "#0a0a0c", borderColor: "#1d1d23" }}>
        {/* Top Attacking Countries */}
        <div className="w-72 shrink-0 border-r overflow-y-auto" style={{ borderColor: "#1d1d23" }}>
          <div className="sticky top-0 px-3 py-1.5 text-[10px] uppercase tracking-wider font-medium" style={{ backgroundColor: "#0a0a0c", borderBottom: "1px solid #1d1d23", color: "#646471" }}>
            <TrendingUp className="w-3 h-3 inline mr-1" />Top Attacking Countries
            <span className="ml-1 font-mono">{mapData?.active_countries || 0}</span>
          </div>
          {mapData?.countries.slice(0, 15).map((c, i) => (
            <div key={c.country} className="flex items-center gap-2 px-3 py-1 text-[11px] hover:bg-white/[0.02]">
              <span className="w-4 font-mono shrink-0" style={{ color: "#3e3e48" }}>{i + 1}</span>
              <span className="truncate" style={{ color: "#e8e8ec" }}>{c.country}</span>
              <span className="ml-auto font-mono shrink-0" style={{ color: "#9b9ba8" }}>{fmtCount(c.count)}</span>
              <span className="text-[9px] w-10 text-right" style={{ color: "#3e3e48" }}>
                {mapData ? (c.count / mapData.total_events * 100).toFixed(1) + "%" : ""}
              </span>
            </div>
          ))}
        </div>

        {/* Live Attack Feed */}
        <div className="flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 px-3 py-1.5 text-[10px] uppercase tracking-wider font-medium flex items-center gap-1.5" style={{ backgroundColor: "#0a0a0c", borderBottom: "1px solid #1d1d23", color: "#646471" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#ef4444" }} />
            Live Attack Feed
            <span className="ml-auto font-mono">{events.length} events</span>
          </div>
          {events.map((e, i) => (
            <div key={`${e.id}-${i}`} className="flex items-center gap-2 px-3 py-1 text-[11px] hover:bg-white/[0.02]">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getProtoColor(e.protocol) }} />
              <span className="font-mono w-28 shrink-0 truncate" style={{ color: "#9b9ba8" }}>{e.source_ip}</span>
              <span style={{ color: "#3e3e48" }}>→</span>
              <span className="font-mono shrink-0" style={{ color: "#646471" }}>:{e.port}</span>
              <span className="text-[10px] px-1 rounded shrink-0" style={{ backgroundColor: getProtoColor(e.protocol) + "20", color: getProtoColor(e.protocol) }}>{e.protocol}</span>
              <span className="truncate" style={{ color: "#3e3e48" }}>{e.agent_name}</span>
              <span className="ml-auto font-mono shrink-0 text-[10px]" style={{ color: "#3e3e48" }}>{timeAgo(e.time)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
