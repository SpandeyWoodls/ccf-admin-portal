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
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  law_enforcement: { label: "Law Enforcement", variant: "default" },
  government: { label: "Government", variant: "secondary" },
  forensic_lab: { label: "Forensic Lab", variant: "outline" },
  private_lab: { label: "Private Lab", variant: "outline" },
  academic: { label: "Academic", variant: "outline" },
  educational: { label: "Educational", variant: "outline" },
  corporate: { label: "Corporate", variant: "secondary" },
  private: { label: "Private", variant: "secondary" },
  individual: { label: "Individual", variant: "outline" },
};

function getTypeInfo(type: string) {
  return (
    typeConfig[type] || {
      label: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      variant: "outline" as const,
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
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
        <Building2 className="h-7 w-7 text-[hsl(var(--muted-foreground))]" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-[hsl(var(--foreground))]">
        {hasSearch ? "No organizations found" : "No organizations yet"}
      </h3>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
        {hasSearch
          ? "Try adjusting your search query."
          : "Create your first organization to get started."}
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
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Organizations
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Manage client organizations and their accounts.
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <Input
              placeholder="Search organizations by name, type, city, or email..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-9"
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
                      className="cursor-pointer"
                      onClick={() => navigate(`/organizations/${org.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] text-[10px] font-semibold">
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
                        <Badge variant={typeInfo.variant} className="text-[10px]">
                          {typeInfo.label}
                        </Badge>
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
                                ? "bg-[hsl(var(--success))]"
                                : "bg-[hsl(var(--muted-foreground))]"
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
                                className="text-[hsl(var(--destructive))]"
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
