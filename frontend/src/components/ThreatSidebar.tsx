import { useMemo } from "react";
import { Zap, Globe, Network, ArrowLeft, Shield, Radio } from "lucide-react";
import type { AttackMapData, AttackMapEvent } from "../types";

interface Props {
  mapData: AttackMapData | null;
  events: AttackMapEvent[];
  selectedCountry: string | null;
  onClearCountry: () => void;
  onSelectCountry: (country: string) => void;
  customer: string;
  activeMode: "attack" | "map" | "graph";
  onModeChange: (m: "attack" | "map" | "graph") => void;
  customer_scope?: string;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5) return "now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function levelTone(level: number) {
  if (level >= 10) {
    return {
      background: "color-mix(in srgb, var(--theme-accent) 14%, transparent)",
      color: "var(--theme-accent)",
    };
  }
  if (level >= 7) {
    return {
      background: "color-mix(in srgb, var(--theme-text-primary) 10%, transparent)",
      color: "var(--theme-text-primary)",
    };
  }
  return {
    background: "var(--theme-surface-raised)",
    color: "var(--theme-text-muted)",
  };
}

function protocolTone(proto: string) {
  const p = proto?.toLowerCase() || "tcp";
  if (p === "ssh") return "var(--theme-accent)";
  if (p === "http" || p === "https") return "var(--theme-text-primary)";
  if (p === "rdp") return "var(--theme-text-secondary)";
  if (p === "telnet") return "var(--theme-text-muted)";
  return "var(--theme-text-dim)";
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-3" style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
      <div
        className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-3"
        style={{ color: "var(--theme-text-muted)" }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

export function ThreatSidebar({
  mapData,
  events,
  selectedCountry,
  onClearCountry,
  onSelectCountry,
  customer,
  activeMode,
  onModeChange,
  customer_scope,
}: Props) {
  const scopedEvents = useMemo(
    () => (selectedCountry ? events.filter(e => e.source_country === selectedCountry) : events),
    [events, selectedCountry]
  );

  const countryStats = useMemo(() => {
    if (!selectedCountry) return null;
    const evts = events.filter(e => e.source_country === selectedCountry);
    const total = evts.length;
    const ruleMap = new Map<string, { desc: string; count: number; level: number }>();
    const portMap = new Map<number, number>();
    const protoMap = new Map<string, number>();
    for (const e of evts) {
      if (e.rule_id) {
        const prev = ruleMap.get(e.rule_id);
        ruleMap.set(e.rule_id, {
          desc: e.rule_desc || e.rule_id,
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
      topProtos: [...protoMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
    };
  }, [selectedCountry, events]);

  const topRules = useMemo(() => {
    const src = selectedCountry ? events.filter(e => e.source_country === selectedCountry) : events;
    const m = new Map<string, { desc: string; count: number }>();
    for (const e of src) {
      if (e.rule_id) {
        m.set(e.rule_id, {
          desc: e.rule_desc || e.rule_id,
          count: (m.get(e.rule_id)?.count ?? 0) + 1,
        });
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [events, selectedCountry]);

  const protocols = useMemo(() => {
    const src = selectedCountry ? events.filter(e => e.source_country === selectedCountry) : events;
    const m = new Map<string, number>();
    for (const e of src) {
      const key = e.protocol?.toLowerCase() || "tcp";
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    const total = src.length || 1;
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([proto, count]) => ({ proto, pct: Math.round((count / total) * 100), count }));
  }, [events, selectedCountry]);

  const topCountries = useMemo(() => {
    return [...(mapData?.countries ?? [])].sort((a, b) => b.count - a.count).slice(0, 12);
  }, [mapData]);

  const feedItems = useMemo(() => scopedEvents.slice(0, 20), [scopedEvents]);

  return (
    <div
      className="w-[340px] flex-shrink-0 flex flex-col h-full overflow-hidden border-l"
      style={{ borderColor: "var(--theme-surface-border)", backgroundColor: "var(--theme-card-bg)" }}
    >
      <div className="flex border-b" style={{ borderColor: "var(--theme-surface-border)" }}>
        {[
          { id: "attack", label: "Attack Map", icon: Zap },
          { id: "map", label: "Sites", icon: Globe },
          { id: "graph", label: "Topology", icon: Network },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => onModeChange(tab.id as "attack" | "map" | "graph")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium"
            style={{
              borderBottom: activeMode === tab.id ? "2px solid var(--theme-accent)" : "2px solid transparent",
              color: activeMode === tab.id ? "var(--theme-accent)" : "var(--theme-text-muted)",
            }}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <SidebarSection title="Overview">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Events (24h)", value: fmtCount(mapData?.total_events || 0), icon: Shield },
              { label: "Countries", value: String(mapData?.active_countries || 0), icon: Globe },
              { label: "Unique IPs", value: fmtCount(mapData?.unique_ips || 0), icon: Radio },
              { label: "Top Source", value: mapData?.top_source || "—", icon: Zap },
            ].map(item => (
              <div
                key={item.label}
                className="rounded-xl border p-3"
                style={{ backgroundColor: "var(--theme-card-bg)", borderColor: "var(--theme-surface-border)" }}
              >
                <div className="flex items-center gap-1.5 mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                  <item.icon className="w-3 h-3" />
                  <span className="text-[10px] uppercase tracking-wide">{item.label}</span>
                </div>
                <div className="text-sm font-semibold font-mono truncate" style={{ color: "var(--theme-text-primary)" }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px]">
            {customer && (
              <span className="px-2 py-1 rounded-full" style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-secondary)" }}>
                Customer: {customer}
              </span>
            )}
            {customer_scope && (
              <span className="px-2 py-1 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 12%, transparent)", color: "var(--theme-accent)" }}>
                Scoped: {customer_scope}
              </span>
            )}
          </div>
        </SidebarSection>

        {selectedCountry && countryStats && (
          <section className="px-4 py-3" style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
            <div
              className="rounded-xl border-l-2 p-3"
              style={{
                borderColor: "var(--theme-accent)",
                backgroundColor: "color-mix(in srgb, var(--theme-card-bg) 88%, transparent)",
              }}
            >
              <button
                onClick={onClearCountry}
                className="flex items-center gap-1.5 text-xs font-medium mb-2"
                style={{ color: "var(--theme-text-primary)" }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {selectedCountry}
              </button>
              <div className="text-[11px] mb-3" style={{ color: "var(--theme-text-secondary)" }}>
                {fmtCount(countryStats.total)} attacks observed from this country
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                    Top rules
                  </div>
                  <div className="space-y-1.5">
                    {countryStats.topRules.length > 0 ? countryStats.topRules.map((rule, idx) => {
                      const tone = levelTone(rule.level);
                      return (
                        <div key={`${rule.desc}-${idx}`} className="flex items-start gap-2">
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0" style={tone}>
                            L{rule.level}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] truncate" style={{ color: "var(--theme-text-primary)" }} title={rule.desc}>
                              {rule.desc}
                            </div>
                            <div className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>
                              {rule.count} hits
                            </div>
                          </div>
                        </div>
                      );
                    }) : <div className="text-[11px]" style={{ color: "var(--theme-text-dim)" }}>No rule data</div>}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                    Top ports
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {countryStats.topPorts.length > 0 ? countryStats.topPorts.map(([port, count]) => (
                      <span
                        key={port}
                        className="text-[10px] px-2 py-1 rounded-full"
                        style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-secondary)" }}
                      >
                        :{port} <span style={{ color: "var(--theme-text-muted)" }}>({count})</span>
                      </span>
                    )) : <div className="text-[11px]" style={{ color: "var(--theme-text-dim)" }}>No port data</div>}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                    Top protocols
                  </div>
                  <div className="space-y-1.5">
                    {countryStats.topProtos.length > 0 ? countryStats.topProtos.map(([proto, count]) => {
                      const pct = Math.max(6, Math.round((count / Math.max(countryStats.total, 1)) * 100));
                      return (
                        <div key={proto} className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span style={{ color: "var(--theme-text-secondary)" }}>{proto.toUpperCase()}</span>
                            <span style={{ color: "var(--theme-text-muted)" }}>{count}</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--theme-surface-raised)" }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: protocolTone(proto) }} />
                          </div>
                        </div>
                      );
                    }) : <div className="text-[11px]" style={{ color: "var(--theme-text-dim)" }}>No protocol data</div>}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <SidebarSection title="Top attacking countries">
          <div className="space-y-1">
            {topCountries.length > 0 ? topCountries.map((countryItem, idx) => (
              <button
                key={countryItem.country}
                onClick={() => onSelectCountry(countryItem.country)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors"
                style={{ color: "var(--theme-text-primary)" }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = "var(--theme-surface-raised)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span className="w-4 text-[10px] font-mono shrink-0" style={{ color: "var(--theme-text-dim)" }}>{idx + 1}</span>
                <span className="truncate text-[11px]">{countryItem.country}</span>
                <span className="ml-auto font-mono text-[11px] shrink-0" style={{ color: "var(--theme-text-secondary)" }}>
                  {fmtCount(countryItem.count)}
                </span>
                <span className="w-10 text-right text-[9px] shrink-0" style={{ color: "var(--theme-text-dim)" }}>
                  {mapData ? `${((countryItem.count / Math.max(mapData.total_events, 1)) * 100).toFixed(1)}%` : ""}
                </span>
              </button>
            )) : <div className="text-[11px]" style={{ color: "var(--theme-text-dim)" }}>No country data</div>}
          </div>
        </SidebarSection>

        <SidebarSection title={selectedCountry ? `Top rules · ${selectedCountry}` : "Top rules"}>
          <div className="space-y-2">
            {topRules.length > 0 ? topRules.map((rule, idx) => (
              <div key={`${rule.desc}-${idx}`} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] truncate" style={{ color: "var(--theme-text-primary)" }} title={rule.desc}>
                    {rule.desc}
                  </div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono shrink-0" style={{ backgroundColor: "var(--theme-surface-raised)", color: "var(--theme-text-secondary)" }}>
                  {rule.count}
                </span>
              </div>
            )) : <div className="text-[11px]" style={{ color: "var(--theme-text-dim)" }}>No rule data</div>}
          </div>
        </SidebarSection>

        <SidebarSection title="Protocol distribution">
          <div className="space-y-2 text-[11px]">
            {protocols.length > 0 ? protocols.map(item => (
              <div key={item.proto} className="grid grid-cols-[50px_1fr_36px] items-center gap-2">
                <span style={{ color: "var(--theme-text-secondary)" }}>{item.proto.toUpperCase()}</span>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--theme-surface-raised)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(item.pct, 5)}%`, backgroundColor: protocolTone(item.proto) }} />
                </div>
                <span className="text-right font-mono" style={{ color: "var(--theme-text-muted)" }}>{item.pct}%</span>
              </div>
            )) : <div className="text-[11px]" style={{ color: "var(--theme-text-dim)" }}>No protocol data</div>}
          </div>
        </SidebarSection>

        <SidebarSection title={selectedCountry ? `Live feed · ${selectedCountry}` : "Live feed"}>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {feedItems.length > 0 ? feedItems.map((e, idx) => (
              <div key={`${e.id}-${idx}`} className="rounded-lg px-2 py-2" style={{ backgroundColor: "color-mix(in srgb, var(--theme-surface-raised) 65%, transparent)" }}>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: protocolTone(e.protocol) }} />
                  <span className="font-mono min-w-0 flex-1 truncate" style={{ color: "var(--theme-text-secondary)" }} title={e.source_ip}>
                    {e.source_ip}
                  </span>
                  <span className="font-mono shrink-0" style={{ color: "var(--theme-text-muted)" }}>:{e.port}</span>
                  {e.rule_level > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0" style={levelTone(e.rule_level)}>
                      L{e.rule_level}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px]">
                  <span style={{ color: protocolTone(e.protocol) }}>{(e.protocol || "tcp").toUpperCase()}</span>
                  <span style={{ color: "var(--theme-text-dim)" }}>•</span>
                  <span className="truncate" style={{ color: "var(--theme-text-dim)" }} title={e.rule_desc}>
                    {e.rule_desc || e.agent_name || "Alert"}
                  </span>
                  <span className="ml-auto shrink-0 font-mono" style={{ color: "var(--theme-text-dim)" }}>
                    {timeAgo(e.time)}
                  </span>
                </div>
              </div>
            )) : <div className="text-[11px]" style={{ color: "var(--theme-text-dim)" }}>No live events</div>}
          </div>
        </SidebarSection>
      </div>
    </div>
  );
}
