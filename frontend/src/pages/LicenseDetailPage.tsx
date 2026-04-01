import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pause,
  Ban,
  RefreshCw,
  Play,
  Monitor,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  Loader2,
  ClipboardCopy,
  FlaskConical,
  Link,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLicenseStore } from "@/stores/licenseStore";
import { cn } from "@/lib/utils";
import { RoleGuard } from "@/components/shared/RoleGuard";

// ---------------------------------------------------------------------------
// Event icon mapping
// ---------------------------------------------------------------------------

const eventIcons: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    label: string;
  }
> = {
  activation: {
    icon: CheckCircle2,
    color: "text-[hsl(var(--success))]",
    label: "Activation",
  },
  "license.activated": {
    icon: CheckCircle2,
    color: "text-[hsl(var(--success))]",
    label: "Activation",
  },
  deactivation: {
    icon: XCircle,
    color: "text-[hsl(var(--destructive))]",
    label: "Deactivation",
  },
  "license.deactivated": {
    icon: XCircle,
    color: "text-[hsl(var(--destructive))]",
    label: "Deactivation",
  },
  renewal: {
    icon: RefreshCw,
    color: "text-[hsl(var(--chart-1))]",
    label: "Renewal",
  },
  "license.renewed": {
    icon: RefreshCw,
    color: "text-[hsl(var(--chart-1))]",
    label: "Renewal",
  },
  suspension: {
    icon: AlertTriangle,
    color: "text-[hsl(var(--warning))]",
    label: "Suspension",
  },
  "license.suspended": {
    icon: AlertTriangle,
    color: "text-[hsl(var(--warning))]",
    label: "Suspension",
  },
  revocation: {
    icon: Ban,
    color: "text-[hsl(var(--destructive))]",
    label: "Revocation",
  },
  "license.revoked": {
    icon: Ban,
    color: "text-[hsl(var(--destructive))]",
    label: "Revocation",
  },
  reinstatement: {
    icon: Play,
    color: "text-[hsl(var(--success))]",
    label: "Reinstatement",
  },
  "license.reinstated": {
    icon: Play,
    color: "text-[hsl(var(--success))]",
    label: "Reinstatement",
  },
  "license.created": {
    icon: CheckCircle2,
    color: "text-[hsl(var(--chart-4))]",
    label: "Created",
  },
  issue: {
    icon: CheckCircle2,
    color: "text-[hsl(var(--chart-4))]",
    label: "Issued",
  },
};

const defaultEventIcon = {
  icon: Clock,
  color: "text-[hsl(var(--muted-foreground))]",
  label: "Event",
};

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const statusConfig: Record<
  string,
  { label: string; variant: "success" | "destructive" | "warning" | "default" }
> = {
  active: { label: "Active", variant: "success" },
  expired: { label: "Expired", variant: "destructive" },
  suspended: { label: "Suspended", variant: "warning" },
  revoked: { label: "Revoked", variant: "destructive" },
  issued: { label: "Issued", variant: "default" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "---";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "---";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + " at " + d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function isExpired(license: { validUntil: string | null; status: string }): boolean {
  if (!license.validUntil) return false;
  return new Date(license.validUntil).getTime() < Date.now();
}

// ---------------------------------------------------------------------------
// License type badge config
// ---------------------------------------------------------------------------

const licenseTypeConfig: Record<string, { label: string; className: string }> = {
  trial: {
    label: "Trial",
    className: "border-transparent bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))]",
  },
  perpetual: {
    label: "Perpetual",
    className: "border-transparent bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]",
  },
  time_limited: {
    label: "Time-Limited",
    className: "border-transparent bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
  },
  organization: {
    label: "Organization",
    className: "border-transparent bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]",
  },
};

function getEventDescription(event: { action: string; metadata: any; actorEmail: string | null; actorType: string }): {
  description: string;
  actor: string;
} {
  const actor = event.actorEmail || (event.actorType === "system" ? "System" : "Admin");
  const meta = event.metadata || {};

  switch (event.action) {
    case "activation":
    case "license.activated":
      return { description: `Activated on ${meta.machineName || "unknown machine"}`, actor };
    case "deactivation":
    case "license.deactivated":
      return { description: `Deactivated from ${meta.machineName || "unknown machine"}`, actor };
    case "renewal":
    case "license.renewed":
      return { description: `License renewed for ${meta.months || "?"} months`, actor };
    case "suspension":
    case "license.suspended":
      return { description: "License suspended", actor };
    case "revocation":
    case "license.revoked":
      return { description: "License revoked", actor };
    case "reinstatement":
    case "license.reinstated":
      return { description: "License reinstated", actor };
    case "license.created":
    case "issue":
      return { description: `License issued${meta.organization ? ` to ${meta.organization}` : ""}`, actor };
    default:
      return { description: event.action.replace(/[._]/g, " "), actor };
  }
}

function isRecentlyOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff < 15 * 60 * 1000; // 15 minutes
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LicenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    selectedLicense: license,
    isLoading,
    isActionLoading,
    fetchLicense,
    suspendLicense,
    revokeLicense,
    reinstateLicense,
    renewLicense,
    deactivateMachine,
    clearSelectedLicense,
  } = useLicenseStore();

  // Dialog states
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: "default" | "destructive";
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", variant: "default", onConfirm: () => {} });

  const [renewDialog, setRenewDialog] = useState(false);
  const [renewMonths, setRenewMonths] = useState(12);
  const [keyCopied, setKeyCopied] = useState(false);

  // Fetch license on mount
  useEffect(() => {
    if (id) {
      fetchLicense(id);
    }
    return () => {
      clearSelectedLicense();
    };
  }, [id, fetchLicense, clearSelectedLicense]);

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  const handleSuspend = () => {
    if (!license) return;
    setConfirmDialog({
      open: true,
      title: "Suspend License",
      description: `Are you sure you want to suspend license ${license.licenseKey}? All active machines will lose access until the license is reinstated.`,
      variant: "default",
      onConfirm: async () => {
        try {
          await suspendLicense(license.id);
          toast.success("License suspended");
          setConfirmDialog((d) => ({ ...d, open: false }));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to suspend license");
        }
      },
    });
  };

  const handleRevoke = () => {
    if (!license) return;
    setConfirmDialog({
      open: true,
      title: "Revoke License",
      description: `Are you sure you want to permanently revoke license ${license.licenseKey}? All activations will be immediately deactivated. This action is difficult to reverse.`,
      variant: "destructive",
      onConfirm: async () => {
        try {
          await revokeLicense(license.id);
          toast.success("License revoked");
          setConfirmDialog((d) => ({ ...d, open: false }));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to revoke license");
        }
      },
    });
  };

  const handleReinstate = () => {
    if (!license) return;
    setConfirmDialog({
      open: true,
      title: "Reinstate License",
      description: `Reinstate license ${license.licenseKey}? This will restore the license to active status.`,
      variant: "default",
      onConfirm: async () => {
        try {
          await reinstateLicense(license.id);
          toast.success("License reinstated");
          setConfirmDialog((d) => ({ ...d, open: false }));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to reinstate license");
        }
      },
    });
  };

  const handleRenew = async () => {
    if (!license) return;
    try {
      await renewLicense(license.id, renewMonths);
      toast.success(`License renewed for ${renewMonths} months`);
      setRenewDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to renew license");
    }
  };

  const handleDeactivate = (activationId: string, machineName: string) => {
    if (!license) return;
    setConfirmDialog({
      open: true,
      title: "Deactivate Machine",
      description: `Deactivate ${machineName} from this license? The machine will need to be re-activated to use the software.`,
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deactivateMachine(license.id, activationId);
          toast.success(`${machineName} deactivated`);
          setConfirmDialog((d) => ({ ...d, open: false }));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to deactivate machine");
        }
      },
    });
  };

  const copyKey = () => {
    if (!license) return;
    navigator.clipboard.writeText(license.licenseKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  // ---------------------------------------------------------------------------
  // Loading skeleton
  // ---------------------------------------------------------------------------

  if (isLoading || !license) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="mb-2 h-3 w-20" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-4">
            <Skeleton className="mb-2 h-4 w-24" />
            <Skeleton className="h-2 w-full rounded-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = statusConfig[license.status] || {
    label: license.status,
    variant: "default" as const,
  };

  const tierLabel =
    license.tier.charAt(0).toUpperCase() + license.tier.slice(1);
  const typeLabel =
    license.licenseType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const typeConfig = licenseTypeConfig[license.licenseType] || {
    label: typeLabel,
    className: "border-transparent bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]",
  };
  const expired = isExpired(license);

  const activationPct =
    license.maxActivations > 0
      ? (license.currentActivations / license.maxActivations) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/licenses")}
        className="gap-1.5 text-[hsl(var(--muted-foreground))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Licenses
      </Button>

      {/* Expired banner */}
      {expired && (
        <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.08)] px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[hsl(var(--destructive))]" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[hsl(var(--destructive))]">
              License Expired
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              This license expired on {formatDate(license.validUntil)}. Renew it to restore access.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-[hsl(var(--destructive)/0.3)] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.1)]"
            onClick={() => setRenewDialog(true)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Renew Now
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">
              {license.licenseKey}
            </span>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "gap-1.5 text-xs h-7 px-2.5",
                keyCopied && "border-[hsl(var(--success))] text-[hsl(var(--success))]",
              )}
              onClick={copyKey}
            >
              {keyCopied ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <ClipboardCopy className="h-3 w-3" />
                  Copy Key
                </>
              )}
            </Button>
            <Badge variant={status.variant}>{status.label}</Badge>
            <Badge className={cn("text-[10px] font-semibold", typeConfig.className)}>
              {typeConfig.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
            {license.organization ? (
              <button
                onClick={() => navigate(`/organizations/${license.organization!.id}`)}
                className="hover:text-[hsl(var(--foreground))] transition-colors cursor-pointer underline-offset-2 hover:underline"
              >
                {license.organization.name}
              </button>
            ) : (
              <span className="italic text-[hsl(var(--muted-foreground)/0.7)]">
                No organization (trial license)
              </span>
            )}
            <span>&middot;</span>
            <span>{tierLabel} Tier</span>
            {license.licenseType === "trial" && (
              <>
                <span>&middot;</span>
                <button
                  onClick={() => navigate("/trials")}
                  className="inline-flex items-center gap-1 text-[hsl(var(--chart-4))] hover:underline underline-offset-2 cursor-pointer"
                >
                  <FlaskConical className="h-3 w-3" />
                  View Trial Requests
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Contextual action buttons based on status */}
          {(license.status === "suspended" || license.status === "revoked") && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReinstate}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Reinstate
            </Button>
          )}
          <RoleGuard permission="licenses.suspend">
            {license.status === "active" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSuspend}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
                Suspend
              </Button>
            )}
          </RoleGuard>
          <RoleGuard permission="licenses.revoke">
            {license.status !== "revoked" && (
              <Button
                variant="outline"
                size="sm"
                className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]"
                onClick={handleRevoke}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
                Revoke
              </Button>
            )}
          </RoleGuard>
          <Button
            size="sm"
            onClick={() => setRenewDialog(true)}
            disabled={isActionLoading}
          >
            {isActionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Renew
          </Button>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Organization */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Organization
            </p>
            {license.organization ? (
              <button
                onClick={() => navigate(`/organizations/${license.organization!.id}`)}
                className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] transition-colors cursor-pointer underline-offset-2 hover:underline inline-flex items-center gap-1"
              >
                {license.organization.name}
                <Link className="h-3 w-3 opacity-50" />
              </button>
            ) : (
              <p className="mt-1 text-sm italic text-[hsl(var(--muted-foreground)/0.7)]">
                No organization (trial license)
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tier */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Tier
            </p>
            <p className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
              {tierLabel}
            </p>
          </CardContent>
        </Card>

        {/* License Type */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              License Type
            </p>
            <div className="mt-1">
              <Badge className={cn("text-xs font-semibold", typeConfig.className)}>
                {typeConfig.label}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Issued Date */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Issued Date
            </p>
            <p className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
              {formatDate(license.validFrom || license.createdAt)}
            </p>
          </CardContent>
        </Card>

        {/* Expires */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Expires
            </p>
            <p className={cn(
              "mt-1 text-sm font-semibold",
              expired
                ? "text-[hsl(var(--destructive))]"
                : "text-[hsl(var(--foreground))]",
            )}>
              {license.validUntil
                ? formatDate(license.validUntil)
                : "Never (Perpetual)"}
              {expired && (
                <span className="ml-1.5 text-xs font-normal text-[hsl(var(--destructive)/0.8)]">
                  (expired)
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Issued By */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Issued By
            </p>
            <p className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
              {license.issuedBy?.name || "System"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Activations bar */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">
              Activations
            </span>
            <span className="text-sm text-[hsl(var(--muted-foreground))]">
              {license.currentActivations} / {license.maxActivations}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[hsl(var(--muted))]">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                activationPct >= 90
                  ? "bg-[hsl(var(--warning))]"
                  : activationPct >= 100
                    ? "bg-[hsl(var(--destructive))]"
                    : "bg-[hsl(var(--primary))]",
              )}
              style={{ width: `${Math.min(activationPct, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="activations">
        <TabsList>
          <TabsTrigger value="activations">
            <Monitor className="mr-1.5 h-3.5 w-3.5" />
            Activations ({license.activations?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="events">
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            Events ({license.events?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        {/* Activations Tab */}
        <TabsContent value="activations">
          <Card>
            <CardContent className="p-0">
              {(!license.activations || license.activations.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
                    <Monitor className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    No activations
                  </h3>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    This license has not been activated on any machine yet.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hostname</TableHead>
                      <TableHead>OS</TableHead>
                      <TableHead>App Version</TableHead>
                      <TableHead>Last Seen</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {license.activations.map((act) => {
                      const online = isRecentlyOnline(act.lastHeartbeatAt);
                      return (
                        <TableRow key={act.id}>
                          <TableCell className="font-mono text-xs font-medium">
                            {act.machineName}
                          </TableCell>
                          <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                            {act.osInfo}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className="font-mono text-[10px]"
                            >
                              v{act.appVersion}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                            {formatDateTime(act.lastHeartbeatAt || act.activatedAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <div
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  online
                                    ? "bg-[hsl(var(--success))]"
                                    : "bg-[hsl(var(--muted-foreground))]",
                                )}
                              />
                              <span className="text-xs capitalize text-[hsl(var(--muted-foreground))]">
                                {online ? "online" : "offline"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
                              disabled={isActionLoading}
                              onClick={() =>
                                handleDeactivate(act.id, act.machineName)
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events">
          <Card>
            <CardContent className="p-6">
              {(!license.events || license.events.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
                    <Clock className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    No events recorded
                  </h3>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    Events will appear here as actions are taken on this
                    license.
                  </p>
                </div>
              ) : (
                <div className="space-y-0">
                  {license.events.map((event, idx) => {
                    const iconConfig =
                      eventIcons[event.action] || defaultEventIcon;
                    const Icon = iconConfig.icon;
                    const { description, actor } = getEventDescription(event);
                    return (
                      <div
                        key={event.id}
                        className="relative flex gap-4 pb-6 last:pb-0"
                      >
                        {/* Timeline line */}
                        {idx < license.events.length - 1 && (
                          <div className="absolute left-[11px] top-8 h-[calc(100%-16px)] w-px bg-[hsl(var(--border))]" />
                        )}
                        {/* Icon */}
                        <div className="relative z-10 mt-0.5">
                          <Icon className={`h-6 w-6 ${iconConfig.color}`} />
                        </div>
                        {/* Content */}
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                            {description}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                            <span>{actor}</span>
                            <span>&middot;</span>
                            <span>{formatDateTime(event.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes">
          <Card>
            {license.notes ? (
              <CardContent className="p-6">
                <p className="text-sm text-[hsl(var(--foreground))] whitespace-pre-wrap">
                  {license.notes}
                </p>
              </CardContent>
            ) : (
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
                  <Clock className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
                </div>
                <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  No notes yet
                </h3>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  Add notes to keep track of important information about this
                  license.
                </p>
                <Button variant="outline" size="sm" className="mt-4">
                  Add Note
                </Button>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) =>
          setConfirmDialog((d) => ({ ...d, open }))
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setConfirmDialog((d) => ({ ...d, open: false }))
              }
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button
              variant={
                confirmDialog.variant === "destructive"
                  ? "destructive"
                  : "default"
              }
              onClick={confirmDialog.onConfirm}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renew Dialog */}
      <Dialog open={renewDialog} onOpenChange={setRenewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renew License</DialogTitle>
            <DialogDescription>
              Choose how long to extend this license. The new expiry date will
              be calculated from the current expiry date.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-4">
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setRenewMonths(m)}
                className={cn(
                  "flex flex-col items-center rounded-[var(--radius)] border-2 p-4 transition-colors cursor-pointer",
                  renewMonths === m
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]"
                    : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)]",
                )}
              >
                <span className="text-2xl font-bold text-[hsl(var(--foreground))]">
                  {m}
                </span>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  months
                </span>
              </button>
            ))}
          </div>
          {license?.validUntil && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Current expiry:{" "}
              <span className="font-medium text-[hsl(var(--foreground))]">
                {formatDate(license.validUntil)}
              </span>
              {" "}&rarr;{" "}
              <span className="font-medium text-[hsl(var(--success))]">
                {formatDate(
                  (() => {
                    const d = new Date(license.validUntil!);
                    d.setMonth(d.getMonth() + renewMonths);
                    return d.toISOString();
                  })(),
                )}
              </span>
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenewDialog(false)}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleRenew} disabled={isActionLoading}>
              {isActionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Renew for {renewMonths} months
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
