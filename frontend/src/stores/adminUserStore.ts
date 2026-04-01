import { create } from "zustand";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AdminUserState {
  users: AdminUser[];
  pagination: Pagination;
  isLoading: boolean;
  error: string | null;

  fetchUsers: (filters?: { search?: string; role?: string; page?: number }) => Promise<void>;
  createUser: (data: Record<string, unknown>) => Promise<AdminUser>;
  updateUser: (id: string, data: Record<string, unknown>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  resetPassword: (id: string, newPassword: string) => Promise<void>;
  reset: () => void;
}

const DEFAULT_PAGINATION: Pagination = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

export const useAdminUserStore = create<AdminUserState>()((set) => ({
  users: [],
  pagination: { ...DEFAULT_PAGINATION },
  isLoading: false,
  error: null,

  fetchUsers: async (filters) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (filters?.search) params.set("search", filters.search);
      if (filters?.role) params.set("role", filters.role);
      if (filters?.page) params.set("page", String(filters.page));

      const raw = await apiGet<BackendPaginatedResponse<AdminUser>>(
        `/api/v1/admin/users?${params.toString()}`,
      );
      set({
        users: raw.items,
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
        users: [],
        pagination: { ...DEFAULT_PAGINATION },
        isLoading: false,
        error:
          err instanceof Error ? err.message : "Failed to fetch admin users",
      });
    }
  },

  createUser: async (data: Record<string, unknown>) => {
    set({ isLoading: true, error: null });
    try {
      const user = await apiPost<AdminUser>("/api/v1/admin/users", data);
      set((state) => ({
        users: [user, ...state.users],
        isLoading: false,
      }));
      return user;
    } catch (err) {
      console.error("Failed to create admin user:", err);
      set({
        isLoading: false,
        error:
          err instanceof Error ? err.message : "Failed to create admin user",
      });
      throw err;
    }
  },

  updateUser: async (id: string, data: Record<string, unknown>) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await apiPatch<AdminUser>(
        `/api/v1/admin/users/${id}`,
        data,
      );
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? { ...u, ...updated } : u)),
        isLoading: false,
      }));
    } catch (err) {
      set({
        isLoading: false,
        error:
          err instanceof Error ? err.message : "Failed to update admin user",
      });
      throw err;
    }
  },

  deleteUser: async (id: string) => {
    try {
      await apiDelete(`/api/v1/admin/users/${id}`);
      set((state) => ({
        users: state.users.filter((u) => u.id !== id),
      }));
    } catch (err) {
      console.error("Failed to delete admin user:", err);
      set({
        error:
          err instanceof Error ? err.message : "Failed to delete admin user",
      });
      throw err;
    }
  },

  resetPassword: async (id: string, newPassword: string) => {
    try {
      await apiPost(`/api/v1/admin/users/${id}/reset-password`, {
        newPassword,
      });
    } catch (err) {
      console.error("Failed to reset password:", err);
      throw err;
    }
  },

  reset: () =>
    set({
      users: [],
      pagination: { ...DEFAULT_PAGINATION },
      isLoading: false,
      error: null,
    }),
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useAdminUsers = () => useAdminUserStore((s) => s.users);

export const useAdminUserPagination = () =>
  useAdminUserStore((s) => s.pagination);

export const useAdminUserLoading = () =>
  useAdminUserStore((s) => s.isLoading);
