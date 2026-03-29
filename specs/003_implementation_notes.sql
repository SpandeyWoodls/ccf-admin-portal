-- =============================================================================
-- Cyber Chakra Forensics - Admin Portal Seed Data & Utility Queries
-- Run AFTER 001_database_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Seed: Default super admin account
-- Password: change-me-immediately (Argon2id hash)
-- ---------------------------------------------------------------------------
INSERT INTO admin_users (
    email, username, password_hash, display_name, role, is_active, email_verified
) VALUES (
    'admin@cyberchakra.in',
    'superadmin',
    -- This is a placeholder. Generate real hash in application code:
    -- argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
    '$argon2id$v=19$m=65536,t=3,p=4$CHANGE_THIS_HASH_IN_PRODUCTION',
    'System Administrator',
    'super_admin',
    TRUE,
    TRUE
);

-- ---------------------------------------------------------------------------
-- Utility: License key generation function
-- Generates keys in format CCF-XXXX-XXXX-XXXX-XXXX
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_license_key()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- No I,O,0,1 to avoid confusion
    result TEXT := 'CCF-';
    i INTEGER;
    g INTEGER;
BEGIN
    FOR g IN 1..4 LOOP
        FOR i IN 1..4 LOOP
            result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
        END LOOP;
        IF g < 4 THEN
            result := result || '-';
        END IF;
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Utility: Auto-generate license key on insert if not provided
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_generate_license_key()
RETURNS TRIGGER AS $$
DECLARE
    new_key TEXT;
    attempts INTEGER := 0;
BEGIN
    IF NEW.license_key IS NULL OR NEW.license_key = '' THEN
        LOOP
            new_key := generate_license_key();
            -- Check uniqueness
            IF NOT EXISTS (SELECT 1 FROM licenses WHERE license_key = new_key) THEN
                NEW.license_key := new_key;
                EXIT;
            END IF;
            attempts := attempts + 1;
            IF attempts > 100 THEN
                RAISE EXCEPTION 'Could not generate unique license key after 100 attempts';
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_license_key
    BEFORE INSERT ON licenses
    FOR EACH ROW EXECUTE FUNCTION auto_generate_license_key();

-- ---------------------------------------------------------------------------
-- Utility: Auto-generate org slug from name
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_org_slug()
RETURNS TRIGGER AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        base_slug := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
        base_slug := trim(BOTH '-' FROM base_slug);
        final_slug := base_slug;

        WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = final_slug AND id != NEW.id) LOOP
            counter := counter + 1;
            final_slug := base_slug || '-' || counter;
        END LOOP;

        NEW.slug := final_slug;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_slug
    BEFORE INSERT OR UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION generate_org_slug();

-- ---------------------------------------------------------------------------
-- Utility: Expire licenses automatically (run via pg_cron daily)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_overdue_licenses()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE licenses
        SET status = 'expired', updated_at = NOW()
        WHERE status = 'active'
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO expired_count FROM expired;

    -- Log events for each expired license
    INSERT INTO license_events (license_id, event_type, triggered_by, details)
    SELECT id, 'expired', 'system', '{"reason": "auto_expiry"}'::jsonb
    FROM licenses
    WHERE status = 'expired'
      AND expires_at IS NOT NULL
      AND expires_at >= NOW() - INTERVAL '1 day'
      AND expires_at < NOW();

    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule with pg_cron (if available):
-- SELECT cron.schedule('expire-licenses', '0 0 * * *', 'SELECT expire_overdue_licenses()');

-- ---------------------------------------------------------------------------
-- Utility: Aggregate daily analytics (run via pg_cron or app scheduler)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aggregate_analytics_daily(target_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS VOID AS $$
BEGIN
    INSERT INTO analytics_daily (
        date, license_id, organization_id, event_category,
        app_version, os_platform, country_code,
        event_count, unique_machines, unique_sessions,
        acquisitions, analyses, reports, errors
    )
    SELECT
        target_date,
        ae.license_id,
        l.organization_id,
        ae.event_category,
        ae.app_version,
        ae.os_platform,
        ae.country_code,
        COUNT(*),
        COUNT(DISTINCT ae.machine_id),
        COUNT(DISTINCT ae.session_id),
        COUNT(*) FILTER (WHERE ae.event_category = 'acquisition'),
        COUNT(*) FILTER (WHERE ae.event_category = 'analysis'),
        COUNT(*) FILTER (WHERE ae.event_category = 'report'),
        COUNT(*) FILTER (WHERE ae.event_category = 'error')
    FROM analytics_events ae
    LEFT JOIN licenses l ON l.id = ae.license_id
    WHERE ae.created_at >= target_date
      AND ae.created_at < target_date + 1
    GROUP BY
        ae.license_id,
        l.organization_id,
        ae.event_category,
        ae.app_version,
        ae.os_platform,
        ae.country_code
    ON CONFLICT (date, license_id, organization_id, event_category, app_version, os_platform, country_code)
    DO UPDATE SET
        event_count = EXCLUDED.event_count,
        unique_machines = EXCLUDED.unique_machines,
        unique_sessions = EXCLUDED.unique_sessions,
        acquisitions = EXCLUDED.acquisitions,
        analyses = EXCLUDED.analyses,
        reports = EXCLUDED.reports,
        errors = EXCLUDED.errors,
        aggregated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Utility: Detect stale activations (no heartbeat in 30+ days)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_stale_activations(stale_days INTEGER DEFAULT 30)
RETURNS TABLE (
    activation_id UUID,
    license_id UUID,
    machine_id TEXT,
    machine_name TEXT,
    last_heartbeat TIMESTAMPTZ,
    days_since_heartbeat INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        la.id,
        la.license_id,
        la.machine_id,
        la.machine_name,
        la.last_heartbeat,
        EXTRACT(DAY FROM NOW() - la.last_heartbeat)::INTEGER
    FROM license_activations la
    WHERE la.is_active = TRUE
      AND la.last_heartbeat < NOW() - (stale_days || ' days')::INTERVAL
    ORDER BY la.last_heartbeat ASC;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Utility: Dashboard stats query (alternative to materialized view)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'active_organizations',
            (SELECT COUNT(*) FROM organizations WHERE status = 'active' AND deleted_at IS NULL),
        'active_licenses',
            (SELECT COUNT(*) FROM licenses WHERE status = 'active'),
        'expired_licenses',
            (SELECT COUNT(*) FROM licenses WHERE status = 'expired'),
        'pending_licenses',
            (SELECT COUNT(*) FROM licenses WHERE status = 'pending_activation'),
        'active_machines',
            (SELECT COUNT(*) FROM license_activations WHERE is_active = TRUE),
        'open_tickets',
            (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open', 'in_progress')),
        'downloads_30d',
            (SELECT COUNT(*) FROM downloads WHERE started_at > NOW() - INTERVAL '30 days'),
        'licenses_expiring_30d',
            (SELECT COUNT(*) FROM licenses
             WHERE status = 'active' AND expires_at IS NOT NULL
               AND expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'),
        'revenue_mtd',
            (SELECT COALESCE(SUM(amount_paid), 0) FROM invoices
             WHERE status = 'paid'
               AND paid_at >= date_trunc('month', NOW())),
        'latest_release',
            (SELECT version FROM releases
             WHERE status = 'published' AND channel = 'stable'
             ORDER BY version_code DESC LIMIT 1)
    );
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Index recommendations for common admin portal queries
-- ---------------------------------------------------------------------------

-- "Show me all licenses expiring this month"
CREATE INDEX idx_licenses_expiring_soon ON licenses (expires_at)
    WHERE status = 'active' AND expires_at IS NOT NULL;

-- "Show me all activations that haven't heartbeated recently"
CREATE INDEX idx_activations_stale ON license_activations (last_heartbeat)
    WHERE is_active = TRUE AND last_heartbeat IS NOT NULL;

-- "Show me download counts per version"
CREATE INDEX idx_downloads_release_completed ON downloads (release_id, completed)
    WHERE completed = TRUE;

-- "Full-text search across tickets"
CREATE INDEX idx_tickets_subject_trgm ON support_tickets USING gin (subject gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Rate limiting table (for public API)
-- ---------------------------------------------------------------------------
CREATE TABLE rate_limits (
    key             TEXT NOT NULL,           -- "ip:1.2.3.4" or "license:CCF-XXXX"
    endpoint        TEXT NOT NULL,           -- "/api/public/v1/license/activate"
    window_start    TIMESTAMPTZ NOT NULL,
    request_count   INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (key, endpoint, window_start)
);

CREATE INDEX idx_rate_limits_cleanup ON rate_limits (window_start);
-- Cleanup old entries periodically:
-- DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 hour';

-- ---------------------------------------------------------------------------
-- API key table (for programmatic access)
-- ---------------------------------------------------------------------------
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    key_hash        TEXT NOT NULL UNIQUE,     -- SHA-256 of API key (never store plaintext)
    key_prefix      TEXT NOT NULL,            -- First 8 chars for identification "ccf_api_"
    scopes          TEXT[] NOT NULL DEFAULT '{}',  -- ["licenses:read", "analytics:read"]
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_hash ON api_keys (key_hash) WHERE is_active = TRUE;
CREATE INDEX idx_api_keys_user ON api_keys (admin_user_id);
