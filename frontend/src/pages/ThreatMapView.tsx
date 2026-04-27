/**
 * Threat Map — Real-time attack visualization
 * Shows site markers, internal attack pulses, external attack arcs, and live feed.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import { Shield, RefreshCw, Crosshair, Clock } from "lucide-react";
import { api } from "../api/client";
import type { AttackArc, TopologyNode } from "../types";
import { ErrorAlert } from "../components/ErrorAlert";
import { Spinner } from "../components/Spinner";
import "leaflet/dist/leaflet.css";

// ── Priority colors (design guide) ──
const PRIORITY_COLOR: Record<string, string> = {
  "P1-Critical": "#ef4444", "P1 - Critical": "#ef4444", Critical: "#ef4444",
  "P2-High": "#f59e0b", "P2 - High": "#f59e0b", High: "#f59e0b",
  "P3-Medium": "#9b9ba8", "P3 - Medium": "#9b9ba8", Medium: "#9b9ba8",
  "P4-Low": "#646471", "P4 - Low": "#646471", Low: "#646471",
};
function getPrioColor(p: string | null): string {
  return (p && PRIORITY_COLOR[p]) || "#646471";
}

// ── Site grouping from topology nodes ──
interface Site {
  id: number;
  label: string;
  customer: string | null;
  lat: number;
  lng: number;
  nodeCount: number;
  nodes: TopologyNode[];
}

function groupToSites(nodes: TopologyNode[]): Site[] {
  const map = new Map<string, Site>();
  for (const n of nodes) {
    if (n.lat == null || n.lng == null) continue;
    // Group by customer + rounded coords (same physical site)
    const key = `${n.customer || "none"}_${n.lat.toFixed(2)}_${n.lng.toFixed(2)}`;
    if (!map.has(key)) {
      map.set(key, {
        id: n.id,
        label: n.label,
        customer: n.customer,
        lat: n.lat,
        lng: n.lng,
        nodeCount: 0,
        nodes: [],
      });
    }
    const site = map.get(key)!;
    site.nodeCount++;
    site.nodes.push(n);
  }
  return Array.from(map.values());
}

// ── Auto-fit bounds ──
function FitBounds({ sites, attacks }: { sites: Site[]; attacks: AttackArc[] }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    sites.forEach(s => pts.push([s.lat, s.lng]));
    attacks.forEach(a => {
      if (a.source_lat && a.source_lng && !a.is_private_ip) pts.push([a.source_lat, a.source_lng]);
      if (a.target_lat && a.target_lng) pts.push([a.target_lat, a.target_lng]);
    });
    if (pts.length >= 2) {
      map.fitBounds(pts as any, { padding: [40, 40], maxZoom: 10 });
    } else if (pts.length === 1) {
      map.setView(pts[0] as any, 8);
    }
  }, [sites, attacks, map]);
  return null;
}

// ── Curved arc path ──
function curvedArc(from: [number, number], to: [number, number], segments = 30): [number, number][] {
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;
  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;
  const dx = lng2 - lng1;
  const dy = lat2 - lat1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = dist * 0.15;
  const perpLat = midLat + (-dx / dist) * offset;
  const perpLng = midLng + (dy / dist) * offset;
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * perpLat + t * t * lat2;
    const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * perpLng + t * t * lng2;
    pts.push([lat, lng]);
  }
  return pts;
}

// ── Feed item type ──
interface FeedItem {
  id: number;
  ip: string;
  asset: string | null;
  customer: string | null;
  priority: string | null;
  category: string | null;
  validation: string | null;
  status: string | null;
  time: string | null;
  rule_id: string | null;
  rule_name: string | null;
  subject: string | null;
  is_private: boolean;
}

export function ThreatMapView() {
  const [attacks, setAttacks] = useState<AttackArc[]>([]);
  const [nodes, setNodes] = useState<TopologyNode[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [customer, setCustomer] = useState<string>("");
  const [customers, setCustomers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [attackData, nodeData, feedData, filterOpts] = await Promise.all([
        api.getAttacks({ customer: customer || undefined, limit: 500 }),
        api.getTopologyNodes(),
        fetch(`/api/threatmap/feed?limit=50${customer ? `&customer=${customer}` : ""}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("soc_token")}` },
        }).then(r => r.json()),
        api.getFilterOptions(),
      ]);
      setAttacks(attackData);
      setNodes(nodeData);
      setFeed(feedData);
      setCustomers(filterOpts.customers || []);
    } catch (e) {
      console.error("Failed to load threat map:", e);
      setLoadError(e instanceof Error ? e.message : "Failed to load threat map data");
    }
    setLoading(false);
  }, [customer]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh feed every 30s
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const feedData = await fetch(`/api/threatmap/feed?limit=50${customer ? `&customer=${customer}` : ""}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("soc_token")}` },
        }).then(r => r.json());
        setFeed(feedData);
      } catch {}
    }, 30000);
    return () => clearInterval(id);
  }, [customer]);

  const sites = useMemo(() => groupToSites(nodes), [nodes]);

  // Stats
  const totalAttacks = attacks.length;
  const internalCount = attacks.filter(a => a.is_private_ip).length;
  const externalCount = totalAttacks - internalCount;
  const criticalCount = attacks.filter(a => a.priority?.includes("Critical")).length;
  const highCount = attacks.filter(a => a.priority?.includes("High")).length;

  // Render external arcs (public IPs with geolocation)
  const externalArcs = useMemo(() =>
    attacks.filter(a => !a.is_private_ip && a.source_lat && a.source_lng && a.target_lat && a.target_lng)
      .slice(0, 50),
    [attacks]
  );

  // Count internal attacks per site (for pulse intensity)
  const siteAttackCounts = useMemo(() => {
    const counts = new Map<string, number>();
    attacks.forEach(a => {
      if (a.is_private_ip && a.target_lat && a.target_lng) {
        const key = `${a.target_lat.toFixed(2)}_${a.target_lng.toFixed(2)}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    return counts;
  }, [attacks]);

  return (
    <div className="relative w-full flex flex-col" style={{ height: "calc(100vh - 56px)", background: "var(--theme-surface-base)" }}>
      {/* Error alert */}
      {loadError && (
        <div className="absolute top-16 left-4 right-4 z-[1001]">
          <ErrorAlert error={loadError} onRetry={loadData} />
        </div>
      )}

      {/* Loading state */}
      {loading && attacks.length === 0 && nodes.length === 0 && (
        <div className="absolute inset-0 z-[1001] flex items-center justify-center" style={{ background: "var(--theme-surface-base)" }}>
          <Spinner />
        </div>
      )}

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={[-2, 118]}
          zoom={5}
          minZoom={3}
          maxZoom={14}
          zoomControl={false}
          attributionControl={false}
          style={{ width: "100%", height: "100%", background: "var(--theme-surface-base)" }}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" subdomains="abcd" />
          <FitBounds sites={sites} attacks={externalArcs} />

          {/* Site markers */}
          {sites.map(site => {
            const key = `${site.lat.toFixed(2)}_${site.lng.toFixed(2)}`;
            const attackCount = siteAttackCounts.get(key) || 0;
            const hasAttacks = attackCount > 0;
            return (
              <CircleMarker
                key={`site-${site.id}`}
                center={[site.lat, site.lng]}
                radius={hasAttacks ? Math.min(8 + attackCount * 0.3, 20) : 6}
                pathOptions={{
                  color: hasAttacks ? "#f59e0b" : "#60a5fa",
                  fillColor: hasAttacks ? "#f59e0b" : "#60a5fa",
                  fillOpacity: hasAttacks ? 0.4 : 0.3,
                  weight: 1.5,
                }}
              >
                <Tooltip>
                  <div className="text-xs" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
                    <strong>{site.label}</strong>
                    {site.customer && <span className="opacity-60"> · {site.customer}</span>}
                    <br />
                    <span className="opacity-60">{site.nodeCount} assets</span>
                    {attackCount > 0 && <span className="text-amber-400"> · {attackCount} attacks</span>}
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}

          {/* Internal attack pulse rings (private IPs) */}
          {sites.map(site => {
            const key = `${site.lat.toFixed(2)}_${site.lng.toFixed(2)}`;
            const count = siteAttackCounts.get(key) || 0;
            if (count === 0) return null;
            return [12, 20, 28].map((r, i) => (
              <CircleMarker
                key={`pulse-${site.id}-${i}`}
                center={[site.lat, site.lng]}
                radius={r}
                pathOptions={{
                  color: "#f59e0b",
                  fillColor: "transparent",
                  fillOpacity: 0,
                  weight: 1,
                  opacity: 0.3 - i * 0.1,
                  dashArray: "4 4",
                }}
              />
            ));
          })}

          {/* External attack arcs */}
          {externalArcs.map((a, i) => {
            const color = getPrioColor(a.priority);
            const positions = curvedArc(
              [a.source_lat!, a.source_lng!],
              [a.target_lat!, a.target_lng!]
            );
            return (
              <Polyline
                key={`arc-${a.ticket_id}-${i}`}
                positions={positions}
                pathOptions={{ color, weight: 1.5, opacity: 0.5, dashArray: "6 4" }}
              >
                <Tooltip><span className="text-[10px] font-mono">{a.priority} → {a.target_asset}</span></Tooltip>
              </Polyline>
            );
          })}
        </MapContainer>

        {/* Overlay: Stats bar */}
        <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center justify-between">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg" style={{ backgroundColor: "var(--theme-nav-bg)", border: "1px solid var(--theme-surface-border)" }}>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" style={{ color: "var(--theme-text-secondary)" }} />
              <h2 className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>Threat Map</h2>
            </div>
            <div className="h-4 w-px" style={{ backgroundColor: "var(--theme-surface-border)" }} />
            <div className="flex items-center gap-3 text-[11px] font-mono" style={{ color: "var(--theme-text-secondary)" }}>
              <span>{totalAttacks} attacks</span>
              {internalCount > 0 && <span style={{ color: "#f59e0b" }}>{internalCount} internal</span>}
              {externalCount > 0 && <span style={{ color: "#60a5fa" }}>{externalCount} external</span>}
              <span>{sites.length} sites</span>
              {criticalCount > 0 && <span style={{ color: "#ef4444" }}>{criticalCount} P1</span>}
              {highCount > 0 && <span style={{ color: "#f59e0b" }}>{highCount} P2</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="appearance-none text-xs px-3 py-2 pr-8 rounded-lg cursor-pointer"
              style={{ backgroundColor: "var(--theme-nav-bg)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-primary)" }}
            >
              <option value="">All Customers</option>
              {customers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={loadData}
              className="p-2 rounded-lg transition-colors hover:bg-white/[0.05]"
              style={{ backgroundColor: "var(--theme-nav-bg)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-secondary)" }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Overlay: Legend */}
        <div className="absolute bottom-2 left-4 z-[1000] px-3 py-2 rounded-lg text-[10px]" style={{ backgroundColor: "var(--theme-nav-bg)", border: "1px solid var(--theme-surface-border)" }}>
          <div className="flex items-center gap-3" style={{ color: "var(--theme-text-muted)" }}>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#60a5fa" }} />Site</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#f59e0b" }} />Under attack</span>
            <span className="flex items-center gap-1"><span className="w-3 h-px" style={{ backgroundColor: "#ef4444" }} />P1 arc</span>
            <span className="flex items-center gap-1"><span className="w-3 h-px" style={{ backgroundColor: "#f59e0b" }} />P2 arc</span>
          </div>
        </div>
      </div>

      {/* Attack Feed Ticker */}
      <div
        ref={feedRef}
        className="h-36 overflow-y-auto border-t shrink-0"
        style={{ backgroundColor: "var(--theme-surface-base)", borderColor: "var(--theme-surface-border)" }}
      >
        <div className="sticky top-0 z-10 px-4 py-1.5 text-[10px] uppercase tracking-wider font-medium flex items-center gap-2" style={{ backgroundColor: "var(--theme-surface-base)", borderBottom: "1px solid var(--theme-surface-border)", color: "var(--theme-text-muted)" }}>
          <Clock className="w-3 h-3" />
          Live Attack Feed
          <span className="ml-auto font-mono">{feed.length} events</span>
        </div>
        {feed.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: "var(--theme-text-dim)" }}>No recent attacks</p>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--theme-surface-border)" }}>
            {feed.map(f => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-1.5 text-[11px] hover:bg-white/[0.02] transition-colors">
                <span className="font-mono w-14 shrink-0" style={{ color: "var(--theme-text-dim)" }}>
                  {f.time ? new Date(f.time).toLocaleTimeString("id-ID", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
                </span>
                <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ backgroundColor: getPrioColor(f.priority) }} />
                <span className="truncate" style={{ color: "var(--theme-text-secondary)" }}>
                  {f.rule_name || f.subject || f.category || "Alert"}
                </span>
                <span style={{ color: "var(--theme-text-dim)" }}>→</span>
                <span className="font-mono truncate" style={{ color: "var(--theme-text-primary)" }}>{f.asset || "—"}</span>
                {f.customer && <span className="shrink-0" style={{ color: "var(--theme-text-dim)" }}>{f.customer}</span>}
                {f.validation && (
                  <span className="shrink-0 text-[9px] px-1 py-0.5 rounded font-medium" style={{
                    backgroundColor: f.validation === "True Positive" ? "rgba(16,185,129,0.1)" : "rgba(155,155,168,0.08)",
                    color: f.validation === "True Positive" ? "#10b981" : "#646471",
                  }}>
                    {f.validation === "True Positive" ? "TP" : f.validation === "False Positive" ? "FP" : "—"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
