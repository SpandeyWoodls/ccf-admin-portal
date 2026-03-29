# CMF Admin Portal - Analytics & Metrics Dashboard Specification

**Agent 8 Research Output** | March 2026
**Scope**: Server-side admin portal analytics for all deployed CMF desktop instances

---

## Table of Contents

1. [Context: Existing Data Flow](#1-context-existing-data-flow)
2. [Key Metrics Dashboard (KPIs)](#2-key-metrics-dashboard-kpis)
3. [Usage Analytics & Telemetry](#3-usage-analytics--telemetry)
4. [Customer Health Scoring](#4-customer-health-scoring)
5. [Visualization Specifications](#5-visualization-specifications)
6. [Data Pipeline Architecture](#6-data-pipeline-architecture)
7. [Database Schema for Analytics](#7-database-schema-for-analytics)
8. [API Endpoints](#8-api-endpoints)
9. [Privacy & Compliance](#9-privacy--compliance)

---

## 1. Context: Existing Data Flow

### What the Desktop App Already Sends

The Rust backend (`src-tauri/src/licensing/mod.rs`) defines a `HeartbeatRequest` struct that each CMF desktop instance sends periodically to the license server:

```rust
pub struct HeartbeatRequest {
    pub license_key: String,
    pub hardware_fingerprint: String,
    pub app_version: String,
    pub usage_stats: UsageStats,
}

pub struct UsageStats {
    pub cases_created: i64,
    pub acquisitions: i64,
    pub reports_generated: i64,
}
```

Additionally, the `ActivationRequest` struct sends:
- `hardware_fingerprint` (machine-bound identifier)
- `machine_name`
- `os_info`
- `app_version`
- `user_email`

The `LicenseStatus` tracks:
- `is_licensed`, `license_key`, `organization`, `user_email`
- `activated_at`, `expires_at`, `days_remaining`
- `is_offline_mode`, `grace_days_remaining`

### Existing Desktop-Side Dashboard Components

The desktop app already has rich analytics components (in `src/components/dashboard/`):
- `AnalyticsSummary.tsx` - Cases, acquisitions, data processed, success rates
- `PerformanceMetrics.tsx` - Acquisition speed, parsing speed, storage, memory
- `ComplianceDashboard.tsx` - Section 65B compliance, hash verification, chain of custody
- `AuditDashboard.tsx` - User actions, system events, security events

The admin portal aggregates these across ALL deployed instances.

### Extraction Types Tracked

From `src/types/index.ts`:
```typescript
type ExtractionType =
  | 'logical'          // ADB backup
  | 'advanced_logical' // Filesystem TAR
  | 'partial_logical'  // Selective extraction
  | 'physical'         // Physical imaging
  | 'ios_logical'      // iOS logical
  | 'cloud';           // Cloud acquisition
```

---

## 2. Key Metrics Dashboard (KPIs)

### 2.1 Executive Summary Cards (Top Row)

Display as a row of 6 large stat cards with sparkline trends.

| Metric | Formula | Card Color | Sparkline Period |
|--------|---------|------------|-----------------|
| **Total Active Licenses** | `COUNT(licenses WHERE status = 'active' AND last_heartbeat > NOW() - 30d)` | Blue | 12-month trend |
| **Monthly Active Users (MAU)** | `COUNT(DISTINCT hardware_fingerprint WHERE last_heartbeat > NOW() - 30d)` | Green | 12-month trend |
| **Daily Active Users (DAU)** | `COUNT(DISTINCT hardware_fingerprint WHERE last_heartbeat > NOW() - 24h)` | Teal | 30-day trend |
| **Total Cases (Period)** | `SUM(delta_cases_created) for selected period` | Purple | Matching period |
| **Total Acquisitions (Period)** | `SUM(delta_acquisitions) for selected period` | Amber | Matching period |
| **License Utilization** | `active_licenses / total_issued_licenses * 100` | Red/Green gradient | 6-month trend |

Each card displays:
- Current value (large, bold)
- Period-over-period delta (e.g., "+12.3% vs last month") with up/down arrow
- Mini sparkline (7-point for 7d, 30-point for 30d, etc.)

### 2.2 Operational KPIs (Second Row)

| Metric | Formula | Significance |
|--------|---------|-------------|
| **DAU/MAU Ratio (Stickiness)** | `DAU / MAU * 100` | Healthy = 20-50% for B2G enterprise. Below 15% = engagement concern. |
| **Avg Cases per User per Month** | `SUM(cases_created_period) / MAU` | Measures productivity. Forensics: 5-20 cases/month typical. |
| **Avg Acquisitions per Case** | `SUM(acquisitions_period) / SUM(cases_created_period)` | Measures thoroughness. Target: 1.5-3.0 (multiple extractions per case). |
| **Reports per Case** | `SUM(reports_period) / SUM(cases_created_period)` | Target: >= 1.0 (every case should produce a report). |
| **Version Currency** | `COUNT(instances on latest version) / COUNT(all active instances) * 100` | Target: >80% within 30 days of release. |
| **Avg Days Since Last Heartbeat** | `AVG(NOW() - last_heartbeat_at)` across active licenses | Alert if >7 days (connectivity or usage issue). |

### 2.3 Revenue & Licensing KPIs

| Metric | Formula | Alert Threshold |
|--------|---------|----------------|
| **Annual Recurring Revenue (ARR)** | `SUM(annual_license_value WHERE status = 'active')` | N/A |
| **Licenses Expiring in 30d** | `COUNT(licenses WHERE expires_at BETWEEN NOW() AND NOW()+30d)` | >10% of total |
| **Licenses Expiring in 90d** | `COUNT(licenses WHERE expires_at BETWEEN NOW() AND NOW()+90d)` | >25% of total |
| **Perpetual vs Subscription Split** | `COUNT(is_perpetual=true) / COUNT(*)` | Track trend |
| **New Activations (Period)** | `COUNT(activations WHERE activated_at IN period)` | Compare to pipeline |
| **Churn Rate (Monthly)** | `COUNT(licenses_deactivated_or_expired_this_month) / COUNT(active_start_of_month) * 100` | >5% = alarm |
| **Net Revenue Retention** | `(ARR_end_of_period - ARR_new_customers) / ARR_start_of_period * 100` | Target: >100% |

### 2.4 Feature Adoption KPIs

| Metric | Formula | Chart |
|--------|---------|-------|
| **Extraction Type Distribution** | `COUNT(acquisitions) GROUP BY extraction_type / total_acquisitions * 100` | Stacked bar |
| **Cloud Acquisition Adoption** | `COUNT(DISTINCT orgs using cloud) / COUNT(DISTINCT active orgs) * 100` | Gauge |
| **Advanced Logical Adoption** | Same pattern as above | Gauge |
| **Physical Imaging Adoption** | Same pattern as above | Gauge |
| **iOS vs Android Split** | `COUNT(acquisitions WHERE platform='ios') vs platform='android'` | Donut |

---

## 3. Usage Analytics & Telemetry

### 3.1 Enhanced Heartbeat Payload

The current `UsageStats` is minimal. Recommend extending the heartbeat with:

```rust
/// Enhanced usage stats for admin portal analytics
/// Sent with each heartbeat (every 4 hours while app is running)
pub struct EnhancedUsageStats {
    // --- Existing fields ---
    pub cases_created: i64,        // Cumulative total
    pub acquisitions: i64,         // Cumulative total
    pub reports_generated: i64,    // Cumulative total

    // --- NEW: Delta counters (since last heartbeat) ---
    pub delta_cases: i64,
    pub delta_acquisitions: i64,
    pub delta_reports: i64,

    // --- NEW: Extraction breakdown (since last heartbeat) ---
    pub logical_extractions: i64,
    pub advanced_logical_extractions: i64,
    pub partial_logical_extractions: i64,
    pub physical_extractions: i64,
    pub ios_logical_extractions: i64,
    pub cloud_extractions: i64,

    // --- NEW: Performance metrics ---
    pub avg_acquisition_speed_mbps: f64,  // Average MB/s this period
    pub avg_acquisition_duration_secs: f64,
    pub total_data_acquired_bytes: i64,
    pub acquisition_success_count: i64,
    pub acquisition_failure_count: i64,

    // --- NEW: App health ---
    pub app_crash_count: i64,       // Crashes since last heartbeat
    pub app_uptime_seconds: i64,    // Uptime this session
    pub session_count: i64,         // User sessions since last heartbeat
    pub avg_session_duration_secs: f64,

    // --- NEW: Feature usage flags (bitmask or struct) ---
    pub features_used: FeatureUsageFlags,

    // --- NEW: Error summary ---
    pub top_errors: Vec<ErrorSummary>,  // Top 5 errors by frequency
}

pub struct FeatureUsageFlags {
    pub used_whatsapp_parser: bool,
    pub used_cloud_acquisition: bool,
    pub used_physical_imaging: bool,
    pub used_report_generator: bool,
    pub used_timeline_view: bool,
    pub used_hex_viewer: bool,
    pub used_contact_graph: bool,
    pub used_dossier_export: bool,
    pub used_forensic_export: bool,
    pub used_section65b_cert: bool,
}

pub struct ErrorSummary {
    pub error_code: String,       // e.g., "ACQ_USB_DISCONNECT"
    pub count: i64,
    pub last_occurred: String,    // ISO 8601
}
```

### 3.2 Enhanced Heartbeat Request

```rust
pub struct EnhancedHeartbeatRequest {
    pub license_key: String,
    pub hardware_fingerprint: String,
    pub app_version: String,
    pub os_info: String,             // NEW: "Windows 11 Pro 10.0.26200" or "Ubuntu 24.04"
    pub platform: String,            // NEW: "windows" | "linux"
    pub machine_name_hash: String,   // NEW: SHA256(machine_name) - not raw name
    pub locale: String,              // NEW: "en-IN", "hi-IN", etc.
    pub usage_stats: EnhancedUsageStats,
    pub timestamp: String,           // ISO 8601 UTC
}
```

### 3.3 Heartbeat Frequency

| App State | Heartbeat Interval | Rationale |
|-----------|-------------------|-----------|
| Active use (foreground) | Every 4 hours | Sufficient for daily analytics |
| Idle (background, no user activity >1hr) | Every 24 hours | Reduce noise |
| App launch | Immediate | Capture session start |
| App close (graceful) | Immediate | Capture session end, final deltas |
| Acquisition completed | Immediate | Real-time acquisition tracking |

### 3.4 Events to Track (Beyond Heartbeat)

For richer analytics, consider a lightweight event stream (batched, not real-time):

| Event | Payload | Priority |
|-------|---------|----------|
| `app.launched` | `{version, os, platform, locale}` | P0 |
| `app.closed` | `{session_duration_secs, reason}` | P0 |
| `license.activated` | `{org, plan_type}` | P0 |
| `license.validation_failed` | `{error_code, was_offline}` | P0 |
| `case.created` | `{extraction_type, device_platform}` | P0 |
| `acquisition.started` | `{extraction_type, device_platform}` | P0 |
| `acquisition.completed` | `{extraction_type, duration_secs, data_bytes, success}` | P0 |
| `acquisition.failed` | `{extraction_type, error_code, step_failed}` | P0 |
| `report.generated` | `{report_type, format, page_count}` | P1 |
| `feature.used` | `{feature_name}` | P1 |
| `error.occurred` | `{error_code, module, severity}` | P1 |
| `update.installed` | `{from_version, to_version}` | P1 |

---

## 4. Customer Health Scoring

### 4.1 Health Score Formula

Each organization gets a composite health score (0-100):

```
HEALTH_SCORE = (
    USAGE_SCORE * 0.35 +
    ENGAGEMENT_SCORE * 0.25 +
    ADOPTION_SCORE * 0.20 +
    RECENCY_SCORE * 0.20
)
```

#### Usage Score (0-100)

```
usage_score = MIN(100, (
    (cases_per_month / expected_cases_per_month) * 50 +
    (acquisitions_per_month / expected_acquisitions_per_month) * 30 +
    (reports_per_month / expected_reports_per_month) * 20
))

Where expected values are based on license tier:
  - Standard (1-5 seats): 10 cases/mo, 15 acquisitions/mo, 8 reports/mo
  - Professional (6-20 seats): 50 cases/mo, 75 acquisitions/mo, 40 reports/mo
  - Enterprise (20+ seats): 200 cases/mo, 300 acquisitions/mo, 150 reports/mo
```

#### Engagement Score (0-100)

```
engagement_score = (
    dau_mau_ratio * 200 +              // 0-50% maps to 0-100
    MIN(1, avg_session_minutes / 60) * 100  // Capped at 60 min avg = 100
) / 2
```

#### Adoption Score (0-100)

```
features_used = COUNT(DISTINCT features used in last 30d)
total_features = 10  // from FeatureUsageFlags

adoption_score = (features_used / total_features) * 60 +
                 (uses_latest_extraction_types ? 20 : 0) +
                 (uses_advanced_features ? 20 : 0)

Where advanced_features = {cloud_acquisition, physical_imaging, forensic_export, contact_graph}
```

#### Recency Score (0-100)

```
days_since_last_activity = NOW() - last_heartbeat_at

recency_score = CASE
    WHEN days <= 1  THEN 100
    WHEN days <= 3  THEN 90
    WHEN days <= 7  THEN 75
    WHEN days <= 14 THEN 50
    WHEN days <= 30 THEN 25
    ELSE 0
END
```

### 4.2 Customer Segments

| Segment | Health Score | Criteria | Action |
|---------|-------------|----------|--------|
| **Champions** | 80-100 | High usage, many features, recent activity | Upsell, beta access, case studies |
| **Healthy** | 60-79 | Steady usage, core features | Feature education, check-ins |
| **At Risk** | 40-59 | Declining usage trend OR low feature adoption | Proactive outreach, training |
| **Critical** | 20-39 | Very low usage, stale heartbeats | Urgent CSM intervention |
| **Dormant** | 0-19 | No activity >30 days, or never activated | Re-engagement campaign or churn |

### 4.3 Automated Alerts

| Alert | Trigger | Recipient | Channel |
|-------|---------|-----------|---------|
| **Usage Drop** | Organization usage drops >40% month-over-month | CSM + Admin | Email + Dashboard |
| **License Expiry Warning** | License expires in <30 days | Admin + Sales | Email + Dashboard |
| **Dormant License** | No heartbeat for 14+ days | CSM | Dashboard |
| **Never Activated** | License issued >7 days ago, 0 heartbeats | Sales | Email |
| **High Error Rate** | Org error rate >10% of acquisitions | Support | Dashboard |
| **Version Lag** | Org on version >2 releases behind latest | CSM | Dashboard |
| **Health Score Drop** | Score drops from Healthy/Champion to At Risk | CSM | Email + Dashboard |
| **Bulk Expiry** | >5 licenses for same org expire within 30 days | Sales + Admin | Email |

### 4.4 Identifying Power Users (Upsell Candidates)

Query:
```sql
SELECT
    o.organization_name,
    o.license_tier,
    COUNT(DISTINCT l.hardware_fingerprint) as active_seats,
    o.total_seats,
    (COUNT(DISTINCT l.hardware_fingerprint)::float / o.total_seats) as utilization,
    SUM(h.delta_cases) as monthly_cases,
    SUM(h.delta_acquisitions) as monthly_acquisitions,
    health.score as health_score
FROM organizations o
JOIN licenses l ON l.organization_id = o.id
JOIN heartbeats h ON h.license_id = l.id
    AND h.received_at > NOW() - INTERVAL '30 days'
JOIN customer_health health ON health.organization_id = o.id
WHERE
    health.score >= 70                          -- Healthy or Champion
    AND (COUNT(DISTINCT l.hardware_fingerprint)::float / o.total_seats) > 0.85  -- Near capacity
GROUP BY o.id
ORDER BY utilization DESC, monthly_cases DESC;
```

Upsell signals:
- Seat utilization >85% (need more licenses)
- Using >7 of 10 trackable features (power users)
- High acquisition count relative to tier baseline
- Using cloud acquisition (ready for advanced tier)
- Multiple extraction types per case (thorough investigations)

---

## 5. Visualization Specifications

### 5.1 Dashboard Layout

```
+-----------------------------------------------------------+
| TIME RANGE SELECTOR  [7d] [30d] [90d] [1y] [Custom]      |
| Compare: [ ] vs previous period                            |
+-----------------------------------------------------------+
|                                                             |
| [Active   ] [MAU     ] [DAU     ] [Cases   ] [Acq.    ] [Util.  ] |
| [Licenses ] [12,345  ] [3,420   ] [48,291  ] [72,105  ] [87.3%  ] |
| [+2.1%    ] [+5.4%   ] [+1.2%   ] [+8.7%   ] [+11.2%  ] [+0.5%  ] |
| [~~~~~~~~ ] [~~~~~~~~ ] [~~~~~~~~ ] [~~~~~~~~ ] [~~~~~~~~ ] [~~~~~~ ] |
|                                                             |
+----------------------------+--------------------------------+
| USAGE TRENDS (Line Chart)  | EXTRACTION TYPE MIX            |
| Cases -- Acquisitions --   | (Stacked Area Chart)           |
| Reports -- over time       | logical / adv_logical /        |
|                            | partial / physical / ios /      |
|                            | cloud stacked over time         |
+----------------------------+--------------------------------+
| VERSION ADOPTION           | LICENSE UTILIZATION             |
| (Stacked Area Chart)       | (Gauge + Horizontal Bars)      |
| v2.3.0 ███████ 68%        | Org A: ████████░░ 80%          |
| v2.2.1 ███░░░░ 22%        | Org B: ██████████ 100%         |
| v2.1.x █░░░░░░ 10%        | Org C: ███░░░░░░░ 30%         |
+----------------------------+--------------------------------+
| CUSTOMER HEALTH MAP        | GEOGRAPHIC DISTRIBUTION         |
| (Heatmap / Treemap)        | (India map with dots/bubbles)  |
| Champions: 12 orgs         | Maharashtra: 45 instances      |
| Healthy:   28 orgs         | Delhi NCR:   38 instances      |
| At Risk:    8 orgs         | Karnataka:   22 instances      |
| Critical:   3 orgs         | Tamil Nadu:  18 instances      |
| Dormant:    5 orgs         | ...                            |
+----------------------------+--------------------------------+
| ACQUISITION SUCCESS RATE   | TOP ERRORS                      |
| (Area chart with threshold | (Horizontal bar chart)          |
|  line at 95%)              | USB_DISCONNECT: ███████ 142     |
| Shows success % over time  | STORAGE_FULL:   ████░░░  87    |
| with annotations for       | ROOT_REQUIRED:  ███░░░░  64    |
| version releases           | TIMEOUT:        ██░░░░░  41    |
+----------------------------+--------------------------------+
| REVENUE DASHBOARD          | EXPIRING LICENSES               |
| (Combo: bar + line)        | (Table with urgency coloring)   |
| Bar: Monthly revenue       | Next 7d:  ██ 3 licenses (RED)  |
| Line: Cumulative ARR       | 8-30d:    ████ 7 licenses (AMB)|
|                            | 31-90d:   ██████ 12 licenses   |
+----------------------------+--------------------------------+
```

### 5.2 Chart Specifications

#### A. Usage Trends Line Chart
- **Type**: Multi-line time series (Recharts `<LineChart>`)
- **Lines**: Cases (blue), Acquisitions (purple), Reports (green)
- **X-axis**: Date (auto-grouped: daily for 7d/30d, weekly for 90d, monthly for 1y)
- **Y-axis**: Count
- **Interaction**: Tooltip on hover, click-to-drill into specific date
- **Comparison**: When "vs previous period" is checked, overlay faded lines for prior period

#### B. Extraction Type Mix
- **Type**: Stacked area chart (Recharts `<AreaChart>`)
- **Areas**: One per extraction type, distinct colors:
  - `logical` = #3b82f6 (blue)
  - `advanced_logical` = #8b5cf6 (purple)
  - `partial_logical` = #06b6d4 (cyan)
  - `physical` = #ef4444 (red)
  - `ios_logical` = #f97316 (orange)
  - `cloud` = #22c55e (green)
- **X-axis**: Date
- **Y-axis**: Percentage (normalized to 100%) or absolute count (toggle)

#### C. Version Adoption
- **Type**: Stacked area chart (Recharts `<AreaChart>`) over time
- **Areas**: One per active version (latest 5, rest grouped as "older")
- **Goal line**: Horizontal line at 80% for latest version
- **Secondary view**: Donut chart showing current distribution

#### D. License Utilization
- **Primary**: Radial gauge (Recharts `<RadialBarChart>`) showing overall utilization
- **Detail**: Horizontal bar chart per organization
  - Bar fill = active seats / total seats
  - Color: Green (>70%), Amber (40-70%), Red (<40%)
- **Sorting**: By utilization descending (highlight underutilized)

#### E. Customer Health Map
- **Type**: Treemap (Recharts `<Treemap>`) where:
  - Size = number of licenses (bigger orgs = bigger boxes)
  - Color = health score (green = healthy, red = critical)
- **Alternative**: Horizontal segmented bar showing count per segment
- **Click**: Drill into organization detail view

#### F. Geographic Distribution
- **Type**: Choropleth map of India (using react-simple-maps or custom SVG)
  - State-level coloring based on instance count
  - Bubble overlay for city-level concentration
- **Fallback** (if map is complex): Horizontal bar chart of top 15 states/cities
- **Data source**: Derived from `os_info` locale or IP geolocation at heartbeat ingestion

#### G. Acquisition Success Rate
- **Type**: Area chart with threshold line
- **Area**: Success rate percentage over time (green fill below, red tint when below threshold)
- **Threshold line**: Horizontal dashed line at 95%
- **Annotations**: Vertical markers for version release dates

#### H. Top Errors
- **Type**: Horizontal bar chart (Recharts `<BarChart layout="vertical">`)
- **Bars**: Top 10 error codes by frequency in period
- **Color**: Severity-coded (critical = red, warning = amber, info = blue)
- **Click**: Drill into error detail showing affected organizations

#### I. Revenue Dashboard
- **Type**: Combo chart
  - Bars: Monthly new/renewal revenue
  - Line: Cumulative ARR
- **Segmentation**: Toggle by license tier (Standard/Professional/Enterprise)

#### J. Expiring Licenses Table
- **Type**: Data table with urgency coloring
- **Columns**: Organization, License Key (masked), Seats, Expires At, Days Left, Contact
- **Row color**: Red (<7d), Amber (8-30d), Yellow (31-60d), Default (61-90d)
- **Actions**: "Send Renewal Reminder" button per row

### 5.3 Time Range Controls

```typescript
interface TimeRangeSelector {
  presets: [
    { label: '7d',  value: { days: 7 } },
    { label: '30d', value: { days: 30 } },
    { label: '90d', value: { days: 90 } },
    { label: '1y',  value: { days: 365 } },
    { label: 'Custom', value: null },  // Opens date picker
  ];
  comparison: {
    enabled: boolean;           // Toggle "vs previous period"
    mode: 'previous_period'     // Auto-matches range length
        | 'previous_year'       // Same dates, prior year
        | 'custom';             // Pick comparison range
  };
  granularity: 'auto' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  // Auto rules: 7d=daily, 30d=daily, 90d=weekly, 1y=monthly
}
```

### 5.4 Export Capabilities

| Format | Contents | Use Case |
|--------|----------|----------|
| **PDF Report** | Executive summary with charts rendered as images, KPI table, health scores | Management reviews, quarterly reports |
| **CSV Data Export** | Raw metric values per period, one row per org or per day | Custom analysis in Excel/Tableau |
| **PNG/SVG Charts** | Individual chart images | Presentations, documentation |
| **Scheduled Email** | Auto-generated PDF summary | Weekly/monthly digest to stakeholders |

PDF report sections:
1. Executive Summary (KPI cards + period comparison)
2. Usage Trends (line charts)
3. Feature Adoption (pie/bar charts)
4. Customer Health Overview (treemap + segment counts)
5. License Status (utilization, expiry forecast)
6. Error Analysis (top errors, trends)
7. Recommendations (auto-generated based on health scores)

---

## 6. Data Pipeline Architecture

### 6.1 Ingestion Flow

```
CMF Desktop App                    Admin Portal Backend
+-----------------+                +-------------------+
|                 |  HTTPS POST    |                   |
| Heartbeat       |  /api/v1/      | API Gateway       |
| (every 4h)      |  heartbeat     | (rate limit:      |
|                 +--------------->| 100/hr/license)   |
|                 |                |                   |
| Event Batch     |  HTTPS POST    |         |         |
| (on flush)      |  /api/v1/      |         v         |
|                 |  events/batch  | Ingestion Queue   |
|                 +--------------->| (Redis/SQS)       |
+-----------------+                |         |         |
                                   |         v         |
                                   | Processing Worker |
                                   | - Validate        |
                                   | - Anonymize       |
                                   | - Aggregate       |
                                   |         |         |
                                   |    +----+----+    |
                                   |    |         |    |
                                   |    v         v    |
                                   | Raw Store  Agg   |
                                   | (30d TTL)  Store  |
                                   | PostgreSQL (perm) |
                                   +-------------------+
```

### 6.2 Processing Steps

1. **Receive**: Accept heartbeat/event at API gateway. Validate license_key + hardware_fingerprint.
2. **Enqueue**: Push to processing queue (decouple ingestion from processing).
3. **Validate**: Check required fields, reject malformed payloads, check for replays (idempotency key).
4. **Anonymize**: Strip or hash any PII before storage (see Section 9).
5. **Delta Calculation**: Compare cumulative counters to previous heartbeat to compute deltas.
6. **Store Raw**: Insert into `heartbeats` table with 30-day retention.
7. **Aggregate**: Update pre-computed aggregation tables:
   - `daily_metrics` (per-organization, per-day rollup)
   - `monthly_metrics` (per-organization, per-month rollup)
   - `feature_adoption` (per-organization feature flags)
   - `customer_health` (recalculated hourly)

### 6.3 Aggregation Strategy

#### Real-time Aggregations (Updated on each heartbeat)
- Active license count
- Current version distribution
- Last-seen timestamps per instance

#### Hourly Aggregations (Cron job)
- Customer health scores
- Alert evaluation (usage drops, dormant licenses)

#### Daily Aggregations (Midnight UTC cron)
- Daily case/acquisition/report totals per organization
- Daily extraction type breakdown
- Daily error summaries
- DAU calculation

#### Monthly Aggregations (1st of month cron)
- MAU calculation
- Revenue metrics (ARR, churn)
- Feature adoption percentages
- Month-over-month comparisons

### 6.4 Data Retention Policy

| Data Category | Retention | Rationale |
|---------------|-----------|-----------|
| Raw heartbeats | 30 days | Debugging, reprocessing |
| Raw events | 30 days | Debugging, reprocessing |
| Daily aggregates | 2 years | Trend analysis |
| Monthly aggregates | 5 years | Long-term business metrics |
| Customer health snapshots | 1 year (daily), 5 years (monthly) | Health trend tracking |
| License lifecycle events | Indefinite | Business records |
| Error aggregates | 1 year | Support analysis |

---

## 7. Database Schema for Analytics

### 7.1 Core Tables (PostgreSQL - Admin Portal Server)

```sql
-- Organizations (customers)
CREATE TABLE organizations (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    license_tier    TEXT NOT NULL CHECK (license_tier IN ('standard', 'professional', 'enterprise')),
    total_seats     INTEGER NOT NULL DEFAULT 1,
    contract_start  TIMESTAMPTZ,
    contract_end    TIMESTAMPTZ,
    annual_value    DECIMAL(12,2),  -- License annual value in INR
    csm_contact     TEXT,           -- Customer success manager email
    sales_contact   TEXT,
    region          TEXT,           -- e.g., "Maharashtra", "Delhi NCR"
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual licenses
CREATE TABLE licenses (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT NOT NULL REFERENCES organizations(id),
    license_key         TEXT NOT NULL UNIQUE,
    hardware_fingerprint TEXT,        -- Bound machine (nullable until activated)
    machine_name_hash   TEXT,
    user_email_hash     TEXT,         -- SHA256(email) for privacy
    status              TEXT NOT NULL DEFAULT 'issued'
                        CHECK (status IN ('issued', 'active', 'expired', 'revoked', 'suspended')),
    is_perpetual        BOOLEAN NOT NULL DEFAULT FALSE,
    activated_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    last_heartbeat_at   TIMESTAMPTZ,
    last_app_version    TEXT,
    last_os_info        TEXT,
    last_platform       TEXT,
    last_locale         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_licenses_org ON licenses(organization_id);
CREATE INDEX idx_licenses_status ON licenses(status);
CREATE INDEX idx_licenses_heartbeat ON licenses(last_heartbeat_at);
CREATE INDEX idx_licenses_expiry ON licenses(expires_at) WHERE status = 'active';

-- Raw heartbeat storage (30-day TTL)
CREATE TABLE heartbeats (
    id                      BIGSERIAL PRIMARY KEY,
    license_id              BIGINT NOT NULL REFERENCES licenses(id),
    organization_id         BIGINT NOT NULL,
    hardware_fingerprint    TEXT NOT NULL,
    app_version             TEXT NOT NULL,
    platform                TEXT,
    locale                  TEXT,

    -- Cumulative counters
    total_cases             BIGINT NOT NULL DEFAULT 0,
    total_acquisitions      BIGINT NOT NULL DEFAULT 0,
    total_reports           BIGINT NOT NULL DEFAULT 0,

    -- Delta counters (since last heartbeat)
    delta_cases             INTEGER NOT NULL DEFAULT 0,
    delta_acquisitions      INTEGER NOT NULL DEFAULT 0,
    delta_reports           INTEGER NOT NULL DEFAULT 0,

    -- Extraction breakdown (deltas)
    logical_extractions     INTEGER NOT NULL DEFAULT 0,
    advanced_logical_ext    INTEGER NOT NULL DEFAULT 0,
    partial_logical_ext     INTEGER NOT NULL DEFAULT 0,
    physical_extractions    INTEGER NOT NULL DEFAULT 0,
    ios_logical_ext         INTEGER NOT NULL DEFAULT 0,
    cloud_extractions       INTEGER NOT NULL DEFAULT 0,

    -- Performance
    avg_acq_speed_mbps      REAL,
    avg_acq_duration_secs   REAL,
    total_data_bytes        BIGINT DEFAULT 0,
    acq_success_count       INTEGER DEFAULT 0,
    acq_failure_count       INTEGER DEFAULT 0,

    -- App health
    crash_count             INTEGER DEFAULT 0,
    uptime_seconds          BIGINT DEFAULT 0,
    session_count           INTEGER DEFAULT 0,
    avg_session_duration    REAL,

    -- Feature flags (stored as JSONB for flexibility)
    features_used           JSONB DEFAULT '{}',

    -- Top errors (JSONB array)
    top_errors              JSONB DEFAULT '[]',

    received_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_timestamp        TIMESTAMPTZ
);

CREATE INDEX idx_heartbeats_license ON heartbeats(license_id);
CREATE INDEX idx_heartbeats_org ON heartbeats(organization_id);
CREATE INDEX idx_heartbeats_received ON heartbeats(received_at);

-- Partition by month for efficient cleanup
-- CREATE TABLE heartbeats_2026_03 PARTITION OF heartbeats
--     FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Daily aggregated metrics
CREATE TABLE daily_metrics (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT NOT NULL REFERENCES organizations(id),
    metric_date         DATE NOT NULL,

    -- User activity
    active_licenses     INTEGER NOT NULL DEFAULT 0,  -- Distinct heartbeats that day
    total_sessions      INTEGER NOT NULL DEFAULT 0,

    -- Work output
    cases_created       INTEGER NOT NULL DEFAULT 0,
    acquisitions        INTEGER NOT NULL DEFAULT 0,
    reports_generated   INTEGER NOT NULL DEFAULT 0,

    -- Extraction breakdown
    logical_count       INTEGER DEFAULT 0,
    advanced_logical    INTEGER DEFAULT 0,
    partial_logical     INTEGER DEFAULT 0,
    physical_count      INTEGER DEFAULT 0,
    ios_logical         INTEGER DEFAULT 0,
    cloud_count         INTEGER DEFAULT 0,

    -- Performance
    avg_acq_speed       REAL,
    total_data_bytes    BIGINT DEFAULT 0,
    success_count       INTEGER DEFAULT 0,
    failure_count       INTEGER DEFAULT 0,

    -- App health
    total_crashes       INTEGER DEFAULT 0,
    total_uptime_secs   BIGINT DEFAULT 0,

    UNIQUE(organization_id, metric_date)
);

CREATE INDEX idx_daily_org_date ON daily_metrics(organization_id, metric_date);

-- Monthly aggregated metrics
CREATE TABLE monthly_metrics (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT NOT NULL REFERENCES organizations(id),
    metric_month        DATE NOT NULL,  -- First day of month

    -- Users
    mau                 INTEGER NOT NULL DEFAULT 0,
    peak_dau            INTEGER NOT NULL DEFAULT 0,
    avg_dau             REAL NOT NULL DEFAULT 0,

    -- Work output
    cases_created       INTEGER NOT NULL DEFAULT 0,
    acquisitions        INTEGER NOT NULL DEFAULT 0,
    reports_generated   INTEGER NOT NULL DEFAULT 0,

    -- Feature adoption (percentage of active users using each)
    pct_logical         REAL DEFAULT 0,
    pct_advanced_logical REAL DEFAULT 0,
    pct_partial_logical REAL DEFAULT 0,
    pct_physical        REAL DEFAULT 0,
    pct_ios             REAL DEFAULT 0,
    pct_cloud           REAL DEFAULT 0,

    -- Performance
    avg_acq_speed       REAL,
    success_rate        REAL,  -- success / (success + failure) * 100
    total_data_bytes    BIGINT DEFAULT 0,
    total_crashes       INTEGER DEFAULT 0,

    -- Revenue
    arr_contribution    DECIMAL(12,2),

    UNIQUE(organization_id, metric_month)
);

-- Customer health score history
CREATE TABLE customer_health (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT NOT NULL REFERENCES organizations(id),
    calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Component scores (0-100)
    usage_score         REAL NOT NULL,
    engagement_score    REAL NOT NULL,
    adoption_score      REAL NOT NULL,
    recency_score       REAL NOT NULL,

    -- Composite score
    health_score        REAL NOT NULL,
    segment             TEXT NOT NULL CHECK (segment IN
                        ('champion', 'healthy', 'at_risk', 'critical', 'dormant')),

    -- Snapshot data for debugging
    mau                 INTEGER,
    dau                 INTEGER,
    cases_30d           INTEGER,
    features_used_count INTEGER,
    days_since_last     INTEGER,

    UNIQUE(organization_id, calculated_at)
);

CREATE INDEX idx_health_org ON customer_health(organization_id);
CREATE INDEX idx_health_segment ON customer_health(segment);

-- Version distribution snapshot (daily)
CREATE TABLE version_snapshots (
    id                  BIGSERIAL PRIMARY KEY,
    snapshot_date       DATE NOT NULL,
    app_version         TEXT NOT NULL,
    instance_count      INTEGER NOT NULL,
    percentage          REAL NOT NULL,
    UNIQUE(snapshot_date, app_version)
);

-- Error aggregates
CREATE TABLE error_aggregates (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT REFERENCES organizations(id),  -- NULL = global
    error_code          TEXT NOT NULL,
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    occurrence_count    INTEGER NOT NULL,
    affected_licenses   INTEGER NOT NULL,
    last_seen           TIMESTAMPTZ,
    UNIQUE(organization_id, error_code, period_start)
);

-- Alerts log
CREATE TABLE alerts (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT REFERENCES organizations(id),
    alert_type          TEXT NOT NULL,
    severity            TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    title               TEXT NOT NULL,
    details             JSONB,
    acknowledged_by     TEXT,
    acknowledged_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_org ON alerts(organization_id);
CREATE INDEX idx_alerts_unack ON alerts(acknowledged_at) WHERE acknowledged_at IS NULL;
```

### 7.2 Materialized Views for Dashboard Performance

```sql
-- Current state overview (refreshed every 5 minutes)
CREATE MATERIALIZED VIEW mv_dashboard_overview AS
SELECT
    COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active') as total_active_licenses,
    COUNT(DISTINCT l.id) FILTER (WHERE l.last_heartbeat_at > NOW() - INTERVAL '30 days') as mau,
    COUNT(DISTINCT l.id) FILTER (WHERE l.last_heartbeat_at > NOW() - INTERVAL '1 day') as dau,
    COUNT(DISTINCT l.organization_id) FILTER (WHERE l.status = 'active') as active_organizations,
    COUNT(DISTINCT l.id) FILTER (WHERE l.expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days') as expiring_30d,
    (SELECT SUM(annual_value) FROM organizations WHERE id IN (
        SELECT DISTINCT organization_id FROM licenses WHERE status = 'active'
    )) as total_arr
FROM licenses l;

-- Organization summary (refreshed every 15 minutes)
CREATE MATERIALIZED VIEW mv_org_summary AS
SELECT
    o.id as organization_id,
    o.name,
    o.license_tier,
    o.total_seats,
    COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active') as active_seats,
    MAX(l.last_heartbeat_at) as last_activity,
    MAX(l.last_app_version) as latest_version,
    ch.health_score,
    ch.segment,
    dm.cases_created as cases_30d,
    dm.acquisitions as acquisitions_30d
FROM organizations o
LEFT JOIN licenses l ON l.organization_id = o.id
LEFT JOIN LATERAL (
    SELECT health_score, segment
    FROM customer_health
    WHERE organization_id = o.id
    ORDER BY calculated_at DESC LIMIT 1
) ch ON true
LEFT JOIN LATERAL (
    SELECT SUM(cases_created) as cases_created, SUM(acquisitions) as acquisitions
    FROM daily_metrics
    WHERE organization_id = o.id AND metric_date > CURRENT_DATE - 30
) dm ON true
GROUP BY o.id, o.name, o.license_tier, o.total_seats, ch.health_score, ch.segment,
         dm.cases_created, dm.acquisitions;
```

---

## 8. API Endpoints

### 8.1 Ingestion Endpoints (Desktop App -> Server)

```
POST /api/v1/heartbeat
  Auth: License-Key header + hardware_fingerprint in body
  Body: EnhancedHeartbeatRequest
  Response: { success: bool, announcements: [], update_available: null | UpdateInfo }

POST /api/v1/events/batch
  Auth: License-Key header
  Body: { events: EventPayload[], batch_id: string }
  Response: { accepted: int, rejected: int }
```

### 8.2 Admin Portal Dashboard Endpoints

```
GET /api/v1/admin/dashboard/overview
  Query: ?range=30d&compare=previous_period
  Response: {
    kpis: { active_licenses, mau, dau, total_cases, total_acquisitions, utilization },
    kpi_deltas: { ... percentage changes ... },
    sparklines: { ... 30-point arrays ... }
  }

GET /api/v1/admin/dashboard/usage-trends
  Query: ?range=30d&granularity=daily&org_id=all
  Response: {
    series: [
      { name: 'cases', data: [{ date, value }] },
      { name: 'acquisitions', data: [...] },
      { name: 'reports', data: [...] }
    ]
  }

GET /api/v1/admin/dashboard/extraction-mix
  Query: ?range=30d&granularity=daily&mode=percentage|absolute
  Response: {
    series: [
      { name: 'logical', data: [...] },
      { name: 'advanced_logical', data: [...] },
      ...
    ]
  }

GET /api/v1/admin/dashboard/version-adoption
  Query: ?range=90d
  Response: {
    current_distribution: [{ version, count, percentage }],
    trend: [{ date, versions: { 'v2.3.0': count, ... } }]
  }

GET /api/v1/admin/dashboard/license-utilization
  Query: ?sort=utilization_desc&limit=50
  Response: {
    overall: { active, total, percentage },
    by_organization: [{ org_name, active_seats, total_seats, utilization_pct }]
  }

GET /api/v1/admin/dashboard/customer-health
  Query: ?segment=all|champion|healthy|at_risk|critical|dormant
  Response: {
    segments: { champion: count, healthy: count, ... },
    organizations: [{ org_name, health_score, segment, trend, ... }]
  }

GET /api/v1/admin/dashboard/errors
  Query: ?range=30d&org_id=all&limit=20
  Response: {
    top_errors: [{ error_code, count, affected_orgs, severity }],
    trend: [{ date, total_errors }]
  }

GET /api/v1/admin/dashboard/revenue
  Query: ?range=1y&granularity=monthly
  Response: {
    arr: number,
    monthly_revenue: [{ month, new_revenue, renewal_revenue }],
    expiring: { next_7d: count, next_30d: count, next_90d: count }
  }

GET /api/v1/admin/dashboard/geographic
  Query: ?range=30d
  Response: {
    by_state: [{ state, instance_count, org_count }],
    by_city: [{ city, state, instance_count }]
  }

GET /api/v1/admin/organizations/:id/detail
  Response: {
    organization: { ... },
    licenses: [{ ... }],
    health_history: [{ date, score }],
    usage_trend: [{ date, cases, acquisitions }],
    feature_adoption: { ... },
    alerts: [{ ... }]
  }

POST /api/v1/admin/export/pdf
  Body: { range, sections: ['overview', 'usage', 'health', ...] }
  Response: PDF binary

GET /api/v1/admin/export/csv
  Query: ?type=usage|health|licenses|errors&range=30d
  Response: CSV file download
```

---

## 9. Privacy & Compliance

### 9.1 Law Enforcement Data Sensitivity

CMF handles law enforcement forensic data. The admin portal analytics must NEVER contain:

| Data Category | Privacy Rule |
|---------------|-------------|
| **Case details** | NEVER transmitted. Desktop heartbeat sends only `cases_created` count. |
| **Evidence data** | NEVER transmitted. All evidence stays on the local machine. |
| **Suspect/victim names** | NEVER transmitted. Not part of any telemetry payload. |
| **Examiner names** | NEVER transmitted. Only `user_email_hash` (SHA256) for deduplication. |
| **FIR numbers / Court case numbers** | NEVER transmitted. Stays in local SQLite only. |
| **Device serial numbers** | NEVER transmitted. Only aggregated device platform counts. |
| **Acquisition file paths** | NEVER transmitted. Only byte counts and speed metrics. |
| **IP addresses** | Logged at ingestion for rate-limiting, then DISCARDED (not stored in analytics tables). |

### 9.2 Data Minimization Principles

1. **Aggregate, don't itemize**: The server sees "15 cases created" not "Case #CMF-2026-0042 for FIR 123/2026".
2. **Hash PII**: `user_email` -> `SHA256(user_email)` before storage. `machine_name` -> `SHA256(machine_name)`.
3. **No reverse lookup**: Hashed values cannot be reversed. Organization association is via license_key only.
4. **Minimal retention**: Raw heartbeats auto-deleted after 30 days. Only aggregates persist.
5. **Opt-out capability**: Organizations can disable telemetry (fallback to license-validation-only mode with zero usage stats).

### 9.3 Transport Security

- All heartbeat/event communication over HTTPS (TLS 1.3)
- Certificate pinning in the desktop app for the license server
- API authentication via `License-Key` header (not in URL/query params)
- Rate limiting: 100 heartbeats per hour per license (prevents abuse)
- Request signing: HMAC-SHA256(body, derived_key) to prevent tampering

### 9.4 Compliance Requirements

| Regulation | Applicability | Compliance Measure |
|------------|--------------|-------------------|
| **IT Act 2000 (India)** | Processing of government data | Data stored in India-region servers, access audit trail |
| **DPDP Act 2023 (India)** | Personal data of examiners | Email hashing, consent for telemetry, data erasure capability |
| **Government procurement rules** | B2G contracts | On-premise deployment option for analytics server, data sovereignty |
| **ISO 27001** | Information security | Encrypted at rest + transit, RBAC for admin portal, audit logging |

### 9.5 Admin Portal Access Control

| Role | Permissions |
|------|------------|
| **Super Admin** | All dashboards, all organizations, user management, export, alerts config |
| **Sales Manager** | Revenue dashboard, license management, customer health (read-only) |
| **Customer Success** | Customer health, usage trends, alerts, organization detail (assigned orgs only) |
| **Support Engineer** | Error dashboard, version adoption, performance metrics (read-only) |
| **Viewer** | Executive summary only (read-only) |

---

## 10. Implementation Recommendations

### 10.1 Technology Stack for Admin Portal

| Layer | Recommendation | Rationale |
|-------|---------------|-----------|
| **Frontend** | React + TypeScript + Tailwind + shadcn/ui | Matches CMF desktop stack; team familiarity |
| **Charts** | Recharts (already used in EnhancedDashboard.tsx) | Consistent; supports all required chart types |
| **Maps** | react-simple-maps + India TopoJSON | Lightweight, SVG-based, no external API dependency |
| **Backend API** | Rust (Actix-web or Axum) | Matches backend expertise; performance for aggregation |
| **Database** | PostgreSQL 16 with TimescaleDB extension | Time-series optimized queries, partitioning, compression |
| **Queue** | Redis Streams or Tokio channels | Lightweight; sufficient for heartbeat ingestion scale |
| **Caching** | Redis | Materialized view refresh, session management |
| **PDF Export** | wkhtmltopdf or Puppeteer | wkhtmltopdf already bundled with CMF |
| **Hosting** | AWS Mumbai (ap-south-1) or Azure Central India | Data sovereignty for Indian government contracts |

### 10.2 Phased Rollout

**Phase 1 (MVP - 4 weeks)**:
- Enhanced heartbeat payload (backward compatible with old clients)
- Core ingestion API + PostgreSQL storage
- Dashboard: KPI cards, usage trends, license utilization, version adoption
- Basic time range selector (7d, 30d, 90d)

**Phase 2 (6 weeks)**:
- Customer health scoring engine
- Health dashboard + alerts
- Extraction type analytics
- Error tracking dashboard
- CSV export

**Phase 3 (4 weeks)**:
- Revenue metrics + expiry forecasting
- Geographic distribution map
- PDF report generation
- Scheduled email digests
- Comparison mode (vs previous period)

**Phase 4 (3 weeks)**:
- Event stream ingestion (beyond heartbeat)
- Feature adoption deep-dive
- Organization detail drill-down
- Custom date range picker
- Admin portal RBAC

### 10.3 Backward Compatibility

The enhanced heartbeat must remain backward compatible:
- New fields are optional (`#[serde(default)]` in Rust)
- Old clients sending the minimal `UsageStats` still work
- Server computes `delta_*` from cumulative counters if deltas are not provided
- Feature flags default to `false` if missing
