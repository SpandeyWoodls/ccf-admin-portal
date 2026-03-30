import { useState, useRef, useEffect, useCallback } from "react";
import {
  Search,
  Send,
  Headphones,
  Lock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Loader2,
  Clock,
  CircleDot,
  Inbox,
  StickyNote,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-[hsl(var(--muted))]">
        <MessageSquare className="h-7 w-7 text-[hsl(var(--muted-foreground)/0.5)]" />
      </div>
      <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
        Select a ticket from the list
      </h3>
      <p className="mt-1.5 max-w-xs text-sm text-[hsl(var(--muted-foreground))]">
        Choose a ticket to view the conversation and respond.
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

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full flex-col gap-2 border-b border-[hsl(var(--border))] px-4 py-3 text-left transition-all duration-150",
        "border-l-2",
        isSelected
          ? "border-l-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)]"
          : "border-l-transparent hover:bg-[hsl(var(--muted)/0.5)]",
      )}
    >
      {/* Row 1: Ticket number + time */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold text-[hsl(var(--foreground)/0.7)]">
          {ticket.ticketNumber || ticket.id.slice(0, 8)}
        </span>
        <span className="shrink-0 text-[10px] text-[hsl(var(--muted-foreground)/0.7)]">
          {relativeTime(ticket.updatedAt)}
        </span>
      </div>

      {/* Row 2: Subject */}
      <p className="truncate text-[13px] font-medium leading-snug text-[hsl(var(--foreground))]">
        {ticket.subject}
      </p>

      {/* Row 3: Badges + org */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 leading-tight font-medium bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-transparent"
        >
          {cat.label}
        </Badge>
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 leading-tight font-medium bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-transparent"
        >
          {pri.label}
        </Badge>
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 leading-tight font-medium bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-transparent"
        >
          {sta.label}
        </Badge>
        {ticket.organization?.name && (
          <span className="ml-auto truncate max-w-[120px] text-[10px] text-[hsl(var(--muted-foreground)/0.7)]">
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
      className={cn("flex gap-3", isAdmin && !isNote ? "flex-row-reverse" : "flex-row")}
    >
      {/* Avatar */}
      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
        <AvatarFallback
          className={cn(
            "text-[10px] font-semibold",
            isNote
              ? "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
              : isAdmin
                ? "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
          )}
        >
          {isAdmin ? (
            <Headphones className="h-3.5 w-3.5" />
          ) : (
            getInitials(msg.sender || "U")
          )}
        </AvatarFallback>
      </Avatar>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3.5 py-2.5",
          isNote
            ? "border border-dashed border-[hsl(var(--muted-foreground)/0.25)] bg-[hsl(var(--muted)/0.6)]"
            : isAdmin
              ? "bg-[hsl(var(--primary)/0.08)] border border-[hsl(var(--primary)/0.12)]"
              : "bg-[hsl(var(--muted)/0.7)] border border-[hsl(var(--border))]",
        )}
      >
        {/* Sender line */}
        <div
          className={cn(
            "mb-1 flex items-center gap-2 flex-wrap",
            isAdmin && !isNote ? "flex-row-reverse" : "flex-row",
          )}
        >
          <span className="text-xs font-semibold text-[hsl(var(--foreground))]">
            {msg.sender}
          </span>
          {isNote && (
            <span className="inline-flex items-center gap-1 rounded bg-[hsl(var(--muted-foreground)/0.12)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              <StickyNote className="h-2.5 w-2.5" />
              Internal Note
            </span>
          )}
          <span className="text-[10px] text-[hsl(var(--muted-foreground)/0.7)]">
            {formatDateTime(msg.createdAt)}
          </span>
        </div>

        {/* Body */}
        <p
          className={cn(
            "text-sm leading-relaxed",
            isNote
              ? "text-[hsl(var(--muted-foreground))]"
              : "text-[hsl(var(--foreground))]",
          )}
        >
          {msg.body}
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
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
          Support Tickets
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Manage support tickets submitted from the desktop application.
        </p>
      </div>

      {/* Stats Cards -- derived from real data only */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="hover:shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.1)]">
              <CircleDot className="h-5 w-5 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Open
              </p>
              {showGlobalSkeleton ? (
                <Skeleton className="mt-1 h-7 w-10" />
              ) : (
                <p className="text-2xl font-bold text-[hsl(var(--foreground))]">
                  {openCount}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--warning)/0.1)]">
              <Clock className="h-5 w-5 text-[hsl(var(--warning))]" />
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                In Progress
              </p>
              {showGlobalSkeleton ? (
                <Skeleton className="mt-1 h-7 w-10" />
              ) : (
                <p className="text-2xl font-bold text-[hsl(var(--foreground))]">
                  {inProgressCount}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--secondary)/0.5)]">
              <AlertCircle className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
            </div>
            <div>
              <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Awaiting Reply
              </p>
              {showGlobalSkeleton ? (
                <Skeleton className="mt-1 h-7 w-10" />
              ) : (
                <p className="text-2xl font-bold text-[hsl(var(--foreground))]">
                  {waitingCount}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
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
          style={{ height: "calc(100vh - 380px)", minHeight: "400px" }}
        >
          <NoTicketsState />
        </Card>
      ) : (
        /* Split View */
        <div
          className="flex gap-4"
          style={{ height: "calc(100vh - 380px)", minHeight: "500px" }}
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
                {/* Ticket header */}
                <div className="border-b border-[hsl(var(--border))] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Badges row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-semibold text-[hsl(var(--foreground)/0.7)]">
                          {selectedTicket.ticketNumber || selectedTicket.id.slice(0, 8)}
                        </span>
                        <Badge
                          variant={
                            (statusConfig[selectedTicket.status] ?? statusConfig.open)
                              .variant
                          }
                          className="text-[10px]"
                        >
                          {(statusConfig[selectedTicket.status] ?? statusConfig.open)
                            .label}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            (
                              priorityConfig[selectedTicket.priority] ??
                              priorityConfig.medium
                            ).className,
                          )}
                        >
                          {(
                            priorityConfig[selectedTicket.priority] ??
                            priorityConfig.medium
                          ).label}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            (categoryConfig[selectedTicket.category] ?? categoryConfig.other)
                              .className,
                          )}
                        >
                          {(categoryConfig[selectedTicket.category] ?? categoryConfig.other)
                            .label}
                        </Badge>
                      </div>

                      {/* Subject */}
                      <h2 className="mt-2 text-base font-semibold leading-snug text-[hsl(var(--foreground))]">
                        {selectedTicket.subject}
                      </h2>
                    </div>

                    {/* Close button for non-closed/resolved tickets */}
                    {selectedTicket.status !== "closed" &&
                      selectedTicket.status !== "resolved" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCloseTicket}
                          className="shrink-0 text-xs"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Close
                        </Button>
                      )}
                  </div>

                  {/* Meta row */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[hsl(var(--muted-foreground)/0.7)]">
                    {selectedTicket.license?.licenseKey && (
                      <span className="flex items-center gap-1.5">
                        <Lock className="h-3 w-3" />
                        <span className="font-mono text-[11px]">
                          {maskLicenseKey(selectedTicket.license.licenseKey)}
                        </span>
                      </span>
                    )}
                    {selectedTicket.organization?.name && (
                      <span className="flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        {selectedTicket.organization.name}
                      </span>
                    )}
                    <span>
                      Created {formatDateTime(selectedTicket.createdAt)}
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
                    <div className="space-y-3">
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
                          "resize-none text-sm",
                          isInternal &&
                            "border-dashed border-[hsl(var(--muted-foreground)/0.3)] bg-[hsl(var(--muted)/0.4)]",
                        )}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            handleSendReply();
                          }
                        }}
                      />
                      <div className="flex items-center justify-between">
                        <label className="flex cursor-pointer items-center gap-2 select-none">
                          <input
                            type="checkbox"
                            checked={isInternal}
                            onChange={(e) => setIsInternal(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-[hsl(var(--input))] accent-[hsl(var(--muted-foreground))]"
                          />
                          <span
                            className={cn(
                              "text-xs font-medium",
                              isInternal
                                ? "text-[hsl(var(--foreground))]"
                                : "text-[hsl(var(--muted-foreground))]",
                            )}
                          >
                            Internal Note
                          </span>
                        </label>
                        <Button
                          size="sm"
                          onClick={handleSendReply}
                          disabled={!replyText.trim() || isSending}
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
