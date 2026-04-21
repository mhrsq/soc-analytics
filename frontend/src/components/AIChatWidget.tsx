import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Sparkles, MessageSquare, Trash2, ChevronDown, Plus, Loader2 } from "lucide-react";
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

const QUICK_ACTIONS = [
  { label: "Analyze trends", prompt: "Analisis trend tiket SOC untuk periode yang sedang dilihat. Highlight anomali dan pola yang perlu perhatian." },
  { label: "Top anomalies", prompt: "Apa anomali paling signifikan dari data SOC saat ini? Urutkan dari yang paling kritis." },
  { label: "SLA report", prompt: "Berikan laporan SLA compliance. Mana yang di bawah target? Apa yang perlu diperbaiki?" },
  { label: "Analyst review", prompt: "Review performa analyst SOC. Siapa yang overloaded? Siapa yang underutilized? Ada burnout risk?" },
  { label: "What should I do?", prompt: "Berdasarkan data SOC saat ini, apa 3 hal paling penting yang harus saya lakukan sekarang sebagai SOC manager?" },
];

export function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Keyboard shortcut: Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Load conversations on open
  useEffect(() => {
    if (isOpen) {
      api.getChatConversations().then(setConversations).catch(() => {});
    }
  }, [isOpen]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.sendChatMessage({
        message: text.trim(),
        conversation_id: convId || undefined,
      });
      const aiMsg: ChatMsg = {
        role: "assistant",
        content: res.message,
        model_used: res.model_used || undefined,
      };
      setMessages(prev => [...prev, aiMsg]);
      if (!convId) setConvId(res.conversation_id);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Error: ${e.message}`,
      }]);
    }
    setLoading(false);
  }, [convId, loading]);

  const loadConversation = async (cid: string) => {
    try {
      const msgs = await api.getChatMessages(cid);
      setMessages(msgs.map(m => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, model_used: m.metadata?.model_used as string })));
      setConvId(cid);
      setShowHistory(false);
    } catch { /* ignore */ }
  };

  const newConversation = () => {
    setMessages([]);
    setConvId(null);
    setShowHistory(false);
  };

  const deleteConv = async (cid: string) => {
    await api.deleteChatConversation(cid).catch(() => {});
    setConversations(prev => prev.filter(c => c.conversation_id !== cid));
    if (convId === cid) newConversation();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ── Floating Action Button (collapsed) ──
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
        style={{
          background: "linear-gradient(135deg, #1b1b21 0%, #141418 100%)",
          border: "1px solid #26262e",
          boxShadow: "0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(155,155,168,0.08)",
        }}
        title="SOC AI Assistant (Ctrl+K)"
      >
        <Sparkles className="w-6 h-6" style={{ color: "#9b9ba8" }} />
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: "#10b981" }} />
      </button>
    );
  }

  // ── Chat Panel (expanded) ──
  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-[420px] rounded-xl overflow-hidden shadow-2xl flex flex-col"
      style={{
        height: "min(640px, calc(100vh - 80px))",
        backgroundColor: "#0a0a0c",
        border: "1px solid #26262e",
        boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid #1d1d23" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#1b1b21" }}>
            <Sparkles className="w-4 h-4" style={{ color: "#9b9ba8" }} />
          </div>
          <div>
            <h3 className="text-sm font-medium" style={{ color: "#e8e8ec" }}>SOC AI Assistant</h3>
            <p className="text-[10px]" style={{ color: "#646471" }}>Powered by LLM · Ctrl+K</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-1.5 rounded-md transition-colors hover:bg-white/[0.05]"
            style={{ color: "#646471" }}
            title="Chat history"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={newConversation}
            className="p-1.5 rounded-md transition-colors hover:bg-white/[0.05]"
            style={{ color: "#646471" }}
            title="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-md transition-colors hover:bg-white/[0.05]"
            style={{ color: "#646471" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* History Sidebar */}
      {showHistory && (
        <div className="absolute inset-0 z-10 flex flex-col" style={{ backgroundColor: "#0a0a0c" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #1d1d23" }}>
            <h4 className="text-xs font-medium uppercase tracking-wider" style={{ color: "#646471" }}>Conversations</h4>
            <button onClick={() => setShowHistory(false)} className="p-1 rounded hover:bg-white/[0.05]" style={{ color: "#646471" }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: "#646471" }}>No conversations yet</p>
            ) : conversations.map(c => (
              <div
                key={c.conversation_id}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-white/[0.03]"
                style={{ backgroundColor: convId === c.conversation_id ? "#1b1b21" : "transparent" }}
                onClick={() => loadConversation(c.conversation_id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate" style={{ color: "#e8e8ec" }}>{c.title}</p>
                  <p className="text-[10px]" style={{ color: "#646471" }}>{c.message_count} messages</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConv(c.conversation_id); }}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/[0.05]"
                  style={{ color: "#646471" }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center py-8">
            <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: "#3e3e48" }} />
            <p className="text-sm font-medium" style={{ color: "#9b9ba8" }}>SOC AI Assistant</p>
            <p className="text-xs mt-1" style={{ color: "#646471" }}>
              Ask anything about your SOC data — trends, anomalies, recommendations.
            </p>

            {/* Quick Actions */}
            <div className="flex flex-wrap justify-center gap-1.5 mt-4">
              {QUICK_ACTIONS.map(a => (
                <button
                  key={a.label}
                  onClick={() => sendMessage(a.prompt)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/[0.05]"
                  style={{ backgroundColor: "#141418", border: "1px solid #1d1d23", color: "#9b9ba8" }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed"
              style={msg.role === "user" ? {
                backgroundColor: "#1b1b21",
                color: "#e8e8ec",
                borderBottomRightRadius: 4,
              } : {
                backgroundColor: "transparent",
                color: "#e8e8ec",
              }}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-invert prose-sm max-w-none [&_p]:my-1 [&_li]:my-0.5 [&_ul]:my-1 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_code]:text-[11px] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-[#1b1b21] [&_table]:text-xs [&_th]:px-2 [&_td]:px-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  {msg.model_used && (
                    <p className="text-[9px] mt-2 opacity-40 font-mono">{msg.model_used}</p>
                  )}
                </div>
              ) : (
                <span>{msg.content}</span>
              )}
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

      {/* Quick actions when conversation has messages */}
      {messages.length > 0 && messages.length < 4 && (
        <div className="px-4 pb-1 flex flex-wrap gap-1">
          {QUICK_ACTIONS.slice(0, 3).map(a => (
            <button
              key={a.label}
              onClick={() => sendMessage(a.prompt)}
              className="px-2 py-1 rounded text-[10px] transition-colors hover:bg-white/[0.05]"
              style={{ backgroundColor: "#141418", border: "1px solid #1d1d23", color: "#646471" }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 shrink-0" style={{ borderTop: "1px solid #1d1d23" }}>
        <div className="flex items-end gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: "#141418", border: "1px solid #1d1d23" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your SOC data..."
            rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-[#3e3e48]"
            style={{ color: "#e8e8ec", maxHeight: 120 }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="p-1.5 rounded-md transition-colors disabled:opacity-20"
            style={{ color: "#9b9ba8" }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
