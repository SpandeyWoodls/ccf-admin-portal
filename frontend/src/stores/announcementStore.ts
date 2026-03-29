import { create } from "zustand";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: string;
  targetAudience: string;
  isActive: boolean;
  publishAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { name: string };
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AnnouncementState {
  announcements: Announcement[];
  isLoading: boolean;
  error: string | null;

  fetchAnnouncements: () => Promise<void>;
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
    isLoading: false,
    error: null,

    fetchAnnouncements: async () => {
      set({ isLoading: true, error: null });
      try {
        const raw = await apiGet<BackendPaginatedResponse<Announcement>>(
          "/api/v1/admin/announcements",
        );
        set({ announcements: raw.items, isLoading: false });
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
      set({ announcements: [], isLoading: false, error: null }),
  }),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useAnnouncements = () =>
  useAnnouncementStore((s) => s.announcements);

export const useAnnouncementLoading = () =>
  useAnnouncementStore((s) => s.isLoading);
