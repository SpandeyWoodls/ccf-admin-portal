import { create } from "zustand";
import { apiGet, apiPost, apiDelete } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface License {
  id: string;
  licenseKey: string;
  licenseType: string;
  tier: string;
  status: string;
  maxActivations: number;
  currentActivations: number;
  validFrom: string;
  validUntil: string | null;
  organization?: { id: string; name: string };
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Activation {
  id: string;
  hardwareFingerprint: string;
  machineName: string;
  osInfo: string;
  userEmail: string;
  appVersion: string;
  isActive: boolean;
  activatedAt: string;
  lastHeartbeatAt: string | null;
}

export interface LicenseEvent {
  id: number;
  action: string;
  actorType: string;
  actorEmail: string | null;
  metadata: any;
  createdAt: string;
}

export interface LicenseDetail extends License {
  featureFlags: Record<string, any>;
  issuedBy?: { name: string };
  purchaseOrderNumber: string | null;
  invoiceNumber: string | null;
  amountInr: number | null;
  activations: Activation[];
  events: LicenseEvent[];
}

export interface LicenseFilters {
  status?: string;
  tier?: string;
  search?: string;
  page: number;
  limit: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Shape returned by the backend paginated() helper */
interface BackendPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Convert backend paginated response to the shape our store expects */
function fromBackendPaginated<T>(raw: BackendPaginatedResponse<T>): {
  items: T[];
  pagination: Pagination;
} {
  return {
    items: raw.items,
    pagination: {
      page: raw.page,
      limit: raw.pageSize,
      total: raw.total,
      totalPages: raw.totalPages,
    },
  };
}

/** Map months to the duration enum the backend renew endpoint expects */
function monthsToDuration(months: number): string {
  if (months <= 1) return "30d";
  if (months <= 3) return "90d";
  if (months <= 6) return "180d";
  if (months <= 12) return "1y";
  if (months <= 24) return "2y";
  return "3y";
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface LicenseState {
  licenses: License[];
  selectedLicense: LicenseDetail | null;
  pagination: Pagination;
  isLoading: boolean;
  isActionLoading: boolean;
  error: string | null;

  fetchLicenses: (filters: LicenseFilters) => Promise<void>;
  fetchLicense: (id: string) => Promise<void>;
  createLicense: (data: Record<string, unknown>) => Promise<License>;
  suspendLicense: (id: string) => Promise<void>;
  revokeLicense: (id: string) => Promise<void>;
  reinstateLicense: (id: string) => Promise<void>;
  renewLicense: (id: string, months: number) => Promise<void>;
  deactivateMachine: (
    licenseId: string,
    activationId: string,
  ) => Promise<void>;
  clearSelectedLicense: () => void;
  reset: () => void;
}

const DEFAULT_PAGINATION: Pagination = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

export const useLicenseStore = create<LicenseState>()((set, get) => ({
  licenses: [],
  selectedLicense: null,
  pagination: { ...DEFAULT_PAGINATION },
  isLoading: false,
  isActionLoading: false,
  error: null,

  fetchLicenses: async (filters: LicenseFilters) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      params.set("page", String(filters.page));
      params.set("pageSize", String(filters.limit));
      if (filters.status && filters.status !== "all")
        params.set("status", filters.status);
      if (filters.tier && filters.tier !== "all")
        params.set("tier", filters.tier);
      if (filters.search) params.set("search", filters.search);

      const raw = await apiGet<BackendPaginatedResponse<License>>(
        `/api/v1/admin/licenses?${params.toString()}`,
      );
      const { items, pagination } = fromBackendPaginated(raw);
      set({
        licenses: items,
        pagination,
        isLoading: false,
      });
    } catch (err) {
      console.error("Failed to fetch licenses:", err);
      set({
        licenses: [],
        pagination: { ...DEFAULT_PAGINATION },
        isLoading: false,
        error:
          err instanceof Error ? err.message : "Failed to fetch licenses",
      });
    }
  },

  fetchLicense: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiGet<LicenseDetail>(
        `/api/v1/admin/licenses/${id}`,
      );
      set({ selectedLicense: data, isLoading: false });
    } catch (err) {
      console.error("Failed to fetch license details:", err);
      set({
        selectedLicense: null,
        isLoading: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch license details",
      });
    }
  },

  createLicense: async (data: Record<string, unknown>) => {
    set({ isActionLoading: true, error: null });
    try {
      const license = await apiPost<License>(
        "/api/v1/admin/licenses",
        data,
      );
      set((state) => ({
        licenses: [license, ...state.licenses],
        isActionLoading: false,
      }));
      return license;
    } catch (err) {
      console.error("Failed to create license:", err);
      set({
        isActionLoading: false,
        error:
          err instanceof Error ? err.message : "Failed to create license",
      });
      throw err;
    }
  },

  suspendLicense: async (id: string) => {
    set({ isActionLoading: true, error: null });
    try {
      await apiPost<void>(`/api/v1/admin/licenses/${id}/suspend`);
    } catch (err) {
      console.error("Failed to suspend license:", err);
      set({
        isActionLoading: false,
        error: err instanceof Error ? err.message : "Failed to suspend license",
      });
      return;
    }
    const { selectedLicense } = get();
    if (selectedLicense?.id === id) {
      set({
        selectedLicense: { ...selectedLicense, status: "suspended" },
      });
    }
    set((state) => ({
      licenses: state.licenses.map((l) =>
        l.id === id ? { ...l, status: "suspended" } : l,
      ),
      isActionLoading: false,
    }));
  },

  revokeLicense: async (id: string) => {
    set({ isActionLoading: true, error: null });
    try {
      await apiPost<void>(`/api/v1/admin/licenses/${id}/revoke`);
    } catch (err) {
      console.error("Failed to revoke license:", err);
      set({
        isActionLoading: false,
        error: err instanceof Error ? err.message : "Failed to revoke license",
      });
      return;
    }
    const { selectedLicense } = get();
    if (selectedLicense?.id === id) {
      set({
        selectedLicense: {
          ...selectedLicense,
          status: "revoked",
          currentActivations: 0,
          activations: [],
        },
      });
    }
    set((state) => ({
      licenses: state.licenses.map((l) =>
        l.id === id ? { ...l, status: "revoked", currentActivations: 0 } : l,
      ),
      isActionLoading: false,
    }));
  },

  reinstateLicense: async (id: string) => {
    set({ isActionLoading: true, error: null });
    try {
      await apiPost<void>(`/api/v1/admin/licenses/${id}/reinstate`);
    } catch (err) {
      console.error("Failed to reinstate license:", err);
      set({
        isActionLoading: false,
        error: err instanceof Error ? err.message : "Failed to reinstate license",
      });
      return;
    }
    const { selectedLicense } = get();
    if (selectedLicense?.id === id) {
      set({
        selectedLicense: { ...selectedLicense, status: "active" },
      });
    }
    set((state) => ({
      licenses: state.licenses.map((l) =>
        l.id === id ? { ...l, status: "active" } : l,
      ),
      isActionLoading: false,
    }));
  },

  renewLicense: async (id: string, months: number) => {
    set({ isActionLoading: true, error: null });
    try {
      const updated = await apiPost<LicenseDetail>(
        `/api/v1/admin/licenses/${id}/renew`,
        { duration: monthsToDuration(months) },
      );
      set((state) => ({
        selectedLicense:
          state.selectedLicense?.id === id ? updated : state.selectedLicense,
        licenses: state.licenses.map((l) =>
          l.id === id
            ? { ...l, validUntil: updated.validUntil, status: updated.status }
            : l,
        ),
        isActionLoading: false,
      }));
    } catch (err) {
      console.error("Failed to renew license:", err);
      set({
        isActionLoading: false,
        error: err instanceof Error ? err.message : "Failed to renew license",
      });
    }
  },

  deactivateMachine: async (licenseId: string, activationId: string) => {
    set({ isActionLoading: true, error: null });
    try {
      await apiDelete<void>(
        `/api/v1/admin/licenses/${licenseId}/activations/${activationId}`,
      );
    } catch (err) {
      console.error("Failed to deactivate machine:", err);
      set({
        isActionLoading: false,
        error: err instanceof Error ? err.message : "Failed to deactivate machine",
      });
      return;
    }
    set((state) => {
      const sel = state.selectedLicense;
      if (sel?.id === licenseId) {
        return {
          selectedLicense: {
            ...sel,
            activations: sel.activations.filter(
              (a) => a.id !== activationId,
            ),
            currentActivations: Math.max(0, sel.currentActivations - 1),
          },
          licenses: state.licenses.map((l) =>
            l.id === licenseId
              ? { ...l, currentActivations: Math.max(0, l.currentActivations - 1) }
              : l,
          ),
          isActionLoading: false,
        };
      }
      return { isActionLoading: false };
    });
  },

  clearSelectedLicense: () => set({ selectedLicense: null }),

  reset: () =>
    set({
      licenses: [],
      selectedLicense: null,
      pagination: { ...DEFAULT_PAGINATION },
      isLoading: false,
      isActionLoading: false,
      error: null,
    }),
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useLicenses = () => useLicenseStore((s) => s.licenses);

export const useSelectedLicense = () =>
  useLicenseStore((s) => s.selectedLicense);

export const useLicensePagination = () =>
  useLicenseStore((s) => s.pagination);

export const useLicenseLoading = () =>
  useLicenseStore((s) => s.isLoading);
