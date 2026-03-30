import { useState, useEffect } from "react";
import {
  Users,
  UserCheck,
  Briefcase,
  Gauge,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Globe,
  MapPin,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/stores/dashboardStore";

// ---------------------------------------------------------------------------
// Time range options
// ---------------------------------------------------------------------------

type TimeRange = "7d" | "30d" | "90d" | "1y";

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "1Y", value: "1y" },
];

// ---------------------------------------------------------------------------
// Chart color constants (kept for future use when real data arrives)
// ---------------------------------------------------------------------------

const CHART_COLORS = {
  chart1: "hsl(var(--chart-1))",
  chart2: "hsl(var(--chart-2))",
  chart3: "hsl(var(--chart-3))",
  chart4: "hsl(var(--chart-4))",
  chart5: "hsl(var(--chart-5))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  destructive: "hsl(var(--destructive))",
  mutedFg: "hsl(var(--muted-foreground))",
};

// ---------------------------------------------------------------------------
// Empty state component for chart cards
// ---------------------------------------------------------------------------

interface ChartEmptyStateProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  height?: string;
}

function ChartEmptyState({
  icon: Icon,
  title,
  subtitle = "Analytics will appear as users send heartbeats",
  height = "h-72",
}: ChartEmptyStateProps) {
  return (
    <div className={cn("flex items-center justify-center", height)}>
      <div className="flex flex-col items-center text-center text-[hsl(var(--muted-foreground))]">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--muted)/0.5)]">
          <Icon className="h-7 w-7 opacity-40" />
        </div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 max-w-[220px] text-xs opacity-60 leading-relaxed">{subtitle}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const { stats, isLoading, fetchStats } = useDashboardStore();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Derive KPI values from dashboard stats (or default to empty)
  const totalActiveLicenses = stats?.totalActiveLicenses ?? 0;
  const totalOrganizations = stats?.totalOrganizations ?? 0;
  const activeTrials = stats?.activeTrials ?? 0;
  const trialConversionRate = stats?.trialConversionRate ?? 0;

  // Check if we have any meaningful chart data
  const hasActivationsData = (stats?.activationsOverTime?.length ?? 0) > 0;
  const hasTierData = (stats?.licensesByTier?.length ?? 0) > 0;
  const hasStatusData = (stats?.licensesByStatus?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Analytics
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Platform usage intelligence and adoption metrics.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => setTimeRange(tr.value)}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
                timeRange === tr.value
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-md ring-1 ring-[hsl(var(--primary)/0.3)]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
              )}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* KPI Row */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Active Licenses */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Active Licenses
                </p>
                <p className="text-2xl font-bold text-[hsl(var(--foreground))]">
                  {isLoading ? "--" : totalActiveLicenses}
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Across all tiers
                </p>
              </div>
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: `${CHART_COLORS.chart1}20` }}
              >
                <Users className="h-5 w-5" style={{ color: CHART_COLORS.chart1 }} />
              </div>
            </div>
            <div
              className="absolute bottom-0 left-0 h-0.5 w-full opacity-60"
              style={{ backgroundColor: CHART_COLORS.chart1 }}
            />
          </CardContent>
        </Card>

        {/* Organizations */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Organizations
                </p>
                <p className="text-2xl font-bold text-[hsl(var(--foreground))]">
                  {isLoading ? "--" : totalOrganizations}
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Registered organizations
                </p>
              </div>
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: `${CHART_COLORS.chart2}20` }}
              >
                <UserCheck className="h-5 w-5" style={{ color: CHART_COLORS.chart2 }} />
              </div>
            </div>
            <div
              className="absolute bottom-0 left-0 h-0.5 w-full opacity-60"
              style={{ backgroundColor: CHART_COLORS.chart2 }}
            />
          </CardContent>
        </Card>

        {/* Active Trials */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Active Trials
                </p>
                <p className="text-2xl font-bold text-[hsl(var(--foreground))]">
                  {isLoading ? "--" : activeTrials}
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  In-progress evaluations
                </p>
              </div>
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: `${CHART_COLORS.chart3}20` }}
              >
                <Briefcase className="h-5 w-5" style={{ color: CHART_COLORS.chart3 }} />
              </div>
            </div>
            <div
              className="absolute bottom-0 left-0 h-0.5 w-full opacity-60"
              style={{ backgroundColor: CHART_COLORS.chart3 }}
            />
          </CardContent>
        </Card>

        {/* Trial Conversion Rate */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5 w-full pr-14">
                <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Trial Conversion
                </p>
                <p className="text-2xl font-bold text-[hsl(var(--foreground))]">
                  {isLoading ? "--" : `${trialConversionRate}%`}
                </p>
                {/* Conversion bar */}
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{
                      width: `${trialConversionRate}%`,
                      background: `linear-gradient(90deg, ${CHART_COLORS.chart2}, ${CHART_COLORS.chart1})`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  Trial to paid conversion
                </p>
              </div>
              <div
                className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: `${CHART_COLORS.chart4}20` }}
              >
                <Gauge className="h-5 w-5" style={{ color: CHART_COLORS.chart4 }} />
              </div>
            </div>
            <div
              className="absolute bottom-0 left-0 h-0.5 w-full opacity-60"
              style={{ backgroundColor: CHART_COLORS.chart4 }}
            />
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Charts Grid */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---- Usage Trends ---- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Usage Trends</CardTitle>
          </CardHeader>
          <CardContent>
            {hasActivationsData ? (
              <div className="h-72">
                {/* TODO: Render real AreaChart with stats.activationsOverTime data */}
                <div className="flex items-center justify-center h-full text-sm text-[hsl(var(--muted-foreground))]">
                  <div className="text-center">
                    <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>{stats!.activationsOverTime.length} data points available</p>
                    <p className="text-xs mt-1 opacity-75">Chart rendering available when recharts is connected</p>
                  </div>
                </div>
              </div>
            ) : (
              <ChartEmptyState
                icon={BarChart3}
                title="No usage data yet"
              />
            )}
          </CardContent>
        </Card>

        {/* ---- Extraction Type Distribution ---- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Extraction Type Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartEmptyState
              icon={BarChart3}
              title="No extraction data yet"
              subtitle="Data will populate as devices are processed"
            />
          </CardContent>
        </Card>

        {/* ---- License Distribution by Tier ---- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">License Distribution by Tier</CardTitle>
          </CardHeader>
          <CardContent>
            {hasTierData ? (
              <div className="space-y-4 py-4">
                {stats!.licensesByTier.map((item, idx) => {
                  const total = stats!.licensesByTier.reduce((sum, t) => sum + t.count, 0) || 1;
                  const pct = (item.count / total) * 100;
                  const colors = [CHART_COLORS.chart1, CHART_COLORS.chart2, CHART_COLORS.chart3, CHART_COLORS.chart4, CHART_COLORS.chart5];
                  const barColor = colors[idx % colors.length];
                  const tierLabel = item.tier.charAt(0).toUpperCase() + item.tier.slice(1);
                  return (
                    <div key={item.tier} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: barColor }}
                          />
                          <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                            {tierLabel}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                            {item.count}
                          </span>
                          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                            ({pct.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max(pct, 3)}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <ChartEmptyState
                icon={PieChartIcon}
                title="No license data yet"
                subtitle="Tier breakdown will appear as licenses are issued"
              />
            )}
          </CardContent>
        </Card>

        {/* ---- License Status Breakdown ---- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              License Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasStatusData ? (
              <div className="space-y-4 py-4">
                {stats!.licensesByStatus.map((item) => {
                  const total = stats!.licensesByStatus.reduce((sum, s) => sum + s.count, 0) || 1;
                  const pct = (item.count / total) * 100;
                  const color =
                    item.status === "active" ? CHART_COLORS.success
                    : item.status === "expired" ? CHART_COLORS.destructive
                    : item.status === "suspended" ? CHART_COLORS.warning
                    : item.status === "issued" ? CHART_COLORS.chart2
                    : CHART_COLORS.chart3;
                  const statusLabel = item.status.charAt(0).toUpperCase() + item.status.slice(1);
                  return (
                    <div key={item.status} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                            {statusLabel}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                            {item.count}
                          </span>
                          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                            ({pct.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max(pct, 3)}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <ChartEmptyState
                icon={PieChartIcon}
                title="No status data yet"
                subtitle="Status distribution will appear as licenses are managed"
              />
            )}
          </CardContent>
        </Card>

        {/* ---- Daily Active Users ---- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Daily Active Users
              <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">
                Last 30 days
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartEmptyState
              icon={Activity}
              title="No daily activity data yet"
              subtitle="Analytics will appear as users send heartbeats"
            />
          </CardContent>
        </Card>

        {/* ---- Customer Health Distribution ---- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Customer Health Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartEmptyState
              icon={PieChartIcon}
              title="No health data yet"
              subtitle="Customer health scores will be calculated from usage patterns"
            />
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Geographic Distribution - Placeholder */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Geographic Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--muted))]">
              <Globe className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
            </div>
            <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <MapPin className="h-4 w-4" />
              <span className="text-sm font-medium">Interactive Map</span>
            </div>
            <p className="mt-2 max-w-md text-center text-xs text-[hsl(var(--muted-foreground))]">
              Geographic heatmap showing deployment density will be available in
              a future update.
            </p>
            <div className="mt-4 rounded-md bg-[hsl(var(--primary)/0.1)] px-3 py-1.5">
              <span className="text-xs font-semibold text-[hsl(var(--primary))]">
                Coming Soon
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
