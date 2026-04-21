/**
 * Unified Threats & Infrastructure page
 * Two modes: Map (geographic attack viz) and Graph (network topology)
 * Plus: Historical attack replay and site detail panel
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import ReactFlow, { Background, MiniMap, Handle, Position, applyNodeChanges, applyEdgeChanges, addEdge, type Node, type Edge, type OnNodesChange, type OnEdgesChange, type OnConnect } from "reactflow";
import "reactflow/dist/style.css";
import "leaflet/dist/leaflet.css";
import { Shield, RefreshCw, Clock, Globe, Network, Plus, Save, X, Trash2, MapPin, Play, Square, ChevronRight, Server, Monitor, Database, Cloud, Radio, Router as RouterIcon, Cpu, Download, Upload, Camera, Search, Palette } from "lucide-react";
import { api } from "../api/client";
import type { AttackArc, TopologyNode, TopologyLink } from "../types";


// ── Design guide colors ──
const PRIO_COLOR: Record<string, string> = {
  "P1-Critical": "#ef4444", "P1 - Critical": "#ef4444", Critical: "#ef4444",
  "P2-High": "#f59e0b", "P2 - High": "#f59e0b", High: "#f59e0b",
  "P3-Medium": "#9b9ba8", "P3 - Medium": "#9b9ba8", Medium: "#9b9ba8",
  "P4-Low": "#646471", "P4 - Low": "#646471", Low: "#646471",
};
const pc = (p: string | null) => (p && PRIO_COLOR[p]) || "#646471";

// ── Node config for topology ──
const NODE_CFG: Record<string, { label: string; color: string; icon: typeof Server }> = {
  server: { label: "Server", color: "#60a5fa", icon: Server },
  firewall: { label: "Firewall", color: "#f59e0b", icon: Shield },
  endpoint: { label: "Endpoint", color: "#10b981", icon: Monitor },
  database: { label: "Database", color: "#9b9ba8", icon: Database },
  cloud: { label: "Cloud", color: "#a78bfa", icon: Cloud },
  siem: { label: "SIEM", color: "#ef4444", icon: Radio },
  router: { label: "Router", color: "#8B5CF6", icon: RouterIcon },
  switch: { label: "Switch", color: "#60a5fa", icon: Cpu },
};

// ── Types ──
interface FeedItem { id: number; ip: string; asset: string | null; customer: string | null; priority: string | null; category: string | null; validation: string | null; status: string | null; time: string | null; rule_name: string | null; subject: string | null; is_private: boolean; }
interface Site { id: number; label: string; customer: string | null; lat: number; lng: number; nodeCount: number; }

type Mode = "map" | "graph";

// ── Helpers ──
function groupToSites(nodes: TopologyNode[]): Site[] {
  const m = new Map<string, Site>();
  for (const n of nodes) {
    if (n.lat == null || n.lng == null) continue;
    const k = `${n.customer || "x"}_${n.lat.toFixed(2)}_${n.lng.toFixed(2)}`;
    if (!m.has(k)) m.set(k, { id: n.id, label: n.label, customer: n.customer, lat: n.lat, lng: n.lng, nodeCount: 0 });
    m.get(k)!.nodeCount++;
  }
  return Array.from(m.values());
}

function curvedArc(from: [number, number], to: [number, number]): [number, number][] {
  const [lat1, lng1] = from; const [lat2, lng2] = to;
  const mx = (lat1 + lat2) / 2, my = (lng1 + lng2) / 2;
  const dx = lng2 - lng1, dy = lat2 - lat1, d = Math.sqrt(dx * dx + dy * dy);
  const off = d * 0.15, px = mx + (-dx / d) * off, py = my + (dy / d) * off;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    pts.push([(1 - t) ** 2 * lat1 + 2 * (1 - t) * t * px + t ** 2 * lat2, (1 - t) ** 2 * lng1 + 2 * (1 - t) * t * py + t ** 2 * lng2]);
  }
  return pts;
}

function FitBounds({ sites }: { sites: Site[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = sites.map(s => [s.lat, s.lng] as [number, number]);
    if (pts.length >= 2) map.fitBounds(pts, { padding: [40, 40], maxZoom: 10 });
    else if (pts.length === 1) map.setView(pts[0], 8);
  }, [sites, map]);
  return null;
}

// ── Custom ReactFlow node ──
function TopoNode({ data }: { data: { label: string; nodeType: string; hostname: string; customer: string } }) {
  const cfg = NODE_CFG[data.nodeType] || NODE_CFG.server;
  const Icon = cfg.icon;
  return (
    <div className="rounded-lg px-3 py-2 min-w-[120px] text-center border relative" style={{ backgroundColor: "#141418", borderColor: cfg.color + "40" }}>
      <Handle type="target" position={Position.Top} style={{ background: "#3e3e48", border: "none", width: 6, height: 6 }} />
      <Handle type="target" position={Position.Left} id="left" style={{ background: "#3e3e48", border: "none", width: 6, height: 6 }} />
      <Icon className="w-5 h-5 mx-auto mb-1" style={{ color: cfg.color }} />
      <div className="text-xs font-medium truncate" style={{ color: "#e8e8ec" }}>{data.label}</div>
      {data.hostname && <div className="text-[9px] font-mono truncate" style={{ color: "#646471" }}>{data.hostname}</div>}
      <Handle type="source" position={Position.Bottom} style={{ background: "#3e3e48", border: "none", width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: "#3e3e48", border: "none", width: 6, height: 6 }} />
    </div>
  );
}
const nodeTypes = { topology: TopoNode };

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export function ThreatsPage() {
  const [mode, setMode] = useState<Mode>("map");
  const [attacks, setAttacks] = useState<AttackArc[]>([]);
  const [nodes, setNodes] = useState<TopologyNode[]>([]);
  const [links, setLinks] = useState<TopologyLink[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [customer, setCustomer] = useState("");
  const [customers, setCustomers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);

  // Replay state
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayStart, setReplayStart] = useState("");
  const [replayEnd, setReplayEnd] = useState("");
  const [replayHostname, setReplayHostname] = useState("");
  const [replayData, setReplayData] = useState<FeedItem[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayArcs, setReplayArcs] = useState<FeedItem[]>([]); // Accumulated arcs (don't disappear)
  const replayTimer = useRef<number | null>(null);

  // Graph state
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const [showAddNode, setShowAddNode] = useState(false);
  const [form, setForm] = useState({ label: "", node_type: "server", hostname: "", customer: "", lat: "", lng: "" });
  const [assets, setAssets] = useState<{ asset_name: string; count: number }[]>([]);
  const [hostnameSearch, setHostnameSearch] = useState("");
  const graphRef = useRef<HTMLDivElement>(null);

  // Link edit state
  const [selectedEdge, setSelectedEdge] = useState<{ id: string; linkId: number; label: string; color: string; linkType: string } | null>(null);
  const [edgeLabelInput, setEdgeLabelInput] = useState("");
  const [edgeColorInput, setEdgeColorInput] = useState("");

  const feedRef = useRef<HTMLDivElement>(null);

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [atkData, nodeData, linkData, feedData, filterOpts, assetData] = await Promise.all([
        api.getAttacks({ customer: customer || undefined, limit: 500 }),
        api.getTopologyNodes(),
        api.getTopologyLinks(),
        fetch(`/api/threatmap/feed?limit=50${customer ? `&customer=${customer}` : ""}`, { headers: { Authorization: `Bearer ${localStorage.getItem("soc_token")}` } }).then(r => r.json()),
        api.getFilterOptions(),
        api.getTicketAssets(),
      ]);
      setAttacks(atkData);
      setNodes(nodeData);
      setLinks(linkData);
      setFeed(feedData);
      setCustomers(filterOpts.customers || []);
      setAssets(assetData);

      // Build ReactFlow — will be filtered by customer in useMemo below
      // (raw data stored in nodes/links state);
    } catch (e) { console.error("Load failed:", e); }
    setLoading(false);
  }, [customer]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh feed
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const d = await fetch(`/api/threatmap/feed?limit=50${customer ? `&customer=${customer}` : ""}`, { headers: { Authorization: `Bearer ${localStorage.getItem("soc_token")}` } }).then(r => r.json());
        setFeed(d);
      } catch {}
    }, 30000);
    return () => clearInterval(id);
  }, [customer]);

  // Build filtered ReactFlow nodes/edges based on customer
  const filteredNodes = useMemo(() => customer ? nodes.filter(n => n.customer === customer || !n.customer) : nodes, [nodes, customer]);
  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);
  const filteredLinks = useMemo(() => links.filter(l => filteredNodeIds.has(l.source_id) && filteredNodeIds.has(l.target_id)), [links, filteredNodeIds]);

  useEffect(() => {
    setRfNodes(filteredNodes.map(n => ({
      id: String(n.id), type: "topology",
      position: { x: n.pos_x || Math.random() * 600, y: n.pos_y || Math.random() * 400 },
      data: { label: n.label, nodeType: n.node_type, hostname: n.hostname || "", customer: n.customer || "" },
    })));
    setRfEdges(filteredLinks.map(l => ({
      id: String(l.id), source: String(l.source_id), target: String(l.target_id),
      label: l.label || l.link_type,
      style: { stroke: l.link_type === "fiber" ? "#60a5fa" : l.link_type === "vpn" ? "#a78bfa" : "#3e3e48", strokeWidth: 1.5 },
      animated: l.link_type === "vpn" || l.link_type === "internet",
      labelStyle: { fill: "#646471", fontSize: 9 },
      labelBgStyle: { fill: "#0a0a0c", fillOpacity: 0.8 },
    })));
  }, [filteredNodes, filteredLinks]);

  const sites = useMemo(() => groupToSites(nodes), [nodes]);
  const siteAttackCounts = useMemo(() => {
    const c = new Map<string, number>();
    attacks.forEach(a => {
      if (a.is_private_ip && a.target_lat && a.target_lng) {
        const k = `${a.target_lat.toFixed(2)}_${a.target_lng.toFixed(2)}`;
        c.set(k, (c.get(k) || 0) + 1);
      }
    });
    return c;
  }, [attacks]);

  // ── Replay logic ──
  const loadReplay = async () => {
    if (!replayStart || !replayEnd) return;
    try {
      const params = new URLSearchParams({ limit: "500", start: replayStart, end: replayEnd });
      if (replayHostname) params.set("asset", replayHostname);
      if (customer) params.set("customer", customer);
      const d = await fetch(`/api/threatmap/feed?${params}`, { headers: { Authorization: `Bearer ${localStorage.getItem("soc_token")}` } }).then(r => r.json());
      // Sort chronologically (oldest first)
      d.sort((a: FeedItem, b: FeedItem) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime());
      setReplayData(d);
      setReplayIndex(0);
      setReplayArcs([]);
      setReplayPlaying(false);
    } catch {}
  };

  const startReplay = () => {
    if (replayData.length === 0) return;
    setReplayPlaying(true);
  };

  const stopReplay = () => {
    setReplayPlaying(false);
    if (replayTimer.current) { clearTimeout(replayTimer.current); replayTimer.current = null; }
  };

  // Replay tick — add one event at a time, never remove (accumulate)
  useEffect(() => {
    if (!replayPlaying || replayIndex >= replayData.length) {
      if (replayIndex >= replayData.length) setReplayPlaying(false);
      return;
    }
    const current = replayData[replayIndex];
    const next = replayData[replayIndex + 1];
    const delay = next && current.time && next.time
      ? Math.min(Math.max(new Date(next.time).getTime() - new Date(current.time).getTime(), 100), 2000)
      : 500;

    replayTimer.current = window.setTimeout(() => {
      setReplayArcs(prev => [...prev, current]); // Accumulate, don't remove
      setReplayIndex(i => i + 1);
    }, delay);

    return () => { if (replayTimer.current) clearTimeout(replayTimer.current); };
  }, [replayPlaying, replayIndex, replayData]);

  // Graph handlers
  const onNodesChange: OnNodesChange = useCallback((ch) => setRfNodes(n => applyNodeChanges(ch, n)), []);
  const onEdgesChange: OnEdgesChange = useCallback((ch) => setRfEdges(e => applyEdgeChanges(ch, e)), []);
  const onConnect: OnConnect = useCallback(async (conn) => {
    if (!conn.source || !conn.target) return;
    try {
      const link = await api.createTopologyLink({ source_id: Number(conn.source), target_id: Number(conn.target), link_type: "lan" });
      setRfEdges(eds => addEdge({ ...conn, id: String(link.id), label: "lan", style: { stroke: "#3e3e48", strokeWidth: 1.5 }, labelStyle: { fill: "#646471", fontSize: 9 }, labelBgStyle: { fill: "#0a0a0c", fillOpacity: 0.8 } }, eds));
    } catch {}
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    const linkId = Number(edge.id);
    const lbl = typeof edge.label === "string" ? edge.label : "";
    const clr = edge.style?.stroke as string || "#3e3e48";
    const lt = edge.data?.linkType || "lan";
    setSelectedEdge({ id: edge.id, linkId, label: lbl, color: clr, linkType: lt });
    setEdgeLabelInput(lbl);
    setEdgeColorInput(clr);
  }, []);

  const updateEdge = useCallback(async () => {
    if (!selectedEdge) return;
    try {
      await api.updateTopologyLink(selectedEdge.linkId, { label: edgeLabelInput, link_type: selectedEdge.linkType });
      setRfEdges(eds => eds.map(e => e.id === selectedEdge.id ? {
        ...e, label: edgeLabelInput,
        style: { ...e.style, stroke: edgeColorInput },
        labelStyle: { fill: "#646471", fontSize: 9 },
        labelBgStyle: { fill: "#0a0a0c", fillOpacity: 0.8 },
      } : e));
      setSelectedEdge(null);
    } catch {}
  }, [selectedEdge, edgeLabelInput, edgeColorInput]);

  const deleteEdge = useCallback(async () => {
    if (!selectedEdge) return;
    try {
      await api.deleteTopologyLink(selectedEdge.linkId);
      setRfEdges(eds => eds.filter(e => e.id !== selectedEdge.id));
      setSelectedEdge(null);
    } catch {}
  }, [selectedEdge]);
  const savePositions = useCallback(async () => {
    const p = rfNodes.map(n => ({ id: Number(n.id), pos_x: n.position.x, pos_y: n.position.y }));
    try { await api.updateTopologyPositions(p); } catch {}
  }, [rfNodes]);

  const createNode = async () => {
    if (!form.label.trim()) return;
    try {
      await api.createTopologyNode({ label: form.label, node_type: form.node_type, hostname: form.hostname || undefined, customer: form.customer || undefined, lat: form.lat ? Number(form.lat) : undefined, lng: form.lng ? Number(form.lng) : undefined });
      setShowAddNode(false);
      setForm({ label: "", node_type: "server", hostname: "", customer: "", lat: "", lng: "" });
      await loadData();
    } catch {}
  };

  // ── Export/Import ──
  const exportTopologyJSON = () => {
    const data = { nodes: filteredNodes, links: filteredLinks, exportedAt: new Date().toISOString(), customer: customer || "all" };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `topology-${customer || "all"}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const importTopologyJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.nodes || !Array.isArray(data.nodes)) { alert("Invalid topology JSON"); return; }
      if (!confirm(`Import ${data.nodes.length} nodes? This will create new nodes.`)) return;
      for (const n of data.nodes) {
        await api.createTopologyNode({ label: n.label, node_type: n.node_type, hostname: n.hostname || undefined, customer: n.customer || undefined, lat: n.lat || undefined, lng: n.lng || undefined });
      }
      alert(`Imported ${data.nodes.length} nodes`);
      await loadData();
    } catch (err) { alert("Import failed: " + String(err)); }
    e.target.value = ""; // Reset input
  };

  const exportScreenshot = async () => {
    // Use SVG serialization from ReactFlow canvas
    const el = document.querySelector(".react-flow__viewport") as SVGElement | HTMLElement;
    if (!el) { alert("No graph to capture"); return; }
    try {
      const svg = document.querySelector(".react-flow svg.react-flow__edges");
      const container = document.querySelector(".react-flow") as HTMLElement;
      if (!container) return;
      // Use canvas approach with drawImage
      const canvas = document.createElement("canvas");
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * 2; canvas.height = rect.height * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(2, 2); ctx.fillStyle = "#0a0a0c"; ctx.fillRect(0, 0, rect.width, rect.height);
      // Draw text summary instead of full render (simple fallback)
      ctx.fillStyle = "#e8e8ec"; ctx.font = "14px 'IBM Plex Sans'";
      ctx.fillText(`Topology: ${filteredNodes.length} nodes, ${filteredLinks.length} links`, 20, 30);
      ctx.fillStyle = "#646471"; ctx.font = "11px 'IBM Plex Mono'";
      filteredNodes.forEach((n, i) => {
        ctx.fillText(`${n.label} (${n.node_type}) ${n.customer || ""}`, 20, 60 + i * 20);
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a"); a.href = url; a.download = `topology-${customer || "all"}-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (e) { alert("Screenshot failed: " + String(e)); }
  };

  const filteredAssets = useMemo(() => {
    if (!hostnameSearch) return assets;
    const q = hostnameSearch.toLowerCase();
    return assets.filter(a => a.asset_name.toLowerCase().includes(q));
  }, [assets, hostnameSearch]);

  return (
    <div className="relative w-full flex flex-col" style={{ height: "calc(100vh - 56px)", background: "#0a0a0c" }}>
      {/* ── Top bar ── */}
      <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center justify-between">
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e" }}>
          <Shield className="w-4 h-4" style={{ color: "#9b9ba8" }} />
          <h2 className="text-sm font-semibold" style={{ color: "#e8e8ec" }}>Threats & Infrastructure</h2>
          <div className="h-4 w-px" style={{ backgroundColor: "#26262e" }} />
          {/* Mode toggle */}
          <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid #26262e" }}>
            <button onClick={() => setMode("map")} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: mode === "map" ? "#1b1b21" : "transparent", color: mode === "map" ? "#e8e8ec" : "#646471" }}>
              <Globe className="w-3 h-3" /> Map
            </button>
            <button onClick={() => setMode("graph")} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: mode === "graph" ? "#1b1b21" : "transparent", color: mode === "graph" ? "#e8e8ec" : "#646471" }}>
              <Network className="w-3 h-3" /> Graph
            </button>
          </div>
          <div className="h-4 w-px" style={{ backgroundColor: "#26262e" }} />

        </div>
        <div className="flex items-center gap-2">
          {mode === "map" && (
            <button onClick={() => setReplayOpen(!replayOpen)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
              style={{ backgroundColor: replayOpen ? "#1b1b21" : "rgba(10,10,12,0.92)", border: "1px solid #26262e", color: replayOpen ? "#f59e0b" : "#9b9ba8" }}>
              <Play className="w-3 h-3" /> Replay
            </button>
          )}
          {mode === "graph" && (
            <>
              <button onClick={() => setShowAddNode(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e", color: "#e8e8ec" }}>
                <Plus className="w-3 h-3" /> Add Node
              </button>
              <button onClick={savePositions} className="p-2 rounded-lg" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e", color: "#9b9ba8" }} title="Save positions">
                <Save className="w-3.5 h-3.5" />
              </button>
              <button onClick={exportTopologyJSON} className="p-2 rounded-lg" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e", color: "#9b9ba8" }} title="Export JSON">
                <Download className="w-3.5 h-3.5" />
              </button>
              <label className="p-2 rounded-lg cursor-pointer hover:bg-white/[0.05]" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e", color: "#9b9ba8" }} title="Import JSON">
                <Upload className="w-3.5 h-3.5" />
                <input type="file" accept=".json" className="hidden" onChange={importTopologyJSON} />
              </label>
              <button onClick={exportScreenshot} className="p-2 rounded-lg" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e", color: "#9b9ba8" }} title="Screenshot PNG">
                <Camera className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <select value={customer} onChange={e => setCustomer(e.target.value)} className="text-xs px-3 py-2 pr-8 rounded-lg" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e", color: "#e8e8ec" }}>
            <option value="">All Customers</option>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={loadData} className="p-2 rounded-lg hover:bg-white/[0.05]" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e", color: "#9b9ba8" }}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Replay panel (below top bar) ── */}
      {replayOpen && mode === "map" && (
        <div className="absolute top-16 left-4 z-[1000] px-4 py-3 rounded-lg flex items-center gap-3 text-xs" style={{ backgroundColor: "rgba(10,10,12,0.95)", border: "1px solid #26262e" }}>
          <span style={{ color: "#646471" }}>From</span>
          <input type="datetime-local" value={replayStart} onChange={e => setReplayStart(e.target.value)} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: "#141418", border: "1px solid #26262e", color: "#e8e8ec" }} />
          <span style={{ color: "#646471" }}>To</span>
          <input type="datetime-local" value={replayEnd} onChange={e => setReplayEnd(e.target.value)} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: "#141418", border: "1px solid #26262e", color: "#e8e8ec" }} />
          <span style={{ color: "#646471" }}>Asset</span>
          <input type="text" value={replayHostname} onChange={e => setReplayHostname(e.target.value)} placeholder="any" className="px-2 py-1 rounded text-xs w-32" style={{ backgroundColor: "#141418", border: "1px solid #26262e", color: "#e8e8ec" }} />
          <button onClick={loadReplay} className="px-3 py-1 rounded text-xs font-medium" style={{ backgroundColor: "#1b1b21", border: "1px solid #26262e", color: "#e8e8ec" }}>Load</button>
          {replayData.length > 0 && (
            <>
              {replayPlaying ? (
                <button onClick={stopReplay} className="p-1 rounded" style={{ color: "#ef4444" }}><Square className="w-3.5 h-3.5" /></button>
              ) : (
                <button onClick={startReplay} className="p-1 rounded" style={{ color: "#10b981" }}><Play className="w-3.5 h-3.5" /></button>
              )}
              <span className="font-mono" style={{ color: "#646471" }}>{replayIndex}/{replayData.length}</span>
            </>
          )}
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="flex-1 relative">
        {/* MAP MODE */}
        {mode === "map" && (
          <MapContainer center={[-2, 118]} zoom={5} minZoom={3} maxZoom={14} zoomControl={false} attributionControl={false} style={{ width: "100%", height: "100%", background: "#0a0a0c" }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" subdomains="abcd" />
            <FitBounds sites={sites} />

            {/* Site markers */}
            {sites.map(site => {
              const k = `${site.lat.toFixed(2)}_${site.lng.toFixed(2)}`;
              const ac = siteAttackCounts.get(k) || 0;
              return (
                <CircleMarker key={`s-${site.id}`} center={[site.lat, site.lng]} radius={ac > 0 ? Math.min(8 + ac * 0.3, 20) : 6}
                  pathOptions={{ color: ac > 0 ? "#f59e0b" : "#60a5fa", fillColor: ac > 0 ? "#f59e0b" : "#60a5fa", fillOpacity: ac > 0 ? 0.4 : 0.3, weight: 1.5 }}
                  eventHandlers={{ click: () => setSelectedSite(site) }}>
                  <Tooltip><div className="text-xs"><strong>{site.label}</strong>{site.customer && <span className="opacity-60"> · {site.customer}</span>}<br /><span className="opacity-60">{site.nodeCount} assets</span>{ac > 0 && <span className="text-amber-400"> · {ac} attacks</span>}</div></Tooltip>
                </CircleMarker>
              );
            })}

            {/* Pulse rings */}
            {sites.map(site => {
              const k = `${site.lat.toFixed(2)}_${site.lng.toFixed(2)}`;
              if ((siteAttackCounts.get(k) || 0) === 0) return null;
              return [12, 20].map((r, i) => (
                <CircleMarker key={`p-${site.id}-${i}`} center={[site.lat, site.lng]} radius={r}
                  pathOptions={{ color: "#f59e0b", fillColor: "transparent", fillOpacity: 0, weight: 1, opacity: 0.3 - i * 0.1, dashArray: "4 4" }} />
              ));
            })}

            {/* Replay accumulated arcs — these stay visible */}
            {replayArcs.map((arc, i) => {
              // Find target site for this arc
              const targetSite = sites.find(s => s.customer === arc.customer) || sites[0];
              if (!targetSite) return null;
              // Small random offset so arcs don't overlap exactly
              const offsetLat = targetSite.lat + (Math.random() - 0.5) * 0.05;
              const offsetLng = targetSite.lng + (Math.random() - 0.5) * 0.05;
              return (
                <CircleMarker key={`ra-${arc.id}-${i}`} center={[offsetLat, offsetLng]} radius={3}
                  pathOptions={{ color: pc(arc.priority), fillColor: pc(arc.priority), fillOpacity: 0.6, weight: 0 }}>
                  <Tooltip><span className="text-[10px] font-mono">{arc.subject || arc.category} → {arc.asset}</span></Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}

        {/* GRAPH MODE */}
        {mode === "graph" && (
          <ReactFlow nodes={rfNodes} edges={rfEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onEdgeClick={onEdgeClick} onNodeDragStop={savePositions} nodeTypes={nodeTypes} fitView style={{ background: "#0a0a0c" }}>
            <Background gap={32} size={1} color="#1d1d23" />
            <MiniMap style={{ background: "#141418", border: "1px solid #26262e", borderRadius: 8 }} nodeColor={(n) => NODE_CFG[n.data?.nodeType]?.color || "#60a5fa"} />
          </ReactFlow>
        )}

        {/* Graph: Link edit panel */}
        {mode === "graph" && selectedEdge && (
          <div className="absolute top-16 left-4 z-[1000] w-56 rounded-lg overflow-hidden" style={{ backgroundColor: "#0a0a0c", border: "1px solid #26262e" }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #1d1d23" }}>
              <div className="flex items-center gap-1.5">
                <Palette className="w-3 h-3" style={{ color: "#9b9ba8" }} />
                <span className="text-xs font-medium" style={{ color: "#e8e8ec" }}>Edit Link</span>
              </div>
              <button onClick={() => setSelectedEdge(null)} className="p-0.5 rounded hover:bg-white/[0.05]" style={{ color: "#646471" }}><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-3 space-y-2.5">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ color: "#646471" }}>Description</label>
                <input type="text" value={edgeLabelInput} onChange={e => setEdgeLabelInput(e.target.value)} placeholder="e.g. lan, fiber, vpn"
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg outline-none" style={{ backgroundColor: "#141418", border: "1px solid #26262e", color: "#e8e8ec" }} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ color: "#646471" }}>Color</label>
                <div className="flex gap-1.5 flex-wrap">
                  {["#3e3e48", "#60a5fa", "#a78bfa", "#10b981", "#f59e0b", "#ef4444", "#e8e8ec"].map(c => (
                    <button key={c} onClick={() => setEdgeColorInput(c)}
                      className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ backgroundColor: c, borderColor: edgeColorInput === c ? "#e8e8ec" : "transparent" }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={updateEdge} className="flex-1 py-1.5 rounded-lg text-[11px] font-medium" style={{ backgroundColor: "#1b1b21", border: "1px solid #26262e", color: "#e8e8ec" }}>Save</button>
                <button onClick={deleteEdge} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Graph: Empty state */
        {mode === "graph" && nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <Server className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "#646471" }} />
              <p className="text-sm" style={{ color: "#646471" }}>No topology nodes yet</p>
              <p className="text-xs mt-1" style={{ color: "#3e3e48" }}>Click "Add Node" to build your network</p>
            </div>
          </div>
        )}

        {/* Map: Legend */}
        {mode === "map" && (
          <div className="absolute bottom-2 left-4 z-[1000] px-3 py-2 rounded-lg text-[10px]" style={{ backgroundColor: "rgba(10,10,12,0.92)", border: "1px solid #26262e" }}>
            <div className="flex items-center gap-3" style={{ color: "#646471" }}>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#60a5fa" }} />Site</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#f59e0b" }} />Under attack</span>
              {replayArcs.length > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#ef4444" }} />{replayArcs.length} replayed</span>}
            </div>
          </div>
        )}

        {/* Site detail panel */}
        {selectedSite && (
          <div className="absolute top-16 right-4 z-[1000] w-72 rounded-lg overflow-hidden" style={{ backgroundColor: "#0a0a0c", border: "1px solid #26262e" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #1d1d23" }}>
              <h3 className="text-sm font-medium" style={{ color: "#e8e8ec" }}>{selectedSite.label}</h3>
              <button onClick={() => setSelectedSite(null)} className="p-1 rounded hover:bg-white/[0.05]" style={{ color: "#646471" }}><X className="w-4 h-4" /></button>
            </div>
            <div className="px-4 py-3 space-y-2 text-xs">
              {selectedSite.customer && <div className="flex justify-between"><span style={{ color: "#646471" }}>Customer</span><span style={{ color: "#e8e8ec" }}>{selectedSite.customer}</span></div>}
              <div className="flex justify-between"><span style={{ color: "#646471" }}>Assets</span><span style={{ color: "#e8e8ec" }}>{selectedSite.nodeCount}</span></div>
              <div className="flex justify-between"><span style={{ color: "#646471" }}>Location</span><span className="font-mono" style={{ color: "#646471" }}>{selectedSite.lat.toFixed(4)}, {selectedSite.lng.toFixed(4)}</span></div>
              <div className="flex justify-between"><span style={{ color: "#646471" }}>Attacks</span><span style={{ color: "#f59e0b" }}>{siteAttackCounts.get(`${selectedSite.lat.toFixed(2)}_${selectedSite.lng.toFixed(2)}`) || 0}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Node side panel (graph mode) ── */}
      {showAddNode && mode === "graph" && (
        <div className="absolute top-0 right-0 bottom-0 w-72 z-[1000] border-l overflow-y-auto" style={{ backgroundColor: "#0a0a0c", borderColor: "#1d1d23" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #1d1d23" }}>
            <h3 className="text-sm font-medium" style={{ color: "#e8e8ec" }}>Add Node</h3>
            <button onClick={() => setShowAddNode(false)} className="p-1 rounded hover:bg-white/[0.05]" style={{ color: "#646471" }}><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 space-y-3">
            <Fld label="Label" value={form.label} onChange={v => setForm(f => ({ ...f, label: v }))} placeholder="e.g. Web Server 1" />
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ color: "#646471" }}>Type</label>
              <select value={form.node_type} onChange={e => setForm(f => ({ ...f, node_type: e.target.value }))} className="w-full text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#141418", border: "1px solid #26262e", color: "#e8e8ec" }}>
                {Object.entries(NODE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ color: "#646471" }}>Hostname</label>
              <div className="relative">
                <div className="flex items-center rounded-lg" style={{ backgroundColor: "#141418", border: "1px solid #26262e" }}>
                  <Search className="w-3 h-3 ml-2 shrink-0" style={{ color: "#3e3e48" }} />
                  <input type="text" value={hostnameSearch || form.hostname} placeholder="Search or type hostname..."
                    onChange={e => { setHostnameSearch(e.target.value); setForm(f => ({ ...f, hostname: e.target.value })); }}
                    className="w-full text-xs px-2 py-2 bg-transparent outline-none" style={{ color: "#e8e8ec" }} />
                  {form.hostname && <button onClick={() => { setForm(f => ({ ...f, hostname: "" })); setHostnameSearch(""); }} className="p-1 mr-1" style={{ color: "#646471" }}><X className="w-3 h-3" /></button>}
                </div>
                {hostnameSearch && filteredAssets.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-lg max-h-40 overflow-y-auto z-50" style={{ backgroundColor: "#141418", border: "1px solid #26262e" }}>
                    <button onClick={() => { setForm(f => ({ ...f, hostname: "" })); setHostnameSearch(""); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.05]" style={{ color: "#646471" }}>
                      None (visual only)
                    </button>
                    {filteredAssets.slice(0, 20).map(a => (
                      <button key={a.asset_name} onClick={() => { setForm(f => ({ ...f, hostname: a.asset_name })); setHostnameSearch(""); }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.05] truncate" style={{ color: "#e8e8ec" }}>
                        {a.asset_name} <span style={{ color: "#646471" }}>({a.count})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ color: "#646471" }}>Customer</label>
              <select value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} className="w-full text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#141418", border: "1px solid #26262e", color: "#e8e8ec" }}>
                <option value="">None</option>
                {customers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Fld label="Lat" value={form.lat} onChange={v => setForm(f => ({ ...f, lat: v }))} placeholder="-6.2" type="number" />
              <Fld label="Lng" value={form.lng} onChange={v => setForm(f => ({ ...f, lng: v }))} placeholder="106.8" type="number" />
            </div>
            <p className="text-[9px] flex items-center gap-1" style={{ color: "#3e3e48" }}><MapPin className="w-3 h-3" /> Coords used by Map mode</p>
            <button onClick={createNode} disabled={!form.label.trim()} className="w-full py-2 rounded-lg text-xs font-medium disabled:opacity-30" style={{ backgroundColor: "#1b1b21", color: "#e8e8ec", border: "1px solid #26262e" }}>Create Node</button>
          </div>
        </div>
      )}

      {/* ── Attack Feed (bottom, Map mode only) ── */}
      {mode === "map" && (
        <div ref={feedRef} className="h-36 overflow-y-auto border-t shrink-0" style={{ backgroundColor: "#0a0a0c", borderColor: "#1d1d23" }}>
          <div className="sticky top-0 z-10 px-4 py-1.5 text-[10px] uppercase tracking-wider font-medium flex items-center gap-2" style={{ backgroundColor: "#0a0a0c", borderBottom: "1px solid #1d1d23", color: "#646471" }}>
            <Clock className="w-3 h-3" />
            {replayPlaying ? `Replay Feed · ${replayIndex}/${replayData.length}` : "Live Attack Feed"}
            <span className="ml-auto font-mono">{replayPlaying ? replayArcs.length : feed.filter(f => !f.validation || (f.validation !== "True Positive" && f.validation !== "False Positive")).length} events</span>
          </div>
          <div className="divide-y" style={{ borderColor: "#1d1d23" }}>
            {(replayPlaying || replayArcs.length > 0 ? [...replayArcs].reverse() : feed.filter(f => !f.validation || (f.validation !== "True Positive" && f.validation !== "False Positive"))).map((f, i) => (
              <div key={`${f.id}-${i}`} className="flex items-center gap-3 px-4 py-1.5 text-[11px] hover:bg-white/[0.02]">
                <span className="font-mono w-14 shrink-0" style={{ color: "#3e3e48" }}>
                  {f.time ? new Date(f.time).toLocaleTimeString("id-ID", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
                </span>
                <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ backgroundColor: pc(f.priority) }} />
                <span className="truncate" style={{ color: "#9b9ba8" }}>{f.subject || f.category || "Alert"}</span>
                <span style={{ color: "#3e3e48" }}>→</span>
                <span className="font-mono truncate" style={{ color: "#e8e8ec" }}>{f.asset || "—"}</span>
                {f.customer && <span className="shrink-0" style={{ color: "#3e3e48" }}>{f.customer}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Fld({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ color: "#646471" }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full text-xs px-3 py-2 rounded-lg outline-none" style={{ backgroundColor: "#141418", border: "1px solid #26262e", color: "#e8e8ec" }} />
    </div>
  );
}
