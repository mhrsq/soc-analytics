-- SOC Analytics Dashboard - Database Initialization
-- This runs automatically on first PostgreSQL container start

-- Core ticket data (synced from SDP)
CREATE TABLE IF NOT EXISTS tickets (
    id              BIGINT PRIMARY KEY,
    subject         TEXT NOT NULL,
    description     TEXT,
    status          VARCHAR(50),
    priority        VARCHAR(50),
    technician      VARCHAR(200),
    group_name      VARCHAR(200),
    account_name    VARCHAR(200),
    site_name       VARCHAR(200),
    created_time    TIMESTAMP WITH TIME ZONE,
    completed_time  TIMESTAMP WITH TIME ZONE,

    -- UDF Fields (SOC-specific)
    validation      VARCHAR(50),
    attack_category VARCHAR(200),
    case_type       VARCHAR(100),
    pic_creator     VARCHAR(200),
    customer        VARCHAR(200),
    asset_name      VARCHAR(500),
    ip_address      VARCHAR(100),
    alert_time      TIMESTAMP WITH TIME ZONE,
    first_notif     TIMESTAMP WITH TIME ZONE,

    -- Computed
    mttd_seconds    INTEGER,
    mttr_seconds    INTEGER,
    sla_met         BOOLEAN,

    -- Parsed from subject
    wazuh_rule_id   VARCHAR(20),
    wazuh_rule_name VARCHAR(500),

    -- Metadata
    synced_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    raw_json        JSONB
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_time);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_validation ON tickets(validation);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer);
CREATE INDEX IF NOT EXISTS idx_tickets_technician ON tickets(technician);
CREATE INDEX IF NOT EXISTS idx_tickets_sla ON tickets(sla_met);
CREATE INDEX IF NOT EXISTS idx_tickets_case_type ON tickets(case_type);
CREATE INDEX IF NOT EXISTS idx_tickets_alert_time ON tickets(alert_time);
CREATE INDEX IF NOT EXISTS idx_tickets_technician_created ON tickets(technician, created_time) WHERE technician IS NOT NULL;

-- Sync tracking
CREATE TABLE IF NOT EXISTS sync_log (
    id          SERIAL PRIMARY KEY,
    started_at  TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    tickets_synced INTEGER DEFAULT 0,
    tickets_total  INTEGER DEFAULT 0,
    errors      INTEGER DEFAULT 0,
    sync_type   VARCHAR(20) DEFAULT 'incremental',  -- initial, incremental, manual
    status      VARCHAR(20) DEFAULT 'running',       -- running, completed, failed
    details     JSONB
);

-- LLM provider settings
CREATE TABLE IF NOT EXISTS llm_providers (
    id           SERIAL PRIMARY KEY,
    provider     VARCHAR(50) NOT NULL,     -- openai, anthropic, xai, google
    label        VARCHAR(100) NOT NULL,    -- Display name
    model        VARCHAR(100) NOT NULL,    -- Model ID
    api_key      TEXT NOT NULL,
    base_url     VARCHAR(500),
    is_active    BOOLEAN DEFAULT true,
    is_default   BOOLEAN DEFAULT false,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_tested  TIMESTAMP WITH TIME ZONE,
    test_status  VARCHAR(20) DEFAULT 'untested'
);

-- Analyst performance snapshots (weekly/monthly trend tracking)
CREATE TABLE IF NOT EXISTS analyst_snapshots (
    id              SERIAL PRIMARY KEY,
    analyst         VARCHAR(200) NOT NULL,
    period_start    TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end      TIMESTAMP WITH TIME ZONE NOT NULL,
    granularity     VARCHAR(20) NOT NULL DEFAULT 'weekly',
    composite_score INTEGER,
    speed_score     INTEGER,
    detection_score INTEGER,
    accuracy_score  INTEGER,
    volume_score    INTEGER,
    sla_score       INTEGER,
    throughput_score INTEGER,
    complexity_score INTEGER,
    total_tickets   INTEGER,
    resolved        INTEGER,
    tp_count        INTEGER,
    fp_count        INTEGER,
    avg_mttd_seconds INTEGER,
    avg_mttr_seconds INTEGER,
    sla_pct         INTEGER,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (analyst, period_start, granularity)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_analyst ON analyst_snapshots(analyst);
CREATE INDEX IF NOT EXISTS idx_snapshots_period ON analyst_snapshots(period_start, granularity);

-- Daily metrics materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_metrics AS
SELECT
    DATE(created_time) AS date,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE validation = 'True Positive') AS tp_count,
    COUNT(*) FILTER (WHERE validation = 'False Positive') AS fp_count,
    COUNT(*) FILTER (WHERE validation IS NULL OR validation = 'Not Specified') AS ns_count,
    COUNT(*) FILTER (WHERE case_type = 'Security Incident') AS si_count,
    COUNT(*) FILTER (WHERE case_type = 'Security Event') AS se_count,
    AVG(mttd_seconds) FILTER (WHERE mttd_seconds IS NOT NULL AND mttd_seconds > 0) AS avg_mttd,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mttd_seconds) 
        FILTER (WHERE mttd_seconds IS NOT NULL AND mttd_seconds > 0) AS median_mttd,
    COUNT(*) FILTER (WHERE sla_met = true) AS sla_met_count,
    COUNT(*) FILTER (WHERE sla_met IS NOT NULL) AS sla_total_count,
    COUNT(*) FILTER (WHERE priority = 'P1-Critical') AS p1_count,
    COUNT(*) FILTER (WHERE priority = 'P2-High') AS p2_count,
    COUNT(*) FILTER (WHERE priority = 'P3-Medium') AS p3_count,
    COUNT(*) FILTER (WHERE priority = 'P4-Low') AS p4_count
FROM tickets
WHERE created_time IS NOT NULL
GROUP BY DATE(created_time)
ORDER BY date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_date ON mv_daily_metrics(date);

-- Customer daily metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_daily AS
SELECT
    DATE(created_time) AS date,
    customer,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE validation = 'True Positive') AS tp_count,
    COUNT(*) FILTER (WHERE validation = 'False Positive') AS fp_count,
    AVG(mttd_seconds) FILTER (WHERE mttd_seconds IS NOT NULL AND mttd_seconds > 0) AS avg_mttd
FROM tickets
WHERE created_time IS NOT NULL AND customer IS NOT NULL
GROUP BY DATE(created_time), customer
ORDER BY date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_cust_daily ON mv_customer_daily(date, customer);

-- Analyst daily metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_analyst_daily AS
SELECT
    DATE(created_time) AS date,
    technician,
    COUNT(*) AS assigned,
    COUNT(*) FILTER (WHERE status IN ('Resolved', 'Closed')) AS resolved,
    COUNT(*) FILTER (WHERE validation = 'True Positive') AS tp_found,
    AVG(mttr_seconds) FILTER (WHERE mttr_seconds IS NOT NULL AND mttr_seconds > 0) AS avg_mttr
FROM tickets
WHERE created_time IS NOT NULL AND technician IS NOT NULL
GROUP BY DATE(created_time), technician
ORDER BY date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_analyst_daily ON mv_analyst_daily(date, technician);
-- Threat Map: Asset Locations
CREATE TABLE IF NOT EXISTS asset_locations (
    id           SERIAL PRIMARY KEY,
    customer     VARCHAR(200) NOT NULL,
    asset_name   VARCHAR(500) NOT NULL,
    label        VARCHAR(200),
    lat          DOUBLE PRECISION NOT NULL,
    lng          DOUBLE PRECISION NOT NULL,
    icon_type    VARCHAR(50) DEFAULT 'server',
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (customer, asset_name)
);

-- Threat Map: SIEM Locations
CREATE TABLE IF NOT EXISTS siem_locations (
    id              SERIAL PRIMARY KEY,
    customer        VARCHAR(200),
    label           VARCHAR(200) NOT NULL,
    location_type   VARCHAR(50) NOT NULL,
    lat             DOUBLE PRECISION NOT NULL,
    lng             DOUBLE PRECISION NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users & Authentication
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(100) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    VARCHAR(200),
    role            VARCHAR(50) NOT NULL DEFAULT 'viewer',
    customer        VARCHAR(200),
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Seed default users (passwords: admin=mtmn1f4rr0, cmwi=cmwi2026)
INSERT INTO users (username, password_hash, display_name, role, customer, is_active)
VALUES
    ('admin', '$2b$12$3erSpNd9jh2mNlcsaaSpluh3PMi9u.uZf096RdRfCoi4SWHab/cHS', 'Super Admin', 'superadmin', NULL, true),
    ('cmwi', '$2b$12$DGx9aX/tKpny0GkrUJDjjupqIJSKw1GhzN4UfqBACuq5/uu5mcwkC', 'CMWI User', 'customer', 'CMWI', true)
ON CONFLICT (username) DO NOTHING;