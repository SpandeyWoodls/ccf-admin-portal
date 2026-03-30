import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Building2,
  AlertCircle,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useOrganizationStore } from "@/stores/organizationStore";
import { CreateOrgDialog } from "@/components/organizations/CreateOrgDialog";
import { RoleGuard } from "@/components/shared/RoleGuard";
import { useCan } from "@/lib/rbac";

// ---------------------------------------------------------------------------
// Type badge config
// ---------------------------------------------------------------------------

const typeConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline"; color: string; avatarBg: string; avatarFg: string }
> = {
  law_enforcement: { label: "Law Enforcement", variant: "default", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800", avatarBg: "bg-blue-100 dark:bg-blue-900/40", avatarFg: "text-blue-700 dark:text-blue-300" },
  government: { label: "Government", variant: "secondary", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800", avatarBg: "bg-emerald-100 dark:bg-emerald-900/40", avatarFg: "text-emerald-700 dark:text-emerald-300" },
  forensic_lab: { label: "Forensic Lab", variant: "outline", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800", avatarBg: "bg-purple-100 dark:bg-purple-900/40", avatarFg: "text-purple-700 dark:text-purple-300" },
  private_lab: { label: "Private Lab", variant: "outline", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-800", avatarBg: "bg-violet-100 dark:bg-violet-900/40", avatarFg: "text-violet-700 dark:text-violet-300" },
  academic: { label: "Academic", variant: "outline", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800", avatarBg: "bg-amber-100 dark:bg-amber-900/40", avatarFg: "text-amber-700 dark:text-amber-300" },
  educational: { label: "Educational", variant: "outline", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800", avatarBg: "bg-orange-100 dark:bg-orange-900/40", avatarFg: "text-orange-700 dark:text-orange-300" },
  corporate: { label: "Corporate", variant: "secondary", color: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300 border-slate-200 dark:border-slate-800", avatarBg: "bg-slate-100 dark:bg-slate-900/40", avatarFg: "text-slate-700 dark:text-slate-300" },
  private: { label: "Private", variant: "secondary", color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800", avatarBg: "bg-zinc-100 dark:bg-zinc-900/40", avatarFg: "text-zinc-700 dark:text-zinc-300" },
  individual: { label: "Individual", variant: "outline", color: "bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400 border-gray-200 dark:border-gray-800", avatarBg: "bg-gray-100 dark:bg-gray-900/40", avatarFg: "text-gray-600 dark:text-gray-400" },
};

function getTypeInfo(type: string) {
  return (
    typeConfig[type] || {
      label: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      variant: "outline" as const,
      color: "bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400 border-gray-200 dark:border-gray-800",
      avatarBg: "bg-[hsl(var(--primary)/0.1)]",
      avatarFg: "text-[hsl(var(--primary))]",
    }
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-6" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-6" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-14" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-8 w-8 rounded" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--muted))]">
        <Building2 className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.6)]" />
        {!hasSearch && (
          <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
            <Plus className="h-3.5 w-3.5" />
          </div>
        )}
        {hasSearch && (
          <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--muted-foreground)/0.3)]">
            <Search className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
          </div>
        )}
      </div>
      <h3 className="mt-5 text-sm font-semibold text-[hsl(var(--foreground))]">
        {hasSearch ? "No organizations found" : "No organizations yet"}
      </h3>
      <p className="mt-1.5 max-w-xs text-sm text-[hsl(var(--muted-foreground))]">
        {hasSearch
          ? "Try adjusting your search query or clearing the filter."
          : "Create your first organization to start managing licenses and contacts."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function OrganizationsPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const canEdit = useCan("organizations.edit");
  const canDelete = useCan("organizations.delete");

  const {
    organizations,
    isLoading,
    error,
    fetchOrganizations,
    deleteOrganization,
  } = useOrganizationStore();

  // Fetch on mount
  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  // Local filtering (client-side search on top of fetched data)
  const filtered = organizations.filter((org) => {
    if (!localSearch.trim()) return true;
    const q = localSearch.toLowerCase();
    return (
      org.name.toLowerCase().includes(q) ||
      (org.orgType || "").toLowerCase().includes(q) ||
      (org.city || "").toLowerCase().includes(q) ||
      (org.email || "").toLowerCase().includes(q)
    );
  });

  const handleDelete = async (
    e: React.MouseEvent,
    orgId: string,
    orgName: string,
  ) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${orgName}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteOrganization(orgId);
      toast.success("Organization deleted", {
        description: `${orgName} has been removed.`,
      });
    } catch {
      toast.error("Failed to delete organization");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
              Organizations
            </h1>
            {!isLoading && organizations.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-[hsl(var(--muted))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                {organizations.length}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Manage client organizations, licenses, and contacts.
          </p>
        </div>
        <RoleGuard permission="organizations.create">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Organization
          </Button>
        </RoleGuard>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <Input
              placeholder="Search organizations by name, type, city, or email..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-9 transition-shadow focus:shadow-md focus:shadow-[hsl(var(--ring)/0.1)]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.05)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {error} &mdash; showing cached data.
          </span>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Licenses</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState hasSearch={localSearch.trim().length > 0} />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((org) => {
                  const typeInfo = getTypeInfo(org.orgType);
                  const initials = org.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  const licensesCount = org._count?.licenses ?? 0;
                  const contactsCount = org._count?.contacts ?? 0;

                  return (
                    <TableRow
                      key={org.id}
                      className="group cursor-pointer odd:bg-[hsl(var(--muted)/0.3)] transition-colors hover:bg-[hsl(var(--muted)/0.6)]"
                      onClick={() => navigate(`/organizations/${org.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className={`${typeInfo.avatarBg} ${typeInfo.avatarFg} text-[10px] font-semibold`}>
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <span className="font-medium">{org.name}</span>
                            {org.city && (
                              <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                                {org.city}
                                {org.state ? `, ${org.state}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                        {licensesCount}
                      </TableCell>
                      <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                        {contactsCount}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`h-2 w-2 rounded-full ${
                              org.isActive
                                ? "bg-[hsl(var(--success))] animate-pulse-dot"
                                : "bg-[hsl(var(--muted-foreground)/0.4)]"
                            }`}
                          />
                          <span className="text-xs capitalize text-[hsl(var(--muted-foreground))]">
                            {org.isActive ? "active" : "inactive"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                        {new Date(org.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
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
                                navigate(`/organizations/${org.id}`);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/organizations/${org.id}`);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <DropdownMenuItem
                                onClick={(e) =>
                                  handleDelete(e, org.id, org.name)
                                }
                                className="text-[hsl(var(--destructive))] focus:text-[hsl(var(--destructive))]"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Organization Dialog */}
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
