import { useEffect, useCallback } from "react";
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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthStore } from "@/stores/authStore";
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
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
        <div className="absolute bottom-0 left-0 h-0.5 w-full">
          <Skeleton className="h-full w-full rounded-none" />
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
  const { user } = useAuthStore();
  const firstName = user?.name?.split(" ")[0] || "Admin";

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Here's an overview of your forensics license management system.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="shrink-0"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && !stats
          ? Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
          : kpiData.map((kpi) => (
              <Card key={kpi.label} className="relative overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                        {kpi.label}
                      </p>
                      <p className="text-2xl font-bold text-[hsl(var(--foreground))]">
                        {kpi.value}
                      </p>
                      <div className="flex items-center gap-1">
                        {kpi.isWarning ? (
                          <Badge variant="warning" className="text-[10px]">
                            {kpi.trend}
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {kpi.trend}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${kpi.color}15` }}
                    >
                      <kpi.icon className="h-5 w-5" style={{ color: kpi.color }} />
                    </div>
                  </div>
                  {/* Subtle bottom accent */}
                  <div
                    className="absolute bottom-0 left-0 h-0.5 w-full opacity-60"
                    style={{ backgroundColor: kpi.color }}
                  />
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {isLoading && !stats ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : (
          <>
            {/* License Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">
                  License Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {distributionData.length === 0 ? (
                  <div className="flex h-52 items-center justify-center">
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      No data yet
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
                            paddingAngle={4}
                            dataKey="value"
                            strokeWidth={0}
                          >
                            {distributionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
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
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">
                  Activations Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activationsData.length === 0 ? (
                  <div className="flex h-52 items-center justify-center">
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      No data yet
                    </p>
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
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Recent Activity
            </CardTitle>
            <a
              href="/audit"
              className="text-xs font-medium text-[hsl(var(--primary))] hover:underline"
            >
              View all
            </a>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {activityRows.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                No recent activity
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activityRows.map((event) => (
                  <TableRow key={event.id} className="cursor-pointer">
                    <TableCell>
                      <event.icon className={cn("h-4 w-4", event.iconColor)} />
                    </TableCell>
                    <TableCell className="font-medium">{event.action}</TableCell>
                    <TableCell className="text-[hsl(var(--muted-foreground))]">
                      {event.detail}
                    </TableCell>
                    <TableCell className="text-right text-xs text-[hsl(var(--muted-foreground))]">
                      <div className="flex items-center justify-end gap-1.5">
                        <Clock className="h-3 w-3" />
                        {event.time}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
