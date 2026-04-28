"""WhatsApp Bot Service — daily SLA reminder with tone escalation."""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional
import httpx

from sqlalchemy import select, func, cast, Date, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Ticket

logger = logging.getLogger(__name__)

WIB = timezone(timedelta(hours=7))
FONNTE_URL = "https://api.fonnte.com/send"

# ── Fallback templates (used when LLM fails) ──

TEMPLATES = {
    "praise": (
        "Halo {name}! 🎉\n"
        "SLA kamu kemarin *{sla}%* — di atas target {target}%!\n"
        "Total {total} tiket, avg MTTD {mttd}. Pertahankan! 💪"
    ),
    "normal": (
        "Halo {name} 👋\n"
        "SLA kamu kemarin *{sla}%* (target: {target}%).\n"
        "Total {total} tiket | Avg MTTD: {mttd}\n"
        "Yuk tingkatin lagi hari ini! Semangat 🔥"
    ),
    "kind": (
        "Hei {name}, gue perhatiin SLA kamu masih di *{sla}%* ya.\n"
        "Gue tau kerjaan bisa overwhelming — target kita {target}%.\n"
        "{total} tiket kemarin, avg MTTD {mttd}.\n"
        "Ada bottleneck yang bisa kita solve bareng? Yuk ngobrol 🙏"
    ),
    "toxic": (
        "{name}.\n"
        "SLA lo *{sla}%*. {streak} hari berturut-turut di bawah target.\n"
        "{total} tiket, avg MTTD {mttd} — ini tidak acceptable.\n"
        "Target kita {target}%, bukan {sla}%.\n"
        "Kalau besok masih di bawah target, gue eskalasi ke management. "
        "Ini bukan ancaman, ini konsekuensi."
    ),
}


def _fmt_duration(seconds: Optional[float]) -> str:
    if not seconds:
        return "—"
    s = int(seconds)
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s // 60}m {s % 60}s"
    return f"{s // 3600}h {(s % 3600) // 60}m"


def _determine_tone(streak: int, override: Optional[str], cfg) -> str:
    """Return tone string based on streak count and config thresholds."""
    if override and override in ("normal", "kind", "toxic", "praise"):
        return override
    if streak >= cfg["streak_threshold_toxic"]:
        return "toxic"
    if streak >= cfg["streak_threshold_kind"]:
        return "kind"
    return "normal"


async def get_config(db: AsyncSession):
    """Get the single WA bot config row."""
    result = await db.execute(text("SELECT * FROM wa_bot_config ORDER BY id LIMIT 1"))
    row = result.mappings().first()
    return row


async def get_analyst_yesterday_sla(db: AsyncSession, yesterday: date, min_tickets: int):
    """Compute per-technician SLA for yesterday. Returns list of dicts."""
    q = (
        select(
            Ticket.technician,
            func.count(Ticket.id).label("total"),
            func.sum(
                cast(Ticket.sla_met, Integer)
            ).label("met_raw"),
            func.avg(Ticket.mttd_seconds).label("avg_mttd"),
        )
        .where(
            Ticket.technician != None,
            cast(Ticket.created_time, Date) == yesterday,
            Ticket.mttd_seconds != None,
        )
        .group_by(Ticket.technician)
    )
    result = await db.execute(q)
    rows = result.all()
    out = []
    for row in rows:
        if row.total < min_tickets:
            continue
        # met_raw may be None if no sla_met values
        met = int(row.met_raw or 0)
        sla_pct = round(met / row.total * 100, 1) if row.total > 0 else 0.0
        out.append({
            "technician": row.technician,
            "total": row.total,
            "sla_pct": sla_pct,
            "avg_mttd_seconds": row.avg_mttd,
        })
    return out


async def get_analyst_mappings(db: AsyncSession):
    """Get all active analyst WA mappings as {technician: {phone, mode_override}}."""
    result = await db.execute(
        text("SELECT technician, phone, mode_override FROM wa_analyst_mapping WHERE is_active = true")
    )
    return {row.technician: {"phone": row.phone, "mode_override": row.mode_override} for row in result}


async def update_streak(db: AsyncSession, technician: str, sla_good: bool, sla_pct: float, today: date):
    """Update streak table. Returns new streak count."""
    result = await db.execute(
        text("SELECT streak_count FROM analyst_wa_streaks WHERE technician = :t"),
        {"t": technician}
    )
    row = result.first()
    if sla_good:
        new_streak = 0
    else:
        new_streak = (row.streak_count + 1) if row else 1

    await db.execute(
        text("""
            INSERT INTO analyst_wa_streaks (technician, streak_count, last_check_date, last_sla_pct, updated_at)
            VALUES (:t, :s, :d, :pct, NOW())
            ON CONFLICT (technician) DO UPDATE
              SET streak_count = :s, last_check_date = :d, last_sla_pct = :pct, updated_at = NOW()
        """),
        {"t": technician, "s": new_streak, "d": today, "pct": sla_pct}
    )
    await db.commit()
    return new_streak


async def generate_message_llm(db: AsyncSession, name: str, tone: str, data: dict, target: float) -> Optional[str]:
    """Try to generate message via LLM. Returns None on failure."""
    try:
        from app.services.ai_service import AIService
        ai = AIService(db)
        provider = await ai._get_provider()
        if not provider:
            return None

        tone_instructions = {
            "praise": "Beri pujian yang tulus dan memotivasi. Tone: hangat, semangat, positif.",
            "normal": "Beri reminder profesional. Tone: langsung, konstruktif, tidak menghakimi.",
            "kind": "Analyst sudah 2 hari berturut SLA jelek. Tone: empati, supportif tapi tegas, tanyakan kendala.",
            "toxic": (
                "Analyst sudah 3+ hari berturut SLA jauh di bawah target. "
                "Tone: keras, tidak basa-basi, ada konsekuensi yang jelas. "
                "Boleh pakai kata-kata tegas. Jangan kasar tapi tegas dan to-the-point."
            ),
        }

        prompt = (
            f"Kamu adalah SOC Manager yang mengirim WA reminder ke analyst.\n\n"
            f"Data analyst:\n"
            f"- Nama: {name}\n"
            f"- SLA kemarin: {data['sla_pct']}% (target: {target}%)\n"
            f"- Total tiket: {data['total']}\n"
            f"- Avg MTTD: {_fmt_duration(data.get('avg_mttd_seconds'))}\n"
            f"- Streak hari jelek: {data.get('streak', 0)} hari\n\n"
            f"Instruksi tone: {tone_instructions.get(tone, tone_instructions['normal'])}\n\n"
            f"Tulis pesan WA singkat (max 5 kalimat). Gunakan Bahasa Indonesia. "
            f"Boleh pakai emoji secukupnya. Jangan pakai markdown header atau bullet. "
            f"Langsung isi pesan, tidak perlu Subject/To."
        )

        text_out = await ai._call_llm(provider, prompt)
        return text_out.strip()
    except Exception as e:
        logger.warning(f"LLM message generation failed: {e}")
        return None


def generate_message_template(name: str, tone: str, data: dict, target: float, streak: int) -> str:
    """Fallback template-based message."""
    tmpl = TEMPLATES.get(tone, TEMPLATES["normal"])
    return tmpl.format(
        name=name,
        sla=data["sla_pct"],
        target=target,
        total=data["total"],
        mttd=_fmt_duration(data.get("avg_mttd_seconds")),
        streak=streak,
    )


async def send_fonnte(token: str, phone: str, message: str) -> dict:
    """Send WA message via Fonnte API."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            FONNTE_URL,
            headers={"Authorization": token},
            data={"target": phone, "message": message},
        )
        return {"status_code": resp.status_code, "body": resp.text[:200]}


async def log_message(db: AsyncSession, technician: str, phone: str, tone: str,
                      sla_pct: float, streak: int, message: str, status: str, response: str):
    await db.execute(
        text("""
            INSERT INTO wa_message_log
              (technician, phone, tone, sla_pct, streak_count, message_preview, status, fonnte_response)
            VALUES (:t, :p, :tone, :sla, :str, :msg, :st, :resp)
        """),
        {
            "t": technician, "p": phone, "tone": tone, "sla": sla_pct,
            "str": streak, "msg": message[:150], "st": status, "resp": response,
        }
    )
    await db.commit()


async def run_daily_reminders(db: AsyncSession):
    """Main function: called by scheduler at 08:00 WIB."""
    cfg = await get_config(db)
    if not cfg or not cfg["enabled"]:
        logger.info("WA Bot disabled, skipping daily reminders")
        return

    token = cfg["fonnte_token"]
    if not token:
        logger.warning("WA Bot: no Fonnte token configured")
        return

    yesterday = (datetime.now(WIB) - timedelta(days=1)).date()
    target = cfg["sla_target_pct"] or 99.0
    min_tickets = cfg["min_tickets_threshold"] or 3

    # Get analyst SLA data
    analyst_data = await get_analyst_yesterday_sla(db, yesterday, min_tickets)
    mappings = await get_analyst_mappings(db)

    logger.info(f"WA Bot: processing {len(analyst_data)} analysts, {len(mappings)} have WA numbers")

    for analyst in analyst_data:
        tech = analyst["technician"]
        if tech not in mappings:
            logger.info(f"WA Bot: no mapping for {tech}, skipping")
            continue

        mapping = mappings[tech]
        phone = mapping["phone"]
        override = mapping["mode_override"]

        sla_good = analyst["sla_pct"] >= target
        streak = await update_streak(db, tech, sla_good, analyst["sla_pct"], yesterday)

        if sla_good:
            tone = "praise"
        else:
            tone = _determine_tone(streak, override, cfg)

        analyst["streak"] = streak

        # Generate message: try LLM first, fallback to template
        message = await generate_message_llm(db, tech.split()[0], tone, analyst, target)
        if not message:
            message = generate_message_template(tech.split()[0], tone, analyst, target, streak)

        # Send
        try:
            resp = await send_fonnte(token, phone, message)
            status = "sent" if resp["status_code"] == 200 else "failed"
            logger.info(f"WA Bot: sent to {tech} ({phone}), tone={tone}, status={status}")
        except Exception as e:
            resp = {"body": str(e)}
            status = "failed"
            logger.error(f"WA Bot: send failed for {tech}: {e}")

        await log_message(db, tech, phone, tone, analyst["sla_pct"], streak, message, status, resp["body"])
