"""LLM provider settings API endpoints."""

import time
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import LlmProvider
from app.schemas import (
    LlmProviderCreate,
    LlmProviderUpdate,
    LlmProviderOut,
    LlmTestResult,
)

router = APIRouter(prefix="/api/llm", tags=["llm"])
logger = logging.getLogger(__name__)


def _mask_key(key: str) -> str:
    """Mask API key for display, showing first 4 and last 4 chars."""
    if len(key) <= 12:
        return key[:3] + "..." + key[-3:]
    return key[:6] + "..." + key[-4:]


def _to_out(row: LlmProvider) -> LlmProviderOut:
    return LlmProviderOut(
        id=row.id,
        provider=row.provider,
        label=row.label,
        model=row.model,
        api_key_hint=_mask_key(row.api_key),
        base_url=row.base_url,
        is_active=row.is_active,
        is_default=row.is_default,
        created_at=row.created_at,
        last_tested=row.last_tested,
        test_status=row.test_status,
    )


@router.get("/providers", response_model=list[LlmProviderOut])
async def list_providers(db: AsyncSession = Depends(get_db)):
    """List all configured LLM providers."""
    result = await db.execute(
        select(LlmProvider).order_by(LlmProvider.is_default.desc(), LlmProvider.created_at)
    )
    return [_to_out(row) for row in result.scalars().all()]


@router.post("/providers", response_model=LlmProviderOut)
async def add_provider(body: LlmProviderCreate, db: AsyncSession = Depends(get_db)):
    """Add a new LLM provider configuration."""
    if body.provider not in ("openai", "anthropic", "xai", "google"):
        raise HTTPException(400, f"Unsupported provider: {body.provider}")

    # If setting as default, unset other defaults
    if body.is_default:
        await db.execute(
            update(LlmProvider).where(LlmProvider.is_default == True).values(is_default=False)
        )

    row = LlmProvider(
        provider=body.provider,
        label=body.label,
        model=body.model,
        api_key=body.api_key,
        base_url=body.base_url,
        is_active=True,
        is_default=body.is_default,
        test_status="untested",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_out(row)


@router.patch("/providers/{provider_id}", response_model=LlmProviderOut)
async def update_provider(
    provider_id: int, body: LlmProviderUpdate, db: AsyncSession = Depends(get_db)
):
    """Update an existing LLM provider."""
    row = await db.get(LlmProvider, provider_id)
    if not row:
        raise HTTPException(404, "Provider not found")

    data = body.model_dump(exclude_unset=True)

    # If setting as default, unset other defaults
    if data.get("is_default"):
        await db.execute(
            update(LlmProvider)
            .where(LlmProvider.is_default == True, LlmProvider.id != provider_id)
            .values(is_default=False)
        )

    for key, val in data.items():
        setattr(row, key, val)

    await db.commit()
    await db.refresh(row)
    return _to_out(row)


@router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: int, db: AsyncSession = Depends(get_db)):
    """Delete an LLM provider."""
    row = await db.get(LlmProvider, provider_id)
    if not row:
        raise HTTPException(404, "Provider not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.post("/providers/{provider_id}/test", response_model=LlmTestResult)
async def test_provider(provider_id: int, db: AsyncSession = Depends(get_db)):
    """Test an LLM provider by sending a simple prompt."""
    row = await db.get(LlmProvider, provider_id)
    if not row:
        raise HTTPException(404, "Provider not found")

    start = time.monotonic()
    try:
        reply = await _test_llm_call(row.provider, row.model, row.api_key, row.base_url)
        latency = int((time.monotonic() - start) * 1000)

        row.last_tested = datetime.now(timezone.utc)
        row.test_status = "ok"
        await db.commit()

        return LlmTestResult(
            success=True,
            message="API key valid — model responded successfully",
            response_preview=reply[:200] if reply else None,
            latency_ms=latency,
        )
    except Exception as e:
        latency = int((time.monotonic() - start) * 1000)
        row.last_tested = datetime.now(timezone.utc)
        row.test_status = "failed"
        await db.commit()

        logger.warning(f"LLM test failed for provider {provider_id}: {e}")
        return LlmTestResult(
            success=False,
            message=str(e)[:300],
            latency_ms=latency,
        )


async def _test_llm_call(
    provider: str, model: str, api_key: str, base_url: str | None
) -> str:
    """Send a simple test prompt to the given LLM provider."""
    prompt = "Say 'Hello! LLM connection test successful.' in exactly one sentence."

    if provider == "anthropic":
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=api_key)
        resp = await client.messages.create(
            model=model,
            max_tokens=64,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text

    elif provider in ("openai", "xai", "google"):
        # All use OpenAI-compatible API
        import httpx

        if provider == "xai":
            url = base_url or "https://api.x.ai/v1"
        elif provider == "google":
            url = base_url or "https://generativelanguage.googleapis.com/v1beta/openai"
        else:
            url = base_url or "https://api.openai.com/v1"

        async with httpx.AsyncClient(timeout=30) as http:
            resp = await http.post(
                f"{url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 64,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            if resp.status_code != 200:
                body = resp.text[:300]
                raise RuntimeError(f"HTTP {resp.status_code}: {body}")
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    else:
        raise ValueError(f"Unsupported provider: {provider}")
