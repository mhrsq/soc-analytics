import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Sparkles, MessageSquare, Trash2, Plus, Loader2, Maximize2, Minimize2, ArrowLeft, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api/client";

interface ChatMsg {
  id?: number;
  role: "user" | "assistant";
  content: string;
  model_used?: string;
  created_at?: string;
}

interface Conversation {
  conversation_id: string;
  title: string;
  message_count: number;
  last_message_at: string | null;
}

interface Props {
  activePage?: string;
  filters?: Record<string, string>;
}

// Menu context descriptions for AI
const MENU_CONTEXT: Record<string, string> = {
  dashboard: "User sedang di Main Dashboard — overview KPI tiket SOC, volume trend, priority distribution, alert quality, top rules, analyst performance.",
  manager: "User sedang di Team Workload — tabel workload analyst, MTTD/MTTR per analyst, SLA compliance, flag overloaded/underutilized, performance trends.",
  threatmap: "User sedang di Threat Map — visualisasi attack pada peta, site markers, attack feed real-time, filter per customer.",
  topology: "User sedang di Topology Editor — network graph editor, node management (server/firewall/siem/etc), link connections.",
  users: "User sedang di User Management — daftar user, role management (superadmin/admin/customer/viewer), create/edit/delete user.",
};

const INITIAL_CHIPS = [
  { label: "Analyze trends", prompt: "Analisis trend tiket SOC untuk periode yang sedang dilihat. Highlight anomali dan pola yang perlu perhatian." },
  { label: "Top anomalies", prompt: "Apa anomali paling signifikan dari data SOC saat ini? Urutkan dari yang paling kritis." },
  { label: "SLA report", prompt: "Berikan laporan SLA compliance. Mana yang di bawah target? Apa yang perlu diperbaiki?" },
  { label: "Analyst review", prompt: "Review performa analyst SOC. Siapa yang overloaded? Siapa yang underutilized? Ada burnout risk?" },
  { label: "What should I do?", prompt: "Berdasarkan data SOC saat ini, apa 3 hal paling penting yang harus saya lakukan sekarang sebagai SOC manager?" },
  { label: "Explain this page", prompt: "Jelaskan menu/halaman yang sedang saya buka sekarang. Apa fungsinya, cara menggunakannya, dan informasi apa yang bisa saya dapatkan dari sini?" },
];

export function AIChatWidget({ activePage, filters }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [followUpChips, setFollowUpChips] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const wasOpenRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Track open state in ref for async callbacks
  // Update ref synchronously via wrapper so async sendMessage can read it immediately
  const openChat = useCallback(() => { setIsOpen(true); wasOpenRef.current = true; setHasUnread(false); }, []);
  const closeChat = useCallback(() => { setIsOpen(false); wasOpenRef.current = false; }, []);
  useEffect(() => {
    if (isOpen) setHasUnread(false);
  }, [isOpen]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Focus input
  useEffect(() => {
    if (isOpen && inputRef.current) setTimeout(() => inputRef.current?.focus(), 200);
  }, [isOpen]);

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); if (wasOpenRef.current) closeChat(); else openChat(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Load conversations on open
  useEffect(() => {
    if (isOpen) api.getChatConversations().then(setConversations).catch(() => {});
  }, [isOpen]);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  // Generate follow-up suggestions from last AI response
  const generateFollowUps = useCallback((aiText: string) => {
    const suggestions: string[] = [];
    if (aiText.includes("anomali") || aiText.includes("Anomali")) suggestions.push("Jelaskan anomali ini lebih detail");
    if (aiText.includes("SLA") || aiText.includes("sla")) suggestions.push("Bagaimana cara improve SLA?");
    if (aiText.includes("MTTD") || aiText.includes("mttd")) suggestions.push("Breakdown MTTD per analyst");
    if (aiText.includes("rule") || aiText.includes("Rule")) suggestions.push("Tuning rules mana yang prioritas?");
    if (aiText.includes("rekomendasi") || aiText.includes("Rekomendasi")) suggestions.push("Elaborate rekomendasi #1");
    if (aiText.includes("analyst") || aiText.includes("Analyst")) suggestions.push("Siapa analyst terbaik?");
    if (suggestions.length === 0) suggestions.push("Lanjutkan analisis", "Apa lagi yang perlu diperhatikan?");
    setFollowUpChips(suggestions.slice(0, 3));
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setFollowUpChips([]);
    setLoading(true);
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = "auto";

    try {
      const res = await api.sendChatMessage({
        message: text.trim(),
        conversation_id: convId || undefined,
        filters: {
          ...filters,
          active_page: activePage || "dashboard",
          page_context: MENU_CONTEXT[activePage || "dashboard"] || "",
        },
      });
      const aiMsg: ChatMsg = { role: "assistant", content: res.message, model_used: res.model_used || undefined };
      setMessages(prev => [...prev, aiMsg]);
      if (!convId) setConvId(res.conversation_id);
      generateFollowUps(res.message);
      // If user closed the panel while waiting, show notification
      if (!wasOpenRef.current) setHasUnread(true);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    }
    setLoading(false);
  }, [convId, loading, filters, activePage, generateFollowUps]);

  const loadConversation = async (cid: string) => {
    try {
      const msgs = await api.getChatMessages(cid);
      setMessages(msgs.map(m => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, model_used: m.metadata?.model_used as string })));
      setConvId(cid);
      setShowHistory(false);
    } catch {}
  };

  const newConversation = () => { setMessages([]); setConvId(null); setShowHistory(false); setFollowUpChips([]); };

  const deleteConv = async (cid: string) => {
    await api.deleteChatConversation(cid).catch(() => {});
    setConversations(prev => prev.filter(c => c.conversation_id !== cid));
    if (convId === cid) newConversation();
  };

  const copyMessage = async (content: string, id?: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id ?? -1);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  // ── FAB (collapsed) ──
  if (!isOpen) {
    return (
      <>
        <style>{`
          @keyframes fabBreathe {
            0%, 100% { box-shadow: 0 0 8px rgba(96,165,250,0.15), 0 4px 24px rgba(0,0,0,0.4); }
            50% { box-shadow: 0 0 20px rgba(96,165,250,0.35), 0 0 40px rgba(96,165,250,0.10), 0 4px 24px rgba(0,0,0,0.4); }
          }
          @keyframes fabNotify {
            0%, 100% { box-shadow: 0 0 8px rgba(16,185,129,0.25), 0 4px 24px rgba(0,0,0,0.4); }
            50% { box-shadow: 0 0 24px rgba(16,185,129,0.50), 0 0 48px rgba(16,185,129,0.15), 0 4px 24px rgba(0,0,0,0.4); }
          }
        `}</style>
        <button onClick={openChat}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #1b1b21 0%, #141418 100%)",
            border: `1px solid ${hasUnread ? "#10b981" : "#26262e"}`,
            animation: hasUnread ? "fabNotify 2s ease-in-out infinite" : "fabBreathe 3s ease-in-out infinite",
          }}
          title="SOC AI Assistant (Ctrl+K)">
          <Sparkles className="w-6 h-6" style={{ color: hasUnread ? "#10b981" : "#9b9ba8" }} />
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: "#10b981" }} />
          )}
        </button>
      </>
    );
  }

  const panelClass = isFullscreen
    ? "fixed inset-4 z-50 rounded-xl"
    : "fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] sm:w-[420px] max-w-[420px] rounded-xl";
  const panelHeight = isFullscreen ? "auto" : "min(640px, calc(100vh - 80px))";

  // ── Chat Panel ──
  return (
    <div className={`${panelClass} overflow-hidden shadow-2xl flex flex-col`}
      style={{ height: panelHeight, backgroundColor: "#0a0a0c", border: "1px solid #26262e", boxShadow: "0 8px 48px rgba(0,0,0,0.6)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid #1d1d23" }}>
        <div className="flex items-center gap-2.5">
          {showHistory && (
            <button onClick={() => setShowHistory(false)} className="p-1 rounded-md hover:bg-white/[0.05]" style={{ color: "#646471" }}>
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#1b1b21" }}>
            <Sparkles className="w-4 h-4" style={{ color: "#9b9ba8" }} />
          </div>
          <div>
            <h3 className="text-sm font-medium" style={{ color: "#e8e8ec" }}>{showHistory ? "Chat History" : "SOC AI Assistant"}</h3>
            <p className="text-[10px]" style={{ color: "#646471" }}>
              {showHistory ? `${conversations.length} conversations` : `${activePage || "dashboard"} · Ctrl+K`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!showHistory && (
            <>
              <button onClick={() => setShowHistory(true)} className="p-1.5 rounded-md hover:bg-white/[0.05]" style={{ color: "#646471" }} title="History">
                <MessageSquare className="w-4 h-4" />
              </button>
              <button onClick={newConversation} className="p-1.5 rounded-md hover:bg-white/[0.05]" style={{ color: "#646471" }} title="New chat">
                <Plus className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={() => setIsFullscreen(f => !f)} className="p-1.5 rounded-md hover:bg-white/[0.05]" style={{ color: "#646471" }} title="Toggle fullscreen">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => { closeChat(); setIsFullscreen(false); }} className="p-1.5 rounded-md hover:bg-white/[0.05]" style={{ color: "#646471" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* History view */}
      {showHistory ? (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: "#646471" }}>No conversations yet</p>
          ) : conversations.map(c => (
            <div key={c.conversation_id} className="group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-white/[0.03]"
              style={{ backgroundColor: convId === c.conversation_id ? "#1b1b21" : "transparent" }}
              onClick={() => loadConversation(c.conversation_id)}>
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate" style={{ color: "#e8e8ec" }}>{c.title}</p>
                <p className="text-[10px]" style={{ color: "#646471" }}>{c.message_count} messages</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteConv(c.conversation_id); }}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/[0.05]" style={{ color: "#646471" }}>
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="text-center py-8">
                <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: "#3e3e48" }} />
                <p className="text-sm font-medium" style={{ color: "#9b9ba8" }}>SOC AI Assistant</p>
                <p className="text-xs mt-1" style={{ color: "#646471" }}>Ask anything about your SOC data.</p>
                <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                  {INITIAL_CHIPS.map(a => (
                    <button key={a.label} onClick={() => sendMessage(a.prompt)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium hover:bg-white/[0.05]"
                      style={{ backgroundColor: "#141418", border: "1px solid #1d1d23", color: "#9b9ba8" }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed group/msg relative`}
                  style={msg.role === "user" ? { backgroundColor: "#1b1b21", color: "#e8e8ec", borderBottomRightRadius: 4 } : { color: "#e8e8ec" }}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-invert prose-sm max-w-none [&_p]:my-1 [&_li]:my-0.5 [&_ul]:my-1 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_code]:text-[11px] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-[#1b1b21] [&_table]:text-xs [&_th]:px-2 [&_td]:px-2">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      {msg.model_used && <p className="text-[9px] mt-2 opacity-40 font-mono">{msg.model_used}</p>}
                    </div>
                  ) : <span>{msg.content}</span>}
                  {/* Copy button */}
                  <button onClick={() => copyMessage(msg.content, msg.id ?? i)}
                    className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover/msg:opacity-100 transition-opacity hover:bg-white/[0.05]"
                    style={{ color: "#646471" }} title="Copy">
                    {copiedId === (msg.id ?? i) ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 px-1">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: "#646471", animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: "#646471", animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: "#646471", animationDelay: "300ms" }} />
                </div>
                <span className="text-[11px]" style={{ color: "#646471" }}>Thinking...</span>
              </div>
            )}
          </div>

          {/* Follow-up chips */}
          {followUpChips.length > 0 && !loading && (
            <div className="px-4 pb-1 flex flex-wrap gap-1">
              {followUpChips.map(c => (
                <button key={c} onClick={() => sendMessage(c)}
                  className="px-2 py-1 rounded text-[10px] hover:bg-white/[0.05]"
                  style={{ backgroundColor: "#141418", border: "1px solid #1d1d23", color: "#646471" }}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-3 shrink-0" style={{ borderTop: "1px solid #1d1d23" }}>
            <div className="flex items-end gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: "#141418", border: "1px solid #1d1d23" }}>
              <textarea ref={inputRef} value={input}
                onChange={e => { setInput(e.target.value); autoResize(); }}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your SOC data..."
                rows={1}
                className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-[#3e3e48]"
                style={{ color: "#e8e8ec", maxHeight: 120 }} />
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
                className="p-1.5 rounded-md transition-colors disabled:opacity-20" style={{ color: "#9b9ba8" }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
