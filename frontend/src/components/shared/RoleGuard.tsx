import type { ReactNode } from "react";
import { useCan, type Permission } from "@/lib/rbac";

interface RoleGuardProps {
  permission: Permission;
  children: ReactNode;
  /** What to render if the user lacks the permission (default: nothing). */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on the current user's role permissions.
 * If the user lacks the required permission, renders the fallback (or nothing).
 */
export function RoleGuard({ permission, children, fallback = null }: RoleGuardProps) {
  const allowed = useCan(permission);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
