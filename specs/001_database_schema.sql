-- =============================================================================
-- Cyber Chakra Forensics - Admin Portal Database Schema
-- PostgreSQL 15+
-- =============================================================================
-- This schema covers the server-side Admin Portal that manages licenses,
-- customers, analytics, downloads, announcements, and support for the
-- Cyber Chakra Forensics desktop application.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- trigram fuzzy search

-- ---------------------------------------------------------------------------
-- Custom ENUM types
-- ---------------------------------------------------------------------------

CREATE TYPE org_status AS ENUM (
    'active',
    'suspended',
    'churned',
    'trial'
);

CREATE TYPE org_type AS ENUM (
    'law_enforcement',
    'government',
    'forensics_lab',
    'military',
    'corporate',
    'academic',
    'individual',
    'other'
);

CREATE TYPE contact_role AS ENUM (
    'primary',
    'technical',
    'billing',
    'admin',
    'user'
);

CREATE TYPE license_type AS ENUM (
    'trial',
    'standard',
    'professional',
    'enterprise',
    'government',
    'academic',
    'oem'
);

CREATE TYPE license_status AS ENUM (
    'active',
    'expired',
    'suspended',
    'revoked',
    'pending_activation'
);

CREATE TYPE license_event_type AS ENUM (
    'created',
    'activated',
    'deactivated',
    'renewed',
    'upgraded',
    'downgraded',
    'suspended',
    'revoked',
    'expired',
    'transferred',
    'heartbeat',
    'validation_success',
    'validation_failure',
    'max_activations_reached',
    'tamper_detected'
);

CREATE TYPE release_channel AS ENUM (
    'stable',
    'beta',
    'alpha',
    'nightly',
    'lts'
);

CREATE TYPE release_status AS ENUM (
    'draft',
    'published',
    'deprecated',
    'yanked'
);

CREATE TYPE platform_type AS ENUM (
    'windows_x64',
    'windows_arm64',
    'linux_x64',
    'linux_arm64',
    'macos_x64',
    'macos_arm64'
);

CREATE TYPE announcement_type AS ENUM (
    'info',
    'warning',
    'critical',
    'maintenance',
    'feature',
    'promotion'
);

CREATE TYPE announcement_target AS ENUM (
    'all',
    'trial',
    'standard',
    'professional',
    'enterprise',
    'government',
    'specific_orgs'
);

CREATE TYPE ticket_status AS ENUM (
    'open',
    'in_progress',
    'waiting_on_customer',
    'waiting_on_internal',
    'resolved',
    'closed'
);

CREATE TYPE ticket_priority AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);

CREATE TYPE invoice_status AS ENUM (
    'draft',
    'sent',
    'paid',
    'overdue',
    'cancelled',
    'refunded'
);

CREATE TYPE admin_role AS ENUM (
    'super_admin',
    'admin',
    'support',
    'viewer',
    'analyst'
);

-- ---------------------------------------------------------------------------
-- 1. organizations
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    org_type        org_type NOT NULL DEFAULT 'other',
    status          org_status NOT NULL DEFAULT 'active',
    -- Address
    address_line_1  TEXT,
    address_line_2  TEXT,
    city            TEXT,
    state_province  TEXT,
    postal_code     TEXT,
    country_code    CHAR(2),          -- ISO 3166-1 alpha-2
    -- Metadata
    phone           TEXT,
    email           TEXT,
    website         TEXT,
    gst_number      TEXT,             -- India GST / Tax ID
    pan_number      TEXT,             -- India PAN
    -- Internal
    notes           TEXT,
    metadata        JSONB DEFAULT '{}',
    max_licenses    INTEGER DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ              -- soft delete
);

CREATE INDEX idx_organizations_status ON organizations (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_slug ON organizations (slug);
CREATE INDEX idx_organizations_name_trgm ON organizations USING gin (name gin_trgm_ops);
CREATE INDEX idx_organizations_country ON organizations (country_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_type ON organizations (org_type) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. contacts
-- ---------------------------------------------------------------------------
CREATE TABLE contacts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    email           TEXT NOT NULL,
    phone           TEXT,
    designation     TEXT,             -- job title / rank
    department      TEXT,
    role            contact_role NOT NULL DEFAULT 'user',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    notes           TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_contacts_email_org ON contacts (email, organization_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_org ON contacts (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_name_trgm ON contacts USING gin (
    (first_name || ' ' || last_name) gin_trgm_ops
);
CREATE INDEX idx_contacts_role ON contacts (role) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. licenses
-- ---------------------------------------------------------------------------
CREATE TABLE licenses (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
    -- License key
    license_key         TEXT NOT NULL UNIQUE,
    license_type        license_type NOT NULL DEFAULT 'standard',
    status              license_status NOT NULL DEFAULT 'pending_activation',
    -- Validity
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,           -- NULL = perpetual
    suspended_at        TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    -- Limits
    max_activations     INTEGER NOT NULL DEFAULT 1,
    current_activations INTEGER NOT NULL DEFAULT 0,
    -- Product
    product_version     TEXT,                  -- e.g., "2.x" for version family
    features            JSONB DEFAULT '{}',    -- feature flags for this license
    -- Metadata
    purchase_order      TEXT,
    invoice_ref         TEXT,
    notes               TEXT,
    metadata            JSONB DEFAULT '{}',
    -- Audit
    created_by          UUID,                  -- admin_users.id
    updated_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_activations CHECK (current_activations >= 0),
    CONSTRAINT chk_max_activations CHECK (max_activations >= 1),
    CONSTRAINT chk_current_le_max CHECK (current_activations <= max_activations)
);

CREATE INDEX idx_licenses_org ON licenses (organization_id);
CREATE INDEX idx_licenses_status ON licenses (status);
CREATE INDEX idx_licenses_key ON licenses (license_key);
CREATE INDEX idx_licenses_type ON licenses (license_type);
CREATE INDEX idx_licenses_expires ON licenses (expires_at) WHERE status = 'active';
CREATE INDEX idx_licenses_contact ON licenses (contact_id) WHERE contact_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. license_activations
-- ---------------------------------------------------------------------------
CREATE TABLE license_activations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_id      UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    -- Machine identification
    machine_id      TEXT NOT NULL,             -- hardware fingerprint hash
    machine_name    TEXT,                      -- human-readable hostname
    os_info         TEXT,                      -- e.g., "Windows 11 Pro 10.0.26200"
    app_version     TEXT,                      -- desktop app version at activation
    ip_address      INET,
    -- Status
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at  TIMESTAMPTZ,
    last_heartbeat  TIMESTAMPTZ,
    heartbeat_count BIGINT NOT NULL DEFAULT 0,
    -- Metadata
    metadata        JSONB DEFAULT '{}',

    CONSTRAINT uq_license_machine UNIQUE (license_id, machine_id)
);

CREATE INDEX idx_activations_license ON license_activations (license_id) WHERE is_active = TRUE;
CREATE INDEX idx_activations_machine ON license_activations (machine_id);
CREATE INDEX idx_activations_heartbeat ON license_activations (last_heartbeat)
    WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- 5. license_events  (audit trail for all license operations)
-- ---------------------------------------------------------------------------
CREATE TABLE license_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_id      UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    activation_id   UUID REFERENCES license_activations(id) ON DELETE SET NULL,
    event_type      license_event_type NOT NULL,
    -- Context
    machine_id      TEXT,
    ip_address      INET,
    user_agent      TEXT,
    -- Who triggered this
    triggered_by    TEXT,                      -- "system", "admin:<id>", "client"
    -- Details
    details         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_license_events_license ON license_events (license_id, created_at DESC);
CREATE INDEX idx_license_events_type ON license_events (event_type, created_at DESC);
CREATE INDEX idx_license_events_machine ON license_events (machine_id)
    WHERE machine_id IS NOT NULL;
CREATE INDEX idx_license_events_created ON license_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- 6. analytics_events  (raw usage telemetry from desktop app)
-- ---------------------------------------------------------------------------
CREATE TABLE analytics_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_id      UUID REFERENCES licenses(id) ON DELETE SET NULL,
    machine_id      TEXT,
    session_id      TEXT,                      -- desktop app session
    -- Event data
    event_name      TEXT NOT NULL,             -- e.g., "acquisition_started", "report_generated"
    event_category  TEXT NOT NULL DEFAULT 'general',  -- e.g., "acquisition", "analysis", "report"
    event_data      JSONB DEFAULT '{}',
    -- Context
    app_version     TEXT,
    os_platform     TEXT,                      -- "windows", "linux"
    os_version      TEXT,
    screen_resolution TEXT,
    locale          TEXT,                      -- e.g., "en-IN"
    -- Geo (derived from IP at ingest)
    ip_address      INET,
    country_code    CHAR(2),
    region          TEXT,
    city            TEXT,
    -- Timing
    client_timestamp TIMESTAMPTZ,              -- when event occurred on client
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- when server received it
);

-- Partitioned by month for high-volume telemetry (applied via PARTITION BY RANGE later)
CREATE INDEX idx_analytics_events_license ON analytics_events (license_id, created_at DESC);
CREATE INDEX idx_analytics_events_name ON analytics_events (event_name, created_at DESC);
CREATE INDEX idx_analytics_events_category ON analytics_events (event_category, created_at DESC);
CREATE INDEX idx_analytics_events_machine ON analytics_events (machine_id, created_at DESC);
CREATE INDEX idx_analytics_events_created ON analytics_events (created_at DESC);
CREATE INDEX idx_analytics_events_session ON analytics_events (session_id)
    WHERE session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. analytics_daily  (pre-aggregated daily statistics)
-- ---------------------------------------------------------------------------
CREATE TABLE analytics_daily (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date            DATE NOT NULL,
    -- Dimensions (any combination; NULLs mean "all")
    license_id      UUID REFERENCES licenses(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    event_category  TEXT,
    app_version     TEXT,
    os_platform     TEXT,
    country_code    CHAR(2),
    -- Metrics
    event_count     BIGINT NOT NULL DEFAULT 0,
    unique_machines INTEGER NOT NULL DEFAULT 0,
    unique_sessions INTEGER NOT NULL DEFAULT 0,
    -- Specific counters (denormalized for fast dashboard queries)
    acquisitions    INTEGER NOT NULL DEFAULT 0,
    analyses        INTEGER NOT NULL DEFAULT 0,
    reports         INTEGER NOT NULL DEFAULT 0,
    errors          INTEGER NOT NULL DEFAULT 0,
    -- Session metrics
    avg_session_duration_seconds INTEGER,
    -- Aggregation metadata
    aggregated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_analytics_daily UNIQUE (
        date, license_id, organization_id, event_category,
        app_version, os_platform, country_code
    )
);

CREATE INDEX idx_analytics_daily_date ON analytics_daily (date DESC);
CREATE INDEX idx_analytics_daily_org ON analytics_daily (organization_id, date DESC)
    WHERE organization_id IS NOT NULL;
CREATE INDEX idx_analytics_daily_license ON analytics_daily (license_id, date DESC)
    WHERE license_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. releases  (software versions)
-- ---------------------------------------------------------------------------
CREATE TABLE releases (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version         TEXT NOT NULL UNIQUE,       -- semver, e.g. "2.1.0"
    version_code    INTEGER NOT NULL UNIQUE,    -- monotonic integer for comparison
    channel         release_channel NOT NULL DEFAULT 'stable',
    status          release_status NOT NULL DEFAULT 'draft',
    -- Content
    title           TEXT NOT NULL,              -- human-readable title
    release_notes   TEXT,                       -- markdown
    changelog_html  TEXT,                       -- rendered HTML
    -- Requirements
    min_os_version  JSONB DEFAULT '{}',         -- {"windows": "10.0", "linux": "5.15"}
    min_upgrade_from TEXT,                      -- minimum version that can upgrade to this
    -- Flags
    is_mandatory    BOOLEAN NOT NULL DEFAULT FALSE,  -- force-update
    is_security     BOOLEAN NOT NULL DEFAULT FALSE,  -- security patch
    -- Timing
    published_at    TIMESTAMPTZ,
    deprecated_at   TIMESTAMPTZ,
    -- Audit
    created_by      UUID,                       -- admin_users.id
    published_by    UUID,                       -- admin_users.id
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_releases_channel_status ON releases (channel, status);
CREATE INDEX idx_releases_version_code ON releases (version_code DESC);
CREATE INDEX idx_releases_published ON releases (published_at DESC)
    WHERE status = 'published';

-- ---------------------------------------------------------------------------
-- 9. release_assets  (binary files per release, per platform)
-- ---------------------------------------------------------------------------
CREATE TABLE release_assets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    release_id      UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    platform        platform_type NOT NULL,
    -- File info
    filename        TEXT NOT NULL,
    file_size       BIGINT NOT NULL,           -- bytes
    content_type    TEXT NOT NULL DEFAULT 'application/octet-stream',
    storage_path    TEXT NOT NULL,              -- S3/R2 key or local path
    storage_bucket  TEXT,
    -- Integrity
    sha256_hash     TEXT NOT NULL,
    sha512_hash     TEXT,
    signature       TEXT,                       -- code-signing signature
    -- Installer type
    installer_type  TEXT,                       -- "nsis", "msi", "appimage", "deb", "dmg"
    -- Metadata
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_release_platform UNIQUE (release_id, platform, installer_type)
);

CREATE INDEX idx_release_assets_release ON release_assets (release_id);
CREATE INDEX idx_release_assets_platform ON release_assets (platform);

-- ---------------------------------------------------------------------------
-- 10. downloads  (download tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE downloads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    release_asset_id UUID NOT NULL REFERENCES release_assets(id) ON DELETE CASCADE,
    release_id      UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    -- Who downloaded
    license_id      UUID REFERENCES licenses(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    ip_address      INET,
    user_agent      TEXT,
    country_code    CHAR(2),
    -- Context
    download_type   TEXT NOT NULL DEFAULT 'manual',  -- "manual", "auto_update", "api"
    is_update       BOOLEAN NOT NULL DEFAULT FALSE,
    from_version    TEXT,                             -- version upgrading from
    -- Status
    completed       BOOLEAN NOT NULL DEFAULT FALSE,
    bytes_downloaded BIGINT DEFAULT 0,
    -- Timing
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_downloads_release ON downloads (release_id, started_at DESC);
CREATE INDEX idx_downloads_asset ON downloads (release_asset_id);
CREATE INDEX idx_downloads_org ON downloads (organization_id, started_at DESC)
    WHERE organization_id IS NOT NULL;
CREATE INDEX idx_downloads_license ON downloads (license_id)
    WHERE license_id IS NOT NULL;
CREATE INDEX idx_downloads_date ON downloads (started_at DESC);

-- ---------------------------------------------------------------------------
-- 11. announcements  (in-app messages)
-- ---------------------------------------------------------------------------
CREATE TABLE announcements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,              -- markdown content
    body_html       TEXT,                       -- rendered HTML
    announcement_type  announcement_type NOT NULL DEFAULT 'info',
    target          announcement_target NOT NULL DEFAULT 'all',
    -- Targeting
    target_org_ids  UUID[] DEFAULT '{}',        -- when target = 'specific_orgs'
    target_versions TEXT[],                     -- app versions to show to, NULL = all
    target_platforms platform_type[],           -- platforms to show to, NULL = all
    min_version     TEXT,                       -- minimum app version to display
    max_version     TEXT,                       -- maximum app version to display
    -- Display
    is_dismissible  BOOLEAN NOT NULL DEFAULT TRUE,
    is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
    action_url      TEXT,                       -- optional CTA link
    action_label    TEXT,                       -- CTA button text
    icon            TEXT,                       -- icon identifier
    -- Scheduling
    starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at         TIMESTAMPTZ,               -- NULL = no expiry
    -- Status
    is_published    BOOLEAN NOT NULL DEFAULT FALSE,
    -- Audit
    created_by      UUID,                      -- admin_users.id
    published_by    UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_announcements_active ON announcements (starts_at, ends_at)
    WHERE is_published = TRUE;
CREATE INDEX idx_announcements_type ON announcements (announcement_type)
    WHERE is_published = TRUE;
CREATE INDEX idx_announcements_target ON announcements (target)
    WHERE is_published = TRUE;

-- ---------------------------------------------------------------------------
-- 12. admin_users  (portal admin accounts)
-- ---------------------------------------------------------------------------
CREATE TABLE admin_users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT NOT NULL UNIQUE,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,              -- Argon2id
    display_name    TEXT NOT NULL,
    role            admin_role NOT NULL DEFAULT 'viewer',
    -- Status
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    -- MFA
    mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret      TEXT,                      -- TOTP secret (encrypted at rest)
    mfa_backup_codes TEXT[],                   -- hashed backup codes
    -- Session management
    last_login_at   TIMESTAMPTZ,
    last_login_ip   INET,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    -- Metadata
    avatar_url      TEXT,
    preferences     JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ                -- soft delete
);

CREATE INDEX idx_admin_users_email ON admin_users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_admin_users_username ON admin_users (username) WHERE deleted_at IS NULL;
CREATE INDEX idx_admin_users_role ON admin_users (role) WHERE is_active = TRUE AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 13. admin_sessions  (admin login sessions)
-- ---------------------------------------------------------------------------
CREATE TABLE admin_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,       -- SHA-256 of session token
    refresh_token_hash TEXT UNIQUE,
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    refresh_expires_at TIMESTAMPTZ,
    is_revoked      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_sessions_user ON admin_sessions (admin_user_id)
    WHERE is_revoked = FALSE;
CREATE INDEX idx_admin_sessions_token ON admin_sessions (token_hash)
    WHERE is_revoked = FALSE;
CREATE INDEX idx_admin_sessions_expiry ON admin_sessions (expires_at)
    WHERE is_revoked = FALSE;

-- ---------------------------------------------------------------------------
-- 14. admin_audit_log  (admin portal action log)
-- ---------------------------------------------------------------------------
CREATE TABLE admin_audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    -- Action
    action          TEXT NOT NULL,              -- e.g., "license.create", "org.update"
    resource_type   TEXT NOT NULL,              -- e.g., "license", "organization"
    resource_id     UUID,                       -- ID of affected resource
    -- Details
    description     TEXT,
    changes         JSONB DEFAULT '{}',         -- {"field": {"old": x, "new": y}}
    request_body    JSONB,                      -- sanitized request (no secrets)
    -- Context
    ip_address      INET,
    user_agent      TEXT,
    session_id      UUID,
    -- Timing
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- This table is append-only. No UPDATE or DELETE operations allowed.
CREATE INDEX idx_audit_log_admin ON admin_audit_log (admin_user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON admin_audit_log (action, created_at DESC);
CREATE INDEX idx_audit_log_resource ON admin_audit_log (resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_log_created ON admin_audit_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- 15. support_tickets
-- ---------------------------------------------------------------------------
CREATE TABLE support_tickets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number   TEXT NOT NULL UNIQUE,       -- human-readable, e.g. "CCF-2026-00123"
    -- Requester
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
    license_id      UUID REFERENCES licenses(id) ON DELETE SET NULL,
    requester_name  TEXT NOT NULL,
    requester_email TEXT NOT NULL,
    -- Ticket content
    subject         TEXT NOT NULL,
    description     TEXT NOT NULL,
    -- Classification
    category        TEXT DEFAULT 'general',     -- "activation", "bug", "feature_request", "general"
    priority        ticket_priority NOT NULL DEFAULT 'medium',
    status          ticket_status NOT NULL DEFAULT 'open',
    -- Assignment
    assigned_to     UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    -- Resolution
    resolution      TEXT,
    resolved_at     TIMESTAMPTZ,
    -- Device context (auto-attached from desktop app)
    device_info     JSONB DEFAULT '{}',
    app_version     TEXT,
    os_info         TEXT,
    logs_attachment TEXT,                       -- storage path to log bundle
    -- Metadata
    tags            TEXT[] DEFAULT '{}',
    metadata        JSONB DEFAULT '{}',
    -- Timing
    first_response_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ
);

CREATE INDEX idx_tickets_status ON support_tickets (status, priority);
CREATE INDEX idx_tickets_org ON support_tickets (organization_id, created_at DESC)
    WHERE organization_id IS NOT NULL;
CREATE INDEX idx_tickets_assigned ON support_tickets (assigned_to, status)
    WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_tickets_number ON support_tickets (ticket_number);
CREATE INDEX idx_tickets_created ON support_tickets (created_at DESC);

-- ---------------------------------------------------------------------------
-- 15b. support_ticket_messages  (conversation thread)
-- ---------------------------------------------------------------------------
CREATE TABLE support_ticket_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id       UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    -- Sender
    sender_type     TEXT NOT NULL CHECK (sender_type IN ('customer', 'admin', 'system')),
    sender_id       UUID,                       -- admin_users.id or contacts.id
    sender_name     TEXT NOT NULL,
    sender_email    TEXT,
    -- Content
    body            TEXT NOT NULL,
    body_html       TEXT,
    -- Attachments
    attachments     JSONB DEFAULT '[]',         -- [{filename, storage_path, size, content_type}]
    -- Flags
    is_internal     BOOLEAN NOT NULL DEFAULT FALSE,  -- internal note, not visible to customer
    -- Timing
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_messages_ticket ON support_ticket_messages (ticket_id, created_at ASC);

-- ---------------------------------------------------------------------------
-- 16. invoices  (basic billing)
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number  TEXT NOT NULL UNIQUE,       -- e.g., "INV-2026-00045"
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    license_id      UUID REFERENCES licenses(id) ON DELETE SET NULL,
    contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
    -- Financial
    currency        CHAR(3) NOT NULL DEFAULT 'INR',  -- ISO 4217
    subtotal        NUMERIC(12,2) NOT NULL,
    tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_rate        NUMERIC(5,2),                     -- e.g., 18.00 for 18% GST
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total           NUMERIC(12,2) NOT NULL,
    amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Status
    status          invoice_status NOT NULL DEFAULT 'draft',
    -- Dates
    issued_at       DATE,
    due_at          DATE,
    paid_at         TIMESTAMPTZ,
    -- Line items
    line_items      JSONB NOT NULL DEFAULT '[]',
    -- [{description, quantity, unit_price, amount, license_type, period}]
    -- Payment
    payment_method  TEXT,
    payment_reference TEXT,
    -- Document
    notes           TEXT,
    terms           TEXT,
    pdf_storage_path TEXT,                     -- generated PDF location
    -- Metadata
    metadata        JSONB DEFAULT '{}',
    created_by      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_org ON invoices (organization_id, created_at DESC);
CREATE INDEX idx_invoices_status ON invoices (status);
CREATE INDEX idx_invoices_due ON invoices (due_at) WHERE status IN ('sent', 'overdue');
CREATE INDEX idx_invoices_number ON invoices (invoice_number);

-- ---------------------------------------------------------------------------
-- Trigger: auto-update updated_at columns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'organizations', 'contacts', 'licenses', 'releases',
            'announcements', 'admin_users', 'support_tickets', 'invoices'
        ])
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
            tbl, tbl
        );
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: prevent modifications to admin_audit_log
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'admin_audit_log is append-only. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON admin_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- ---------------------------------------------------------------------------
-- Trigger: auto-generate ticket numbers
-- ---------------------------------------------------------------------------
CREATE SEQUENCE ticket_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
        NEW.ticket_number := 'CCF-' || EXTRACT(YEAR FROM NOW())::TEXT
                             || '-' || LPAD(nextval('ticket_number_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_number
    BEFORE INSERT ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION generate_ticket_number();

-- ---------------------------------------------------------------------------
-- Trigger: auto-generate invoice numbers
-- ---------------------------------------------------------------------------
CREATE SEQUENCE invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
        NEW.invoice_number := 'INV-' || EXTRACT(YEAR FROM NOW())::TEXT
                              || '-' || LPAD(nextval('invoice_number_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_number
    BEFORE INSERT ON invoices
    FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- ---------------------------------------------------------------------------
-- Trigger: update license activation count
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_license_activation_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE licenses
        SET current_activations = (
            SELECT COUNT(*) FROM license_activations
            WHERE license_id = NEW.license_id AND is_active = TRUE
        ),
        updated_at = NOW()
        WHERE id = NEW.license_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        UPDATE licenses
        SET current_activations = (
            SELECT COUNT(*) FROM license_activations
            WHERE license_id = OLD.license_id AND is_active = TRUE
        ),
        updated_at = NOW()
        WHERE id = OLD.license_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_activation_count
    AFTER INSERT OR UPDATE OR DELETE ON license_activations
    FOR EACH ROW EXECUTE FUNCTION sync_license_activation_count();

-- ---------------------------------------------------------------------------
-- Row-Level Security (RLS) policies - ready for multi-tenant
-- ---------------------------------------------------------------------------
-- (Policies would be added here based on auth provider integration.
--  Example structure shown for reference.)

-- ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY org_admin_access ON organizations
--     FOR ALL TO admin_role
--     USING (TRUE);

-- ---------------------------------------------------------------------------
-- Materialized view: dashboard summary
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_dashboard_summary AS
SELECT
    (SELECT COUNT(*) FROM organizations WHERE status = 'active' AND deleted_at IS NULL) AS active_orgs,
    (SELECT COUNT(*) FROM licenses WHERE status = 'active') AS active_licenses,
    (SELECT COUNT(*) FROM licenses WHERE status = 'expired') AS expired_licenses,
    (SELECT COUNT(*) FROM license_activations WHERE is_active = TRUE) AS active_machines,
    (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open', 'in_progress')) AS open_tickets,
    (SELECT COUNT(*) FROM downloads WHERE started_at > NOW() - INTERVAL '30 days') AS downloads_30d,
    NOW() AS refreshed_at;

CREATE UNIQUE INDEX idx_mv_dashboard_summary ON mv_dashboard_summary (refreshed_at);

-- Refresh periodically via pg_cron or application scheduler:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_summary;
