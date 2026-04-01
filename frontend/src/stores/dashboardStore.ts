import { create } from "zustand";
import { apiGet } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LicenseByTier {
  tier: string;
  count: number;
}

interface LicenseByStatus {
  status: string;
  count: number;
}

interface RecentActivity {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
  adminUser?: { name: string };
}

interface ActivationOverTime {
  month: string;
  count: number;
}

export interface DashboardStats {
  totalActiveLicenses: number;
  expiringWithin30Days: number;
  totalOrganizations: number;
  activeTrials: number;
  trialConversionRate: number;
  monthlyRevenue: number;
  versionAdoption: number;
  licensesByTier: LicenseByTier[];
  licensesByStatus: LicenseByStatus[];
  recentActivity: RecentActivity[];
  activationsOverTime: ActivationOverTime[];
}

// ---------------------------------------------------------------------------
// Transform backend activity events to the shape the frontend expects
// ---------------------------------------------------------------------------

/**
 * Backend returns events like:
 *   { id, action: "license_created", actorType, actorEmail, createdAt,
 *     license: { licenseKey, tier }, organization: { name } }
 *
 * Frontend expects:
 *   { id, action: "license.created", resourceType, resourceId, createdAt,
 *     adminUser?: { name } }
 */
function transformRecentActivity(rawActivity: unknown): RecentActivity[] {
  if (!Array.isArray(rawActivity)) return [];

  return rawActivity.map((evt: any) => {
    // Convert action format: "license_created" -> "license.created"
    const action = typeof evt.action === "string"
      ? evt.action.replace(/_/g, ".")
      : evt.action;

    // Derive resourceType from the action prefix
    const RESOURCE_MAP: Record<string, string> = {
      license: "license", organization: "organization", org: "organization",
      trial: "trial", release: "release", contact: "contact",
      announcement: "announcement", ticket: "ticket", support: "ticket",
      activation: "license", user: "admin_user", admin: "admin_user",
    };
    const prefix = (action?.split(".")[0] ?? "").toLowerCase();
    const resourceType = RESOURCE_MAP[prefix] ?? "license";

    // Derive resourceId: prefer licenseKey from nested license, then fallback
    const resourceId =
      evt.license?.licenseKey ??
      evt.resourceId ??
      evt.id?.toString() ??
      "unknown";

    // adminUser: prefer organization name, then actorEmail
    const adminUser = evt.organization?.name
      ? { name: evt.organization.name }
      : evt.adminUser ?? (evt.actorEmail ? { name: evt.actorEmail } : undefined);

    return {
      id: evt.id?.toString() ?? String(Math.random()),
      action,
      resourceType,
      resourceId,
      createdAt: evt.createdAt,
      adminUser,
    } as RecentActivity;
  });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface DashboardState {
  stats: DashboardStats | null;
  isLoading: boolean;
  error: string | null;

  fetchStats: () => Promise<void>;
  reset: () => void;
}

export const useDashboardStore = create<DashboardState>()((set) => ({
  stats: null,
  isLoading: false,
  error: null,

  fetchStats: async () => {
    set({ isLoading: true, error: null });
    try {
      const raw = await apiGet<Record<string, unknown>>(
        "/api/v1/admin/dashboard",
      );

      // The backend returns licensesByTier and licensesByStatus as
      // Record<string, number> objects. Transform them into the array
      // format the frontend components expect.
      const tierObj = (raw.licensesByTier ?? {}) as Record<string, number>;
      const statusObj = (raw.licensesByStatus ?? {}) as Record<string, number>;

      const data: DashboardStats = {
        totalActiveLicenses: (raw.totalActiveLicenses as number) ?? 0,
        expiringWithin30Days: (raw.expiringWithin30Days as number) ?? 0,
        totalOrganizations: (raw.totalOrganizations as number) ?? 0,
        activeTrials: (raw.activeTrials as number) ?? 0,
        trialConversionRate: (raw.trialConversionRate as number) ?? 0,
        // These fields are not yet returned by the backend; use defaults
        monthlyRevenue: (raw.monthlyRevenue as number) ?? 0,
        versionAdoption: (raw.versionAdoption as number) ?? 0,
        licensesByTier: Array.isArray(tierObj)
          ? tierObj
          : Object.entries(tierObj).map(([tier, count]) => ({ tier, count })),
        licensesByStatus: Array.isArray(statusObj)
          ? statusObj
          : Object.entries(statusObj).map(([status, count]) => ({ status, count })),
        recentActivity: transformRecentActivity(raw.recentActivity),
        activationsOverTime: (raw.activationsOverTime as ActivationOverTime[]) ?? [],
      };

      set({ stats: data, isLoading: false });
    } catch (err) {
      console.error("Failed to fetch dashboard stats:", err);
      set({
        stats: null,
        isLoading: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch dashboard stats",
      });
    }
  },

  reset: () => set({ stats: null, isLoading: false, error: null }),
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useDashboardStats = () =>
  useDashboardStore((s) => s.stats);

export const useDashboardLoading = () =>
  useDashboardStore((s) => s.isLoading);
