import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  ScrollText,
  Monitor,
  User,
  Shield,
  Plus,
  Pencil,
  Trash2,
  LogIn,
  Cpu,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuditStore } from "@/stores/auditStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  id: number;
  action: string;
  resourceType: string;
  resourceId: string;
  adminUser: { name: string } | null;
  ipAddress: string;
  userAgent: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: string;
}

// No mock data -- page uses useAuditStore for real data

// ---------------------------------------------------------------------------
// Action badge color configuration
// ---------------------------------------------------------------------------

type ActionCategory = "create" | "update" | "delete" | "auth" | "system";

const ACTION_CATEGORIES: Record<string, ActionCategory> = {
  license_created: "create",
  org_created: "create",
  announcement_created: "create",
  trial_approved: "create",
  release_published: "create",
  license_activated: "update",
  license_renewed: "update",
  org_updated: "update",
  license_revoked: "delete",
  license_suspended: "delete",
  user_login: "auth",
  user_logout: "auth",
  heartbeat_received: "system",
};

const CATEGORY_STYLES: Record<
  ActionCategory,
  { bg: string; text: string; border: string; label: string; icon: typeof Plus }
> = {
  create: {
    bg: "bg-[hsl(var(--success)/0.1)]",
    text: "text-[hsl(var(--success))]",
    border: "border-[hsl(var(--success)/0.2)]",
    label: "Create",
    icon: Plus,
  },
  update: {
    bg: "bg-[hsl(210_100%_50%/0.1)]",
    text: "text-[hsl(210_100%_50%)]",
    border: "border-[hsl(210_100%_50%/0.2)]",
    label: "Update",
    icon: Pencil,
  },
  delete: {
    bg: "bg-[hsl(var(--destructive)/0.1)]",
    text: "text-[hsl(var(--destructive))]",
    border: "border-[hsl(var(--destructive)/0.2)]",
    label: "Delete",
    icon: Trash2,
  },
  auth: {
    bg: "bg-[hsl(var(--muted)/0.6)]",
    text: "text-[hsl(var(--muted-foreground))]",
    border: "border-[hsl(var(--border))]",
    label: "Auth",
    icon: LogIn,
  },
  system: {
    bg: "bg-[hsl(270_60%_60%/0.1)]",
    text: "text-[hsl(270_60%_60%)]",
    border: "border-[hsl(270_60%_60%/0.2)]",
    label: "System",
    icon: Cpu,
  },
};

function getActionCategory(action: string): ActionCategory {
  return ACTION_CATEGORIES[action] ?? "system";
}

function getActionStyle(action: string) {
  return CATEGORY_STYLES[getActionCategory(action)];
}

// ---------------------------------------------------------------------------
// Dropdown option lists
// ---------------------------------------------------------------------------

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "license_created", label: "License Created" },
  { value: "license_activated", label: "License Activated" },
  { value: "license_revoked", label: "License Revoked" },
  { value: "license_suspended", label: "License Suspended" },
  { value: "license_renewed", label: "License Renewed" },
  { value: "org_created", label: "Org Created" },
  { value: "org_updated", label: "Org Updated" },
  { value: "user_login", label: "User Login" },
  { value: "user_logout", label: "User Logout" },
  { value: "announcement_created", label: "Announcement Created" },
  { value: "trial_approved", label: "Trial Approved" },
  { value: "release_published", label: "Release Published" },
  { value: "heartbeat_received", label: "Heartbeat Received" },
];

const RESOURCE_OPTIONS = [
  { value: "all", label: "All Resources" },
  { value: "License", label: "License" },
  { value: "Organization", label: "Organization" },
  { value: "Release", label: "Release" },
  { value: "Announcement", label: "Announcement" },
  { value: "TrialRequest", label: "Trial Request" },
  { value: "Ticket", label: "Ticket" },
  { value: "Admin", label: "Admin" },
];

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return { date, time };
}

function formatActionLabel(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function resolveActor(entry: AuditLogEntry): {
  label: string;
  kind: "admin" | "system" | "app";
} {
  if (entry.adminUser) {
    return { label: entry.adminUser.name, kind: "admin" };
  }
  if (
    entry.userAgent &&
    (entry.userAgent.startsWith("reqwest") ||
      entry.userAgent.startsWith("CCF-Desktop"))
  ) {
    return { label: "Desktop App", kind: "app" };
  }
  return { label: "System", kind: "system" };
}

// ---------------------------------------------------------------------------
// JSON formatter component
// ---------------------------------------------------------------------------

function JsonBlock({
  label,
  data,
}: {
  label: string;
  data: Record<string, unknown> | null;
}) {
  if (!data) {
    return (
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          {label}
        </p>
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] px-4 py-3">
          <span className="font-mono text-xs italic text-[hsl(var(--muted-foreground)/0.6)]">
            null
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        {label}
      </p>
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] px-4 py-3 overflow-x-auto max-h-64 overflow-y-auto">
        <pre className="font-mono text-xs leading-relaxed text-[hsl(var(--foreground)/0.85)]">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton component
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-36" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-md" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-6" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Expanded row detail component
// ---------------------------------------------------------------------------

function ExpandedDetail({ entry }: { entry: AuditLogEntry }) {
  const actor = resolveActor(entry);
  const style = getActionStyle(entry.action);
  const ActionIcon = style.icon;

  return (
    <TableRow className="bg-[hsl(var(--muted)/0.15)] hover:bg-[hsl(var(--muted)/0.15)] border-b border-[hsl(var(--border)/0.5)]">
      <TableCell colSpan={6} className="px-6 py-5">
        <div className="space-y-5">
          {/* Top meta row */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Action
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                    style.bg,
                    style.text,
                    style.border
                  )}
                >
                  <ActionIcon className="h-3 w-3" />
                  {formatActionLabel(entry.action)}
                </span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Actor
              </p>
              <p className="mt-1.5 text-sm text-[hsl(var(--foreground))]">
                {actor.label}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Full IP Address
              </p>
              <code className="mt-1.5 inline-block rounded bg-[hsl(var(--muted)/0.4)] px-2 py-0.5 font-mono text-xs text-[hsl(var(--foreground))]">
                {entry.ipAddress}
              </code>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Resource
              </p>
              <p className="mt-1.5 text-sm text-[hsl(var(--foreground))]">
                {entry.resourceType}{" "}
                <code className="rounded bg-[hsl(var(--muted)/0.4)] px-1.5 py-0.5 font-mono text-xs text-[hsl(var(--muted-foreground))]">
                  {entry.resourceId}
                </code>
              </p>
            </div>
          </div>

          {/* User Agent */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              User Agent
            </p>
            <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] px-3 py-2">
              <code className="font-mono text-xs text-[hsl(var(--foreground)/0.75)] break-all">
                {entry.userAgent}
              </code>
            </div>
          </div>

          {/* Old / New values */}
          <div className="grid gap-4 sm:grid-cols-2">
            <JsonBlock label="Old Values" data={entry.oldValues} />
            <JsonBlock label="New Values" data={entry.newValues} />
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AuditPage() {
  const { logs: auditLogs, isLoading: storeLoading, fetchAuditLogs } = useAuditStore();

  // Fetch audit logs on mount
  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Map store logs to the local AuditLogEntry shape
  const allLogs: AuditLogEntry[] = useMemo(() => {
    return auditLogs.map((log, idx) => ({
      id: Number(log.id.replace(/\D/g, "")) || idx + 1,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      adminUser: log.adminUser ? { name: log.adminUser.name } : null,
      ipAddress: log.ipAddress || "",
      userAgent: log.userAgent || "",
      oldValues: (log.metadata as Record<string, unknown>) ?? null,
      newValues: (log.metadata as Record<string, unknown>) ?? null,
      createdAt: log.createdAt,
    }));
  }, [auditLogs]);

  const isLoading = storeLoading;

  // Filter state
  const [actionFilter, setActionFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Applied filter snapshot (applied on "Apply Filters" click)
  const [appliedFilters, setAppliedFilters] = useState({
    action: "all",
    resource: "all",
    dateFrom: "",
    dateTo: "",
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 25;

  // Expanded row
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Apply filters handler
  const handleApplyFilters = useCallback(() => {
    setAppliedFilters({
      action: actionFilter,
      resource: resourceFilter,
      dateFrom,
      dateTo,
    });
    setCurrentPage(1);
    setExpandedId(null);
  }, [actionFilter, resourceFilter, dateFrom, dateTo]);

  // Clear filters handler
  const handleClearFilters = useCallback(() => {
    setActionFilter("all");
    setResourceFilter("all");
    setDateFrom("");
    setDateTo("");
    setAppliedFilters({
      action: "all",
      resource: "all",
      dateFrom: "",
      dateTo: "",
    });
    setCurrentPage(1);
    setExpandedId(null);
  }, []);

  const hasActiveFilters =
    appliedFilters.action !== "all" ||
    appliedFilters.resource !== "all" ||
    appliedFilters.dateFrom !== "" ||
    appliedFilters.dateTo !== "";

  // Filtered data
  const filtered = useMemo(() => {
    return allLogs.filter((log) => {
      if (
        appliedFilters.action !== "all" &&
        log.action !== appliedFilters.action
      )
        return false;
      if (
        appliedFilters.resource !== "all" &&
        log.resourceType !== appliedFilters.resource
      )
        return false;
      if (appliedFilters.dateFrom) {
        const from = new Date(appliedFilters.dateFrom);
        if (new Date(log.createdAt) < from) return false;
      }
      if (appliedFilters.dateTo) {
        const to = new Date(appliedFilters.dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(log.createdAt) > to) return false;
      }
      return true;
    });
  }, [allLogs, appliedFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  );

  const toggleRow = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            Audit Log
          </h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            System-wide audit trail and compliance logs.
          </p>
        </div>
        <Button
          disabled
          className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(230_65%_55%)] text-white shadow-md hover:shadow-lg hover:brightness-110 transition-all duration-200 gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Filter Bar                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardContent className="px-4 py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
              <Filter className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Filters</span>
            </div>

            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              {/* Action type */}
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="h-8 w-full text-xs sm:w-44">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Resource type */}
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger className="h-8 w-full text-xs sm:w-40">
                  <SelectValue placeholder="All Resources" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Date range inline */}
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 w-full text-xs sm:w-36"
                  placeholder="From"
                />
                <span className="text-xs text-[hsl(var(--muted-foreground))]">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 w-full text-xs sm:w-36"
                  placeholder="To"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-1.5">
              <Button onClick={handleApplyFilters} size="sm" className="h-8 px-3 text-xs">
                Apply
              </Button>
              {hasActiveFilters && (
                <Button
                  onClick={handleClearFilters}
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-[hsl(var(--muted-foreground))]"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Log Table                                                           */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Timestamp</TableHead>
                <TableHead className="min-w-[140px]">Action</TableHead>
                <TableHead className="min-w-[160px]">Resource</TableHead>
                <TableHead className="min-w-[120px]">Actor</TableHead>
                <TableHead className="min-w-[120px]">IP Address</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-40 text-center"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--muted))]">
                        <ScrollText className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
                      </div>
                      <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                        {hasActiveFilters ? "No audit logs found" : "No audit events yet"}
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {hasActiveFilters
                          ? "Adjust filters or date range to see results."
                          : "No audit events yet. Actions will be logged here automatically."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((entry) => {
                  const style = getActionStyle(entry.action);
                  const ActionIcon = style.icon;
                  const actor = resolveActor(entry);
                  const isExpanded = expandedId === entry.id;
                  const ts = formatTimestamp(entry.createdAt);
                  const actorInitial = actor.label.charAt(0).toUpperCase();

                  return (
                    <Fragment key={entry.id}>
                      <TableRow
                        className={cn(
                          "cursor-pointer transition-colors group",
                          isExpanded &&
                            "bg-[hsl(var(--muted)/0.35)] hover:bg-[hsl(var(--muted)/0.35)]"
                        )}
                        onClick={() => toggleRow(entry.id)}
                      >
                        {/* Timestamp */}
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm text-[hsl(var(--foreground))]">
                              {ts.date}
                            </span>
                            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                              {ts.time}
                            </span>
                          </div>
                        </TableCell>

                        {/* Action badge with icon */}
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold",
                              style.bg,
                              style.text,
                              style.border
                            )}
                          >
                            <ActionIcon className="h-3 w-3" />
                            {formatActionLabel(entry.action)}
                          </span>
                        </TableCell>

                        {/* Resource - subtle tag */}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded bg-[hsl(var(--muted)/0.5)] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
                              <FileText className="h-2.5 w-2.5" />
                              {entry.resourceType}
                            </span>
                            <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
                              {entry.resourceId}
                            </span>
                          </div>
                        </TableCell>

                        {/* Actor with avatar initial */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                              actor.kind === "admin" && "bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]",
                              actor.kind === "app" && "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
                              actor.kind === "system" && "bg-[hsl(270_60%_60%/0.1)] text-[hsl(270_60%_60%)]"
                            )}>
                              {actorInitial}
                            </div>
                            <span className="text-sm text-[hsl(var(--foreground))]">
                              {actor.label}
                            </span>
                          </div>
                        </TableCell>

                        {/* IP Address - monospace */}
                        <TableCell>
                          <code className="rounded bg-[hsl(var(--muted)/0.4)] px-1.5 py-0.5 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                            {entry.ipAddress}
                          </code>
                        </TableCell>

                        {/* Expand indicator */}
                        <TableCell className="text-center">
                          <div className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                            isExpanded ? "bg-[hsl(var(--muted))]" : "group-hover:bg-[hsl(var(--muted)/0.5)]"
                          )}>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded detail row */}
                      {isExpanded && <ExpandedDetail entry={entry} />}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Pagination                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {filtered.length === 0
            ? "No entries"
            : `Showing ${(currentPage - 1) * perPage + 1}-${Math.min(
                currentPage * perPage,
                filtered.length
              )} of ${filtered.length} entries`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => {
              setCurrentPage((p) => p - 1);
              setExpandedId(null);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="px-2 text-sm text-[hsl(var(--muted-foreground))]">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => {
              setCurrentPage((p) => p + 1);
              setExpandedId(null);
            }}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
