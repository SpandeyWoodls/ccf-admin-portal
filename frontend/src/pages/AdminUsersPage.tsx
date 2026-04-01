import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  KeyRound,
  Users,
  AlertCircle,
  ShieldCheck,
  UserX,
  UserCheck,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAdminUserStore } from "@/stores/adminUserStore";
import { RoleGuard } from "@/components/shared/RoleGuard";
import { useCan } from "@/lib/rbac";

// ---------------------------------------------------------------------------
// Role badge config
// ---------------------------------------------------------------------------

const roleConfig: Record<
  string,
  { label: string; color: string; avatarBg: string; avatarFg: string }
> = {
  super_admin: {
    label: "Super Admin",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    avatarBg: "bg-purple-100 dark:bg-purple-900/40",
    avatarFg: "text-purple-700 dark:text-purple-300",
  },
  admin: {
    label: "Admin",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    avatarBg: "bg-blue-100 dark:bg-blue-900/40",
    avatarFg: "text-blue-700 dark:text-blue-300",
  },
  support: {
    label: "Support",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    avatarBg: "bg-emerald-100 dark:bg-emerald-900/40",
    avatarFg: "text-emerald-700 dark:text-emerald-300",
  },
  viewer: {
    label: "Viewer",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400 border-gray-200 dark:border-gray-800",
    avatarBg: "bg-gray-100 dark:bg-gray-900/40",
    avatarFg: "text-gray-600 dark:text-gray-400",
  },
};

function getRoleInfo(role: string) {
  return (
    roleConfig[role] || {
      label: role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      color: "bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400 border-gray-200 dark:border-gray-800",
      avatarBg: "bg-[hsl(var(--primary)/0.1)]",
      avatarFg: "text-[hsl(var(--primary))]",
    }
  );
}

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "support", label: "Support" },
  { value: "viewer", label: "Viewer" },
] as const;

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
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-14" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
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
        <Users className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.6)]" />
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
        {hasSearch ? "No admin users found" : "No admin users yet"}
      </h3>
      <p className="mt-1.5 max-w-xs text-sm text-[hsl(var(--muted-foreground))]">
        {hasSearch
          ? "Try adjusting your search query or clearing the filter."
          : "Create your first admin user to start managing the portal."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Admin Dialog
// ---------------------------------------------------------------------------

function CreateAdminDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createUser = useAdminUserStore((s) => s.createUser);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("");

  const resetForm = () => {
    setEmail("");
    setName("");
    setPassword("");
    setRole("");
  };

  const handleClose = (nextOpen: boolean) => {
    if (!isSubmitting) {
      if (!nextOpen) resetForm();
      onOpenChange(nextOpen);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim() || !password.trim() || !role) return;

    setIsSubmitting(true);
    try {
      await createUser({ email, name, password, role });
      toast.success("Admin user created", {
        description: `${name} has been added as ${getRoleInfo(role).label}.`,
      });
      resetForm();
      onOpenChange(false);
    } catch {
      toast.error("Failed to create admin user", {
        description: "Please try again or check your connection.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-[hsl(var(--primary))]" />
            Create Admin User
          </DialogTitle>
          <DialogDescription>
            Add a new administrator to the portal. Fields marked with * are
            required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-name">
              Name <span className="text-[hsl(var(--destructive))]">*</span>
            </Label>
            <Input
              id="admin-name"
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-email">
              Email <span className="text-[hsl(var(--destructive))]">*</span>
            </Label>
            <Input
              id="admin-email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-password">
              Password <span className="text-[hsl(var(--destructive))]">*</span>
            </Label>
            <Input
              id="admin-password"
              type="password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Role <span className="text-[hsl(var(--destructive))]">*</span>
            </Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !role}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Admin
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit Role Dialog
// ---------------------------------------------------------------------------

function EditRoleDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; name: string; role: string } | null;
}) {
  const updateUser = useAdminUserStore((s) => s.updateUser);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [role, setRole] = useState(user?.role || "");

  useEffect(() => {
    if (user) setRole(user.role);
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !role) return;

    setIsSubmitting(true);
    try {
      await updateUser(user.id, { role });
      toast.success("Role updated", {
        description: `${user.name} is now a ${getRoleInfo(role).label}.`,
      });
      onOpenChange(false);
    } catch {
      toast.error("Failed to update role");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-[hsl(var(--primary))]" />
            Edit Role
          </DialogTitle>
          <DialogDescription>
            Change the role for {user?.name || "this user"}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || role === user?.role}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reset Password Dialog
// ---------------------------------------------------------------------------

function ResetPasswordDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; name: string } | null;
}) {
  const resetPassword = useAdminUserStore((s) => s.resetPassword);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const handleClose = (nextOpen: boolean) => {
    if (!isSubmitting) {
      if (!nextOpen) setNewPassword("");
      onOpenChange(nextOpen);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newPassword.trim()) return;

    setIsSubmitting(true);
    try {
      await resetPassword(user.id, newPassword);
      toast.success("Password reset", {
        description: `Password for ${user.name} has been updated.`,
      });
      setNewPassword("");
      onOpenChange(false);
    } catch {
      toast.error("Failed to reset password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[hsl(var(--primary))]" />
            Reset Password
          </DialogTitle>
          <DialogDescription>
            Set a new password for {user?.name || "this user"}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">
              New Password <span className="text-[hsl(var(--destructive))]">*</span>
            </Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Minimum 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reset Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AdminUsersPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editRoleUser, setEditRoleUser] = useState<{
    id: string;
    name: string;
    role: string;
  } | null>(null);
  const [resetPwUser, setResetPwUser] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [localSearch, setLocalSearch] = useState("");
  const canEdit = useCan("settings.team");
  const canDelete = useCan("settings.team");

  const { users, isLoading, error, fetchUsers, updateUser, deleteUser } =
    useAdminUserStore();

  // Fetch on mount
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Client-side search filtering
  const filtered = users.filter((user) => {
    if (!localSearch.trim()) return true;
    const q = localSearch.toLowerCase();
    return (
      user.name.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      user.role.toLowerCase().includes(q)
    );
  });

  const handleToggleActive = async (
    e: React.MouseEvent,
    user: { id: string; name: string; isActive: boolean },
  ) => {
    e.stopPropagation();
    const action = user.isActive ? "deactivate" : "activate";
    if (
      !window.confirm(
        `${action.charAt(0).toUpperCase() + action.slice(1)} "${user.name}"?`,
      )
    ) {
      return;
    }
    try {
      await updateUser(user.id, { isActive: !user.isActive });
      toast.success(
        user.isActive ? "User deactivated" : "User activated",
        {
          description: `${user.name} has been ${action}d.`,
        },
      );
    } catch {
      toast.error(`Failed to ${action} user`);
    }
  };

  const handleDelete = async (
    e: React.MouseEvent,
    userId: string,
    userName: string,
  ) => {
    e.stopPropagation();
    if (
      !window.confirm(`Delete "${userName}"? This action cannot be undone.`)
    ) {
      return;
    }
    try {
      await deleteUser(userId);
      toast.success("Admin user deleted", {
        description: `${userName} has been removed.`,
      });
    } catch {
      toast.error("Failed to delete admin user");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
              Admin Users
            </h1>
            {!isLoading && users.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-[hsl(var(--muted))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                {users.length}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Manage portal administrators, roles, and access.
          </p>
        </div>
        <RoleGuard permission="settings.team">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Admin
          </Button>
        </RoleGuard>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <Input
              placeholder="Search by name, email, or role..."
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
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState hasSearch={localSearch.trim().length > 0} />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((user) => {
                  const roleInfo = getRoleInfo(user.role);
                  const initials = user.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <TableRow
                      key={user.id}
                      className="group odd:bg-[hsl(var(--muted)/0.3)] transition-colors hover:bg-[hsl(var(--muted)/0.6)]"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback
                              className={`${roleInfo.avatarBg} ${roleInfo.avatarFg} text-[10px] font-semibold`}
                            >
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <span className="font-medium">{user.name}</span>
                            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={roleInfo.color}
                        >
                          {roleInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`h-2 w-2 rounded-full ${
                              user.isActive
                                ? "bg-[hsl(var(--success))] animate-pulse-dot"
                                : "bg-[hsl(var(--muted-foreground)/0.4)]"
                            }`}
                          />
                          <span className="text-xs capitalize text-[hsl(var(--muted-foreground))]">
                            {user.isActive ? "active" : "inactive"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              },
                            )
                          : "Never"}
                      </TableCell>
                      <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                        {new Date(user.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        {canEdit && (
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
                                  setEditRoleUser({
                                    id: user.id,
                                    name: user.name,
                                    role: user.role,
                                  });
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit Role
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setResetPwUser({
                                    id: user.id,
                                    name: user.name,
                                  });
                                }}
                              >
                                <KeyRound className="mr-2 h-4 w-4" />
                                Reset Password
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => handleToggleActive(e, user)}
                              >
                                {user.isActive ? (
                                  <>
                                    <UserX className="mr-2 h-4 w-4" />
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    Activate
                                  </>
                                )}
                              </DropdownMenuItem>
                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) =>
                                      handleDelete(e, user.id, user.name)
                                    }
                                    className="text-[hsl(var(--destructive))] focus:text-[hsl(var(--destructive))]"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateAdminDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditRoleDialog
        open={!!editRoleUser}
        onOpenChange={(open) => {
          if (!open) setEditRoleUser(null);
        }}
        user={editRoleUser}
      />
      <ResetPasswordDialog
        open={!!resetPwUser}
        onOpenChange={(open) => {
          if (!open) setResetPwUser(null);
        }}
        user={resetPwUser}
      />
    </div>
  );
}
