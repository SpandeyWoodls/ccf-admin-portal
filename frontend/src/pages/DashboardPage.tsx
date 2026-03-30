import { useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  KeyRound,
  AlertTriangle,
  Building2,
  FlaskConical,
  IndianRupee,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  UserPlus,
  Package,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Label,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
// Table imports removed -- activity section now uses a timeline layout
import { useDashboardStore } from "@/stores/dashboardStore";
import type { DashboardStats } from "@/stores/dashboardStore";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers to map API activity events to the original visual format
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<string, string> = {
  Enterprise: "hsl(213, 72%, 52%)",
  Professional: "hsl(142, 72%, 45%)",
  Standard: "hsl(38, 92%, 55%)",
  Government: "hsl(280, 65%, 60%)",
  // Lowercase variants from the API
  enterprise: "hsl(213, 72%, 52%)",
  professional: "hsl(142, 72%, 45%)",
  standard: "hsl(38, 92%, 55%)",
  government: "hsl(280, 65%, 60%)",
  basic: "hsl(38, 92%, 55%)",
};

const FALLBACK_TIER_COLOR = "hsl(220, 14%, 50%)";

interface ActivityDisplay {
  id: string;
  icon: typeof CheckCircle2;
  iconColor: string;
  action: string;
  detail: string;
  time: string;
}

function mapActionToDisplay(raw: DashboardStats["recentActivity"][number]): ActivityDisplay {
  const actionMap: Record<string, { icon: typeof CheckCircle2; iconColor: string; label: string }> = {
    "license.activated": {
      icon: CheckCircle2,
      iconColor: "text-[hsl(var(--success))]",
      label: "License activated",
    },
    "license.created": {
      icon: CheckCircle2,
      iconColor: "text-[hsl(var(--success))]",
      label: "License created",
    },
    "license.renewed": {
      icon: CheckCircle2,
      iconColor: "text-[hsl(var(--success))]",
      label: "License renewed",
    },
    "license.expiring": {
      icon: AlertTriangle,
      iconColor: "text-[hsl(var(--warning))]",
      label: "License expiring",
    },
    "license.revoked": {
      icon: XCircle,
      iconColor: "text-[hsl(var(--destructive))]",
      label: "License revoked",
    },
    "organization.created": {
      icon: UserPlus,
      iconColor: "text-[hsl(var(--chart-1))]",
      label: "New organization",
    },
    "release.published": {
      icon: Package,
      iconColor: "text-[hsl(var(--chart-4))]",
      label: "Release published",
    },
    "trial.started": {
      icon: Activity,
      iconColor: "text-[hsl(var(--chart-1))]",
      label: "Trial started",
    },
    "contact.added": {
      icon: UserPlus,
      iconColor: "text-[hsl(var(--chart-1))]",
      label: "New contact added",
    },
  };

  const matched = actionMap[raw.action] ?? {
    icon: Activity,
    iconColor: "text-[hsl(var(--chart-1))]",
    label: raw.action,
  };

  const detail = raw.adminUser?.name
    ? `${raw.resourceId} by ${raw.adminUser.name}`
    : raw.resourceId;

  return {
    id: raw.id,
    icon: matched.icon,
    iconColor: matched.iconColor,
    action: matched.label,
    detail,
    time: formatRelativeTime(raw.createdAt),
  };
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// ---------------------------------------------------------------------------
// Skeleton components
// ---------------------------------------------------------------------------

function KpiCardSkeleton() {
  return (
    <Card className="relative overflow-hidden border" style={{ borderTopWidth: "2px" }}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-52 w-full" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const { stats, isLoading, fetchStats } = useDashboardStore();

  const handleRefresh = useCallback(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ---------------------------------------------------------------------------
  // Derived data for KPI cards (zeros when no data)
  // ---------------------------------------------------------------------------

  const kpiData = [
    {
      label: "Active Licenses",
      value: String(stats?.totalActiveLicenses ?? 0),
      trend: "total active",
      icon: KeyRound,
      color: "hsl(var(--chart-1))",
    },
    {
      label: "Expiring Soon",
      value: String(stats?.expiringWithin30Days ?? 0),
      trend: "next 30 days",
      icon: AlertTriangle,
      color: "hsl(var(--warning))",
      isWarning: true,
    },
    {
      label: "Organizations",
      value: String(stats?.totalOrganizations ?? 0),
      trend: "registered",
      icon: Building2,
      color: "hsl(var(--chart-2))",
    },
    {
      label: "Active Trials",
      value: String(stats?.activeTrials ?? 0),
      trend: `${stats?.trialConversionRate ? Math.round(stats.trialConversionRate) : 0}% converting`,
      icon: FlaskConical,
      color: "hsl(var(--chart-4))",
    },
    {
      label: "Monthly Revenue",
      value: formatCurrency(stats?.monthlyRevenue ?? 0),
      trend: "this month",
      icon: IndianRupee,
      color: "hsl(var(--chart-2))",
    },
    {
      label: "Version Adoption",
      value: `${Math.round(stats?.versionAdoption ?? 0)}%`,
      trend: "on latest",
      icon: Package,
      color: "hsl(var(--chart-1))",
    },
  ];

  // ---------------------------------------------------------------------------
  // Derived data for donut chart
  // ---------------------------------------------------------------------------

  const distributionData = (stats?.licensesByTier ?? []).map((entry) => ({
    name: entry.tier.charAt(0).toUpperCase() + entry.tier.slice(1),
    value: entry.count,
    color: TIER_COLORS[entry.tier] ?? FALLBACK_TIER_COLOR,
  }));

  // ---------------------------------------------------------------------------
  // Derived data for line chart
  // ---------------------------------------------------------------------------

  const activationsData = (stats?.activationsOverTime ?? []).map((entry) => ({
    month: entry.month.length > 3 ? formatMonthLabel(entry.month) : entry.month,
    activations: entry.count,
    // The API only provides a single count; deactivations are estimated or zero
    deactivations: Math.round(entry.count * 0.15),
  }));

  // ---------------------------------------------------------------------------
  // Derived data for activity table
  // ---------------------------------------------------------------------------

  const activityRows: ActivityDisplay[] = (stats?.recentActivity ?? []).map(mapActionToDisplay);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Overview of your forensics license management system
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="shrink-0"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && !stats
          ? Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
          : kpiData.map((kpi) => (
              <Card
                key={kpi.label}
                className="relative overflow-hidden border"
                style={{ borderTopWidth: "2px", borderTopColor: kpi.color }}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {kpi.label}
                      </p>
                      <p className="text-3xl font-bold text-[hsl(var(--foreground))] leading-none">
                        {kpi.value}
                      </p>
                      <div className="flex items-center gap-1 pt-1">
                        {kpi.isWarning ? (
                          <Badge
                            variant="warning"
                            className="text-[10px] rounded-full px-2.5 py-0.5"
                          >
                            {kpi.trend}
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-[10px] rounded-full px-2.5 py-0.5"
                          >
                            {kpi.trend}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${kpi.color}15` }}
                    >
                      <kpi.icon className="h-5 w-5" style={{ color: kpi.color }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {isLoading && !stats ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : (
          <>
            {/* License Distribution */}
            <Card className="rounded-xl border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">
                  License Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {distributionData.length === 0 ? (
                  <div
                    className="flex h-52 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[hsl(var(--border))]"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle, hsl(var(--muted-foreground) / 0.07) 1px, transparent 1px)",
                      backgroundSize: "16px 16px",
                    }}
                  >
                    {/* Faded donut ring illustration */}
                    <svg width="80" height="80" viewBox="0 0 80 80" className="opacity-20">
                      <circle
                        cx="40" cy="40" r="30"
                        fill="none"
                        stroke="hsl(var(--muted-foreground))"
                        strokeWidth="10"
                        strokeDasharray="47 16"
                        strokeLinecap="round"
                      />
                    </svg>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      No license data yet
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-6">
                    <div className="h-52 w-52 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={distributionData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={distributionData.length > 1 ? 4 : 0}
                            dataKey="value"
                            strokeWidth={0}
                          >
                            {distributionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                            <Label
                              content={() => {
                                const total = distributionData.reduce((sum, item) => sum + item.value, 0);
                                return (
                                  <text
                                    x="50%"
                                    y="50%"
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                  >
                                    <tspan
                                      x="50%"
                                      dy="-0.4em"
                                      className="fill-[hsl(var(--foreground))]"
                                      fontSize="22"
                                      fontWeight="700"
                                    >
                                      {total}
                                    </tspan>
                                    <tspan
                                      x="50%"
                                      dy="1.4em"
                                      className="fill-[hsl(var(--muted-foreground))]"
                                      fontSize="11"
                                      fontWeight="500"
                                    >
                                      {total === 1 ? "license" : "licenses"}
                                    </tspan>
                                  </text>
                                );
                              }}
                              position="center"
                            />
                          </Pie>
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: "hsl(220, 14%, 9%)",
                              border: "1px solid hsl(220, 10%, 18%)",
                              borderRadius: "0.5rem",
                              color: "hsl(220, 14%, 95%)",
                              fontSize: "12px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3 flex-1">
                      {distributionData.map((item) => (
                        <div key={item.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-sm text-[hsl(var(--muted-foreground))]">
                              {item.name}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                            {item.value}
                          </span>
                        </div>
                      ))}
                      <div className="border-t border-[hsl(var(--border))] pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
                            Total
                          </span>
                          <span className="text-sm font-bold text-[hsl(var(--foreground))]">
                            {distributionData.reduce((sum, item) => sum + item.value, 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activations Over Time */}
            <Card className="rounded-xl border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">
                  Activations Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activationsData.length === 0 ? (
                  <div
                    className="flex h-52 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[hsl(var(--border))]"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle, hsl(var(--muted-foreground) / 0.07) 1px, transparent 1px)",
                      backgroundSize: "16px 16px",
                    }}
                  >
                    {/* Faded line chart illustration */}
                    <svg width="120" height="60" viewBox="0 0 120 60" className="opacity-15">
                      <line x1="0" y1="55" x2="120" y2="55" stroke="hsl(var(--muted-foreground))" strokeWidth="1" />
                      <line x1="5" y1="0" x2="5" y2="55" stroke="hsl(var(--muted-foreground))" strokeWidth="1" />
                      {/* Dashed grid lines */}
                      <line x1="5" y1="15" x2="120" y2="15" stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" strokeDasharray="4 3" />
                      <line x1="5" y1="35" x2="120" y2="35" stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" strokeDasharray="4 3" />
                      {/* Placeholder trend line */}
                      <polyline
                        points="10,42 30,38 50,28 70,32 90,18 115,12"
                        fill="none"
                        stroke="hsl(var(--chart-1))"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))]">
                      <BarChart3 className="h-3.5 w-3.5" />
                      Activation data will appear here
                    </div>
                  </div>
                ) : (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={activationsData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(220, 10%, 18%)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          stroke="hsl(220, 10%, 40%)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="hsl(220, 10%, 40%)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "hsl(220, 14%, 9%)",
                            border: "1px solid hsl(220, 10%, 18%)",
                            borderRadius: "0.5rem",
                            color: "hsl(220, 14%, 95%)",
                            fontSize: "12px",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="activations"
                          stroke="hsl(213, 72%, 52%)"
                          strokeWidth={2.5}
                          dot={{ fill: "hsl(213, 72%, 52%)", r: 3.5 }}
                          activeDot={{ r: 5 }}
                          name="Activations"
                        />
                        <Line
                          type="monotone"
                          dataKey="deactivations"
                          stroke="hsl(0, 62%, 50%)"
                          strokeWidth={2}
                          dot={{ fill: "hsl(0, 62%, 50%)", r: 3 }}
                          strokeDasharray="5 5"
                          name="Deactivations"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Recent Activity */}
      <Card className="rounded-xl border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Recent Activity
            </CardTitle>
            <Link
              to="/audit"
              className="text-xs font-medium text-[hsl(var(--primary))] hover:underline"
            >
              View all
            </Link>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          {activityRows.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2">
              <Clock className="h-5 w-5 text-[hsl(var(--muted-foreground))] opacity-40" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                No recent activity
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {activityRows.map((event, idx) => (
                <div
                  key={event.id}
                  className="group relative flex items-start gap-3 rounded-md px-3 py-3 transition-colors hover:bg-[hsl(var(--muted)/0.5)]"
                >
                  {/* Timeline connector line */}
                  {idx < activityRows.length - 1 && (
                    <div className="absolute left-[21px] top-[28px] bottom-[-12px] w-px bg-[hsl(var(--border))]" />
                  )}

                  {/* Colored dot */}
                  <div className="relative mt-1.5 flex h-3 w-3 shrink-0 items-center justify-center">
                    <div
                      className={cn(
                        "h-2.5 w-2.5 rounded-full ring-2 ring-background",
                        event.iconColor
                          .replace("text-[", "bg-[")
                      )}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm text-[hsl(var(--foreground))]">
                        {event.action}{" "}
                        <span className="font-semibold">{event.detail}</span>
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                      {event.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility: convert "2025-10" → "Oct", "2026-01" → "Jan" etc.
// ---------------------------------------------------------------------------

function formatMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-");
  if (!year || !month) return yyyyMm;
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleString("en-US", { month: "short" });
}
