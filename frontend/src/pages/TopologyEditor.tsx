import { useState, useEffect, useCallback, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeTypes,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { api } from "../api/client";
import type { TopologyNode, TopologyLink, TopologyNodeCreate, TopologyLinkCreate } from "../types";
import {
  Plus, Trash2, Save, X, Server, Shield, Monitor, Database, Cloud, Radio,
  Router, Cpu, Globe, ChevronDown,
} from "lucide-react";

// ── Node type config ───────────────────────────────────────────
const NODE_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Server }> = {
  server: { label: "Server", color: "#00D4FF", icon: Server },
  firewall: { label: "Firewall", color: "#FF6B35", icon: Shield },
  endpoint: { label: "Endpoint", color: "#00FF88", icon: Monitor },
  database: { label: "Database", color: "#FFD700", icon: Database },
  cloud: { label: "Cloud", color: "#FF00FF", icon: Cloud },
  siem: { label: "SIEM", color: "#FF073A", icon: Radio },
  router: { label: "Router", color: "#8B5CF6", icon: Router },
  switch: { label: "Switch", color: "#06B6D4", icon: Cpu },
};

const LINK_TYPES = ["fiber", "vpn", "internet", "lan", "wan", "mpls"];

// ── Custom topology node ───────────────────────────────────────
function TopologyNodeComponent({ data }: { data: { label: string; nodeType: string; hostname: string; customer: string; selected: boolean } }) {
  const config = NODE_TYPE_CONFIG[data.nodeType] || NODE_TYPE_CONFIG.server;
  const IconComp = config.icon;
  return (
    <div
      className={`relative px-3 py-2 rounded-lg border-2 min-w-[100px] text-center transition-all ${
        data.selected ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0a0a1a]" : ""
      }`}
      style={{
        background: "rgba(10,10,26,0.9)",
        borderColor: config.color + "80",
        boxShadow: `0 0 12px ${config.color}30`,
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-white/30 !border-white/20" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-white/30 !border-white/20" />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-white/30 !border-white/20" id="left" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-white/30 !border-white/20" id="right" />

      <div className="flex flex-col items-center gap-1">
        <IconComp className="w-5 h-5" style={{ color: config.color }} />
        <p className="text-xs font-semibold text-white/90 leading-tight">{data.label}</p>
        {data.hostname && (
          <p className="text-[9px] text-white/40 font-mono truncate max-w-[90px]">{data.hostname}</p>
        )}
        {data.customer && (
          <p className="text-[9px] px-1.5 rounded-full" style={{ background: config.color + "20", color: config.color }}>
            {data.customer}
          </p>
        )}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  topology: TopologyNodeComponent,
};

// ── Main Component ─────────────────────────────────────────────
export function TopologyEditor() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [topoNodes, setTopoNodes] = useState<TopologyNode[]>([]);
  const [topoLinks, setTopoLinks] = useState<TopologyLink[]>([]);
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [customers, setCustomers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dragSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Node form
  const [nodeForm, setNodeForm] = useState({
    label: "",
    hostname: "",
    customer: "",
    node_type: "server",
    lat: "",
    lng: "",
  });

  // Link form
  const [linkForm, setLinkForm] = useState({
    link_type: "lan",
    label: "",
    bandwidth: "",
  });

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [nodeData, linkData, opts] = await Promise.all([
        api.getTopologyNodes(),
        api.getTopologyLinks(),
        api.getFilterOptions(),
      ]);
      setTopoNodes(nodeData);
      setTopoLinks(linkData);
      setCustomers(opts.customers);

      // Convert to ReactFlow nodes
      setNodes(
        nodeData.map((n) => ({
          id: String(n.id),
          type: "topology",
          position: { x: n.pos_x, y: n.pos_y },
          data: {
            label: n.label,
            nodeType: n.node_type,
            hostname: n.hostname || "",
            customer: n.customer || "",
            selected: false,
          },
        }))
      );

      // Convert to ReactFlow edges
      setEdges(
        linkData.map((l) => ({
          id: String(l.id),
          source: String(l.source_id),
          target: String(l.target_id),
          label: l.label || l.link_type,
          type: "default",
          animated: l.link_type === "vpn" || l.link_type === "internet",
          style: {
            stroke: l.link_type === "fiber" ? "#00D4FF" : l.link_type === "vpn" ? "#FF00FF" : l.link_type === "internet" ? "#FFD700" : "#666",
            strokeWidth: l.bandwidth ? Math.min(1 + (parseInt(l.bandwidth) || 0) / 500, 4) : 2,
          },
          labelStyle: { fill: "#aaa", fontSize: 10 },
          labelBgStyle: { fill: "#0a0a1a", fillOpacity: 0.8 },
        }))
      );
    } catch (e) {
      console.error("Failed to load topology:", e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── ReactFlow handlers ──
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      // Check for position changes (drag) and save positions
      const posChanges = changes.filter((c) => c.type === "position" && c.dragging === false);
      if (posChanges.length > 0) {
        setDirty(true);
        // Debounce position save
        if (dragSaveTimerRef.current) clearTimeout(dragSaveTimerRef.current);
        dragSaveTimerRef.current = setTimeout(() => {
          savePositions();
        }, 1000);
      }
    },
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect: OnConnect = useCallback(
    async (connection) => {
      if (!connection.source || !connection.target) return;
      try {
        const link = await api.createTopologyLink({
          source_id: parseInt(connection.source),
          target_id: parseInt(connection.target),
          link_type: "lan",
          label: "",
        });
        setTopoLinks((prev) => [...prev, link]);
        setEdges((eds) =>
          addEdge(
            {
              ...connection,
              id: String(link.id),
              animated: false,
              style: { stroke: "#666", strokeWidth: 2 },
              label: "lan",
              labelStyle: { fill: "#aaa", fontSize: 10 },
              labelBgStyle: { fill: "#0a0a1a", fillOpacity: 0.8 },
            },
            eds
          )
        );
      } catch (e) {
        console.error("Failed to create link:", e);
      }
    },
    []
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const topoNode = topoNodes.find((n) => n.id === parseInt(node.id));
      if (topoNode) {
        setSelectedNode(topoNode);
        setSelectedEdge(null);
        setNodeForm({
          label: topoNode.label,
          hostname: topoNode.hostname || "",
          customer: topoNode.customer || "",
          node_type: topoNode.node_type,
          lat: topoNode.lat != null ? String(topoNode.lat) : "",
          lng: topoNode.lng != null ? String(topoNode.lng) : "",
        });
        setPanelOpen(true);
        setAddMode(false);
      }
    },
    [topoNodes]
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const topoLink = topoLinks.find((l) => l.id === parseInt(edge.id));
      if (topoLink) {
        setSelectedEdge(edge.id);
        setSelectedNode(null);
        setLinkForm({
          link_type: topoLink.link_type || "lan",
          label: topoLink.label || "",
          bandwidth: topoLink.bandwidth || "",
        });
        setPanelOpen(true);
        setAddMode(false);
      }
    },
    [topoLinks]
  );

  // ── Save positions (bulk update) ──
  const savePositions = useCallback(async () => {
    setNodes((current) => {
      const positions = current.map((n) => ({
        id: parseInt(n.id),
        pos_x: Math.round(n.position.x),
        pos_y: Math.round(n.position.y),
      }));
      api.updateTopologyPositions(positions).then(() => setDirty(false)).catch(console.error);
      return current;
    });
  }, []);

  // ── Add node ──
  const handleAddNode = async () => {
    if (!nodeForm.label) return;
    setSaving(true);
    try {
      const data: TopologyNodeCreate = {
        label: nodeForm.label,
        hostname: nodeForm.hostname || undefined,
        customer: nodeForm.customer || undefined,
        node_type: nodeForm.node_type,
        lat: nodeForm.lat ? parseFloat(nodeForm.lat) : undefined,
        lng: nodeForm.lng ? parseFloat(nodeForm.lng) : undefined,
        pos_x: 200 + Math.random() * 400,
        pos_y: 200 + Math.random() * 400,
      };
      const created = await api.createTopologyNode(data);
      setTopoNodes((prev) => [...prev, created]);
      setNodes((prev) => [
        ...prev,
        {
          id: String(created.id),
          type: "topology",
          position: { x: created.pos_x, y: created.pos_y },
          data: {
            label: created.label,
            nodeType: created.node_type,
            hostname: created.hostname || "",
            customer: created.customer || "",
            selected: false,
          },
        },
      ]);
      setAddMode(false);
      setNodeForm({ label: "", hostname: "", customer: "", node_type: "server", lat: "", lng: "" });
    } catch (e) {
      console.error("Failed to add node:", e);
    } finally {
      setSaving(false);
    }
  };

  // ── Update node ──
  const handleUpdateNode = async () => {
    if (!selectedNode) return;
    setSaving(true);
    try {
      const updated = await api.updateTopologyNode(selectedNode.id, {
        label: nodeForm.label,
        hostname: nodeForm.hostname || undefined,
        customer: nodeForm.customer || undefined,
        node_type: nodeForm.node_type,
        lat: nodeForm.lat ? parseFloat(nodeForm.lat) : undefined,
        lng: nodeForm.lng ? parseFloat(nodeForm.lng) : undefined,
      });
      setTopoNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setNodes((prev) =>
        prev.map((n) =>
          n.id === String(updated.id)
            ? {
                ...n,
                data: {
                  label: updated.label,
                  nodeType: updated.node_type,
                  hostname: updated.hostname || "",
                  customer: updated.customer || "",
                  selected: false,
                },
              }
            : n
        )
      );
      setSelectedNode(updated);
    } catch (e) {
      console.error("Failed to update node:", e);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete node ──
  const handleDeleteNode = async () => {
    if (!selectedNode) return;
    try {
      await api.deleteTopologyNode(selectedNode.id);
      setTopoNodes((prev) => prev.filter((n) => n.id !== selectedNode.id));
      setTopoLinks((prev) => prev.filter((l) => l.source_id !== selectedNode.id && l.target_id !== selectedNode.id));
      setNodes((prev) => prev.filter((n) => n.id !== String(selectedNode.id)));
      setEdges((prev) =>
        prev.filter((e) => e.source !== String(selectedNode.id) && e.target !== String(selectedNode.id))
      );
      setSelectedNode(null);
      setPanelOpen(false);
    } catch (e) {
      console.error("Failed to delete node:", e);
    }
  };

  // ── Update link ──
  const handleUpdateLink = async () => {
    if (!selectedEdge) return;
    setSaving(true);
    try {
      const updated = await api.updateTopologyLink(parseInt(selectedEdge), {
        link_type: linkForm.link_type,
        label: linkForm.label || undefined,
        bandwidth: linkForm.bandwidth || undefined,
      });
      setTopoLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setEdges((prev) =>
        prev.map((e) =>
          e.id === selectedEdge
            ? {
                ...e,
                label: updated.label || updated.link_type,
                animated: updated.link_type === "vpn" || updated.link_type === "internet",
                style: {
                  stroke: updated.link_type === "fiber" ? "#00D4FF" : updated.link_type === "vpn" ? "#FF00FF" : updated.link_type === "internet" ? "#FFD700" : "#666",
                  strokeWidth: updated.bandwidth ? Math.min(1 + (parseInt(updated.bandwidth) || 0) / 500, 4) : 2,
                },
              }
            : e
        )
      );
    } catch (e) {
      console.error("Failed to update link:", e);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete link ──
  const handleDeleteLink = async () => {
    if (!selectedEdge) return;
    try {
      await api.deleteTopologyLink(parseInt(selectedEdge));
      setTopoLinks((prev) => prev.filter((l) => l.id !== parseInt(selectedEdge)));
      setEdges((prev) => prev.filter((e) => e.id !== selectedEdge));
      setSelectedEdge(null);
      setPanelOpen(false);
    } catch (e) {
      console.error("Failed to delete link:", e);
    }
  };

  const inputCls = "w-full px-2 py-1.5 rounded-lg text-xs focus:outline-none transition-colors theme-input";
  const selectCls = `${inputCls} appearance-none pr-7 cursor-pointer`;
  const chevronCls = "absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" as const;

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 56px)", background: "#0a0a1a" }}>
      {/* ReactFlow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        style={{ background: "#0a0a1a" }}
        defaultEdgeOptions={{
          type: "default",
          style: { stroke: "#666", strokeWidth: 2 },
          labelStyle: { fill: "#aaa", fontSize: 10 },
          labelBgStyle: { fill: "#0a0a1a", fillOpacity: 0.8 },
        }}
      >
        <Background color="#1a1a2e" gap={20} size={1} />
        <Controls
          position="bottom-right"
          style={{ background: "#0a0a1a", border: "1px solid rgba(0,212,255,0.15)", borderRadius: 8 }}
        />
        <MiniMap
          style={{ background: "#0a0a1a", border: "1px solid rgba(0,212,255,0.15)", borderRadius: 8 }}
          nodeColor={(n) => {
            const nodeType = n.data?.nodeType || "server";
            return NODE_TYPE_CONFIG[nodeType]?.color || "#00D4FF";
          }}
          maskColor="rgba(10,10,26,0.8)"
        />
      </ReactFlow>

      {/* Top toolbar */}
      <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 py-3"
        style={{ background: "linear-gradient(180deg, rgba(10,10,26,0.95) 0%, rgba(10,10,26,0) 100%)" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white tracking-wide">TOPOLOGY EDITOR</h2>
          </div>
          <span className="text-xs text-white/40 font-mono">{topoNodes.length} nodes · {topoLinks.length} links</span>
          {dirty && <span className="text-[10px] text-yellow-400/80 font-mono">unsaved positions</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setAddMode(true); setPanelOpen(true); setSelectedNode(null); setSelectedEdge(null); setNodeForm({ label: "", hostname: "", customer: "", node_type: "server", lat: "", lng: "" }); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Node
          </button>
          <button onClick={savePositions}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-white/5 border border-white/10 text-white/60 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
            title="Save positions">
            <Save className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Node type palette (left side) */}
      <div className="absolute top-16 left-4 z-[1000] rounded-lg p-2 space-y-1"
        style={{ background: "rgba(10,10,26,0.85)", border: "1px solid rgba(0,212,255,0.15)" }}>
        <p className="text-[9px] font-semibold uppercase tracking-widest text-cyan-500/60 px-1 pb-1">Node Types</p>
        {Object.entries(NODE_TYPE_CONFIG).map(([type, config]) => {
          const IconComp = config.icon;
          return (
            <button
              key={type}
              onClick={() => {
                setAddMode(true);
                setPanelOpen(true);
                setSelectedNode(null);
                setSelectedEdge(null);
                setNodeForm({ label: "", hostname: "", customer: "", node_type: type, lat: "", lng: "" });
              }}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-white/5 transition-colors group"
              title={`Add ${config.label}`}
            >
              <IconComp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: config.color }} />
              <span className="text-[10px] text-white/50 group-hover:text-white/80">{config.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right panel (node/link detail) */}
      {panelOpen && (
        <div className="absolute top-0 right-0 bottom-0 z-[1100] w-72 overflow-y-auto"
          style={{ background: "rgba(10,10,26,0.95)", borderLeft: "1px solid rgba(0,212,255,0.15)" }}>

          <div className="flex items-center justify-between p-3 border-b border-white/5">
            <h3 className="text-sm font-semibold text-white">
              {addMode ? "Add Node" : selectedNode ? "Edit Node" : selectedEdge ? "Edit Link" : "Details"}
            </h3>
            <button onClick={() => { setPanelOpen(false); setAddMode(false); }} className="text-white/40 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 space-y-3">
            {/* Add / Edit node form */}
            {(addMode || selectedNode) && (
              <>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-cyan-500/60 block mb-1">Label *</label>
                  <input value={nodeForm.label} onChange={(e) => setNodeForm({ ...nodeForm, label: e.target.value })} placeholder="e.g. Web Server 1" className={inputCls} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-cyan-500/60 block mb-1">Type</label>
                  <div className="relative">
                    <select value={nodeForm.node_type} onChange={(e) => setNodeForm({ ...nodeForm, node_type: e.target.value })} className={selectCls}>
                      {Object.entries(NODE_TYPE_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                    <ChevronDown className={chevronCls} style={{ color: "var(--theme-text-muted)" }} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-cyan-500/60 block mb-1">Hostname</label>
                  <input value={nodeForm.hostname} onChange={(e) => setNodeForm({ ...nodeForm, hostname: e.target.value })} placeholder="e.g. srv-web-01.dc.local" className={inputCls} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-cyan-500/60 block mb-1">Customer</label>
                  <div className="relative">
                    <select value={nodeForm.customer} onChange={(e) => setNodeForm({ ...nodeForm, customer: e.target.value })} className={selectCls}>
                      <option value="">None</option>
                      {customers.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown className={chevronCls} style={{ color: "var(--theme-text-muted)" }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-cyan-500/60 block mb-1">Latitude</label>
                    <input value={nodeForm.lat} onChange={(e) => setNodeForm({ ...nodeForm, lat: e.target.value })} placeholder="Lat" type="number" step="any" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-cyan-500/60 block mb-1">Longitude</label>
                    <input value={nodeForm.lng} onChange={(e) => setNodeForm({ ...nodeForm, lng: e.target.value })} placeholder="Lng" type="number" step="any" className={inputCls} />
                  </div>
                </div>
                <p className="text-[9px] text-white/30">Lat/Lng is used by the Threat Map to place this node on the map</p>

                <div className="flex gap-2 pt-2">
                  {addMode ? (
                    <button onClick={handleAddNode} disabled={saving || !nodeForm.label}
                      className="flex-1 py-1.5 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-40">
                      {saving ? "Saving..." : "Create Node"}
                    </button>
                  ) : (
                    <>
                      <button onClick={handleUpdateNode} disabled={saving}
                        className="flex-1 py-1.5 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-40">
                        {saving ? "Saving..." : "Update"}
                      </button>
                      <button onClick={handleDeleteNode}
                        className="py-1.5 px-3 rounded text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Edit link form */}
            {selectedEdge && !selectedNode && !addMode && (
              <>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-cyan-500/60 block mb-1">Link Type</label>
                  <div className="relative">
                    <select value={linkForm.link_type} onChange={(e) => setLinkForm({ ...linkForm, link_type: e.target.value })} className={selectCls}>
                      {LINK_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                    <ChevronDown className={chevronCls} style={{ color: "var(--theme-text-muted)" }} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-cyan-500/60 block mb-1">Label</label>
                  <input value={linkForm.label} onChange={(e) => setLinkForm({ ...linkForm, label: e.target.value })} placeholder="Optional label" className={inputCls} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-cyan-500/60 block mb-1">Bandwidth (Mbps)</label>
                  <input value={linkForm.bandwidth} onChange={(e) => setLinkForm({ ...linkForm, bandwidth: e.target.value })} placeholder="e.g. 1000" type="number" className={inputCls} />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleUpdateLink} disabled={saving}
                    className="flex-1 py-1.5 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-40">
                    {saving ? "Saving..." : "Update"}
                  </button>
                  <button onClick={handleDeleteLink}
                    className="py-1.5 px-3 rounded text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Instructions overlay (when empty) */}
      {topoNodes.length === 0 && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
          <div className="text-center p-6 rounded-xl" style={{ background: "rgba(10,10,26,0.8)", border: "1px solid rgba(0,212,255,0.1)" }}>
            <Globe className="w-10 h-10 text-cyan-500/30 mx-auto mb-3" />
            <p className="text-sm text-white/60 mb-1">No topology nodes yet</p>
            <p className="text-xs text-white/30 max-w-xs">
              Click <strong className="text-cyan-400">"Add Node"</strong> or pick a node type from the left palette to start building your network topology.
              Connect nodes by dragging from one handle to another.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
