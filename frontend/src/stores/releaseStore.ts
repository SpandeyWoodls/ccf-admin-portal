import { create } from "zustand";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReleaseAsset {
  id: string;
  platform: string;
  arch: string;
  packageType: string;
  filename: string;
  fileSize: number;
  sha256Hash: string;
  downloadUrl: string;
  signature: string | null;
}

export interface Release {
  id: string;
  version: string;
  channel: string;
  severity: string;
  title: string;
  releaseNotes: string | null;
  forceUpdate: boolean;
  isBlocked: boolean;
  publishedAt: string | null;
  createdAt: string;
  assets?: ReleaseAsset[];
  _count?: { assets: number; downloads: number };
}

export interface ReleaseDetail extends Release {
  gitCommitSha: string | null;
  minVersion: string | null;
  blockReason: string | null;
  assets: ReleaseAsset[];
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

interface ReleaseState {
  releases: Release[];
  selectedRelease: ReleaseDetail | null;
  isLoading: boolean;
  error: string | null;

  fetchReleases: () => Promise<void>;
  fetchRelease: (id: string) => Promise<void>;
  createRelease: (data: Record<string, unknown>) => Promise<Release>;
  publishRelease: (id: string, force?: boolean) => Promise<void>;
  blockRelease: (id: string, reason: string) => Promise<void>;
  deleteRelease: (id: string) => Promise<void>;
  updateRelease: (id: string, data: Record<string, unknown>) => Promise<void>;
  importAssets: (releaseId: string) => Promise<void>;
  clearSelectedRelease: () => void;
  reset: () => void;
}

export const useReleaseStore = create<ReleaseState>()((set, get) => ({
  releases: [],
  selectedRelease: null,
  isLoading: false,
  error: null,

  fetchReleases: async () => {
    set({ isLoading: true, error: null });
    try {
      const raw = await apiGet<BackendPaginatedResponse<Release>>(
        "/api/v1/admin/releases",
      );
      set({ releases: raw.items, isLoading: false });
    } catch (err) {
      set({
        releases: [],
        isLoading: false,
        error:
          err instanceof Error ? err.message : "Failed to fetch releases",
      });
    }
  },

  fetchRelease: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiGet<ReleaseDetail>(
        `/api/v1/admin/releases/${id}`,
      );
      set({ selectedRelease: data, isLoading: false });
    } catch (err) {
      set({
        selectedRelease: null,
        isLoading: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch release details",
      });
    }
  },

  createRelease: async (data: Record<string, unknown>) => {
    set({ isLoading: true, error: null });
    try {
      const release = await apiPost<Release>(
        "/api/v1/admin/releases",
        data,
      );
      set((state) => ({
        releases: [release, ...state.releases],
        isLoading: false,
      }));
      return release;
    } catch (err) {
      set({
        isLoading: false,
        error:
          err instanceof Error ? err.message : "Failed to create release",
      });
      throw err;
    }
  },

  publishRelease: async (id: string, force = false) => {
    set({ isLoading: true, error: null });
    try {
      const qs = force ? "?force=true" : "";
      await apiPost<void>(`/api/v1/admin/releases/${id}/publish${qs}`);
    } catch (err) {
      console.error("Failed to publish release:", err);
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to publish release",
      });
      throw err;
    }
    const now = new Date().toISOString();
    const { selectedRelease } = get();
    if (selectedRelease?.id === id) {
      set({ selectedRelease: { ...selectedRelease, publishedAt: now } });
    }
    set((state) => ({
      releases: state.releases.map((r) =>
        r.id === id ? { ...r, publishedAt: now } : r,
      ),
      isLoading: false,
    }));
  },

  blockRelease: async (id: string, reason: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiPost<void>(`/api/v1/admin/releases/${id}/block`, {
        reason,
      });
    } catch (err) {
      console.error("Failed to block release:", err);
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to block release",
      });
      return;
    }
    const { selectedRelease } = get();
    if (selectedRelease?.id === id) {
      set({
        selectedRelease: {
          ...selectedRelease,
          isBlocked: true,
          blockReason: reason,
        },
      });
    }
    set((state) => ({
      releases: state.releases.map((r) =>
        r.id === id ? { ...r, isBlocked: true } : r,
      ),
      isLoading: false,
    }));
  },

  deleteRelease: async (id: string) => {
    try {
      await apiDelete(`/api/v1/admin/releases/${id}`);
      set((state) => ({
        releases: state.releases.filter((r) => r.id !== id),
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to delete release",
      });
      throw err;
    }
  },

  updateRelease: async (id: string, data: Record<string, unknown>) => {
    try {
      const updated = await apiPatch<Release>(
        `/api/v1/admin/releases/${id}`,
        data,
      );
      set((state) => ({
        releases: state.releases.map((r) => (r.id === id ? { ...r, ...updated } : r)),
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to update release",
      });
      throw err;
    }
  },

  importAssets: async (releaseId: string) => {
    try {
      await apiPost(`/api/v1/admin/release-wizard/import-assets`, {
        releaseId,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to import assets",
      });
      throw err;
    }
  },

  clearSelectedRelease: () => set({ selectedRelease: null }),

  reset: () =>
    set({
      releases: [],
      selectedRelease: null,
      isLoading: false,
      error: null,
    }),
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useReleases = () => useReleaseStore((s) => s.releases);

export const useSelectedRelease = () =>
  useReleaseStore((s) => s.selectedRelease);

export const useReleaseLoading = () =>
  useReleaseStore((s) => s.isLoading);
