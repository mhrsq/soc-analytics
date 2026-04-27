/**
 * Topology Editor — Network graph editor with map coordinate picker
 * Simplified: focused on site/node management with visual graph layout
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactFlow, {
  Background, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges, addEdge,
  type Node, type Edge, type OnNodesChange, type OnEdgesChange, type OnConnect,
} from "reactflow";
import "reactflow/dist/style.css";
import { Server, Shield, Monitor, Database, Cloud, Radio, Router as RouterIcon, Cpu, Plus, Trash2, Save, X, MapPin } from "lucide-react";
import { api } from "../api/client";
import type { TopologyNode, TopologyLink } from "../types";
import { ErrorAlert } from "../components/ErrorAlert";
import { ConfirmDialog } from "../components/ConfirmDialog";

// ── Node type config ──
const NODE_CONFIG: Record<string, { label: string; color: string; icon: typeof Server }> = {
  server:   { label: "Server",   color: "#60a5fa", icon: Server },
  firewall: { label: "Firewall", color: "#f59e0b", icon: Shield },
  endpoint: { label: "Endpoint", color: "#10b981", icon: Monitor },
  database: { label: "Database", color: "#9b9ba8", icon: Database },
  cloud:    { label: "Cloud",    color: "#a78bfa", icon: Cloud },
  siem:     { label: "SIEM",     color: "#ef4444", icon: Radio },
  router:   { label: "Router",   color: "#8B5CF6", icon: RouterIcon },
  switch:   { label: "Switch",   color: "#60a5fa", icon: Cpu },
};

const LINK_TYPES = ["fiber", "vpn", "internet", "lan", "wan", "mpls"];

// ── Custom node renderer ──
function TopoNode({ data }: { data: { label: string; nodeType: string; hostname: string; customer: string } }) {
  const cfg = NODE_CONFIG[data.nodeType] || NODE_CONFIG.server;
  const Icon = cfg.icon;
  return (
    <div
      className="rounded-lg px-3 py-2 min-w-[120px] text-center border"
      style={{ backgroundColor: "var(--theme-card-bg)", borderColor: cfg.color + "40", boxShadow: `0 0 8px ${cfg.color}15` }}
    >
      <Icon className="w-5 h-5 mx-auto mb-1" style={{ color: cfg.color }} />
      <div className="text-xs font-medium truncate" style={{ color: "var(--theme-text-primary)" }}>{data.label}</div>
      {data.hostname && <div className="text-[9px] font-mono truncate" style={{ color: "var(--theme-text-muted)" }}>{data.hostname}</div>}
      {data.customer && <div className="text-[9px] truncate" style={{ color: "var(--theme-text-muted)" }}>{data.customer}</div>}
    </div>
  );
}

const nodeTypes = { topology: TopoNode };

export function TopologyEditor() {
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const [topoNodes, setTopoNodes] = useState<TopologyNode[]>([]);
  const [topoLinks, setTopoLinks] = useState<TopologyLink[]>([]);
  const [showPanel, setShowPanel] = useState<"add" | "edit" | null>(null);
  const [editNode, setEditNode] = useState<TopologyNode | null>(null);
  const [assets, setAssets] = useState<{ asset_name: string; count: number }[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [opError, setOpError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form state
  const [form, setForm] = useState({ label: "", node_type: "server", hostname: "", customer: "", lat: "", lng: "" });

  // Load data
  const loadData = useCallback(async () => {
    setOpError(null);
    try {
      const [nodes, links, assetData, filterOpts] = await Promise.all([
        api.getTopologyNodes(),
        api.getTopologyLinks(),
        api.getTicketAssets(),
        api.getFilterOptions(),
      ]);
      setTopoNodes(nodes);
      setTopoLinks(links);
      setAssets(assetData);
      setCustomers(filterOpts.customers || []);

      // Convert to ReactFlow format
      setRfNodes(nodes.map(n => ({
        id: String(n.id),
        type: "topology",
        position: { x: n.pos_x || ((n.id * 2654435761 >>> 0) % 600), y: n.pos_y || ((n.id * 2654435761 * 7 >>> 0) % 400) },
        data: { label: n.label, nodeType: n.node_type, hostname: n.hostname || "", customer: n.customer || "" },
      })));
      setRfEdges(links.map(l => ({
        id: String(l.id),
        source: String(l.source_id),
        target: String(l.target_id),
        label: l.label || l.link_type,
        style: { stroke: l.link_type === "fiber" ? "#60a5fa" : l.link_type === "vpn" ? "#a78bfa" : "var(--theme-text-dim)", strokeWidth: 1.5 },
        animated: l.link_type === "vpn" || l.link_type === "internet",
        labelStyle: { fill: "var(--theme-text-muted)", fontSize: 9 },
        labelBgStyle: { fill: "var(--theme-surface-base)", fillOpacity: 0.8 },
      })));
    } catch (e) {
      console.error("Failed to load topology:", e);
      setOpError(e instanceof Error ? e.message : "Operation failed");
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ReactFlow handlers
  const onNodesChange: OnNodesChange = useCallback((changes) => setRfNodes(nds => applyNodeChanges(changes, nds)), []);
  const onEdgesChange: OnEdgesChange = useCallback((changes) => setRfEdges(eds => applyEdgeChanges(changes, eds)), []);
  const onConnect: OnConnect = useCallback(async (conn) => {
    if (!conn.source || !conn.target) return;
    setOpError(null);
    try {
      const link = await api.createTopologyLink({ source_id: Number(conn.source), target_id: Number(conn.target), link_type: "lan" });
      setRfEdges(eds => addEdge({
        ...conn, id: String(link.id), label: "lan",
        style: { stroke: "var(--theme-text-dim)", strokeWidth: 1.5 },
        labelStyle: { fill: "var(--theme-text-muted)", fontSize: 9 },
        labelBgStyle: { fill: "var(--theme-surface-base)", fillOpacity: 0.8 },
      }, eds));
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Operation failed");
    }
  }, []);

  // Save positions on drag end
  const savePositions = useCallback(async () => {
    setOpError(null);
    const positions = rfNodes.map(n => ({ id: Number(n.id), pos_x: n.position.x, pos_y: n.position.y }));
    try {
      await api.updateTopologyPositions(positions);
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Operation failed");
    }
  }, [rfNodes]);

  // Node click → edit
  const onNodeClick = useCallback((_: any, node: Node) => {
    const tn = topoNodes.find(n => n.id === Number(node.id));
    if (tn) {
      setEditNode(tn);
      setForm({ label: tn.label, node_type: tn.node_type, hostname: tn.hostname || "", customer: tn.customer || "", lat: tn.lat?.toString() || "", lng: tn.lng?.toString() || "" });
      setShowPanel("edit");
    }
  }, [topoNodes]);

  // Create node
  const createNode = async () => {
    if (!form.label.trim()) return;
    setOpError(null);
    try {
      const node = await api.createTopologyNode({
        label: form.label, node_type: form.node_type, hostname: form.hostname || undefined,
        customer: form.customer || undefined, lat: form.lat ? Number(form.lat) : undefined,
        lng: form.lng ? Number(form.lng) : undefined,
      });
      setShowPanel(null);
      setForm({ label: "", node_type: "server", hostname: "", customer: "", lat: "", lng: "" });
      await loadData();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Operation failed");
    }
  };

  // Update node
  const updateNode = async () => {
    if (!editNode) return;
    setOpError(null);
    try {
      await api.updateTopologyNode(editNode.id, {
        label: form.label, node_type: form.node_type, hostname: form.hostname || undefined,
        customer: form.customer || undefined, lat: form.lat ? Number(form.lat) : undefined,
        lng: form.lng ? Number(form.lng) : undefined,
      });
      setShowPanel(null);
      setEditNode(null);
      await loadData();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Operation failed");
    }
  };

  // Delete node — triggered by ConfirmDialog's onConfirm
  const doDeleteNode = async () => {
    if (!editNode) return;
    setOpError(null);
    try {
      await api.deleteTopologyNode(editNode.id);
      setShowPanel(null);
      setEditNode(null);
      await loadData();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Operation failed");
    }
  };

  return (
    <div className="relative w-full flex" style={{ height: "calc(100vh - 56px)", background: "var(--theme-surface-base)" }}>
      {/* Error alert */}
      {opError && (
        <div className="absolute top-14 left-4 right-4 z-20">
          <ErrorAlert error={opError} />
        </div>
      )}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        isOpen={confirmDelete}
        onConfirm={doDeleteNode}
        onCancel={() => setConfirmDelete(false)}
        title="Delete Node"
        message={`Delete "${editNode?.label}"? This will also remove all links connected to this node.`}
        confirmLabel="Delete"
        variant="danger"
      />

      {/* Graph Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodeDragStop={savePositions}
          nodeTypes={nodeTypes}
          fitView
          style={{ background: "var(--theme-surface-base)" }}
          defaultEdgeOptions={{ type: "default" }}
        >
          <Background gap={32} size={1} color="var(--theme-surface-border)" />
          <Controls position="top-left" style={{ background: "var(--theme-card-bg)", border: "1px solid var(--theme-surface-border)", borderRadius: 8 }} />
          <MiniMap style={{ background: "var(--theme-card-bg)", border: "1px solid var(--theme-surface-border)", borderRadius: 8 }} nodeColor={(n) => NODE_CONFIG[n.data?.nodeType]?.color || "#60a5fa"} />
        </ReactFlow>

        {/* Empty state */}
        {topoNodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <Server className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--theme-text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>No topology nodes yet</p>
              <p className="text-xs mt-1" style={{ color: "var(--theme-text-dim)" }}>Click "Add Node" to start building your network</p>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <span className="text-xs font-mono px-2 py-1 rounded" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-muted)" }}>
          {topoNodes.length} nodes · {topoLinks.length} links
        </span>
        <button onClick={() => { setShowPanel("add"); setEditNode(null); setForm({ label: "", node_type: "server", hostname: "", customer: "", lat: "", lng: "" }); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/[0.05]"
          style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-primary)" }}>
          <Plus className="w-3.5 h-3.5" /> Add Node
        </button>
        <button onClick={savePositions}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.05]"
          style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-secondary)" }} title="Save positions">
          <Save className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Node palette (left) */}
      <div className="absolute top-16 left-4 z-10 flex flex-col gap-1 p-2 rounded-lg" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-surface-border)" }}>
        {Object.entries(NODE_CONFIG).map(([type, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button key={type} onClick={() => { setShowPanel("add"); setForm({ label: "", node_type: type, hostname: "", customer: "", lat: "", lng: "" }); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-[10px] transition-colors hover:bg-white/[0.05]"
              style={{ color: cfg.color }} title={cfg.label}>
              <Icon className="w-3.5 h-3.5" />
              <span style={{ color: "var(--theme-text-secondary)" }}>{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* Side Panel (add/edit) */}
      {showPanel && (
        <div className="w-72 border-l shrink-0 overflow-y-auto" style={{ backgroundColor: "var(--theme-surface-base)", borderColor: "var(--theme-surface-border)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
            <h3 className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>{showPanel === "add" ? "Add Node" : "Edit Node"}</h3>
            <button onClick={() => { setShowPanel(null); setEditNode(null); }} className="p-1 rounded hover:bg-white/[0.05]" style={{ color: "var(--theme-text-muted)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <Field label="Label" value={form.label} onChange={v => setForm(f => ({ ...f, label: v }))} placeholder="e.g. Web Server 1" />
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ color: "var(--theme-text-muted)" }}>Type</label>
              <select value={form.node_type} onChange={e => setForm(f => ({ ...f, node_type: e.target.value }))}
                className="w-full text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-primary)" }}>
                {Object.entries(NODE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ color: "var(--theme-text-muted)" }}>Hostname</label>
              <select value={form.hostname} onChange={e => setForm(f => ({ ...f, hostname: e.target.value }))}
                className="w-full text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-primary)" }}>
                <option value="">Select asset...</option>
                {assets.map(a => <option key={a.asset_name} value={a.asset_name}>{a.asset_name} ({a.count})</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ color: "var(--theme-text-muted)" }}>Customer</label>
              <select value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))}
                className="w-full text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-primary)" }}>
                <option value="">None</option>
                {customers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Latitude" value={form.lat} onChange={v => setForm(f => ({ ...f, lat: v }))} placeholder="-6.2" type="number" />
              <Field label="Longitude" value={form.lng} onChange={v => setForm(f => ({ ...f, lng: v }))} placeholder="106.8" type="number" />
            </div>
            <p className="text-[9px] flex items-center gap-1" style={{ color: "var(--theme-text-dim)" }}>
              <MapPin className="w-3 h-3" /> Coordinates are used by the Threat Map
            </p>

            {showPanel === "add" ? (
              <button onClick={createNode} disabled={!form.label.trim()}
                className="w-full py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-30"
                style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-surface-border)" }}>
                Create Node
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={updateNode} className="flex-1 py-2 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-surface-border)" }}>
                  Save
                </button>
                <button onClick={() => setConfirmDelete(true)} className="px-3 py-2 rounded-lg text-xs transition-colors hover:bg-red-500/10"
                  style={{ color: "#ef4444", border: "1px solid var(--theme-surface-border)" }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ color: "var(--theme-text-muted)" }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full text-xs px-3 py-2 rounded-lg outline-none focus:ring-1" style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-surface-border)", color: "var(--theme-text-primary)" }} />
    </div>
  );
}
