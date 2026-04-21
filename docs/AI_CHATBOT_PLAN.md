# SOC AI Chatbot — Implementation Plan

## Concept

Transform the current one-shot "Generate Insights" button into a persistent **AI chatbot** that:
- Floats as a small icon (bottom-right corner), always accessible
- Opens as a chat panel (like Intercom/helpdesk style)
- Can analyze dashboard data conversationally
- Maintains chat history per user (persisted in DB)
- Has context of all current SOC metrics

## UI/UX Design

### Floating Icon (Collapsed State)
```
┌──────────────────────────────────┐
│          Dashboard...            │
│                                  │
│                                  │
│                           ┌────┐ │
│                           │ AI │ │  ← Floating FAB, bottom-right
│                           │ ✨ │ │     60×60px, subtle pulse animation
│                           └────┘ │     fixed position, z-50
└──────────────────────────────────┘
```
- Animated icon: sparkle/brain SVG with subtle breathing glow
- Badge count for unread AI messages (if any pending)
- Click → expands to chat panel

### Chat Panel (Expanded State)
```
┌─────────────────────────────────────────┐
│ ● SOC AI Assistant            ✕  ⤢     │  ← Header with close + expand
│─────────────────────────────────────────│
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 👤 Analyze ticket trends for    │    │  ← User message (right-aligned)
│  │    CMWI last 7 days             │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🤖 Untuk CMWI 7 hari terakhir: │    │  ← AI response (left-aligned)
│  │                                 │    │     Markdown rendered
│  │ **Total:** 42 tickets           │    │
│  │ **TP Rate:** 4.8% (↑ dari 2%)  │    │
│  │                                 │    │
│  │ Anomali yang terdeteksi:        │    │
│  │ - Rule 100021 spike 3x normal   │    │
│  │ - MTTD naik 40% vs minggu lalu  │    │
│  │                                 │    │
│  │ Rekomendasi:                    │    │
│  │ 1. Review rule tuning...        │    │
│  └─────────────────────────────────┘    │
│                                         │
│─────────────────────────────────────────│
│ ┌─────────────────────────────┐ ┌────┐ │
│ │ Ask about your SOC data...  │ │ ➤  │ │  ← Input bar
│ └─────────────────────────────┘ └────┘ │
│                                         │
│  💡 Quick actions:                      │
│  [Analyze trends] [Top anomalies]       │  ← Suggestion chips
│  [SLA report] [Analyst review]          │
└─────────────────────────────────────────┘
```

### Quick Action Chips
Pre-built prompts for common queries:
1. **"Analyze trends"** — Generates full insight report (same as current "Generate Insights")
2. **"Top anomalies"** — Focuses on anomaly detection
3. **"SLA report"** — SLA compliance analysis
4. **"Analyst review"** — Per-analyst performance assessment
5. **"Compare customers"** — Cross-customer comparison
6. **"What should I do?"** — Prioritized action recommendations

---

## Architecture

### Backend Changes

#### New DB Table: `chat_messages`
```sql
CREATE TABLE chat_messages (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    conversation_id VARCHAR(100) NOT NULL,  -- groups messages into conversations
    role          VARCHAR(20) NOT NULL,     -- 'user' or 'assistant'
    content       TEXT NOT NULL,
    metadata      JSONB DEFAULT '{}',       -- model_used, tokens, filters used
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_chat_user_conv ON chat_messages(user_id, conversation_id);
```

#### New Router: `routers/chat.py`
```
POST /api/chat/message     — Send a message, get AI response
GET  /api/chat/history     — Get conversation list for user
GET  /api/chat/history/:id — Get messages for a conversation
DELETE /api/chat/history/:id — Delete a conversation
```

#### `POST /api/chat/message` Flow:
```
1. Receive: { message, conversation_id?, filters? }
2. If no conversation_id → create new one (uuid)
3. Save user message to DB
4. Gather current SOC metrics (using filters from dashboard)
5. Build prompt:
   - SYSTEM: SOC AI assistant + data context
   - HISTORY: last N messages from conversation (for context)
   - USER: new message
6. Call LLM (same multi-provider system as current)
7. Parse response
8. Save assistant message to DB
9. Return: { message, conversation_id, model_used }
```

#### Context Injection
The AI gets the same metrics as current `_build_prompt()`:
- Summary KPIs (total, open, TP/FP rates, MTTD, SLA)
- Top 5 alert rules
- Customer breakdown
- Analyst performance

Plus: the current dashboard filter context (time range, customer, asset).

**New**: Chat messages carry `metadata.filters` so the AI knows what the user is looking at.

### Frontend Changes

#### New Component: `AIChatWidget.tsx`
- **Collapsed**: Floating FAB icon (bottom-right, `position: fixed`)
- **Expanded**: Chat panel (400px wide × 600px tall, slides up)
- **States**: collapsed, expanded, loading (AI thinking)

#### Component Structure:
```
AIChatWidget
├── ChatFAB              — Floating action button with animation
├── ChatPanel            — The chat window
│   ├── ChatHeader       — Title, close, expand/minimize
│   ├── ChatMessages     — Scrollable message list
│   │   ├── UserMessage  — Right-aligned, user's text
│   │   └── AIMessage    — Left-aligned, markdown rendered
│   ├── QuickChips       — Suggestion action buttons
│   └── ChatInput        — Text input + send button
└── ConversationList     — History sidebar (optional)
```

#### State Management:
- `conversations[]` — list of conversation IDs + titles
- `activeConversation` — current conversation messages
- `isOpen` — panel visibility
- Messages fetched from API on open, cached locally

#### Keyboard Shortcut:
- `Ctrl+K` or `Ctrl+/` to toggle chat panel

---

## Implementation Phases

### Phase A: Backend Chat API (3 files)
1. `chat_messages` table + SQLAlchemy model
2. `routers/chat.py` with send/history endpoints
3. Enhanced prompt builder with conversation history context

### Phase B: Frontend Chat Widget (2 files)
1. `AIChatWidget.tsx` — FAB + chat panel + message rendering
2. Wire into `App.tsx` — render widget globally

### Phase C: Quick Actions + Polish
1. Suggestion chips with pre-built prompts
2. Conversation list / history sidebar
3. Keyboard shortcut
4. "Thinking..." animation
5. Auto-scroll to latest message

---

## Model Selection & Auto-Discovery

### Concept
User bisa pilih model AI dari chat header. Model list di-fetch langsung dari masing-masing provider API (bukan hardcode). Ambil top 5 model per provider.

### Flow
```
1. User adds provider (e.g. OpenAI + API key) via LLM Settings
2. Backend calls provider's model list API
3. Returns top 5 models per provider (sorted by capability/latest)
4. User picks model from dropdown in chat header
5. Selected model saved per conversation
```

### Backend: `GET /api/llm/providers/:id/models`
Fetch available models from provider API, return top 5:

```python
# Per provider model list API:
# OpenAI:    GET https://api.openai.com/v1/models
# Anthropic: hardcoded (no list API) → claude-sonnet-4-20250514, claude-3.5-haiku, etc.
# xAI:       GET https://api.x.ai/v1/models
# Google:    GET https://generativelanguage.googleapis.com/v1beta/models

# Response format:
{
  "provider": "openai",
  "models": [
    { "id": "gpt-4o", "name": "GPT-4o", "context": 128000 },
    { "id": "gpt-4o-mini", "name": "GPT-4o Mini", "context": 128000 },
    { "id": "o4-mini", "name": "o4 Mini", "context": 200000 },
    { "id": "gpt-4.1", "name": "GPT-4.1", "context": 1048576 },
    { "id": "gpt-4.1-mini", "name": "GPT-4.1 Mini", "context": 1048576 },
  ]
}
```

### Top 5 Model Selection per Provider

| Provider | Top 5 Models (fallback if API unavailable) |
|----------|-------------------------------------------|
| **OpenAI** | gpt-4o, gpt-4o-mini, o4-mini, gpt-4.1, gpt-4.1-mini |
| **Anthropic** | claude-sonnet-4-20250514, claude-3.5-haiku-20241022, claude-3.5-sonnet-20241022, claude-3-haiku-20240307, claude-3-opus-20240229 |
| **xAI** | grok-3, grok-3-mini, grok-2, grok-2-mini, grok-2-vision |
| **Google** | gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash |

### Frontend: Model Picker in Chat Header
```
┌─────────────────────────────────────────┐
│ ● SOC AI Assistant  [GPT-4o ▾]   ✕  ⤢  │  ← Model dropdown in header
│─────────────────────────────────────────│
```
- Dropdown shows: provider icon + model name + context window size
- Grouped by provider (OpenAI section, Anthropic section, etc.)
- Default: the provider/model marked as default in LLM Settings
- Changing model mid-conversation is allowed (new messages use new model)

### Auto-Discovery Implementation
```python
async def fetch_provider_models(provider: str, api_key: str, base_url: str | None) -> list[dict]:
    """Fetch available models from provider API."""
    if provider == "anthropic":
        # No list API — return curated list
        return ANTHROPIC_MODELS
    
    # OpenAI-compatible providers (openai, xai, google)
    url = base_url or DEFAULT_URLS[provider]
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{url}/models",
            headers={"Authorization": f"Bearer {api_key}"}
        )
        if resp.status_code != 200:
            return FALLBACK_MODELS[provider]
        
        models = resp.json().get("data", [])
        # Filter to chat models, sort by created date desc, take top 5
        chat_models = [m for m in models if "chat" in str(m.get("id", "")) or not m.get("id", "").startswith("ft:")]
        chat_models.sort(key=lambda m: m.get("created", 0), reverse=True)
        return [{"id": m["id"], "name": m["id"]} for m in chat_models[:5]]
```

### Caching
- Model list cached in Redis (key: `models:{provider_id}`, TTL: 1 hour)
- Fallback to hardcoded list if API call fails
- Force refresh button in UI

---

## What Changes vs Current

| Aspect | Current | New |
|--------|---------|-----|
| Trigger | "Generate Insights" button in dashboard | Floating chat FAB anywhere |
| Format | Structured sections (Ringkasan/Anomali/Rekomendasi) | Conversational markdown |
| History | None — one-shot, lost on refresh | Persisted in DB per user |
| Follow-up | Cannot ask follow-up questions | Full conversation context |
| Location | Fixed panel below dashboard grid | Floating overlay, accessible from any page |
| Context | Only current filter period | Current filters + conversation history |
| AI Panel | Removed from dashboard grid | Chat widget replaces it |

## What Stays the Same
- LLM provider system (multi-provider, DB-configured)
- Authentication (JWT, per-user)
- Data access (same AnalyticsService metrics)
- Language (Bahasa Indonesia, casual professional)
- SYSTEM_PROMPT tone and guidelines
