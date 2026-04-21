# Customer View Redesign Plan

## Overview

Customer View = what a **customer user** sees when they log in. It's their security operations dashboard — scoped entirely to their data, designed to answer: **"Is my infrastructure being protected?"**

### Key Principle
When a `role=customer` user logs in, they should NEVER see the admin dashboard. They get **Customer View automatically** — no tab switching, no customer selector (it's always their customer).

---

## Current State (Broken)

- CustomerView.tsx exists (220 lines) but **tab is hidden** and route falls through to main Dashboard
- Customer users see the **same admin dashboard** as superadmins
- Customer selector shows **all customers** — no scoping
- No backend enforcement of customer data isolation
- Dead code: CustomerDashboardContext.tsx manages state but is unused

---

## Role-Based Routing

### How it works after redesign:

```
User logs in → GET /api/auth/me → check role

if (role === "superadmin" || role === "admin"):
  → Show full admin interface
  → Tabs: Overview | Team | Threats | Topology | Users
  → Customer View accessible via dedicated tab or dropdown

if (role === "customer"):
  → Show Customer View ONLY
  → No admin tabs visible
  → All data auto-scoped to their customer
  → No customer selector (hardcoded to their customer)
  → Can see: Their KPIs, incidents, SLA, alerts
  → Cannot see: Other customers, analyst performance, user management

if (role === "viewer"):
  → Same as admin but read-only (no edit dashboard, no user management)
```

### Frontend Implementation (App.tsx)

```tsx
// In AppShell:
const isCustomerUser = currentUser?.role === "customer";

if (isCustomerUser) {
  // Customer users get CustomerView with their customer auto-set
  return <CustomerDashboard customer={currentUser.customer} />;
}

// Admin/superadmin/viewer get full dashboard with tabs
return <AdminDashboard ... />;
```

---

## Customer View Design

### Aesthetic Direction
**Refined minimal** — clean, confident, no clutter. The customer doesn't need to be a SOC expert. They need to see:
1. Am I protected? (SLA status)
2. What's happening? (Incident summary)
3. Should I worry? (Anomalies/trends)
4. What assets are exposed? (Attack surface)

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  🏢 CMWI Security Operations           Apr 21, 2026   Mahrus ▾  │
│  Managed by MTM MSSP                                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ Protection Status ────────────────────────────────────────┐  │
│  │                                                            │  │
│  │   SLA COMPLIANCE        INCIDENTS (30d)     RESPONSE TIME  │  │
│  │   ████████████ 98.2%    42 total            12m avg MTTD   │  │
│  │   ✅ On Target          0 open · 2 critical  ✅ Under SLA  │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Incident Timeline ─────────┐ ┌─ Alert Quality ────────────┐ │
│  │                             │ │                             │ │
│  │  [area chart: 30 days]      │ │  True Positive    4.8%     │ │
│  │  FP (gray) + TP (green)     │ │  2 / 42 tickets            │ │
│  │                             │ │                             │ │
│  │                             │ │  False Positive   95.2%    │ │
│  │                             │ │  40 / 42 tickets            │ │
│  └─────────────────────────────┘ └─────────────────────────────┘ │
│                                                                  │
│  ┌─ Your Assets ───────────────────────────────────────────────┐ │
│  │                                                             │ │
│  │  ASSET                    ALERTS  PRIORITY   LAST ALERT     │ │
│  │  AD_Server_Primary        24      P2 ●●○○    2h ago         │ │
│  │  AD_Server_Secondary      8       P3 ●○○○    5h ago         │ │
│  │  Syslog-Pasuruan          4       P3 ●○○○    1d ago         │ │
│  │  FW-CMWI-HO-M290         2       P3 ●○○○    3d ago         │ │
│  │                                                             │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Top Alert Rules ──────────┐ ┌─ Monthly Report ────────────┐ │
│  │                            │ │                              │ │
│  │  Rule 100021    20   0% TP │ │  📊 Download PDF report      │ │
│  │  Rule 200134    2  100% TP │ │  for Apr 2026               │ │
│  │                            │ │                              │ │
│  └────────────────────────────┘ │  Last generated: Apr 20      │ │
│                                 └──────────────────────────────┘ │
│                                                                  │
│  ┌─ AI Summary ───────────────────────────────────────────────┐  │
│  │  🤖 "CMWI infrastructure shows stable security posture.    │  │
│  │  SLA compliance at 98.2% — well above the 90% target.      │  │
│  │  AD_Server_Primary has the most alerts (24) — recommend     │  │
│  │  checking rule 100021 tuning to reduce false positives."    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  💬 AI Chat available (bottom-right)                             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Protection Status (Hero)
A single large card at top showing the 3 most important metrics:
- **SLA Compliance** — big number with progress bar + status text
- **Incidents (period)** — total, open, critical counts
- **Response Time** — avg MTTD with SLA status

Colors: **Green only if on target**, amber if approaching threshold, red if breached. Otherwise neutral gray.

#### 2. Incident Timeline
Same dual-series area chart as admin dashboard but:
- Default period: **30 days** (not 24 hours — customer needs monthly view)
- No filter bar — period selector built into widget header

#### 3. Alert Quality
Text-based TP/FP display (same as admin). Shows detection accuracy for customer's tickets.

#### 4. Your Assets
Table showing customer's assets ranked by alert count:
- Asset name, total alerts, highest priority, time since last alert
- Priority shown as dot indicator (●●●○ for P2)
- Clicking an asset → shows ticket list for that asset

#### 5. Top Alert Rules
Compact table showing most triggered rules for this customer's tickets.

#### 6. Monthly Report (Phase 2)
Auto-generated PDF export summarizing the month's security operations for the customer. **Future feature** — placeholder card for now.

#### 7. AI Summary
Auto-generated one-paragraph summary of the customer's security posture. Uses the existing AI chat backend with customer-scoped metrics.

---

## Backend Changes

### 1. Customer Data Scoping (Middleware)
Add `require_customer_scope` middleware that:
- If user role is "customer", force `customer` query param to user's `customer` value
- Override any customer param they try to set (prevent data leakage)
- Applied to all `/api/metrics/*`, `/api/tickets/*`, `/api/threatmap/*` endpoints

```python
async def get_customer_scope(request: Request, user: User = Depends(require_auth)) -> Optional[str]:
    """Returns the customer scope. For customer users, always their own customer."""
    if user.role == "customer":
        return user.customer  # Force scope
    # For admins, use query param or None (all)
    return request.query_params.get("customer") or None
```

### 2. Customer Summary Endpoint
```
GET /api/customer/summary
```
Returns a combined response with everything the customer view needs in one call:
- KPIs (total, open, TP/FP, MTTD, SLA)
- Recent volume trend (30 days)
- Asset exposure list
- Top alert rules
- AI one-liner summary (cached, regenerated daily)

This avoids 6+ separate API calls from the customer frontend.

### 3. Filter Options Scoping
The existing `/api/filters/options` endpoint already has customer scoping from the security audit:
```python
if user_role == "customer" and user_customer:
    customer = user_customer  # Override
```
This ensures customer users only see their own assets in filter dropdowns.

---

## Frontend Changes

### 1. New Component: `CustomerDashboard.tsx`
Single-page dashboard, no react-grid-layout (fixed layout, not customizable by customer).

### 2. App.tsx Role Routing
```tsx
// After auth check:
if (currentUser.role === "customer") {
  return <CustomerDashboard />;  // Customer-only view
}
// else: full admin interface
```

### 3. Customer Nav Bar
Simplified header for customer users:
- Logo + "CMWI Security Operations" (their customer name)
- Clock
- AI Chat icon
- User dropdown (profile, logout)
- **No tabs** — single page view

### 4. Unhide the Tab for Admin
For admin users, re-enable "Customer View" tab but rename to "Client View" — allows admins to preview what their customers see.

---

## Implementation Phases

### Phase 1: Role-Based Routing
- App.tsx: route customer users to CustomerDashboard
- Simplified customer nav bar
- Backend: customer scope middleware

### Phase 2: CustomerDashboard Component
- Protection Status hero card
- Incident Timeline
- Alert Quality
- Your Assets table
- Top Alert Rules

### Phase 3: AI Summary + Polish
- Auto-generated customer summary paragraph
- AI Chat scoped to customer data
- Monthly report placeholder
- Admin "Client View" tab

---

## Security Considerations

- **Customer users MUST NOT see**: Other customers' data, analyst performance, user management, topology, threat map (admin tools)
- **Backend enforcement**: All metrics endpoints must respect customer scope from JWT
- **Frontend enforcement**: Customer users get different component tree — no admin tabs rendered
- **Session isolation**: Customer's localStorage dashboard profiles are separate (different user_id in DB)
