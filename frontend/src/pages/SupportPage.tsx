import { useState, useRef, useEffect, useCallback } from "react";
import {
  Search,
  Send,
  Headphones,
  Lock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Loader2,
  Inbox,
  StickyNote,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { maskLicenseKey, cn } from "@/lib/utils";
import {
  useSupportStore,
  type Ticket,
  type TicketMessage,
} from "@/stores/supportStore";

// ---------------------------------------------------------------------------
// Config maps
// ---------------------------------------------------------------------------

const categoryConfig: Record<string, { label: string; className: string }> = {
  bug: {
    label: "Bug",
    className:
      "border-transparent bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
  },
  feature: {
    label: "Feature",
    className:
      "border-transparent bg-[hsl(280_65%_60%/0.12)] text-[hsl(280_65%_60%)]",
  },
  question: {
    label: "Question",
    className:
      "border-transparent bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]",
  },
  other: {
    label: "Other",
    className:
      "border-transparent bg-[hsl(var(--muted-foreground)/0.18)] text-[hsl(var(--muted-foreground))]",
  },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  critical: {
    label: "Critical",
    className:
      "border-transparent bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
  },
  high: {
    label: "High",
    className:
      "border-transparent bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]",
  },
  medium: {
    label: "Medium",
    className:
      "border-transparent bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]",
  },
  low: {
    label: "Low",
    className:
      "border-transparent bg-[hsl(var(--muted-foreground)/0.18)] text-[hsl(var(--muted-foreground))]",
  },
};

const statusConfig: Record<
  string,
  {
    label: string;
    variant: "success" | "destructive" | "warning" | "default" | "secondary";
  }
> = {
  open: { label: "Open", variant: "default" },
  in_progress: { label: "In Progress", variant: "warning" },
  waiting: { label: "Waiting", variant: "secondary" },
  resolved: { label: "Resolved", variant: "success" },
  closed: { label: "Closed", variant: "destructive" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton for the ticket list */
function TicketListSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="border-b border-[hsl(var(--border))] px-4 py-3.5 space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="h-4 w-[85%]" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-4 w-10 rounded-md" />
            <Skeleton className="h-4 w-12 rounded-md" />
            <Skeleton className="h-4 w-11 rounded-md" />
            <Skeleton className="ml-auto h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Loading skeleton for the conversation panel */
function ConversationSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Header skeleton */}
      <div className="border-b border-[hsl(var(--border))] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-14 rounded-md" />
          <Skeleton className="h-5 w-14 rounded-md" />
        </div>
        <Skeleton className="h-5 w-[60%]" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3.5 w-36" />
        </div>
      </div>
      {/* Messages skeleton */}
      <div className="flex-1 p-4 space-y-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={cn("flex gap-3", i === 1 && "flex-row-reverse")}
          >
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="space-y-2 max-w-[70%]">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-16 w-80 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Empty state when no tickets exist at all */
function NoTicketsState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center px-8">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--muted))]">
        <Inbox className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.6)]" />
      </div>
      <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
        No support tickets yet
      </h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
        Tickets submitted from the desktop app will appear here. You can view
        conversations, reply, add internal notes, and manage ticket status.
      </p>
    </div>
  );
}

/** Empty state when no ticket is selected in the detail panel */
function NoSelectionState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center px-8">
      {/* Layered bubble illustration */}
      <div className="relative mb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--muted)/0.6)] shadow-sm">
          <MessageSquare className="h-7 w-7 text-[hsl(var(--muted-foreground)/0.35)]" />
        </div>
        <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.1)] ring-2 ring-[hsl(var(--card))]">
          <MessageSquare className="h-3.5 w-3.5 text-[hsl(var(--primary)/0.5)]" />
        </div>
      </div>
      <p className="text-sm font-medium text-[hsl(var(--muted-foreground)/0.7)]">
        Select a ticket to view conversation
      </p>
      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground)/0.45)]">
        Choose from the list on the left to get started
      </p>
    </div>
  );
}

/** Empty state when filter matches nothing */
function NoFilterResultsState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <Search className="mb-3 h-9 w-9 text-[hsl(var(--muted-foreground)/0.35)]" />
      <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
        No tickets match your filters
      </p>
      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground)/0.6)]">
        Try adjusting your search or status filter.
      </p>
    </div>
  );
}

const priorityBorderColor: Record<string, string> = {
  critical: "border-l-red-500",
  high: "border-l-amber-500",
  medium: "border-l-blue-500",
  low: "border-l-gray-400",
};

/** Single ticket card in the list */
function TicketListItem({
  ticket,
  isSelected,
  onSelect,
}: {
  ticket: Ticket;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const cat = categoryConfig[ticket.category] ?? categoryConfig.other;
  const pri = priorityConfig[ticket.priority] ?? priorityConfig.medium;
  const sta = statusConfig[ticket.status] ?? statusConfig.open;
  const borderColor = priorityBorderColor[ticket.priority] ?? "border-l-gray-400";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-all duration-150",
        "border-l-[3px] border-b border-b-[hsl(var(--border)/0.5)]",
        isSelected
          ? cn(borderColor, "bg-[hsl(var(--primary)/0.08)] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)]")
          : cn(borderColor.replace("border-l-", "border-l-").replace("500", "500/40").replace("400", "400/40"), "hover:bg-[hsl(var(--muted)/0.5)]"),
        !isSelected && "opacity-80 hover:opacity-100",
      )}
      style={!isSelected ? { borderLeftColor: `color-mix(in srgb, ${
        ticket.priority === "critical" ? "#ef4444" :
        ticket.priority === "high" ? "#f59e0b" :
        ticket.priority === "medium" ? "#3b82f6" : "#9ca3af"
      } 35%, transparent)` } : { borderLeftColor:
        ticket.priority === "critical" ? "#ef4444" :
        ticket.priority === "high" ? "#f59e0b" :
        ticket.priority === "medium" ? "#3b82f6" : "#9ca3af"
      }}
    >
      {/* Row 1: Ticket number + time */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold tracking-wide text-[hsl(var(--foreground)/0.6)]">
          {ticket.ticketNumber || ticket.id.slice(0, 8)}
        </span>
        <span className="shrink-0 text-[10px] text-[hsl(var(--muted-foreground)/0.6)]">
          {relativeTime(ticket.updatedAt)}
        </span>
      </div>

      {/* Row 2: Subject */}
      <p className={cn(
        "truncate text-[13px] font-medium leading-snug",
        isSelected ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--foreground)/0.85)]",
      )}>
        {ticket.subject}
      </p>

      {/* Row 3: Tiny pill badges + org */}
      <div className="flex flex-wrap items-center gap-1">
        <span className={cn("inline-flex items-center rounded-full px-1.5 py-[1px] text-[10px] font-medium leading-tight", cat.className)}>
          {cat.label}
        </span>
        <span className={cn("inline-flex items-center rounded-full px-1.5 py-[1px] text-[10px] font-medium leading-tight", pri.className)}>
          {pri.label}
        </span>
        <span className={cn(
          "inline-flex items-center rounded-full px-1.5 py-[1px] text-[10px] font-medium leading-tight",
          sta.variant === "success" ? "bg-emerald-500/12 text-emerald-600" :
          sta.variant === "destructive" ? "bg-red-500/12 text-red-500" :
          sta.variant === "warning" ? "bg-amber-500/12 text-amber-600" :
          "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
        )}>
          {sta.label}
        </span>
        {ticket.organization?.name && (
          <span className="ml-auto truncate max-w-[110px] text-[10px] text-[hsl(var(--muted-foreground)/0.6)]">
            {ticket.organization.name}
          </span>
        )}
      </div>
    </button>
  );
}

/** Single message bubble in the conversation */
function MessageBubble({ msg }: { msg: TicketMessage }) {
  const isAdmin = msg.senderType === "admin" || msg.senderType === "support";
  const isNote = msg.isInternal;

  return (
    <div
      className={cn(
        "flex gap-2.5",
        isAdmin && !isNote ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar */}
      <Avatar className="h-7 w-7 shrink-0 mt-1">
        <AvatarFallback
          className={cn(
            "text-[9px] font-bold",
            isNote
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
              : isAdmin
                ? "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
          )}
        >
          {isNote ? (
            <StickyNote className="h-3 w-3" />
          ) : isAdmin ? (
            <Headphones className="h-3 w-3" />
          ) : (
            getInitials(msg.sender || msg.senderName || "U")
          )}
        </AvatarFallback>
      </Avatar>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[75%] px-3.5 py-2.5",
          isNote
            ? "rounded-lg border border-dashed border-amber-400/40 bg-amber-50/80 dark:border-amber-500/25 dark:bg-amber-950/30"
            : isAdmin
              ? "rounded-lg rounded-tr-none bg-[hsl(var(--primary)/0.08)] border border-[hsl(var(--primary)/0.15)]"
              : "rounded-lg rounded-tl-none bg-[hsl(var(--muted)/0.6)] border border-[hsl(var(--border)/0.8)]",
        )}
      >
        {/* Sender line */}
        <div
          className={cn(
            "mb-1 flex items-center gap-2 flex-wrap",
            isAdmin && !isNote ? "flex-row-reverse" : "flex-row",
          )}
        >
          <span className="text-[11px] font-bold text-[hsl(var(--foreground))]">
            {msg.sender || msg.senderName || "User"}
          </span>
          {isNote && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-200/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-800/40 dark:text-amber-400">
              Note
            </span>
          )}
          <span className="text-[10px] text-[hsl(var(--muted-foreground)/0.55)]">
            {formatDateTime(msg.createdAt)}
          </span>
        </div>

        {/* Body */}
        <p
          className={cn(
            "text-sm leading-relaxed whitespace-pre-wrap",
            isNote
              ? "text-amber-900/80 dark:text-amber-200/80"
              : "text-[hsl(var(--foreground)/0.9)]",
          )}
        >
          {msg.body || msg.message || "(no content)"}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SupportPage() {
  const {
    tickets,
    selectedTicket,
    isLoading,
    fetchTickets,
    fetchTicket,
    replyToTicket,
    closeTicket,
    clearSelectedTicket,
  } = useSupportStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState("all");
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch tickets on mount
  useEffect(() => {
    fetchTickets().finally(() => setInitialLoad(false));
  }, [fetchTickets]);

  // Fetch ticket detail when selection changes
  useEffect(() => {
    if (selectedId) {
      fetchTicket(selectedId);
    } else {
      clearSelectedTicket();
    }
  }, [selectedId, fetchTicket, clearSelectedTicket]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedTicket?.messages?.length, selectedId]);

  // Client-side filtering on top of fetched tickets
  const safeTickets = Array.isArray(tickets) ? tickets : [];
  const filtered = safeTickets.filter((t) => {
    if (statusTab !== "all" && t.status !== statusTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.id.toLowerCase().includes(q) ||
        (t.ticketNumber ?? "").toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.organization?.name ?? "").toLowerCase().includes(q) ||
        t.requesterName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Stats derived from real ticket data
  const openCount = safeTickets.filter((t) => t.status === "open").length;
  const inProgressCount = safeTickets.filter(
    (t) => t.status === "in_progress",
  ).length;
  const waitingCount = safeTickets.filter((t) => t.status === "waiting").length;

  // Tab counts
  const tabCounts: Record<string, number> = {
    all: safeTickets.length,
    open: openCount,
    in_progress: inProgressCount,
    waiting: waitingCount,
    resolved: safeTickets.filter((t) => t.status === "resolved").length,
    closed: safeTickets.filter((t) => t.status === "closed").length,
  };

  // Handlers
  const handleSelectTicket = useCallback(
    (id: string) => {
      setSelectedId(id);
      setReplyText("");
      setIsInternal(false);
    },
    [],
  );

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim() || !selectedId) return;
    setIsSending(true);
    try {
      await replyToTicket(selectedId, replyText.trim(), isInternal);
      setReplyText("");
      setIsInternal(false);
    } finally {
      setIsSending(false);
    }
  }, [replyText, selectedId, isInternal, replyToTicket]);

  const handleCloseTicket = useCallback(async () => {
    if (!selectedId) return;
    await closeTicket(selectedId);
    // Refresh tickets list
    await fetchTickets();
  }, [selectedId, closeTicket, fetchTickets]);

  // If initial load hasn't finished, show full skeleton
  const showGlobalSkeleton = initialLoad && isLoading;

  // Check if we have no tickets at all (after loading)
  const hasNoTickets = !initialLoad && safeTickets.length === 0;

  return (
    <div className="space-y-3">
      {/* Compact header: title + stats + tabs in tight rows */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
          Support
        </h1>
        {!showGlobalSkeleton && (
          <div className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1 text-[11px] font-medium text-[hsl(var(--foreground))]">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
              <span>{openCount}</span>
            </span>
            <span className="mx-1.5 text-[hsl(var(--border))]">|</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--warning))]" />
              <span>{inProgressCount}</span>
            </span>
            <span className="mx-1.5 text-[hsl(var(--border))]">|</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--muted-foreground))]" />
              <span>{waitingCount}</span>
            </span>
          </div>
        )}
      </div>

      {/* Status Tabs */}
      <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v)}>
        <TabsList>
          {[
            { value: "all", label: "All" },
            { value: "open", label: "Open" },
            { value: "in_progress", label: "In Progress" },
            { value: "waiting", label: "Waiting" },
            { value: "resolved", label: "Resolved" },
            { value: "closed", label: "Closed" },
          ].map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              {!showGlobalSkeleton && tabCounts[tab.value] > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--muted-foreground)/0.15)] px-1.5 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">
                  {tabCounts[tab.value]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* No tickets global empty state */}
      {hasNoTickets ? (
        <Card
          className="flex items-center justify-center"
          style={{ height: "calc(100vh - 155px)", minHeight: "450px" }}
        >
          <NoTicketsState />
        </Card>
      ) : (
        /* Split View */
        <div
          className="flex gap-4"
          style={{ height: "calc(100vh - 155px)", minHeight: "500px" }}
        >
          {/* ==================== LEFT PANEL: Ticket List ==================== */}
          <Card className="flex w-[38%] shrink-0 flex-col overflow-hidden">
            {/* Search bar */}
            <div className="border-b border-[hsl(var(--border))] p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground)/0.5)]" />
                <Input
                  placeholder="Search tickets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>

            {/* Ticket list */}
            <div className="flex-1 overflow-y-auto">
              {showGlobalSkeleton ? (
                <TicketListSkeleton />
              ) : filtered.length === 0 ? (
                <NoFilterResultsState />
              ) : (
                filtered.map((ticket) => (
                  <TicketListItem
                    key={ticket.id}
                    ticket={ticket}
                    isSelected={selectedId === ticket.id}
                    onSelect={() => handleSelectTicket(ticket.id)}
                  />
                ))
              )}
            </div>
          </Card>

          {/* ==================== RIGHT PANEL: Conversation ==================== */}
          <Card className="flex flex-1 flex-col overflow-hidden">
            {showGlobalSkeleton ? (
              <ConversationSkeleton />
            ) : !selectedId || !selectedTicket ? (
              <NoSelectionState />
            ) : (
              <>
                {/* Ticket header -- compact layout */}
                <div className="border-b border-[hsl(var(--border))] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                      <span className="font-mono text-[11px] font-semibold tracking-wide text-[hsl(var(--foreground)/0.55)]">
                        {selectedTicket.ticketNumber || selectedTicket.id.slice(0, 8)}
                      </span>
                      <Badge
                        variant={
                          (statusConfig[selectedTicket.status] ?? statusConfig.open)
                            .variant
                        }
                        className="text-[10px] px-1.5 py-0"
                      >
                        {(statusConfig[selectedTicket.status] ?? statusConfig.open)
                          .label}
                      </Badge>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-1.5 py-[1px] text-[10px] font-medium",
                        (priorityConfig[selectedTicket.priority] ?? priorityConfig.medium).className,
                      )}>
                        {(priorityConfig[selectedTicket.priority] ?? priorityConfig.medium).label}
                      </span>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-1.5 py-[1px] text-[10px] font-medium",
                        (categoryConfig[selectedTicket.category] ?? categoryConfig.other).className,
                      )}>
                        {(categoryConfig[selectedTicket.category] ?? categoryConfig.other).label}
                      </span>
                    </div>

                    {/* Close button for non-closed/resolved tickets */}
                    {selectedTicket.status !== "closed" &&
                      selectedTicket.status !== "resolved" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCloseTicket}
                          className="shrink-0 text-[11px] h-7 px-2.5"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Close
                        </Button>
                      )}
                  </div>

                  {/* Subject */}
                  <h2 className="mt-1.5 text-[15px] font-semibold leading-snug text-[hsl(var(--foreground))]">
                    {selectedTicket.subject}
                  </h2>

                  {/* Meta row -- single compact line */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[hsl(var(--muted-foreground)/0.6)]">
                    {selectedTicket.license?.licenseKey && (
                      <span className="flex items-center gap-1">
                        <Lock className="h-2.5 w-2.5" />
                        <span className="font-mono text-[10px]">
                          {maskLicenseKey(selectedTicket.license.licenseKey)}
                        </span>
                      </span>
                    )}
                    {selectedTicket.organization?.name && (
                      <span className="flex items-center gap-1">
                        <User className="h-2.5 w-2.5" />
                        {selectedTicket.organization.name}
                      </span>
                    )}
                    <span>
                      {formatDateTime(selectedTicket.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Conversation thread */}
                <div className="flex-1 overflow-y-auto p-4">
                  {selectedTicket.messages && selectedTicket.messages.length > 0 ? (
                    <div className="space-y-4">
                      {selectedTicket.messages.map((msg) => (
                        <MessageBubble key={msg.id} msg={msg} />
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <MessageSquare className="mb-2 h-8 w-8 text-[hsl(var(--muted-foreground)/0.3)]" />
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        No messages in this ticket yet.
                      </p>
                    </div>
                  )}
                </div>

                {/* Reply box */}
                <div className="border-t border-[hsl(var(--border))] p-4">
                  {selectedTicket.status === "closed" ? (
                    <div className="flex items-center justify-center gap-2 py-2 text-sm text-[hsl(var(--muted-foreground)/0.6)]">
                      <XCircle className="h-4 w-4" />
                      This ticket is closed.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <Textarea
                        placeholder={
                          isInternal
                            ? "Write an internal note (not visible to the user)..."
                            : "Type your reply..."
                        }
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={3}
                        className={cn(
                          "resize-none text-sm transition-shadow duration-200",
                          "border-[hsl(var(--border))] focus:border-[hsl(var(--primary)/0.5)] focus:ring-2 focus:ring-[hsl(var(--primary)/0.12)] focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]",
                          isInternal &&
                            "border-dashed border-amber-400/40 bg-amber-50/50 focus:border-amber-400/60 focus:ring-amber-400/15 focus:shadow-[0_0_0_3px_hsl(45_93%_47%/0.08)] dark:bg-amber-950/20 dark:border-amber-500/30",
                        )}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            handleSendReply();
                          }
                        }}
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Toggle switch for internal note */}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isInternal}
                            onClick={() => setIsInternal(!isInternal)}
                            className={cn(
                              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200",
                              isInternal
                                ? "bg-amber-500"
                                : "bg-[hsl(var(--muted-foreground)/0.2)]",
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
                                isInternal ? "translate-x-[18px]" : "translate-x-[3px]",
                              )}
                            />
                          </button>
                          <span
                            className={cn(
                              "text-xs font-medium select-none",
                              isInternal
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-[hsl(var(--muted-foreground)/0.7)]",
                            )}
                          >
                            Internal Note
                          </span>
                          <span className="hidden sm:inline text-[10px] text-[hsl(var(--muted-foreground)/0.4)]">
                            Ctrl+Enter to send
                          </span>
                        </div>
                        <Button
                          size="sm"
                          onClick={handleSendReply}
                          disabled={!replyText.trim() || isSending}
                          className={cn(
                            "text-xs font-semibold shadow-sm",
                            !isSending && replyText.trim() && "bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.85)] hover:from-[hsl(var(--primary)/0.9)] hover:to-[hsl(var(--primary)/0.75)]",
                          )}
                        >
                          {isSending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          {isInternal ? "Add Note" : "Send Reply"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
