import { create } from "zustand";
import { apiGet } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  adminUser: { id: string; name: string; email: string } | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditFilters {
  action?: string;
  resourceType?: string;
  adminUserId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Shape of a single audit log item as returned by the backend */
interface BackendAuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  admin: { id: string; name: string; email: string } | null;
  ipAddress: string | null;
  userAgent: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: string;
}

/** Shape returned by the backend paginated() helper */
interface BackendPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// No mock data -- stores return empty arrays on API failure

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AuditState {
  logs: AuditLog[];
  pagination: Pagination;
  isLoading: boolean;
  error: string | null;

  fetchAuditLogs: (filters?: AuditFilters) => Promise<void>;
  reset: () => void;
}

const DEFAULT_PAGINATION: Pagination = {
  page: 1,
  limit: 50,
  total: 0,
  totalPages: 0,
};

export const useAuditStore = create<AuditState>()((set) => ({
  logs: [],
  pagination: { ...DEFAULT_PAGINATION },
  isLoading: false,
  error: null,

  fetchAuditLogs: async (filters?: AuditFilters) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (filters?.action) params.set("action", filters.action);
      if (filters?.resourceType)
        params.set("resourceType", filters.resourceType);
      if (filters?.adminUserId)
        params.set("adminUserId", filters.adminUserId);
      // Backend uses "from" / "to" for date range, not "startDate" / "endDate"
      if (filters?.startDate) params.set("from", filters.startDate);
      if (filters?.endDate) params.set("to", filters.endDate);
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.limit) params.set("pageSize", String(filters.limit));

      const query = params.toString();
      const path = `/api/v1/admin/audit${query ? `?${query}` : ""}`;
      const raw = await apiGet<BackendPaginatedResponse<BackendAuditLog>>(path);
      // Map backend field name "admin" to frontend "adminUser"
      const logs: AuditLog[] = raw.items.map((item) => ({
        id: item.id,
        action: item.action,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        adminUser: item.admin,
        ipAddress: item.ipAddress,
        userAgent: item.userAgent,
        metadata: item.oldValues ?? item.newValues ?? null,
        createdAt: item.createdAt,
      }));
      set({
        logs,
        pagination: {
          page: raw.page,
          limit: raw.pageSize,
          total: raw.total,
          totalPages: raw.totalPages,
        },
        isLoading: false,
      });
    } catch (err) {
      set({
        logs: [],
        pagination: { ...DEFAULT_PAGINATION },
        isLoading: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch audit logs",
      });
    }
  },

  reset: () =>
    set({
      logs: [],
      pagination: { ...DEFAULT_PAGINATION },
      isLoading: false,
      error: null,
    }),
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useAuditLogs = () => useAuditStore((s) => s.logs);

export const useAuditPagination = () =>
  useAuditStore((s) => s.pagination);

export const useAuditLoading = () =>
  useAuditStore((s) => s.isLoading);
