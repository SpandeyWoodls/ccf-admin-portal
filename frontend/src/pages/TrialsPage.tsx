import { useState, useEffect, useMemo } from "react";
import {
  FlaskConical,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Search,
  Copy,
  Check,
  Monitor,
  User,
  Building2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTrialStore, type TrialRequest } from "@/stores/trialStore";
import { cn } from "@/lib/utils";
import { RoleGuard } from "@/components/shared/RoleGuard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "warning" | "success" | "destructive" }
> = {
  pending: { label: "Pending", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
};

const ORG_TYPE_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  law_enforcement: { label: "Law Enforcement", variant: "default" },
  academic: { label: "Academic", variant: "secondary" },
  corporate: { label: "Corporate", variant: "outline" },
  government: { label: "Government", variant: "default" },
  ngo: { label: "NGO", variant: "secondary" },
  individual: { label: "Individual", variant: "outline" },
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              color,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[hsl(var(--foreground))]">
              {value}
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {label}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      <span
        className={cn(
          "text-sm text-[hsl(var(--foreground))]",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function TrialDetailPanel({
  trial,
  onApprove,
  onReject,
}: {
  trial: TrialRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const status = STATUS_CONFIG[trial.status];
  return (
    <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-6 py-5">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Personal info */}
        <div className="space-y-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
            <User className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            Applicant Details
          </div>
          <DetailRow label="Full Name" value={trial.fullName} />
          <DetailRow label="Email" value={trial.email} />
          <DetailRow label="Phone" value={trial.phone} />
          <DetailRow label="Designation" value={trial.designation} />
          <DetailRow label="Department" value={trial.department} />
        </div>

        {/* Organization & request info */}
        <div className="space-y-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
            <Building2 className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            Request Details
          </div>
          <DetailRow label="Organization" value={trial.organization} />
          <DetailRow
            label="Organization Type"
            value={
              ORG_TYPE_CONFIG[trial.organizationType]?.label ??
              trial.organizationType
            }
          />
          <DetailRow label="Purpose" value={trial.purpose} />
          <DetailRow
            label="Expected Device Volume"
            value={`${trial.expectedVolume} devices/month`}
          />
        </div>

        {/* Machine info */}
        <div className="space-y-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
            <Monitor className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            Machine Info
          </div>
          <DetailRow
            label="Hardware Fingerprint"
            value={trial.hardwareFingerprint}
            mono
          />
          <DetailRow label="Machine Name" value={trial.machineName} mono />
          <DetailRow label="OS" value={trial.osInfo} />
          <DetailRow label="App Version" value={trial.appVersion} mono />
          <DetailRow
            label="Submitted"
            value={new Date(trial.createdAt).toLocaleString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
          {trial.reviewedAt && (
            <DetailRow
              label="Reviewed"
              value={new Date(trial.reviewedAt).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            />
          )}
        </div>
      </div>

      {/* Outcome section for approved/rejected */}
      {trial.status === "approved" && trial.approvedLicenseKey && (
        <div className="mt-4 rounded-lg border border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.05)] p-3">
          <p className="text-xs font-medium text-[hsl(var(--success))]">
            Approved License Key
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-[hsl(var(--foreground))]">
            {trial.approvedLicenseKey}
          </p>
        </div>
      )}

      {trial.status === "rejected" && trial.rejectionReason && (
        <div className="mt-4 rounded-lg border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.05)] p-3">
          <p className="text-xs font-medium text-[hsl(var(--destructive))]">
            Rejection Reason
          </p>
          <p className="mt-1 text-sm text-[hsl(var(--foreground))]">
            {trial.rejectionReason}
          </p>
        </div>
      )}

      {/* Action buttons for pending */}
      {trial.status === "pending" && (
        <RoleGuard permission="trials.approve">
          <div className="mt-5 flex items-center gap-3">
            <Button
              size="sm"
              className="bg-[hsl(var(--success))] text-white hover:bg-[hsl(var(--success)/0.9)]"
              onClick={(e) => {
                e.stopPropagation();
                onApprove();
              }}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Approve
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              Reject
            </Button>
          </div>
        </RoleGuard>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Table skeleton */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-20 rounded-md" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function TrialsPage() {
  const {
    trials,
    isLoading,
    error,
    fetchTrials,
    approveTrialRequest,
    rejectTrialRequest,
  } = useTrialStore();

  const [activeTab, setActiveTab] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  // Dialog state
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedTrial, setSelectedTrial] = useState<TrialRequest | null>(null);

  // Approve form state
  const [approveTier, setApproveTier] = useState("individual");
  const [approveDuration, setApproveDuration] = useState("14");
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);

  // Reject form state
  const [rejectReason, setRejectReason] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);

  // Copied license key state
  const [copiedKey, setCopiedKey] = useState(false);

  // Fetch real data from API on mount
  useEffect(() => {
    fetchTrials({ page: 1, limit: 50 });
  }, [fetchTrials]);

  // Safe trials array (guard against null/undefined from store)
  const safeTrials = Array.isArray(trials) ? trials : [];

  // Filtered + searched trials
  const filtered = useMemo(() => {
    return safeTrials.filter((t) => {
      if (activeTab !== "all" && t.status !== activeTab) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (t.fullName ?? "").toLowerCase().includes(q) ||
          (t.email ?? "").toLowerCase().includes(q) ||
          (t.organization ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [safeTrials, activeTab, search]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: safeTrials.length,
      pending: safeTrials.filter((t) => t.status === "pending").length,
      approved: safeTrials.filter((t) => t.status === "approved").length,
      rejected: safeTrials.filter((t) => t.status === "rejected").length,
    };
  }, [safeTrials]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  );

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, search]);

  // Handlers
  function openApproveDialog(trial: TrialRequest) {
    setSelectedTrial(trial);
    setApproveTier("individual");
    setApproveDuration("14");
    setApproveSuccess(null);
    setApproveDialogOpen(true);
  }

  function openRejectDialog(trial: TrialRequest) {
    setSelectedTrial(trial);
    setRejectReason("");
    setRejectDialogOpen(true);
  }

  async function handleApprove() {
    if (!selectedTrial) return;
    setApproveLoading(true);
    try {
      const durationDays = parseInt(approveDuration, 10);
      // Convert days to approximate months for the API (minimum 1)
      const months = Math.max(1, Math.round(durationDays / 30));
      const result = await approveTrialRequest(selectedTrial.id, {
        tier: approveTier,
        months,
      });
      setApproveSuccess(result.licenseKey);
    } catch {
      // API failed -- error is already set in the store
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleReject() {
    if (!selectedTrial || !rejectReason.trim()) return;
    setRejectLoading(true);
    try {
      await rejectTrialRequest(selectedTrial.id, rejectReason.trim());
      setRejectDialogOpen(false);
    } catch {
      // API failed -- error is already set in the store
    } finally {
      setRejectLoading(false);
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  const tabs: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: stats.total },
    { value: "pending", label: "Pending", count: stats.pending },
    { value: "approved", label: "Approved", count: stats.approved },
    { value: "rejected", label: "Rejected", count: stats.rejected },
  ];

  if (isLoading && safeTrials.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Trial Requests
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Review and manage incoming trial license requests.
          </p>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  // Empty state: no trials and not loading
  if (!isLoading && safeTrials.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Trial Requests
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Review and manage incoming trial license requests.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
              <FlaskConical className="h-7 w-7 text-[hsl(var(--muted-foreground))]" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-[hsl(var(--foreground))]">
              No trial requests yet
            </h3>
            <p className="mt-1 max-w-sm text-center text-sm text-[hsl(var(--muted-foreground))]">
              {error
                ? "Could not connect to the server. Trial requests will appear here once the backend is available."
                : "When users request trial licenses from the desktop app, their requests will appear here for review."}
            </p>
            {error && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => fetchTrials({ page: 1, limit: 50 })}
              >
                Retry
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + filter tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Trial Requests
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Review and manage incoming trial license requests.
          </p>
        </div>
        <div className="relative flex-shrink-0 sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <Input
            placeholder="Search requests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 cursor-pointer",
              activeTab === tab.value
                ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                activeTab === tab.value
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                  : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Requests"
          value={stats.total}
          icon={FlaskConical}
          color="bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]"
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          icon={Clock}
          color="bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]"
        />
        <StatCard
          label="Approved"
          value={stats.approved}
          icon={CheckCircle2}
          color="bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
        />
        <StatCard
          label="Rejected"
          value={stats.rejected}
          icon={XCircle}
          color="bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-16 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
                      <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
                        No trial requests found
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {search
                          ? "Try adjusting your search query."
                          : "New requests will appear here."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((trial) => {
                  const status = STATUS_CONFIG[trial.status];
                  const orgType =
                    ORG_TYPE_CONFIG[trial.organizationType] ?? {
                      label: trial.organizationType,
                      variant: "outline" as const,
                    };
                  const isExpanded = expandedId === trial.id;

                  return (
                    <TableRow
                      key={trial.id}
                      className="group cursor-pointer"
                      data-state={isExpanded ? "selected" : undefined}
                      onClick={() =>
                        setExpandedId(isExpanded ? null : trial.id)
                      }
                    >
                      {/* Expand chevron */}
                      <TableCell className="w-8 pr-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {trial.fullName}
                      </TableCell>
                      <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                        {trial.email}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm">
                        {trial.organization}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={orgType.variant}
                          className="text-[10px]"
                        >
                          {orgType.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                        <span title={new Date(trial.createdAt).toLocaleString()}>
                          {timeAgo(trial.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={status.variant}
                          className="text-[10px]"
                        >
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {trial.status === "pending" ? (
                          <RoleGuard
                            permission="trials.approve"
                            fallback={
                              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                                Pending
                              </span>
                            }
                          >
                            <div
                              className="flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                size="sm"
                                className="h-7 bg-[hsl(var(--success))] px-2 text-[11px] text-white hover:bg-[hsl(var(--success)/0.9)]"
                                onClick={() => openApproveDialog(trial)}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => openRejectDialog(trial)}
                              >
                                Reject
                              </Button>
                            </div>
                          </RoleGuard>
                        ) : (
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">
                            Reviewed
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Expanded detail panels rendered outside the table for clean layout */}
          {paginated.map((trial) => {
            if (expandedId !== trial.id) return null;
            return (
              <TrialDetailPanel
                key={`detail-${trial.id}`}
                trial={trial}
                onApprove={() => openApproveDialog(trial)}
                onReject={() => openRejectDialog(trial)}
              />
            );
          })}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Showing {(currentPage - 1) * perPage + 1}-
            {Math.min(currentPage * perPage, filtered.length)} of{" "}
            {filtered.length} requests
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Approve Dialog                                                     */}
      {/* ----------------------------------------------------------------- */}
      <Dialog
        open={approveDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setApproveDialogOpen(false);
            setApproveSuccess(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {approveSuccess
                ? "Trial Approved"
                : "Approve Trial Request"}
            </DialogTitle>
            <DialogDescription>
              {approveSuccess
                ? "The trial license has been generated successfully."
                : `Approve ${selectedTrial?.fullName}'s trial request and generate a license key.`}
            </DialogDescription>
          </DialogHeader>

          {approveSuccess ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.05)] p-4">
                <p className="mb-1 text-xs font-medium text-[hsl(var(--success))]">
                  Generated License Key
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-sm font-bold text-[hsl(var(--foreground))]">
                    {approveSuccess}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => copyKey(approveSuccess)}
                  >
                    {copiedKey ? (
                      <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="rounded-lg bg-[hsl(var(--muted)/0.5)] p-3 text-xs text-[hsl(var(--muted-foreground))]">
                <p>
                  The license key has been emailed to{" "}
                  <strong>{selectedTrial?.email}</strong>. The applicant can
                  activate the trial by entering this key in the application.
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setApproveDialogOpen(false);
                    setApproveSuccess(null);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Applicant summary */}
              <div className="rounded-lg bg-[hsl(var(--muted)/0.5)] p-3">
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                  {selectedTrial?.fullName}
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {selectedTrial?.organization} &middot;{" "}
                  {selectedTrial?.email}
                </p>
              </div>

              {/* License tier */}
              <div className="space-y-2">
                <Label>License Tier</Label>
                <Select
                  value={approveTier}
                  onValueChange={setApproveTier}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                    <SelectItem value="government">Government</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Trial duration */}
              <div className="space-y-2">
                <Label>Trial Duration</Label>
                <Select
                  value={approveDuration}
                  onValueChange={setApproveDuration}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setApproveDialogOpen(false)}
                  disabled={approveLoading}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-[hsl(var(--success))] text-white hover:bg-[hsl(var(--success)/0.9)]"
                  onClick={handleApprove}
                  disabled={approveLoading}
                >
                  {approveLoading ? (
                    <>
                      <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      Approve & Generate License
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* Reject Dialog                                                      */}
      {/* ----------------------------------------------------------------- */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Trial Request</DialogTitle>
            <DialogDescription>
              Reject {selectedTrial?.fullName}'s trial request. Please
              provide a reason.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Applicant summary */}
            <div className="rounded-lg bg-[hsl(var(--muted)/0.5)] p-3">
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                {selectedTrial?.fullName}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {selectedTrial?.organization} &middot;{" "}
                {selectedTrial?.email}
              </p>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label>
                Rejection Reason <span className="text-[hsl(var(--destructive))]">*</span>
              </Label>
              <textarea
                className="flex min-h-[100px] w-full rounded-[var(--radius)] border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-1 focus-visible:ring-offset-[hsl(var(--background))] disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                placeholder="Explain why this request is being rejected..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRejectDialogOpen(false)}
                disabled={rejectLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectLoading || !rejectReason.trim()}
              >
                {rejectLoading ? (
                  <>
                    <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Rejecting...
                  </>
                ) : (
                  <>
                    <XCircle className="mr-1.5 h-4 w-4" />
                    Reject Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
