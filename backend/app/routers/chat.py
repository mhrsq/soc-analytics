"""AI Chat API — conversational SOC analytics assistant."""

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, distinct, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ChatMessage, LlmProvider, User
from app.routers.auth import require_auth
from app.services.ai_service import AIService
from app.services.analytics_service import AnalyticsService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

MAX_HISTORY_MESSAGES = 20  # Max messages sent as context to LLM


# ── Schemas ──

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)
    conversation_id: Optional[str] = None
    provider_id: Optional[int] = None
    model_override: Optional[str] = None  # Override model for this message
    filters: Optional[dict] = None  # Current dashboard filters {start, end, customer}


class ChatResponse(BaseModel):
    message: str
    conversation_id: str
    model_used: Optional[str] = None
    created_at: datetime


class ConversationSummary(BaseModel):
    conversation_id: str
    title: str
    message_count: int
    last_message_at: Optional[datetime]


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    metadata: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Endpoints ──

@router.post("/message", response_model=ChatResponse)
async def send_message(
    body: ChatRequest,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Send a message to the AI assistant and get a response."""
    conv_id = body.conversation_id or str(uuid.uuid4())

    # Save user message
    user_msg = ChatMessage(
        user_id=user.id,
        conversation_id=conv_id,
        role="user",
        content=body.message,
        metadata_={"filters": body.filters} if body.filters else {},
    )
    db.add(user_msg)
    await db.flush()

    # Gather SOC metrics for context
    filters = body.filters or {}
    # Parse time range from filters, or detect from user message
    msg_lower = body.message.lower()
    try:
        if filters.get("start"):
            start_date = date.fromisoformat(filters.get("start", ""))
            end_date = date.fromisoformat(filters.get("end", "")) if filters.get("end") else date.today()
        elif any(k in msg_lower for k in ["24 jam", "24h", "hari ini", "today"]):
            start_date = date.today() - timedelta(days=1)
            end_date = date.today()
        elif any(k in msg_lower for k in ["seminggu", "7 hari", "minggu ini", "7d", "1 week"]):
            start_date = date.today() - timedelta(days=7)
            end_date = date.today()
        elif any(k in msg_lower for k in ["sebulan", "30 hari", "bulan ini", "30d", "1 month"]):
            start_date = date.today() - timedelta(days=30)
            end_date = date.today()
        elif any(k in msg_lower for k in ["semua", "all time", "all data"]):
            start_date = date(2020, 1, 1)
            end_date = date.today()
        else:
            # Default: last 24 hours (most relevant for real-time SOC)
            start_date = date.today() - timedelta(days=1)
            end_date = date.today()
    except ValueError:
        end_date = date.today()
        start_date = end_date - timedelta(days=1)

    customer = filters.get("customer") or None

    analytics = AnalyticsService(db)
    summary = await analytics.get_summary(start_date, end_date, customer)
    top_alerts = await analytics.get_top_alerts(5, start_date, end_date, customer)

    # Build data context string
    data_context = _build_data_context(summary, top_alerts, start_date, end_date, customer)

    # Page context
    active_page = filters.get("active_page", "dashboard")
    page_context = filters.get("page_context", "")

    # Load conversation history
    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conv_id, ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(MAX_HISTORY_MESSAGES)
    )
    history = list(reversed(history_result.scalars().all()))

    # Build messages array for LLM
    period_days = (end_date - start_date).days
    period_label = f"{start_date} to {end_date}"
    if period_days <= 1:
        period_label += " (last 24 hours)"
    elif period_days <= 7:
        period_label += f" (last {period_days} days)"
    elif period_days <= 30:
        period_label += f" (last {period_days} days)"

    system_prompt = AIService.SYSTEM_PROMPT + f"""

--- CURRENT CONTEXT ---
Active page: {active_page}
{page_context}
Data period: {period_label}
Customer filter: {customer or 'all customers'}

IMPORTANT: Semua data di bawah ini HANYA untuk periode {period_label}. 
Saat user bertanya tentang "24 jam terakhir" atau rentang waktu tertentu, pastikan analisis kamu HANYA merujuk ke data di periode tersebut.
Jangan pernah bilang "minggu ini" kalau data-nya cuma 24 jam, atau sebaliknya.

--- SOC DATA FOR {period_label.upper()} ---
{data_context}

Kalau user bertanya tentang halaman/menu yang sedang dibuka, jelaskan fungsi dan cara penggunaannya."""

    messages = [{"role": "system", "content": system_prompt}]
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})

    # Call LLM
    ai_svc = AIService(db)
    provider = await ai_svc._get_provider(body.provider_id)

    if not provider:
        raise HTTPException(400, "No LLM provider configured. Add one in Settings → LLM Providers.")

    # Allow model override per message
    original_model = provider.model
    if body.model_override:
        provider.model = body.model_override

    try:
        reply = await _call_llm_chat(provider, messages)
    except Exception as e:
        logger.error(f"Chat LLM call failed: {e}")
        reply = f"Maaf, gagal menghubungi AI: {type(e).__name__}. Coba lagi atau ganti model."
    finally:
        provider.model = original_model  # Restore

    model_label = f"{provider.label} ({body.model_override or provider.model})"

    # Save assistant response
    ai_msg = ChatMessage(
        user_id=user.id,
        conversation_id=conv_id,
        role="assistant",
        content=reply,
        metadata_={"model_used": model_label},
    )
    db.add(ai_msg)
    await db.commit()

    return ChatResponse(
        message=reply,
        conversation_id=conv_id,
        model_used=model_label,
        created_at=ai_msg.created_at or datetime.now(timezone.utc),
    )


@router.get("/conversations", response_model=list[ConversationSummary])
async def list_conversations(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """List all conversations for the current user."""
    result = await db.execute(
        select(
            ChatMessage.conversation_id,
            func.count(ChatMessage.id).label("count"),
            func.max(ChatMessage.created_at).label("last_at"),
            func.min(ChatMessage.content).filter(ChatMessage.role == "user").label("first_msg"),
        )
        .where(ChatMessage.user_id == user.id)
        .group_by(ChatMessage.conversation_id)
        .order_by(func.max(ChatMessage.created_at).desc())
        .limit(50)
    )
    convs = []
    for row in result.all():
        title = (row.first_msg or "New conversation")[:80]
        convs.append(ConversationSummary(
            conversation_id=row.conversation_id,
            title=title,
            message_count=row.count,
            last_message_at=row.last_at,
        ))
    return convs


@router.get("/conversations/{conv_id}", response_model=list[MessageOut])
async def get_conversation(
    conv_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Get all messages in a conversation."""
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conv_id, ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = result.scalars().all()
    if not messages:
        raise HTTPException(404, "Conversation not found")
    return [MessageOut(
        id=m.id, role=m.role, content=m.content,
        metadata=m.metadata_, created_at=m.created_at,
    ) for m in messages]


@router.delete("/conversations/{conv_id}")
async def delete_conversation(
    conv_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation."""
    await db.execute(
        delete(ChatMessage).where(
            ChatMessage.conversation_id == conv_id,
            ChatMessage.user_id == user.id,
        )
    )
    await db.commit()
    return {"ok": True}


# ── Helpers ──

def _build_data_context(summary: dict, top_alerts: list, start_date, end_date, customer) -> str:
    """Build a concise data context string for the AI."""
    period = f"{start_date} to {end_date}"
    cust = f" (customer: {customer})" if customer else " (all customers)"

    lines = [
        f"Period: {period}{cust}",
        f"Total tickets: {summary.get('total_tickets', 0)}",
        f"Open: {summary.get('open_tickets', 0)}",
        f"True Positive: {summary.get('tp_count', 0)} ({summary.get('tp_rate', 0):.1f}%)",
        f"False Positive: {summary.get('fp_count', 0)} ({summary.get('fp_rate', 0):.1f}%)",
        f"Avg MTTD: {summary.get('avg_mttd_display', 'N/A')}",
        f"SLA Compliance: {summary.get('sla_compliance_pct', 'N/A')}%",
    ]

    if top_alerts:
        lines.append("\nTop Alert Rules:")
        for a in top_alerts[:5]:
            lines.append(f"  - {a.get('rule_name', 'Unknown')}: {a.get('count', 0)} tickets (TP rate: {a.get('tp_rate', 0):.0f}%)")

    return "\n".join(lines)


async def _call_llm_chat(provider: LlmProvider, messages: list[dict]) -> str:
    """Call LLM with full message history (chat completion)."""
    if provider.provider == "anthropic":
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=provider.api_key)
        # Anthropic: system is separate, messages exclude system
        system = next((m["content"] for m in messages if m["role"] == "system"), "")
        chat_msgs = [m for m in messages if m["role"] != "system"]
        response = await client.messages.create(
            model=provider.model,
            max_tokens=2048,
            system=system,
            messages=chat_msgs,
        )
        return response.content[0].text

    else:
        # OpenAI-compatible (openai, xai, google, openrouter, 9router)
        import httpx
        DEFAULT_URLS = {
            "xai": "https://api.x.ai/v1",
            "google": "https://generativelanguage.googleapis.com/v1beta/openai",
            "openrouter": "https://openrouter.ai/api/v1",
            "9router": "https://9ai.cyberxatria.id/v1",
        }
        url = provider.base_url or DEFAULT_URLS.get(provider.provider, "https://api.openai.com/v1")

        model_lower = (provider.model or "").lower()
        use_new_param = provider.provider == "openai" and any(
            tag in model_lower for tag in ("gpt-4o", "gpt-5", "o1", "o3", "o4")
        )
        token_param = {"max_completion_tokens": 2048} if use_new_param else {"max_tokens": 2048}

        async with httpx.AsyncClient(timeout=90) as http:
            resp = await http.post(
                f"{url}/chat/completions",
                headers={"Authorization": f"Bearer {provider.api_key}", "Content-Type": "application/json"},
                json={"model": provider.model, **token_param, "stream": False, "messages": messages},
            )
            if resp.status_code != 200:
                raise RuntimeError(f"LLM HTTP {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            return data["choices"][0]["message"]["content"]
