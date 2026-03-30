import { create } from "zustand";
import { apiGet, apiPost } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TicketMessage {
  id: string;
  body?: string;
  message?: string;
  isInternal: boolean;
  sender?: string;
  senderName?: string;
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
  requesterEmail: string;
  requesterName: string;
  organization?: { id: string; name: string };
  license?: { id: string; licenseKey: string };
  assignedTo?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail extends Ticket {
  description: string;
  messages: TicketMessage[];
}

export interface TicketFilters {
  status?: string;
  priority?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// NOTE: The backend does NOT yet have admin support ticket routes.
// The public routes exist at /api/v1/support/ for the desktop app:
//   POST /api/v1/support/create-ticket
//   POST /api/v1/support/ticket-status
//   POST /api/v1/support/ticket-details
//   POST /api/v1/support/reply-ticket
//
// Missing backend routes that need to be created:
//   GET  /api/v1/admin/tickets              (list all tickets for admin)
//   GET  /api/v1/admin/tickets/:id          (ticket detail with all messages)
//   POST /api/v1/admin/tickets/:id/reply    (admin reply, supports isInternal)
//   POST /api/v1/admin/tickets/:id/close    (close a ticket)
//
// Until those are implemented, this store returns empty arrays on API failure.
// ---------------------------------------------------------------------------

// No mock data -- stores return empty arrays on API failure

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SupportState {
  tickets: Ticket[];
  selectedTicket: TicketDetail | null;
  isLoading: boolean;
  error: string | null;

  fetchTickets: (filters?: TicketFilters) => Promise<void>;
  fetchTicket: (id: string) => Promise<void>;
  replyToTicket: (
    id: string,
    message: string,
    isInternal: boolean,
  ) => Promise<void>;
  closeTicket: (id: string) => Promise<void>;
  clearSelectedTicket: () => void;
  reset: () => void;
}

export const useSupportStore = create<SupportState>()((set, get) => ({
  tickets: [],
  selectedTicket: null,
  isLoading: false,
  error: null,

  fetchTickets: async (filters?: TicketFilters) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.priority) params.set("priority", filters.priority);
      if (filters?.search) params.set("search", filters.search);
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.limit) params.set("pageSize", String(filters.limit));

      const query = params.toString();
      const path = `/api/v1/admin/tickets${query ? `?${query}` : ""}`;
      const raw = await apiGet<any>(path);
      // Backend may return { items: [...], total, page } or a raw array
      const tickets = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.tickets) ? raw.tickets : [];
      set({ tickets, isLoading: false });
    } catch (err) {
      set({
        tickets: [],
        isLoading: false,
        error:
          err instanceof Error ? err.message : "Failed to fetch tickets",
      });
    }
  },

  fetchTicket: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const raw = await apiGet<any>(
        `/api/v1/admin/tickets/${id}`,
      );
      // Ensure messages is always an array
      const detail: TicketDetail = {
        ...raw,
        messages: Array.isArray(raw?.messages) ? raw.messages : [],
      };
      set({ selectedTicket: detail, isLoading: false });
    } catch (err) {
      set({
        selectedTicket: null,
        isLoading: false,
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
    set({ isLoading: true, error: null });
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
              messages: [...sel.messages, reply],
            },
            isLoading: false,
          };
        }
        return { isLoading: false };
      });
    } catch (err) {
      console.error("Failed to send reply:", err);
      set({
        isLoading: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to send reply",
      });
    }
  },

  closeTicket: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiPost<void>(
        `/api/v1/admin/tickets/${id}/close`,
      );
    } catch (err) {
      console.error("Failed to close ticket:", err);
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to close ticket",
      });
      return;
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
      isLoading: false,
    }));
  },

  clearSelectedTicket: () => set({ selectedTicket: null }),

  reset: () =>
    set({
      tickets: [],
      selectedTicket: null,
      isLoading: false,
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
