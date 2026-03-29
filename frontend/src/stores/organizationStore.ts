import { create } from "zustand";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type { License } from "./licenseStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  role: string;
  isActive: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  orgType: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string;
  isActive: boolean;
  createdAt: string;
  _count?: { licenses: number; contacts: number };
}

export interface OrganizationDetail extends Organization {
  address: string | null;
  gstin: string | null;
  panNumber: string | null;
  notes: string | null;
  website?: string | null;
  contacts: Contact[];
  licenses: License[];
  activities?: OrgActivity[];
}

export interface OrgActivity {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  createdAt: string;
  adminUser?: { name: string };
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

// No mock data -- stores return empty arrays on API failure

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface OrganizationState {
  organizations: Organization[];
  selectedOrg: OrganizationDetail | null;
  pagination: Pagination;
  isLoading: boolean;
  error: string | null;

  fetchOrganizations: (search?: string, page?: number) => Promise<void>;
  fetchOrganization: (id: string) => Promise<void>;
  createOrganization: (
    data: Record<string, unknown>,
  ) => Promise<Organization>;
  updateOrganization: (
    id: string,
    data: Record<string, unknown>,
  ) => Promise<void>;
  addContact: (
    orgId: string,
    data: Record<string, unknown>,
  ) => Promise<Contact>;
  deleteOrganization: (id: string) => Promise<void>;
  clearSelectedOrg: () => void;
  reset: () => void;
}

const DEFAULT_PAGINATION: Pagination = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

export const useOrganizationStore = create<OrganizationState>()(
  (set, get) => ({
    organizations: [],
    selectedOrg: null,
    pagination: { ...DEFAULT_PAGINATION },
    isLoading: false,
    error: null,

    fetchOrganizations: async (search?: string, page?: number) => {
      set({ isLoading: true, error: null });
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (page) params.set("page", String(page));

        const raw = await apiGet<BackendPaginatedResponse<Organization>>(
          `/api/v1/admin/organizations?${params.toString()}`,
        );
        set({
          organizations: raw.items,
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
          organizations: [],
          pagination: { ...DEFAULT_PAGINATION },
          isLoading: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to fetch organizations",
        });
      }
    },

    fetchOrganization: async (id: string) => {
      set({ isLoading: true, error: null });
      try {
        const data = await apiGet<OrganizationDetail>(
          `/api/v1/admin/organizations/${id}`,
        );
        set({ selectedOrg: data, isLoading: false });
      } catch (err) {
        set({
          selectedOrg: null,
          isLoading: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to fetch organization details",
        });
      }
    },

    createOrganization: async (data: Record<string, unknown>) => {
      set({ isLoading: true, error: null });
      try {
        const org = await apiPost<Organization>(
          "/api/v1/admin/organizations",
          data,
        );
        set((state) => ({
          organizations: [org, ...state.organizations],
          isLoading: false,
        }));
        return org;
      } catch (err) {
        console.error("Failed to create organization:", err);
        set({
          isLoading: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to create organization",
        });
        throw err;
      }
    },

    updateOrganization: async (
      id: string,
      data: Record<string, unknown>,
    ) => {
      set({ isLoading: true, error: null });
      try {
        const updated = await apiPatch<OrganizationDetail>(
          `/api/v1/admin/organizations/${id}`,
          data,
        );
        const { selectedOrg } = get();
        set((state) => ({
          selectedOrg:
            selectedOrg?.id === id ? updated : state.selectedOrg,
          organizations: state.organizations.map((o) =>
            o.id === id ? { ...o, ...updated } : o,
          ),
          isLoading: false,
        }));
      } catch (err) {
        set({
          isLoading: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to update organization",
        });
        throw err;
      }
    },

    addContact: async (orgId: string, data: Record<string, unknown>) => {
      set({ isLoading: true, error: null });
      try {
        const contact = await apiPost<Contact>(
          `/api/v1/admin/organizations/${orgId}/contacts`,
          data,
        );
        // Append contact to selected org if it matches
        set((state) => {
          const sel = state.selectedOrg;
          if (sel?.id === orgId) {
            return {
              selectedOrg: {
                ...sel,
                contacts: [...sel.contacts, contact],
              },
              isLoading: false,
            };
          }
          return { isLoading: false };
        });
        return contact;
      } catch (err) {
        console.error("Failed to add contact:", err);
        set({
          isLoading: false,
          error:
            err instanceof Error ? err.message : "Failed to add contact",
        });
        throw err;
      }
    },

    deleteOrganization: async (id: string) => {
      try {
        await apiDelete(`/api/v1/admin/organizations/${id}`);
        set((state) => ({
          organizations: state.organizations.filter((o) => o.id !== id),
        }));
      } catch (err) {
        console.error("Failed to delete organization:", err);
        set({
          error:
            err instanceof Error
              ? err.message
              : "Failed to delete organization",
        });
        throw err;
      }
    },

    clearSelectedOrg: () => set({ selectedOrg: null }),

    reset: () =>
      set({
        organizations: [],
        selectedOrg: null,
        pagination: { ...DEFAULT_PAGINATION },
        isLoading: false,
        error: null,
      }),
  }),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useOrganizations = () =>
  useOrganizationStore((s) => s.organizations);

export const useSelectedOrg = () =>
  useOrganizationStore((s) => s.selectedOrg);

export const useOrgPagination = () =>
  useOrganizationStore((s) => s.pagination);

export const useOrgLoading = () =>
  useOrganizationStore((s) => s.isLoading);
