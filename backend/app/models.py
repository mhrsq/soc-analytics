"""SQLAlchemy ORM models."""

from datetime import datetime
from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Integer, String, Text,
    Index
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(BigInteger, primary_key=True)
    subject = Column(Text, nullable=False)
    description = Column(Text)
    status = Column(String(50))
    priority = Column(String(50))
    technician = Column(String(200))
    group_name = Column(String(200))
    account_name = Column(String(200))
    site_name = Column(String(200))
    created_time = Column(DateTime(timezone=True))
    completed_time = Column(DateTime(timezone=True))

    # UDF Fields
    validation = Column(String(50))        # udf_pick_1805
    attack_category = Column(String(200))  # udf_pick_1806
    case_type = Column(String(100))        # udf_pick_1819
    pic_creator = Column(String(200))      # udf_pick_2704
    customer = Column(String(200))         # udf_pick_3901
    asset_name = Column(String(500))       # udf_pick_1818
    ip_address = Column(String(100))       # udf_sline_1827
    alert_time = Column(DateTime(timezone=True))    # udf_date_2701
    first_notif = Column(DateTime(timezone=True))   # udf_date_1807

    # Computed
    mttd_seconds = Column(Integer)
    mttr_seconds = Column(Integer)
    sla_met = Column(Boolean)

    # Parsed from subject
    wazuh_rule_id = Column(String(20))
    wazuh_rule_name = Column(String(500))

    # Metadata
    synced_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    raw_json = Column(JSONB)


class LlmProvider(Base):
    __tablename__ = "llm_providers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String(50), nullable=False)       # openai, anthropic, xai, google
    label = Column(String(100), nullable=False)          # Display name e.g. "GPT-5.2"
    model = Column(String(100), nullable=False)          # Model ID e.g. "gpt-5.2"
    api_key = Column(Text, nullable=False)
    base_url = Column(String(500))                       # Optional custom endpoint
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    last_tested = Column(DateTime(timezone=True))
    test_status = Column(String(20))                     # ok, failed, untested


class SyncLog(Base):
    __tablename__ = "sync_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))
    tickets_synced = Column(Integer, default=0)
    tickets_total = Column(Integer, default=0)
    errors = Column(Integer, default=0)
    sync_type = Column(String(20), default="incremental")
    status = Column(String(20), default="running")
    details = Column(JSONB)
