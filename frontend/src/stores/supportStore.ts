import { create } from "zustand";
import { apiGet, apiPost, apiPatch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TicketMessage {
  id: string;
  message: string;
  body?: string; // Legacy alias
  isInternal: boolean;
  senderName: string;
  sender?: string; // Legacy alias
  senderType: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  licenseKey: string;
  organizationId?: string | null;
  assignedToId?: string | null;
  organization?: { id: string; name: string; slug?: string } | null;
  messageCount?: number;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

export interface TicketFilters {
  status?: string;
  priority?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}

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

interface SupportState {
  tickets: Ticket[];
  pagination: Pagination;
  selectedTicket: TicketDetail | null;
  isLoading: boolean;
  isDetailLoading: boolean;
  error: string | null;

  fetchTickets: (filters?: TicketFilters) => Promise<void>;
  fetchTicket: (id: string) => Promise<void>;
  replyToTicket: (
    id: string,
    message: string,
    isInternal: boolean,
  ) => Promise<void>;
  closeTicket: (id: string) => Promise<void>;
  updateTicket: (
    id: string,
    data: { status?: string; priority?: string; category?: string },
  ) => Promise<void>;
  assignTicket: (id: string, adminId: string) => Promise<void>;
  clearSelectedTicket: () => void;
  reset: () => void;
}

export const useSupportStore = create<SupportState>()((set, get) => ({
  tickets: [],
  pagination: { ...DEFAULT_PAGINATION },
  selectedTicket: null,
  isLoading: false,
  isDetailLoading: false,
  error: null,

  fetchTickets: async (filters?: TicketFilters) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (filters?.status && filters.status !== "all")
        params.set("status", filters.status);
      if (filters?.priority) params.set("priority", filters.priority);
      if (filters?.category) params.set("category", filters.category);
      if (filters?.search) params.set("search", filters.search);
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.limit) params.set("pageSize", String(filters.limit));

      const query = params.toString();
      const path = `/api/v1/admin/tickets${query ? `?${query}` : ""}`;
      const raw = await apiGet<any>(path);

      // Backend returns { items: [...], total, page, pageSize, totalPages }
      const tickets = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.items)
          ? raw.items
          : [];
      const paginationData =
        raw && !Array.isArray(raw) && raw.total !== undefined
          ? {
              page: raw.page ?? 1,
              limit: raw.pageSize ?? 20,
              total: raw.total,
              totalPages: raw.totalPages ?? 1,
            }
          : { ...DEFAULT_PAGINATION, total: tickets.length };
      set({ tickets, pagination: paginationData, isLoading: false });
    } catch (err) {
      set({
        tickets: [],
        pagination: { ...DEFAULT_PAGINATION },
        isLoading: false,
        error:
          err instanceof Error ? err.message : "Failed to fetch tickets",
      });
    }
  },

  fetchTicket: async (id: string) => {
    set({ isDetailLoading: true, error: null });
    try {
      const raw = await apiGet<any>(`/api/v1/admin/tickets/${id}`);
      // Ensure messages is always an array and normalize fields
      const detail: TicketDetail = {
        ...raw,
        messages: (raw?.messages || []).map((m: any) => ({
          ...m,
          message: m.message || m.body || "",
          senderName: m.senderName || m.sender || "User",
        })),
      };
      set({ selectedTicket: detail, isDetailLoading: false });
    } catch (err) {
      set({
        selectedTicket: null,
        isDetailLoading: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch ticket details",
      });
    }
  },

  replyToTicket: async (
    id: string,
    message: string,
    isInternal: boolean,
  ) => {
    // Don't set global isLoading -- use isSending in the component instead
    set({ error: null });
    try {
      const reply = await apiPost<TicketMessage>(
        `/api/v1/admin/tickets/${id}/reply`,
        { message, isInternal },
      );
      // Append reply to selected ticket messages
      set((state) => {
        const sel = state.selectedTicket;
        if (sel?.id === id) {
          return {
            selectedTicket: {
              ...sel,
              messages: [
                ...sel.messages,
                {
                  ...reply,
                  message: reply.message || message,
                  senderName: reply.senderName || "Support",
                },
              ],
              // If status was "open" and not internal, backend moves to "in_progress"
              status:
                sel.status === "open" && !isInternal
                  ? "in_progress"
                  : sel.status,
            },
          };
        }
        return {};
      });
    } catch (err) {
      console.error("Failed to send reply:", err);
      set({
        error:
          err instanceof Error ? err.message : "Failed to send reply",
      });
      throw err;
    }
  },

  closeTicket: async (id: string) => {
    set({ error: null });
    try {
      await apiPost<void>(`/api/v1/admin/tickets/${id}/close`);
    } catch (err) {
      console.error("Failed to close ticket:", err);
      set({
        error: err instanceof Error ? err.message : "Failed to close ticket",
      });
      throw err;
    }
    const { selectedTicket } = get();
    if (selectedTicket?.id === id) {
      set({
        selectedTicket: { ...selectedTicket, status: "closed" },
      });
    }
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === id ? { ...t, status: "closed" } : t,
      ),
    }));
  },

  updateTicket: async (
    id: string,
    data: { status?: string; priority?: string; category?: string },
  ) => {
    set({ error: null });
    try {
      const updated = await apiPatch<Ticket>(
        `/api/v1/admin/tickets/${id}`,
        data,
      );
      // Update in list
      set((state) => ({
        tickets: state.tickets.map((t) =>
          t.id === id ? { ...t, ...updated } : t,
        ),
      }));
      // Update selected ticket if it matches
      const { selectedTicket } = get();
      if (selectedTicket?.id === id) {
        set({
          selectedTicket: { ...selectedTicket, ...updated },
        });
      }
    } catch (err) {
      console.error("Failed to update ticket:", err);
      set({
        error:
          err instanceof Error ? err.message : "Failed to update ticket",
      });
      throw err;
    }
  },

  assignTicket: async (id: string, adminId: string) => {
    set({ error: null });
    try {
      const updated = await apiPost<Ticket>(
        `/api/v1/admin/tickets/${id}/assign`,
        { adminId },
      );
      set((state) => ({
        tickets: state.tickets.map((t) =>
          t.id === id ? { ...t, ...updated } : t,
        ),
      }));
      const { selectedTicket } = get();
      if (selectedTicket?.id === id) {
        set({
          selectedTicket: { ...selectedTicket, ...updated },
        });
      }
    } catch (err) {
      console.error("Failed to assign ticket:", err);
      set({
        error:
          err instanceof Error ? err.message : "Failed to assign ticket",
      });
      throw err;
    }
  },

  clearSelectedTicket: () => set({ selectedTicket: null }),

  reset: () =>
    set({
      tickets: [],
      pagination: { ...DEFAULT_PAGINATION },
      selectedTicket: null,
      isLoading: false,
      isDetailLoading: false,
      error: null,
    }),
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useTickets = () => useSupportStore((s) => s.tickets);

export const useSelectedTicket = () =>
  useSupportStore((s) => s.selectedTicket);

export const useSupportLoading = () =>
  useSupportStore((s) => s.isLoading);

export const useSupportPagination = () =>
  useSupportStore((s) => s.pagination);
