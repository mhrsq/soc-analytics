# Test Plan — AI Features

**Module:** AI (Chat Widget, AI Insights, LLM Settings)  
**URL:** `http://<host>/` → Floating FAB (bottom-right), AI Insights panel, LLM Settings  
**Last Updated:** 2026-04-21  

---

## 1. AI Chat — FAB (Floating Action Button)

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 1.1 | FAB visible | Load any page | Sparkles icon button in bottom-right corner, z-index above content | ☐ |
| 1.2 | Default animation | Observe FAB (no unread messages) | Blue breathing glow animation (subtle pulsing box-shadow) | ☐ |
| 1.3 | No green dot default | Observe FAB | No green notification dot visible by default | ☐ |
| 1.4 | Click to open | Click FAB | Chat panel opens (420×640px) | ☐ |
| 1.5 | Ctrl+K shortcut | Press Ctrl+K | Chat panel toggles open/close | ☐ |
| 1.6 | FAB hidden when open | Open chat | FAB disappears, chat panel visible | ☐ |
| 1.7 | Tooltip | Hover over FAB | "SOC AI Assistant (Ctrl+K)" tooltip | ☐ |

---

## 2. AI Chat — Notification Behavior

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 2.1 | Send while open | Open chat → send message → wait for response | Response appears in chat, no notification behavior | ☐ |
| 2.2 | Close while thinking | Send message → immediately close chat | FAB shows, AI continues processing in background | ☐ |
| 2.3 | Green notification | After 2.2, wait for AI to respond | Green pulse dot appears on FAB, green glow animation | ☐ |
| 2.4 | Clear notification | Click FAB to open chat (after green dot) | Green dot disappears, chat shows AI response | ☐ |
| 2.5 | No false notification | Open chat → close (no pending message) | NO green dot — blue breathing glow only | ☐ |

---

## 3. AI Chat — Panel Layout

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 3.1 | Panel dimensions | Open chat | 420px wide, max 640px tall, rounded-xl | ☐ |
| 3.2 | Header | Observe chat header | "SOC AI Assistant" title, active page context (e.g. "Dashboard") | ☐ |
| 3.3 | Header buttons | Observe header | History icon, New chat (+), Fullscreen toggle, Close (X) | ☐ |
| 3.4 | Fullscreen toggle | Click maximize icon | Chat expands to near-fullscreen (inset-4), icon changes to minimize | ☐ |
| 3.5 | Minimize | Click minimize icon | Returns to 420×640 size | ☐ |
| 3.6 | Close button | Click X | Chat closes, FAB returns | ☐ |
| 3.7 | Input area | Observe bottom of chat | Auto-resizing textarea with send button | ☐ |
| 3.8 | Ctrl+K hint | Observe header | "Ctrl+K" text hint visible | ☐ |

---

## 4. AI Chat — Initial State & Quick Actions

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 4.1 | Initial chips | Open fresh chat (no messages) | 6 quick action chips visible | ☐ |
| 4.2 | Chip labels | Read chip labels | "Analyze trends", "Top anomalies", "SLA report", "Analyst review", "What should I do?", "Explain this page" | ☐ |
| 4.3 | Click chip | Click "Analyze trends" | Message sent automatically, loading shown | ☐ |
| 4.4 | Chips disappear | After first message sent | Initial chips disappear | ☐ |
| 4.5 | "Explain this page" context | Navigate to Threats → open chat → click "Explain this page" | AI explains the Threats page specifically | ☐ |

---

## 5. AI Chat — Messaging

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 5.1 | Type message | Type "Hello" in textarea | Text appears in input | ☐ |
| 5.2 | Send via Enter | Press Enter | Message sent, input clears | ☐ |
| 5.3 | Shift+Enter newline | Press Shift+Enter | Newline inserted, message NOT sent | ☐ |
| 5.4 | Send button | Click send icon | Message sent | ☐ |
| 5.5 | Disabled when empty | Observe send button with empty input | Button disabled / grayed out | ☐ |
| 5.6 | Disabled while loading | Send message, observe button | Button disabled during AI processing | ☐ |
| 5.7 | User message style | Send message, observe right side | Right-aligned, dark background | ☐ |
| 5.8 | AI response style | Observe AI reply | Left-aligned, markdown rendered | ☐ |
| 5.9 | Markdown rendering | AI responds with markdown (headers, lists, bold, code) | Properly rendered with ReactMarkdown | ☐ |
| 5.10 | Code blocks | AI responds with code block | Syntax-highlighted code block | ☐ |
| 5.11 | Tables in response | AI responds with markdown table | Table rendered properly | ☐ |
| 5.12 | Model attribution | Check below AI response | Model name shown (e.g. "Claude 3.5 Sonnet") | ☐ |
| 5.13 | Auto-scroll | Send message / receive response | Chat auto-scrolls to bottom | ☐ |
| 5.14 | Loading indicator | Send message | Bouncing dots + "Thinking..." shown while waiting | ☐ |
| 5.15 | Textarea auto-resize | Type multiple lines | Textarea grows up to 120px max | ☐ |
| 5.16 | Error response | Trigger API error (e.g. no LLM configured) | "Error: ..." message shown in chat | ☐ |

---

## 6. AI Chat — Copy Messages

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 6.1 | Copy button appears | Hover over AI message | Copy icon appears on message | ☐ |
| 6.2 | Copy to clipboard | Click copy button | Content copied to clipboard, icon changes to checkmark | ☐ |
| 6.3 | Checkmark feedback | After copy | Checkmark shown for ~2 seconds, then reverts | ☐ |
| 6.4 | Paste verification | Copy → paste in text editor | Content matches AI response | ☐ |

---

## 7. AI Chat — Follow-up Suggestions

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 7.1 | Follow-ups appear | After AI responds | Up to 3 follow-up chip suggestions shown | ☐ |
| 7.2 | Contextual chips | AI response mentions "SLA" | Chip like "Bagaimana cara improve SLA?" appears | ☐ |
| 7.3 | Contextual chips - analyst | AI mentions "analyst" | "Siapa analyst terbaik?" chip appears | ☐ |
| 7.4 | Contextual chips - anomaly | AI mentions "anomali" | "Jelaskan anomali ini lebih detail" chip appears | ☐ |
| 7.5 | Default chips | AI response without keywords | "Lanjutkan analisis" and "Apa lagi yang perlu diperhatikan?" | ☐ |
| 7.6 | Click follow-up | Click a follow-up chip | Message sent, new response generated | ☐ |
| 7.7 | Chips clear on send | Send a manual message | Previous follow-up chips disappear | ☐ |

---

## 8. AI Chat — Conversation History

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 8.1 | Open history | Click message/history icon in header | Conversation list shown | ☐ |
| 8.2 | Conversations listed | Observe list | Each conversation: title, message count | ☐ |
| 8.3 | Load conversation | Click a conversation | Messages loaded, chat shows previous messages | ☐ |
| 8.4 | Back button | Click back arrow in history view | Returns to current chat | ☐ |
| 8.5 | New conversation | Click + button | New blank chat, convId reset | ☐ |
| 8.6 | Delete conversation | Hover row → click trash icon | Conversation removed from list | ☐ |
| 8.7 | Delete active conv | Delete the currently loaded conversation | Chat cleared, new conversation started | ☐ |
| 8.8 | Empty history | Delete all conversations | "No conversations yet" empty state | ☐ |
| 8.9 | Conversations in API | Check Network tab | `GET /api/chat/conversations` called | ☐ |
| 8.10 | Persistence | Send messages → close/reopen chat → load history | Previous conversations available | ☐ |

---

## 9. AI Chat — Context Awareness

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 9.1 | Dashboard context | On Main Dashboard → ask "What am I looking at?" | AI mentions dashboard, KPIs, ticket data | ☐ |
| 9.2 | Manager context | On Manager view → ask "Explain this page" | AI mentions analyst workload, team performance | ☐ |
| 9.3 | Threats context | On Threats → ask "Explain this page" | AI mentions threat map, attack visualization, topology | ☐ |
| 9.4 | Users context | On Users → ask "Explain this page" | AI mentions user management, role management | ☐ |
| 9.5 | Filter passthrough | Set customer filter → send message | API receives filters in request payload | ☐ |
| 9.6 | Page context in API | Send message → check Network | Request includes `active_page` and `page_context` fields | ☐ |
| 9.7 | SOC metrics injection | Ask data question | AI response references actual SOC metrics (ticket counts, SLA, etc.) | ☐ |

---

## 10. AI Insights Panel

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 10.1 | Panel visible | On Main Dashboard, scroll below grid | AI Insights panel visible | ☐ |
| 10.2 | Provider selector | Click provider dropdown | "Auto (default)" + configured providers listed | ☐ |
| 10.3 | Select provider | Choose specific provider | Provider selected for next generation | ☐ |
| 10.4 | LLM settings gear | Click gear icon | LLM settings expand inline | ☐ |
| 10.5 | Empty state | Before generating | Sparkle icon + "Click Generate Insights..." prompt | ☐ |
| 10.6 | Generate insights | Click "Generate Insights" | Loading spinner + "Analyzing ticket patterns..." → AI analysis appears | ☐ |
| 10.7 | Narrative section | Read generated insights | Summary narrative of ticket data | ☐ |
| 10.8 | Anomalies list | Read anomalies section | Bullet points of detected anomalies | ☐ |
| 10.9 | Recommendations | Read recommendations | Categorized: People, Process, Technology | ☐ |
| 10.10 | Metadata | Check footer | Model name + generation timestamp | ☐ |
| 10.11 | Error state | No LLM providers → generate | AlertTriangle icon + error message | ☐ |
| 10.12 | Re-generate | Generate again after first result | New insights replace old ones | ☐ |

---

## 11. LLM Settings Panel

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 11.1 | Open panel | Click gear/settings icon in nav or AI Insights | LLM Settings panel slides in from right | ☐ |
| 11.2 | Provider list | Observe panel | Card for each configured LLM provider | ☐ |
| 11.3 | Provider card info | Observe a card | Label, provider type, model name, API key (masked), status dot | ☐ |
| 11.4 | Status dot colors | Check status dots | Green = tested OK, Red = failed, Gray = untested | ☐ |

---

## 12. LLM Settings — Add Provider

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 12.1 | Open add form | Click "Add Provider" button | Add provider form expands | ☐ |
| 12.2 | Provider type select | Click provider dropdown | Options: OpenAI, Anthropic, xAI (Grok), Google (Gemini) | ☐ |
| 12.3 | Label input | Type display label | Text input accepts label | ☐ |
| 12.4 | Model ID input | Type model ID | Placeholder matches provider (e.g. "gpt-4o" for OpenAI) | ☐ |
| 12.5 | API Key input | Type API key | Password field with show/hide toggle | ☐ |
| 12.6 | Show/hide toggle | Click eye icon on API key | Toggles between masked and visible | ☐ |
| 12.7 | Submit valid | Fill all fields → Submit | Provider added, card appears in list | ☐ |
| 12.8 | Cancel add | Click Cancel | Form collapses, no provider added | ☐ |
| 12.9 | API call | Submit → check Network | `POST /api/llm/providers` called | ☐ |

---

## 13. LLM Settings — Provider Actions

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 13.1 | Test connection | Click "Test" on a provider | Loading → success/fail message with details | ☐ |
| 13.2 | Test success | Test with valid API key | Green checkmark, response preview, latency shown | ☐ |
| 13.3 | Test failure | Test with invalid API key | Red X, error message | ☐ |
| 13.4 | Set default | Click star icon | Provider marked as default, star filled | ☐ |
| 13.5 | Disable provider | Click eye/toggle icon | Provider disabled, grayed out | ☐ |
| 13.6 | Enable provider | Click eye/toggle on disabled | Provider re-enabled | ☐ |
| 13.7 | Delete provider | Click trash icon | Provider removed from list | ☐ |
| 13.8 | Delete confirmation | Observe delete flow | Immediate delete (no confirm dialog) or confirm first | ☐ |
| 13.9 | Model discovery | After adding provider → check model list | Available models populated from provider API | ☐ |

---

## 14. LLM Settings — Multi-Provider

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 14.1 | Multiple providers | Add 2+ providers | All listed with separate cards | ☐ |
| 14.2 | Default selection | Set one as default | Only one has filled star | ☐ |
| 14.3 | Provider in chat | Use chat with specific provider | AI response uses selected provider's model | ☐ |
| 14.4 | Fallback | Default provider fails → generate insights | Falls back to another available provider or shows error | ☐ |
| 14.5 | All disabled | Disable all providers → try chat/insights | Clear error message: no providers available | ☐ |

---

## 15. Cross-Feature Integration

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 15.1 | Chat uses filters | Set dashboard filter → open chat → ask question | AI response reflects filtered data context | ☐ |
| 15.2 | Chat on each page | Navigate to each page → open chat | Chat shows correct page context | ☐ |
| 15.3 | Insights after filter | Set customer filter → Generate Insights | Insights specific to selected customer | ☐ |
| 15.4 | Chat persistence | Send messages → navigate to different page → open chat | Previous conversation still loaded | ☐ |
| 15.5 | LLM change reflects | Change LLM provider → generate insights | Uses newly selected provider | ☐ |

---

## 16. Visual / Design Compliance

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 16.1 | FAB styling | Observe FAB | Dark rounded button, sparkles icon, blue glow | ☐ |
| 16.2 | Chat panel theme | Open chat | Dark theme matching design guide (#141418 surface, #26262e border) | ☐ |
| 16.3 | Message bubbles | Send/receive messages | User=right-aligned dark, AI=left-aligned lighter bg | ☐ |
| 16.4 | Chip styling | Observe quick action chips | Rounded pills, proper contrast, hover effect | ☐ |
| 16.5 | Loading animation | Observe "Thinking..." | Bouncing dots animation | ☐ |
| 16.6 | Insights styling | Generate insights | Clean markdown rendering, categorized sections | ☐ |
| 16.7 | LLM panel styling | Open LLM settings | Proper card layout, status dots, form styling | ☐ |
| 16.8 | Responsive chat | Resize browser to mobile | Chat panel adapts or maintains usability | ☐ |
