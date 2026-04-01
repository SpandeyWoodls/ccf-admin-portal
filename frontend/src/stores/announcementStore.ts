import { create } from "zustand";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Announcement {
  id: string;
  title: string;
  message: string;
  announcementType: "info" | "warning" | "critical" | "maintenance";
  targetOrgIds: string[] | null;
  targetTiers: string[] | null;
  targetVersions: string[] | null;
  actionUrl: string | null;
  actionLabel: string | null;
  dismissible: boolean;
  priority: number;
  startsAt: string;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string; email: string } | null;
}

// ---------------------------------------------------------------------------
// Backend paginated response shape
// ---------------------------------------------------------------------------

interface BackendPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// No mock data -- stores return empty arrays on API failure

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const DEFAULT_PAGINATION: Pagination = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AnnouncementState {
  announcements: Announcement[];
  pagination: Pagination;
  isLoading: boolean;
  error: string | null;

  fetchAnnouncements: (params?: { page?: number; limit?: number }) => Promise<void>;
  createAnnouncement: (
    data: Record<string, unknown>,
  ) => Promise<Announcement>;
  updateAnnouncement: (
    id: string,
    data: Record<string, unknown>,
  ) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
  reset: () => void;
}

export const useAnnouncementStore = create<AnnouncementState>()(
  (set) => ({
    announcements: [],
    pagination: { ...DEFAULT_PAGINATION },
    isLoading: false,
    error: null,

    fetchAnnouncements: async (params?: { page?: number; limit?: number }) => {
      set({ isLoading: true, error: null });
      try {
        const qp = new URLSearchParams();
        if (params?.page) qp.set("page", String(params.page));
        if (params?.limit) qp.set("pageSize", String(params.limit));
        const qs = qp.toString();
        const raw = await apiGet<BackendPaginatedResponse<Announcement>>(
          `/api/v1/admin/announcements${qs ? `?${qs}` : ""}`,
        );
        set({
          announcements: raw.items,
          pagination: raw
            ? { page: raw.page, limit: raw.pageSize, total: raw.total, totalPages: raw.totalPages }
            : { ...DEFAULT_PAGINATION },
          isLoading: false,
        });
      } catch (err) {
        set({
          announcements: [],
          isLoading: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to fetch announcements",
        });
      }
    },

    createAnnouncement: async (data: Record<string, unknown>) => {
      set({ isLoading: true, error: null });
      try {
        const announcement = await apiPost<Announcement>(
          "/api/v1/admin/announcements",
          data,
        );
        set((state) => ({
          announcements: [announcement, ...state.announcements],
          isLoading: false,
        }));
        return announcement;
      } catch (err) {
        set({
          isLoading: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to create announcement",
        });
        throw err;
      }
    },

    updateAnnouncement: async (
      id: string,
      data: Record<string, unknown>,
    ) => {
      set({ isLoading: true, error: null });
      try {
        const updated = await apiPatch<Announcement>(
          `/api/v1/admin/announcements/${id}`,
          data,
        );
        set((state) => ({
          announcements: state.announcements.map((a) =>
            a.id === id ? updated : a,
          ),
          isLoading: false,
        }));
      } catch (err) {
        set({
          isLoading: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to update announcement",
        });
        throw err;
      }
    },

    deleteAnnouncement: async (id: string) => {
      set({ isLoading: true, error: null });
      try {
        await apiDelete<void>(`/api/v1/admin/announcements/${id}`);
        set((state) => ({
          announcements: state.announcements.filter((a) => a.id !== id),
          isLoading: false,
        }));
      } catch (err) {
        console.error("Failed to delete announcement:", err);
        set({
          isLoading: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to delete announcement",
        });
        throw err;
      }
    },

    reset: () =>
      set({ announcements: [], pagination: { ...DEFAULT_PAGINATION }, isLoading: false, error: null }),
  }),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useAnnouncements = () =>
  useAnnouncementStore((s) => s.announcements);

export const useAnnouncementLoading = () =>
  useAnnouncementStore((s) => s.isLoading);

export const useAnnouncementPagination = () =>
  useAnnouncementStore((s) => s.pagination);
