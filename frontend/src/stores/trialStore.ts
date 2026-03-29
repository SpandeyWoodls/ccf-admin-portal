import { create } from "zustand";
import { apiGet, apiPost } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrialRequest {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  organization: string;
  organizationType: string;
  designation: string;
  department: string;
  purpose: string;
  expectedVolume: string;
  hardwareFingerprint: string;
  machineName: string;
  osInfo: string;
  appVersion: string;
  status: "pending" | "approved" | "rejected";
  approvedLicenseKey?: string;
  rejectionReason?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface ApprovePayload {
  tier: string;
  months: number;
}

export interface TrialFilters {
  status?: string;
  page: number;
  limit: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface TrialListResponse {
  trials: TrialRequest[];
  pagination: Pagination;
}

interface ApproveResponse {
  trial: TrialRequest;
  licenseKey: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface TrialState {
  trials: TrialRequest[];
  pagination: Pagination;
  isLoading: boolean;
  error: string | null;

  fetchTrials: (filters: TrialFilters) => Promise<void>;
  approveTrialRequest: (
    id: string,
    payload: ApprovePayload,
  ) => Promise<ApproveResponse>;
  rejectTrialRequest: (id: string, reason: string) => Promise<void>;
  reset: () => void;
}

const DEFAULT_PAGINATION: Pagination = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

export const useTrialStore = create<TrialState>()((set) => ({
  trials: [],
  pagination: { ...DEFAULT_PAGINATION },
  isLoading: false,
  error: null,

  fetchTrials: async (filters: TrialFilters) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      params.set("page", String(filters.page));
      params.set("pageSize", String(filters.limit));
      if (filters.status) params.set("status", filters.status);

      const data = await apiGet<TrialListResponse>(
        `/api/v1/admin/trials?${params.toString()}`,
      );
      set({
        trials: Array.isArray(data?.trials) ? data.trials : [],
        pagination: data?.pagination ?? { ...DEFAULT_PAGINATION },
        isLoading: false,
      });
    } catch (err) {
      set({
        trials: [],
        pagination: { ...DEFAULT_PAGINATION },
        isLoading: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch trial requests",
      });
    }
  },

  approveTrialRequest: async (id: string, payload: ApprovePayload) => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiPost<ApproveResponse>(
        `/api/v1/admin/trials/${id}/approve`,
        payload,
      );
      set((state) => ({
        trials: (state.trials ?? []).map((t) =>
          t.id === id
            ? {
                ...t,
                status: "approved" as const,
                approvedLicenseKey: result.licenseKey,
                reviewedAt: new Date().toISOString(),
              }
            : t,
        ),
        isLoading: false,
      }));
      return result;
    } catch (err) {
      set({
        isLoading: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to approve trial request",
      });
      throw err;
    }
  },

  rejectTrialRequest: async (id: string, reason: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiPost<void>(`/api/v1/admin/trials/${id}/reject`, { reason });
      set((state) => ({
        trials: (state.trials ?? []).map((t) =>
          t.id === id
            ? {
                ...t,
                status: "rejected" as const,
                rejectionReason: reason,
                reviewedAt: new Date().toISOString(),
              }
            : t,
        ),
        isLoading: false,
      }));
    } catch (err) {
      set({
        isLoading: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to reject trial request",
      });
      throw err;
    }
  },

  reset: () =>
    set({
      trials: [],
      pagination: { ...DEFAULT_PAGINATION },
      isLoading: false,
      error: null,
    }),
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useTrials = () => useTrialStore((s) => s.trials);
export const useTrialLoading = () => useTrialStore((s) => s.isLoading);
export const useTrialPagination = () => useTrialStore((s) => s.pagination);
