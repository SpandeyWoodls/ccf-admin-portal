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
  { label: string; variant: "success" | "destructive" | "warning" | "default" | "secondary" }
> = {
  active: { label: "Active", variant: "success" },
  expired: { label: "Expired", variant: "destructive" },
  suspended: { label: "Suspended", variant: "warning" },
  revoked: { label: "Revoked", variant: "destructive" },
  issued: { label: "Issued", variant: "secondary" },
};

const tierConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  enterprise: { label: "Enterprise", variant: "default" },
  team: { label: "Team", variant: "secondary" },
  individual: { label: "Individual", variant: "outline" },
  government: { label: "Government", variant: "default" },
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
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Licenses
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
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
                className="pl-9"
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
                  };
                  const tier = tierConfig[lic.tier] || {
                    label: lic.tier,
                    variant: "outline" as const,
                  };
                  return (
                    <TableRow
                      key={lic.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/licenses/${lic.id}`)}
                    >
                      <TableCell className="font-mono text-xs font-medium">
                        {maskLicenseKey(lic.licenseKey)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {lic.organization?.name || (
                          <span className="text-[hsl(var(--muted-foreground))] italic">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tier.variant} className="text-[10px]">
                          {tier.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="text-[10px]">
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "text-sm",
                            lic.currentActivations >= lic.maxActivations
                              ? "text-[hsl(var(--warning))]"
                              : "text-[hsl(var(--muted-foreground))]",
                          )}
                        >
                          {lic.currentActivations}/{lic.maxActivations}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                        {lic.validUntil
                          ? new Date(lic.validUntil).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              },
                            )
                          : "Perpetual"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
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
                                className="text-[hsl(var(--destructive))]"
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Showing {(currentPage - 1) * perPage + 1}-
            {Math.min(currentPage * perPage, pagination.total)} of{" "}
            {pagination.total} licenses
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
            {/* Page number indicators */}
            <div className="hidden items-center gap-1 sm:flex">
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
                    className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
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
