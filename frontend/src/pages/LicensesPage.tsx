import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Pause,
  Ban,
  RefreshCw,
  FileX2,
  Layers,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLicenseStore } from "@/stores/licenseStore";
import { maskLicenseKey, cn } from "@/lib/utils";
import { CreateLicenseDialog } from "@/components/licenses/CreateLicenseDialog";
import { BulkOperationsDialog } from "@/components/licenses/BulkOperationsDialog";
import { RoleGuard } from "@/components/shared/RoleGuard";
import { useCan } from "@/lib/rbac";

// ---------------------------------------------------------------------------
// Status / Tier display configs
// ---------------------------------------------------------------------------

const statusConfig: Record<
  string,
  { label: string; variant: "success" | "destructive" | "warning" | "default" | "secondary"; dotColor: string; pillBg: string; pillText: string }
> = {
  active: { label: "Active", variant: "success", dotColor: "bg-emerald-500", pillBg: "bg-emerald-50 dark:bg-emerald-900/30", pillText: "text-emerald-700 dark:text-emerald-300" },
  expired: { label: "Expired", variant: "destructive", dotColor: "bg-red-400", pillBg: "bg-red-50 dark:bg-red-900/30", pillText: "text-red-700 dark:text-red-300" },
  suspended: { label: "Suspended", variant: "warning", dotColor: "bg-amber-500", pillBg: "bg-amber-50 dark:bg-amber-900/30", pillText: "text-amber-700 dark:text-amber-300" },
  revoked: { label: "Revoked", variant: "destructive", dotColor: "bg-red-500", pillBg: "bg-red-50 dark:bg-red-900/30", pillText: "text-red-700 dark:text-red-300" },
  issued: { label: "Issued", variant: "secondary", dotColor: "bg-slate-400", pillBg: "bg-slate-50 dark:bg-slate-800/50", pillText: "text-slate-600 dark:text-slate-300" },
};

const tierConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline"; color: string }
> = {
  enterprise: { label: "Enterprise", variant: "default", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800" },
  team: { label: "Team", variant: "secondary", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  individual: { label: "Individual", variant: "outline", color: "bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400 border-gray-200 dark:border-gray-700" },
  government: { label: "Government", variant: "default", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LicensesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const perPage = 10;

  const canSuspend = useCan("licenses.suspend");
  const canRevoke = useCan("licenses.revoke");

  const {
    licenses,
    pagination,
    isLoading,
    fetchLicenses,
    suspendLicense,
    revokeLicense,
  } = useLicenseStore();

  // Debounced search value
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  // Fetch licenses when filters or page change
  const loadLicenses = useCallback(() => {
    fetchLicenses({
      status: statusFilter !== "all" ? statusFilter : undefined,
      tier: tierFilter !== "all" ? tierFilter : undefined,
      search: debouncedSearch || undefined,
      page: currentPage,
      limit: perPage,
    });
  }, [fetchLicenses, statusFilter, tierFilter, debouncedSearch, currentPage, perPage]);

  useEffect(() => {
    loadLicenses();
  }, [loadLicenses]);

  const totalPages = pagination.totalPages || Math.ceil(pagination.total / perPage) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            Licenses
          </h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Manage software license keys and activations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RoleGuard permission="licenses.bulk">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Layers className="h-4 w-4" />
              Bulk Operations
            </Button>
          </RoleGuard>
          <RoleGuard permission="licenses.create">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New License
            </Button>
          </RoleGuard>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
              <Input
                placeholder="Search by key or organization..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 transition-shadow focus:shadow-md focus:shadow-[hsl(var(--ring)/0.1)]"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={tierFilter}
              onValueChange={(v) => {
                setTierFilter(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="government">Government</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>License Key</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Activations</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Loading skeletons */}
              {isLoading &&
                Array.from({ length: perPage }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-12" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </TableCell>
                  </TableRow>
                ))}

              {/* Empty state */}
              {!isLoading && licenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
                        <FileX2 className="h-7 w-7 text-[hsl(var(--muted-foreground))]" />
                      </div>
                      <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                        No licenses found
                      </h3>
                      <p className="mt-1 max-w-sm text-xs text-[hsl(var(--muted-foreground))]">
                        {search || statusFilter !== "all" || tierFilter !== "all"
                          ? "Try adjusting your filters or search query."
                          : "Get started by creating your first license."}
                      </p>
                      {!search && statusFilter === "all" && tierFilter === "all" && (
                        <Button
                          size="sm"
                          className="mt-4"
                          onClick={() => setCreateOpen(true)}
                        >
                          <Plus className="h-4 w-4" />
                          Create License
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Data rows */}
              {!isLoading &&
                licenses.map((lic) => {
                  const status = statusConfig[lic.status] || {
                    label: lic.status,
                    variant: "secondary" as const,
                    dotColor: "bg-slate-400",
                    pillBg: "bg-slate-50 dark:bg-slate-800/50",
                    pillText: "text-slate-600 dark:text-slate-300",
                  };
                  const tier = tierConfig[lic.tier] || {
                    label: lic.tier,
                    variant: "outline" as const,
                    color: "bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400 border-gray-200 dark:border-gray-700",
                  };
                  const activationPct = lic.maxActivations > 0
                    ? Math.min((lic.currentActivations / lic.maxActivations) * 100, 100)
                    : 0;
                  const isCopied = copiedId === lic.id;
                  return (
                    <TableRow
                      key={lic.id}
                      className="group cursor-pointer odd:bg-[hsl(var(--muted)/0.3)] transition-colors hover:bg-[hsl(var(--muted)/0.6)]"
                      onClick={() => navigate(`/licenses/${lic.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-medium tracking-wide">
                            {maskLicenseKey(lic.licenseKey)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(lic.licenseKey);
                              setCopiedId(lic.id);
                              toast.success("License key copied");
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[hsl(var(--muted))]"
                            title="Copy license key"
                          >
                            {isCopied ? (
                              <Check className="h-3 w-3 text-[hsl(var(--success))]" />
                            ) : (
                              <Copy className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                            )}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {lic.organization?.name || (
                          <span className="text-[hsl(var(--muted-foreground))] italic">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${tier.color}`}>
                          {tier.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${status.pillBg} ${status.pillText}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dotColor}`} />
                          {status.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <span
                            className={cn(
                              "text-sm font-medium",
                              lic.currentActivations >= lic.maxActivations
                                ? "text-[hsl(var(--warning))]"
                                : "text-[hsl(var(--muted-foreground))]",
                            )}
                          >
                            {lic.currentActivations}/{lic.maxActivations}
                          </span>
                          <div className="h-1 w-16 rounded-full bg-[hsl(var(--muted))]">
                            <div
                              className={cn(
                                "h-1 rounded-full transition-all",
                                activationPct >= 100
                                  ? "bg-[hsl(var(--warning))]"
                                  : activationPct >= 70
                                    ? "bg-amber-400"
                                    : "bg-[hsl(var(--primary))]",
                              )}
                              style={{ width: `${activationPct}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {lic.validUntil ? (
                          <span className="text-[hsl(var(--muted-foreground))]">
                            {new Date(lic.validUntil).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                          </span>
                        ) : (
                          <span className="italic text-[hsl(var(--muted-foreground)/0.6)]">
                            Perpetual
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/licenses/${lic.id}`);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {lic.status === "active" && canSuspend && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (
                                    window.confirm(
                                      `Suspend license ${lic.licenseKey}?`,
                                    )
                                  ) {
                                    suspendLicense(lic.id);
                                  }
                                }}
                              >
                                <Pause className="mr-2 h-4 w-4" />
                                Suspend
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/licenses/${lic.id}`);
                              }}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Renew
                            </DropdownMenuItem>
                            {lic.status !== "revoked" && canRevoke && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (
                                    window.confirm(
                                      `Revoke license ${lic.licenseKey}? This will deactivate all machines.`,
                                    )
                                  ) {
                                    revokeLicense(lic.id);
                                  }
                                }}
                                className="text-[hsl(var(--destructive))] focus:text-[hsl(var(--destructive))]"
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Revoke
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && pagination.total > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2.5">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            <span className="font-medium text-[hsl(var(--foreground))]">
              {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, pagination.total)}
            </span>
            {" "}of {pagination.total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {/* Page number indicators */}
            <div className="hidden items-center gap-0.5 sm:flex">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-7 w-7 p-0 text-xs",
                      currentPage === pageNum && "pointer-events-none",
                    )}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create License Dialog */}
      <CreateLicenseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          loadLicenses();
        }}
      />

      {/* Bulk Operations Dialog */}
      <BulkOperationsDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onCompleted={() => loadLicenses()}
      />
    </div>
  );
}
