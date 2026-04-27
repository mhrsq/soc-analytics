"""SQLAlchemy ORM models."""

from datetime import datetime
from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Float, Integer, String, Text,
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
    workaround_time = Column(DateTime(timezone=True))  # udf_date_1808

    # Computed
    mttd_seconds = Column(Integer)
    mttr_seconds = Column(Integer)
    sla_met = Column(Boolean)       # MTTD SLA
    mttr_sla_met = Column(Boolean)  # MTTR SLA (priority-based)

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


class AnalystSnapshot(Base):
    __tablename__ = "analyst_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    analyst = Column(String(200), nullable=False)
    period_start = Column(DateTime(timezone=True), nullable=False)
    period_end = Column(DateTime(timezone=True), nullable=False)
    granularity = Column(String(20), nullable=False, default="weekly")  # weekly, monthly
    composite_score = Column(Integer)  # stored as 0-1000 (10x for precision)
    speed_score = Column(Integer)
    detection_score = Column(Integer)
    accuracy_score = Column(Integer)
    volume_score = Column(Integer)
    sla_score = Column(Integer)
    throughput_score = Column(Integer)
    complexity_score = Column(Integer)
    total_tickets = Column(Integer)
    resolved = Column(Integer)
    tp_count = Column(Integer)
    fp_count = Column(Integer)
    avg_mttd_seconds = Column(Integer)
    avg_mttr_seconds = Column(Integer)
    sla_pct = Column(Integer)  # stored as 0-1000
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("uq_analyst_snapshot", "analyst", "period_start", "granularity", unique=True),
    )


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


class AssetLocation(Base):
    __tablename__ = "asset_locations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer = Column(String(200), nullable=False)
    asset_name = Column(String(500), nullable=False)
    label = Column(String(200))
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    icon_type = Column(String(50), default="server")  # server, firewall, endpoint, database, cloud
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("uq_asset_location", "customer", "asset_name", unique=True),
    )


class SiemLocation(Base):
    __tablename__ = "siem_locations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer = Column(String(200))  # NULL = shared/MTM central SIEM
    label = Column(String(200), nullable=False)
    location_type = Column(String(50), nullable=False)  # on-prem, customer-site, cloud
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    conversation_id = Column(String(100), nullable=False)
    role = Column(String(20), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    metadata_ = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("idx_chat_user_conv", "user_id", "conversation_id"),
    )


class DashboardProfile(Base):
    __tablename__ = "dashboard_profiles"

    id = Column(String(100), primary_key=True)
    user_id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    widgets = Column(JSONB, nullable=False, default=list)
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=False)
    page = Column(String(50), default="main")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    display_name = Column(String(200))
    role = Column(String(50), nullable=False, default="viewer")  # superadmin, admin, customer, viewer
    customer = Column(String(200))  # NULL for admins, customer name for customer users
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class TopologyNode(Base):
    __tablename__ = "topology_nodes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    label = Column(String(200), nullable=False)
    hostname = Column(String(500))
    customer = Column(String(200))
    node_type = Column(String(50), default="server")  # server, firewall, switch, router, endpoint, database, cloud, siem
    lat = Column(Float)
    lng = Column(Float)
    pos_x = Column(Float, default=0)  # Canvas X position in topology editor
    pos_y = Column(Float, default=0)  # Canvas Y position in topology editor
    metadata_ = Column("metadata", JSONB, default=dict)  # Extra fields: IP, OS, notes, etc.
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class TopologyLink(Base):
    __tablename__ = "topology_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_id = Column(Integer, nullable=False)  # FK to topology_nodes
    target_id = Column(Integer, nullable=False)  # FK to topology_nodes
    link_type = Column(String(50), default="ethernet")  # ethernet, fiber, vpn, internet, wireless
    label = Column(String(200))
    bandwidth = Column(String(50))  # e.g. "1Gbps", "10Gbps"
    metadata_ = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)