-- ScanGuard Initial Schema
-- 8 core tables + CV integration

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants (SaaS multi-tenancy)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'starter',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Locations (stores/branches)
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    timezone VARCHAR(50) DEFAULT 'Europe/Berlin',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_locations_tenant ON locations(tenant_id);

-- Cameras
CREATE TABLE IF NOT EXISTS cameras (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    camera_id VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    rtsp_url TEXT NOT NULL,
    scan_zone JSONB,       -- polygon points for scan area
    exit_zone JSONB,       -- polygon points for exit area
    status VARCHAR(20) DEFAULT 'offline',
    last_heartbeat TIMESTAMPTZ,
    fps REAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(location_id, camera_id)
);

CREATE INDEX idx_cameras_location ON cameras(location_id);
CREATE INDEX idx_cameras_status ON cameras(status);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'viewer',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- Alerts (non-scan events, anomalies)
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'non_scan',
    severity VARCHAR(20) DEFAULT 'medium',
    track_id INTEGER,
    class_name VARCHAR(100),
    confidence REAL,
    bbox JSONB,
    snapshot_url TEXT,
    snapshot_b64 TEXT,
    description TEXT,
    status VARCHAR(20) DEFAULT 'open',      -- open, reviewed, dismissed, resolved
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_location ON alerts(location_id);
CREATE INDEX idx_alerts_camera ON alerts(camera_id);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX idx_alerts_type ON alerts(type);

-- POS Events (cash register transactions)
CREATE TABLE IF NOT EXISTS pos_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    register_id VARCHAR(100),
    transaction_id VARCHAR(255),
    event_type VARCHAR(50),      -- scan, void, payment, cancel
    item_barcode VARCHAR(100),
    item_name VARCHAR(255),
    quantity INTEGER DEFAULT 1,
    price_cents INTEGER,
    timestamp TIMESTAMPTZ NOT NULL,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pos_location ON pos_events(location_id);
CREATE INDEX idx_pos_timestamp ON pos_events(timestamp DESC);
CREATE INDEX idx_pos_register ON pos_events(register_id);

-- CV Detections (raw detection data from CV engine)
CREATE TABLE IF NOT EXISTS cv_detections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    frame_number INTEGER,
    detections JSONB NOT NULL,   -- array of {class_id, class_name, confidence, bbox, track_id}
    detection_count INTEGER DEFAULT 0,
    snapshot_b64 TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cv_det_camera ON cv_detections(camera_id);
CREATE INDEX idx_cv_det_location ON cv_detections(location_id);
CREATE INDEX idx_cv_det_timestamp ON cv_detections(timestamp DESC);

-- Daily Stats (aggregated KPIs per location per day)
CREATE TABLE IF NOT EXISTS daily_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_transactions INTEGER DEFAULT 0,
    total_items_scanned INTEGER DEFAULT 0,
    total_alerts INTEGER DEFAULT 0,
    alerts_reviewed INTEGER DEFAULT 0,
    alerts_confirmed INTEGER DEFAULT 0,
    estimated_loss_cents INTEGER DEFAULT 0,
    detection_count INTEGER DEFAULT 0,
    avg_confidence REAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(location_id, date)
);

CREATE INDEX idx_daily_stats_location ON daily_stats(location_id);
CREATE INDEX idx_daily_stats_date ON daily_stats(date DESC);
