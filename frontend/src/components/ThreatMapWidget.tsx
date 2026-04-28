import { useState, useEffect, useRef, useMemo } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { api } from "../api/client";
import type { AttackMapData, AttackMapEvent } from "../types";
import { Card } from "./Card";

const GEO_URL = "/geo/countries-110m.json";
const TARGET_POS: [number, number] = [107.6, -6.9];

function heatColor(count: number, maxCount: number): string {
  if (!count || !maxCount) return "#1a1a22";
  const scale = Math.log(count + 1) / Math.log(maxCount + 1);
  const a = Math.max(0.15, scale);
  return `rgb(${Math.round(26 + 100 * a)},${Math.round(26 - 10 * a)},${Math.round(34 - 10 * a)})`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface Arc {
  id: string;
  from: [number, number];
  to: [number, number];
  protocol: string;
  createdAt: number;
  phase: "travel" | "fade";
  progress: number;
  opacity: number;
}

interface Props {
  customer?: string;
  bare?: boolean;
}

export function ThreatMapWidget({ customer, bare }: Props) {
  const [mapData, setMapData] = useState<AttackMapData | null>(null);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const arcIdCounter = useRef(0);
  const seenIds = useRef(new Set<string>());
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getAttackMapData(24);
        setMapData(data);
      } catch {
        // silent
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [customer]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api.getAttackMapEvents(5, 5);
        const newEvents = res.items.filter((e: AttackMapEvent) => !seenIds.current.has(e.id));
        newEvents.forEach((e: AttackMapEvent) => seenIds.current.add(e.id));
        if (newEvents.length > 0) {
          const newArcs = newEvents.slice(0, 2).map((e: AttackMapEvent, i: number) => ({
            id: `arc-${arcIdCounter.current++}`,
            from: [e.source_lng, e.source_lat] as [number, number],
            to: TARGET_POS,
            protocol: e.protocol,
            createdAt: Date.now() + i * 600,
            phase: "travel" as const,
            progress: 0,
            opacity: 1,
          }));
          setArcs(prev => [...prev, ...newArcs].slice(-4));
        }
      } catch {
        // silent
      }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [customer]);

  useEffect(() => {
    let lastFrame = 0;
    const tick = (ts: number) => {
      if (ts - lastFrame < 100) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrame = ts;
      const now = Date.now();
      setArcs(prev => prev.map(arc => {
        const el = now - arc.createdAt;
        if (el < 0) return arc;
        if (el < 2500) return { ...arc, phase: "travel" as const, progress: el / 2500, opacity: 1 };
        if (el < 5000) return { ...arc, phase: "fade" as const, progress: 1, opacity: 1 - (el - 2500) / 2500 };
        return { ...arc, opacity: 0 };
      }).filter(a => a.opacity > 0));
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const countryMap = useMemo(() => {
    const m = new Map<string, number>();
    mapData?.countries.forEach(c => m.set(c.country, c.count));
    return m;
  }, [mapData]);
  const maxCount = useMemo(() => Math.max(1, ...Array.from(countryMap.values())), [countryMap]);

  const PROTO_COLORS: Record<string, string> = {
    ssh: "#ef4444", http: "#f97316", https: "#f97316", rdp: "#3b82f6",
    telnet: "#eab308", tcp: "#9b9ba8", default: "#9b9ba8",
  };
  const protoColor = (p: string) => PROTO_COLORS[p?.toLowerCase()] || PROTO_COLORS.default;

  const bezierCtrl = (from: [number, number], to: [number, number]): [number, number] => {
    const mx = (from[0] + to[0]) / 2;
    const my = (from[1] + to[1]) / 2;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.01) return [mx, my];
    const off = Math.min(0.12 * d, 12);
    return [mx + (-dy / d) * off, my + (dx / d) * off];
  };
  const bezierPt = (from: [number, number], ctrl: [number, number], to: [number, number], t: number): [number, number] => {
    const s = 1 - t;
    return [s * s * from[0] + 2 * s * t * ctrl[0] + t * t * to[0], s * s * from[1] + 2 * s * t * ctrl[1] + t * t * to[1]];
  };

  const topCountry = mapData?.countries[0];

  const inner = (
    <div className="h-full flex flex-col" style={{ minHeight: 200 }}>
      <div className="flex-1 relative overflow-hidden">
        <ComposableMap
          projectionConfig={{ scale: 147, center: [0, 0] }}
          style={{ width: "100%", height: "100%", background: "var(--theme-surface-base)" }}
        >
          <ZoomableGroup zoom={1} center={[20, 10]} minZoom={1} maxZoom={1}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) => geographies.map(geo => {
                const name = geo.properties.name;
                const count = countryMap.get(name) || 0;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={count > 0 ? heatColor(count, maxCount) : "var(--theme-card-bg)"}
                    stroke="var(--theme-surface-border)"
                    strokeWidth={0.3}
                    style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }}
                  />
                );
              })}
            </Geographies>

            <Marker coordinates={TARGET_POS}>
              <circle r={2.5} fill="#10b981" opacity={0.9} />
              <circle r={0} fill="none" stroke="#10b981" strokeWidth={0.6} opacity={0.6}>
                <animate attributeName="r" from="2" to="8" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
              </circle>
            </Marker>

            {arcs.map(arc => {
              if (arc.opacity <= 0) return null;
              const ctrl = bezierCtrl(arc.from, arc.to);
              const color = protoColor(arc.protocol);
              if (arc.phase === "travel") {
                const head = bezierPt(arc.from, ctrl, arc.to, arc.progress);
                const trail = arc.progress > 0.08 ? bezierPt(arc.from, ctrl, arc.to, arc.progress - 0.08) : arc.from;
                return (
                  <g key={arc.id} opacity={arc.opacity}>
                    <Marker coordinates={trail}><circle r={0.8} fill={color} opacity={0.4} /></Marker>
                    <Marker coordinates={head}><circle r={1.8} fill={color} opacity={0.9} /></Marker>
                  </g>
                );
              }
              return <Marker key={arc.id} coordinates={arc.to}><circle r={1.5} fill={color} opacity={arc.opacity * 0.5} /></Marker>;
            })}
          </ZoomableGroup>
        </ComposableMap>

        <div className="absolute top-1.5 right-2 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#ef4444" }} />
          <span className="text-[9px] font-mono" style={{ color: "#ef4444" }}>LIVE</span>
        </div>
      </div>

      <div
        className="flex-shrink-0 flex items-center gap-0 border-t text-[10px] font-mono"
        style={{ borderColor: "var(--theme-surface-border)", height: 32 }}
      >
        <div className="flex-1 px-2 border-r" style={{ borderColor: "var(--theme-surface-border)" }}>
          <span style={{ color: "var(--theme-text-muted)" }}>Top: </span>
          <span style={{ color: "var(--theme-text-primary)" }}>{topCountry?.country || "—"}</span>
          <span className="ml-1" style={{ color: "var(--theme-text-muted)" }}>{topCountry ? fmtCount(topCountry.count) : ""}</span>
        </div>
        <div className="flex-1 px-2 border-r" style={{ borderColor: "var(--theme-surface-border)" }}>
          <span style={{ color: "var(--theme-text-muted)" }}>24h: </span>
          <span style={{ color: "var(--theme-text-primary)" }}>{fmtCount(mapData?.total_events || 0)}</span>
        </div>
        <div className="flex-1 px-2">
          <span style={{ color: "var(--theme-text-muted)" }}>⊕ </span>
          <span style={{ color: "var(--theme-text-primary)" }}>{mapData?.active_countries || 0}</span>
          <span style={{ color: "var(--theme-text-muted)" }}> ctry</span>
        </div>
      </div>
    </div>
  );

  if (bare) return inner;
  return <Card title="Live Threat Map">{inner}</Card>;
}
