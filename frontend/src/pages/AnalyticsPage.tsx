import { useState, useEffect, useRef, useLayoutEffect } from "react";
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
// Animated segmented control for time range
// ---------------------------------------------------------------------------

function TimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderStyle, setSliderStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector(
      `[data-value="${value}"]`
    ) as HTMLButtonElement | null;
    if (!activeBtn) return;
    setSliderStyle({
      width: activeBtn.offsetWidth,
      left: activeBtn.offsetLeft,
    });
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-0.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] p-1"
    >
      {/* Animated sliding background */}
      <div
        className="absolute top-1 h-[calc(100%-8px)] rounded-md bg-[hsl(var(--primary))] shadow-lg shadow-[hsl(var(--primary)/0.25)] transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
        style={sliderStyle}
      />
      {TIME_RANGES.map((tr) => (
        <button
          key={tr.value}
          data-value={tr.value}
          onClick={() => onChange(tr.value)}
          className={cn(
            "relative z-10 rounded-md px-4 py-1.5 text-xs font-semibold transition-colors duration-200",
            value === tr.value
              ? "text-[hsl(var(--primary-foreground))]"
              : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          )}
        >
          {tr.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG placeholder illustrations for empty charts
// ---------------------------------------------------------------------------

function AreaChartPlaceholder() {
  return (
    <svg viewBox="0 0 400 160" className="w-full h-full opacity-[0.08]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0,140 Q50,120 100,100 T200,70 T300,90 T400,50 L400,160 L0,160 Z" fill="url(#areaGrad)" />
      <path d="M0,140 Q50,120 100,100 T200,70 T300,90 T400,50" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" />
    </svg>
  );
}

function BarChartPlaceholder() {
  return (
    <svg viewBox="0 0 400 160" className="w-full h-full opacity-[0.08]" preserveAspectRatio="none">
      {[40, 90, 130, 70, 110, 55, 100, 80, 120, 60].map((h, i) => (
        <rect
          key={i}
          x={i * 40 + 4}
          y={160 - h}
          width="32"
          height={h}
          rx="4"
          fill="hsl(var(--primary))"
        />
      ))}
    </svg>
  );
}

function PieChartPlaceholder() {
  return (
    <svg viewBox="0 0 160 160" className="w-24 h-24 opacity-[0.08]">
      <circle cx="80" cy="80" r="70" fill="none" stroke="hsl(var(--primary))" strokeWidth="24" strokeDasharray="110 330" strokeDashoffset="0" />
      <circle cx="80" cy="80" r="70" fill="none" stroke="hsl(var(--chart-2))" strokeWidth="24" strokeDasharray="88 352" strokeDashoffset="-110" />
      <circle cx="80" cy="80" r="70" fill="none" stroke="hsl(var(--chart-3))" strokeWidth="24" strokeDasharray="66 374" strokeDashoffset="-198" />
      <circle cx="80" cy="80" r="70" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="24" strokeDasharray="176 264" strokeDashoffset="-264" />
    </svg>
  );
}

function ActivityChartPlaceholder() {
  return (
    <svg viewBox="0 0 400 160" className="w-full h-full opacity-[0.08]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity="0.5" />
          <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0,130 L40,110 L80,120 L120,80 L160,90 L200,60 L240,70 L280,40 L320,55 L360,30 L400,45 L400,160 L0,160 Z" fill="url(#actGrad)" />
      <path d="M0,130 L40,110 L80,120 L120,80 L160,90 L200,60 L240,70 L280,40 L320,55 L360,30 L400,45" fill="none" stroke="hsl(var(--chart-2))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {[0, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400].map((x, i) => {
        const ys = [130, 110, 120, 80, 90, 60, 70, 40, 55, 30, 45];
        return <circle key={i} cx={x} cy={ys[i]} r="4" fill="hsl(var(--chart-2))" />;
      })}
    </svg>
  );
}

type PlaceholderType = "area" | "bar" | "pie" | "activity";

const placeholderMap: Record<PlaceholderType, React.FC> = {
  area: AreaChartPlaceholder,
  bar: BarChartPlaceholder,
  pie: PieChartPlaceholder,
  activity: ActivityChartPlaceholder,
};

// ---------------------------------------------------------------------------
// Empty state component for chart cards
// ---------------------------------------------------------------------------

interface ChartEmptyStateProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  height?: string;
  placeholder?: PlaceholderType;
}

function ChartEmptyState({
  icon: Icon,
  title,
  subtitle = "Analytics will appear as users send heartbeats",
  height = "h-72",
  placeholder = "bar",
}: ChartEmptyStateProps) {
  const Illustration = placeholderMap[placeholder];
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-[hsl(var(--border)/0.5)] bg-[hsl(var(--muted)/0.1)]", height)}>
      {/* Background SVG illustration */}
      <div className="absolute inset-0 flex items-end">
        <Illustration />
      </div>
      {/* Content overlay */}
      <div className="relative z-10 flex flex-col items-center text-center px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--muted)/0.9)] backdrop-blur-sm">
          <Icon className="h-7 w-7 text-[hsl(var(--muted-foreground)/0.6)]" />
        </div>
        <p className="mt-3 text-sm font-medium text-[hsl(var(--muted-foreground))]">{title}</p>
        <p className="mt-1.5 max-w-xs text-xs text-[hsl(var(--muted-foreground)/0.5)] leading-relaxed">{subtitle}</p>
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
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            Analytics
          </h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Platform usage intelligence and adoption metrics.
          </p>
        </div>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* KPI Row */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Active Licenses */}
        <Card className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{ background: `linear-gradient(135deg, ${CHART_COLORS.chart1}, transparent 70%)` }}
          />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Active Licenses
                </p>
                <p className="text-3xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">
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
              className="absolute bottom-0 left-0 h-[3px] w-full rounded-b-sm"
              style={{ background: `linear-gradient(90deg, ${CHART_COLORS.chart1}, ${CHART_COLORS.chart1}66)` }}
            />
          </CardContent>
        </Card>

        {/* Organizations */}
        <Card className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{ background: `linear-gradient(135deg, ${CHART_COLORS.chart2}, transparent 70%)` }}
          />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Organizations
                </p>
                <p className="text-3xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">
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
              className="absolute bottom-0 left-0 h-[3px] w-full rounded-b-sm"
              style={{ background: `linear-gradient(90deg, ${CHART_COLORS.chart2}, ${CHART_COLORS.chart2}66)` }}
            />
          </CardContent>
        </Card>

        {/* Active Trials */}
        <Card className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{ background: `linear-gradient(135deg, ${CHART_COLORS.chart3}, transparent 70%)` }}
          />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Active Trials
                </p>
                <p className="text-3xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">
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
              className="absolute bottom-0 left-0 h-[3px] w-full rounded-b-sm"
              style={{ background: `linear-gradient(90deg, ${CHART_COLORS.chart3}, ${CHART_COLORS.chart3}66)` }}
            />
          </CardContent>
        </Card>

        {/* Trial Conversion Rate */}
        <Card className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{ background: `linear-gradient(135deg, ${CHART_COLORS.chart4}, transparent 70%)` }}
          />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1 w-full pr-14">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Trial Conversion
                </p>
                <p className="text-3xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">
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
              className="absolute bottom-0 left-0 h-[3px] w-full rounded-b-sm"
              style={{ background: `linear-gradient(90deg, ${CHART_COLORS.chart4}, ${CHART_COLORS.chart4}66)` }}
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
              <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[hsl(var(--border)/0.5)] bg-[hsl(var(--muted)/0.1)]">
                <div className="absolute inset-0 flex items-end">
                  <AreaChartPlaceholder />
                </div>
                <div className="relative z-10 flex flex-col items-center text-center px-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--muted)/0.9)] backdrop-blur-sm">
                    <TrendingUp className="h-7 w-7 text-[hsl(var(--muted-foreground)/0.6)]" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-[hsl(var(--muted-foreground))]">{stats!.activationsOverTime.length} data points available</p>
                  <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground)/0.5)]">Chart rendering available when recharts is connected</p>
                </div>
              </div>
            ) : (
              <ChartEmptyState
                icon={BarChart3}
                title="No usage data yet"
                placeholder="area"
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
              placeholder="bar"
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
              <div className="space-y-3.5 py-4">
                {stats!.licensesByTier.map((item, idx) => {
                  const total = stats!.licensesByTier.reduce((sum, t) => sum + t.count, 0) || 1;
                  const pct = (item.count / total) * 100;
                  const colors = [CHART_COLORS.chart1, CHART_COLORS.chart2, CHART_COLORS.chart3, CHART_COLORS.chart4, CHART_COLORS.chart5];
                  const barColor = colors[idx % colors.length];
                  const tierLabel = item.tier.charAt(0).toUpperCase() + item.tier.slice(1);
                  const showLabelInside = pct >= 20;
                  return (
                    <div key={item.tier} className="space-y-1.5">
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
                        {!showLabelInside && (
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                              {item.count}
                            </span>
                            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                              ({pct.toFixed(0)}%)
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="relative h-7 w-full overflow-hidden rounded-full bg-[hsl(var(--muted)/0.5)]">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max(pct, 4)}%`,
                            background: `linear-gradient(90deg, ${barColor}, ${barColor}99)`,
                          }}
                        />
                        {showLabelInside && (
                          <span className="absolute inset-y-0 left-3 flex items-center text-[11px] font-bold text-white drop-shadow-sm">
                            {tierLabel} &middot; {item.count} ({pct.toFixed(0)}%)
                          </span>
                        )}
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
                placeholder="pie"
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
              <div className="space-y-3.5 py-4">
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
                  const showLabelInside = pct >= 20;
                  return (
                    <div key={item.status} className="space-y-1.5">
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
                        {!showLabelInside && (
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                              {item.count}
                            </span>
                            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                              ({pct.toFixed(0)}%)
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="relative h-7 w-full overflow-hidden rounded-full bg-[hsl(var(--muted)/0.5)]">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max(pct, 4)}%`,
                            background: `linear-gradient(90deg, ${color}, ${color}99)`,
                          }}
                        />
                        {showLabelInside && (
                          <span className="absolute inset-y-0 left-3 flex items-center text-[11px] font-bold text-white drop-shadow-sm">
                            {statusLabel} &middot; {item.count} ({pct.toFixed(0)}%)
                          </span>
                        )}
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
                placeholder="pie"
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
              placeholder="activity"
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
              placeholder="pie"
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
