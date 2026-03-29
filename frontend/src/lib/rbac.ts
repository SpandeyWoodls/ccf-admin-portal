import { useAuthStore } from "@/stores/authStore";

export type AdminRole = "super_admin" | "admin" | "support" | "viewer";

export const PERMISSIONS = {
  // Dashboard
  "dashboard.view": ["super_admin", "admin", "support", "viewer"],

  // Licenses
  "licenses.view": ["super_admin", "admin", "support", "viewer"],
  "licenses.create": ["super_admin", "admin"],
  "licenses.edit": ["super_admin", "admin"],
  "licenses.suspend": ["super_admin", "admin"],
  "licenses.revoke": ["super_admin"],
  "licenses.bulk": ["super_admin", "admin"],

  // Organizations
  "organizations.view": ["super_admin", "admin", "support", "viewer"],
  "organizations.create": ["super_admin", "admin"],
  "organizations.edit": ["super_admin", "admin"],
  "organizations.delete": ["super_admin"],

  // Trials
  "trials.view": ["super_admin", "admin", "support"],
  "trials.approve": ["super_admin", "admin"],
  "trials.reject": ["super_admin", "admin"],

  // Releases
  "releases.view": ["super_admin", "admin", "support", "viewer"],
  "releases.create": ["super_admin", "admin"],
  "releases.publish": ["super_admin", "admin"],
  "releases.block": ["super_admin"],

  // Downloads
  "downloads.view": ["super_admin", "admin", "support", "viewer"],

  // Announcements
  "announcements.view": ["super_admin", "admin", "support", "viewer"],
  "announcements.create": ["super_admin", "admin"],
  "announcements.edit": ["super_admin", "admin"],
  "announcements.delete": ["super_admin"],

  // Support
  "support.view": ["super_admin", "admin", "support"],
  "support.reply": ["super_admin", "admin", "support"],
  "support.close": ["super_admin", "admin", "support"],

  // Analytics
  "analytics.view": ["super_admin", "admin", "viewer"],

  // Audit Log
  "audit.view": ["super_admin", "admin"],

  // Settings
  "settings.view": ["super_admin", "admin"],
  "settings.edit": ["super_admin"],
  "settings.team": ["super_admin"],
  "settings.api": ["super_admin", "admin"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: AdminRole, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return (allowedRoles as readonly string[]).includes(role);
}

export function usePermission(permission: Permission): boolean {
  const role = useAuthStore((s) => s.user?.role) as AdminRole;
  if (!role) return false;
  return hasPermission(role, permission);
}

/** Hook: returns true if the current user can perform the given action. */
export function useCan(permission: Permission): boolean {
  return usePermission(permission);
}
