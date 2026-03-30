import { useState, useMemo, useEffect } from "react";
import {
  Plus,
  Search,
  Info,
  AlertTriangle,
  AlertOctagon,
  Wrench,
  Pencil,
  Power,
  PowerOff,
  ExternalLink,
  Clock,
  Megaphone,
  CheckCircle,
  PauseCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnnouncementStore } from "@/stores/announcementStore";
import { RoleGuard } from "@/components/shared/RoleGuard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnnouncementType = "info" | "warning" | "critical" | "maintenance";
type TierValue = "individual" | "team" | "enterprise" | "government";

interface Announcement {
  id: string;
  title: string;
  message: string;
  announcementType: AnnouncementType;
  priority: number;
  actionUrl: string | null;
  actionLabel: string | null;
  dismissible: boolean;
  startsAt: string;
  expiresAt: string | null;
  isActive: boolean;
  targetTiers: TierValue[] | null;
  targetOrgIds: string[] | null;
  createdAt: string;
}

interface AnnouncementFormData {
  title: string;
  message: string;
  announcementType: AnnouncementType;
  priority: number;
  actionUrl: string;
  actionLabel: string;
  dismissible: boolean;
  startsAt: string;
  expiresAt: string;
  targetTiers: TierValue[];
  allTiers: boolean;
}


// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<
  AnnouncementType,
  {
    label: string;
    icon: typeof Info;
    colorClass: string;
    bgClass: string;
    borderClass: string;
    badgeBg: string;
  }
> = {
  info: {
    label: "Info",
    icon: Info,
    colorClass: "text-blue-400",
    bgClass: "bg-blue-500/10",
    borderClass: "border-l-blue-500",
    badgeBg: "bg-blue-500/15 text-blue-400",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    colorClass: "text-amber-400",
    bgClass: "bg-amber-500/10",
    borderClass: "border-l-amber-500",
    badgeBg: "bg-amber-500/15 text-amber-400",
  },
  critical: {
    label: "Critical",
    icon: AlertOctagon,
    colorClass: "text-red-400",
    bgClass: "bg-red-500/10",
    borderClass: "border-l-red-500",
    badgeBg: "bg-red-500/15 text-red-400",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    colorClass: "text-slate-400",
    bgClass: "bg-slate-500/10",
    borderClass: "border-l-slate-500",
    badgeBg: "bg-slate-500/15 text-slate-400",
  },
};

const STATUS_CONFIG = {
  active: { label: "Active", dotClass: "bg-emerald-400", textClass: "text-emerald-400" },
  inactive: { label: "Inactive", dotClass: "bg-slate-500", textClass: "text-slate-400" },
  expired: { label: "Expired", dotClass: "bg-red-400", textClass: "text-red-400" },
};

const ALL_TIERS: TierValue[] = ["individual", "team", "enterprise", "government"];

const TIER_LABELS: Record<TierValue, string> = {
  individual: "Individual",
  team: "Team",
  enterprise: "Enterprise",
  government: "Government",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAnnouncementStatus(
  a: Announcement,
): "active" | "inactive" | "expired" {
  if (!a.isActive) return "inactive";
  if (a.expiresAt && new Date(a.expiresAt) < new Date()) return "expired";
  return "active";
}

function toInputDate(dateStr: string): string {
  // Convert ISO string to datetime-local value
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${min}`;
}

function emptyFormData(): AnnouncementFormData {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");

  return {
    title: "",
    message: "",
    announcementType: "info",
    priority: 5,
    actionUrl: "",
    actionLabel: "",
    dismissible: true,
    startsAt: `${year}-${month}-${day}T${hour}:${min}`,
    expiresAt: "",
    targetTiers: [],
    allTiers: true,
  };
}

function announcementToForm(a: Announcement): AnnouncementFormData {
  return {
    title: a.title,
    message: a.message,
    announcementType: a.announcementType,
    priority: a.priority,
    actionUrl: a.actionUrl ?? "",
    actionLabel: a.actionLabel ?? "",
    dismissible: a.dismissible,
    startsAt: toInputDate(a.startsAt),
    expiresAt: a.expiresAt ? toInputDate(a.expiresAt) : "",
    targetTiers: a.targetTiers ?? [],
    allTiers: a.targetTiers === null,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  title?: string;
  message?: string;
  startsAt?: string;
  priority?: string;
}

function validateForm(form: AnnouncementFormData): FormErrors {
  const errors: FormErrors = {};
  if (!form.title.trim()) errors.title = "Title is required.";
  if (!form.message.trim()) errors.message = "Message is required.";
  if (!form.startsAt) errors.startsAt = "Start date is required.";
  if (form.priority < 1 || form.priority > 10)
    errors.priority = "Priority must be between 1 and 10.";
  return errors;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TierToggle({
  tier,
  selected,
  onToggle,
  disabled,
}: {
  tier: TierValue;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "rounded-md border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer",
        disabled && "opacity-40 cursor-not-allowed",
        selected && !disabled
          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
          : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.5)]",
      )}
    >
      {TIER_LABELS[tier]}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Announcement Card
// ---------------------------------------------------------------------------

function AnnouncementCard({
  announcement,
  onEdit,
  onToggleActive,
}: {
  announcement: Announcement;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const typeConf = TYPE_CONFIG[announcement.announcementType];
  const TypeIcon = typeConf.icon;
  const status = getAnnouncementStatus(announcement);
  const statusConf = STATUS_CONFIG[status];

  const targeting =
    announcement.targetTiers === null
      ? "All users"
      : announcement.targetTiers.map((t) => TIER_LABELS[t]).join(", ");

  return (
    <Card
      className={cn(
        "border-l-4 transition-all duration-200 hover:shadow-md",
        typeConf.borderClass,
        status === "inactive" && "opacity-60",
      )}
    >
      <CardContent className="p-5">
        {/* Row 1: icon + title + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                typeConf.bgClass,
              )}
            >
              <TypeIcon className={cn("h-4 w-4", typeConf.colorClass)} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] leading-tight">
                {announcement.title}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border-transparent px-2 py-0.5 text-[10px] font-semibold",
                    typeConf.badgeBg,
                  )}
                >
                  {typeConf.label}
                </span>
                <span>Priority: {announcement.priority}</span>
                <span>{formatDate(announcement.createdAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                statusConf.dotClass,
              )}
            />
            <span
              className={cn("text-xs font-medium", statusConf.textClass)}
            >
              {statusConf.label}
            </span>
          </div>
        </div>

        {/* Row 2: message */}
        <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
          {announcement.message}
        </p>

        {/* Row 3: action link */}
        {announcement.actionUrl && announcement.actionLabel && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--primary))]">
              <ExternalLink className="h-3 w-3" />
              {announcement.actionLabel}
              <span className="ml-1 font-normal text-[hsl(var(--muted-foreground))]">
                ({announcement.actionUrl})
              </span>
            </span>
          </div>
        )}

        {/* Row 4: metadata */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]">
          <span>
            Targeting:{" "}
            <span className="font-medium text-[hsl(var(--foreground))]">
              {targeting}
            </span>
          </span>
          <span>
            Dismissible:{" "}
            <span className="font-medium text-[hsl(var(--foreground))]">
              {announcement.dismissible ? "Yes" : "No"}
            </span>
          </span>
          {announcement.expiresAt && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Expires: {formatDateTime(announcement.expiresAt)}
            </span>
          )}
        </div>

        {/* Row 5: actions */}
        <div className="mt-4 flex items-center gap-2 border-t border-[hsl(var(--border))] pt-3">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleActive}
            className={
              announcement.isActive
                ? "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-emerald-400"
            }
          >
            {announcement.isActive ? (
              <>
                <PowerOff className="h-3.5 w-3.5" />
                Deactivate
              </>
            ) : (
              <>
                <Power className="h-3.5 w-3.5" />
                Activate
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function AnnouncementsPage() {
  const {
    announcements: storeAnnouncements,
    isLoading,
    fetchAnnouncements,
    createAnnouncement,
    updateAnnouncement,
  } = useAnnouncementStore();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnnouncementFormData>(emptyFormData);
  const [errors, setErrors] = useState<FormErrors>({});

  // Fetch announcements on mount
  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  // Map store announcements to page-local shape
  const announcements: Announcement[] = useMemo(
    () =>
      storeAnnouncements.map((a) => ({
        id: a.id,
        title: a.title,
        message: a.body,
        announcementType: (a.severity as AnnouncementType) || "info",
        priority: 5,
        actionUrl: null,
        actionLabel: null,
        dismissible: true,
        startsAt: a.publishAt || a.createdAt,
        expiresAt: a.expiresAt,
        isActive: a.isActive,
        targetTiers: null,
        targetOrgIds: null,
        createdAt: a.createdAt,
      })),
    [storeAnnouncements],
  );

  // ------- Filtering -------
  const filtered = useMemo(() => {
    return announcements.filter((a) => {
      // Type filter
      if (typeFilter !== "all" && a.announcementType !== typeFilter) return false;
      // Status filter
      if (statusFilter !== "all") {
        const s = getAnnouncementStatus(a);
        if (s !== statusFilter) return false;
      }
      // Search
      if (search) {
        const q = search.toLowerCase();
        return (
          a.title.toLowerCase().includes(q) ||
          a.message.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [announcements, typeFilter, statusFilter, search]);

  // ------- Handlers -------

  function openCreate() {
    setEditingId(null);
    setForm(emptyFormData());
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(a: Announcement) {
    setEditingId(a.id);
    setForm(announcementToForm(a));
    setErrors({});
    setDialogOpen(true);
  }

  async function toggleActive(id: string) {
    const target = announcements.find((a) => a.id === id);
    if (!target) return;
    try {
      await updateAnnouncement(id, { isActive: !target.isActive });
    } catch {
      // Error handled in store
    }
  }

  async function handleSubmit() {
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const payload = {
      title: form.title.trim(),
      message: form.message.trim(),
      announcementType: form.announcementType,
      priority: form.priority,
      actionUrl: form.actionUrl.trim() || null,
      actionLabel: form.actionLabel.trim() || null,
      dismissible: form.dismissible,
      startsAt: new Date(form.startsAt).toISOString(),
      expiresAt: form.expiresAt
        ? new Date(form.expiresAt).toISOString()
        : null,
      isActive: true,
      targetTiers:
        form.allTiers
          ? null
          : form.targetTiers.length > 0
            ? form.targetTiers
            : null,
    };

    try {
      if (editingId) {
        await updateAnnouncement(editingId, payload);
      } else {
        await createAnnouncement(payload);
      }
      setDialogOpen(false);
    } catch {
      // Error handled in store
    }
  }

  function updateForm(patch: Partial<AnnouncementFormData>) {
    setForm((prev) => ({ ...prev, ...patch }));
    // Clear relevant error on change
    const keys = Object.keys(patch) as (keyof AnnouncementFormData)[];
    const errorKeys = keys.filter((k) => k in errors);
    if (errorKeys.length > 0) {
      setErrors((prev) => {
        const next = { ...prev };
        for (const k of errorKeys) delete next[k as keyof FormErrors];
        return next;
      });
    }
  }

  function toggleTier(tier: TierValue) {
    setForm((prev) => {
      const has = prev.targetTiers.includes(tier);
      return {
        ...prev,
        targetTiers: has
          ? prev.targetTiers.filter((t) => t !== tier)
          : [...prev.targetTiers, tier],
      };
    });
  }

  // ------- Counts for filters -------
  const counts = useMemo(() => {
    const c = { active: 0, inactive: 0, expired: 0, total: announcements.length };
    for (const a of announcements) {
      const s = getAnnouncementStatus(a);
      c[s]++;
    }
    return c;
  }, [announcements]);

  if (isLoading && announcements.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-1.5 h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-7 w-10" />
              </CardContent>
            </Card>
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Announcements
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Broadcast notifications to organizations and users.
          </p>
        </div>
        <RoleGuard permission="announcements.create">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Announcement
          </Button>
        </RoleGuard>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Total",
            value: counts.total,
            color: "text-[hsl(var(--foreground))]",
            icon: Megaphone,
            iconColor: "text-blue-400",
            iconBg: "bg-blue-500/10",
            border: "border-l-blue-500",
          },
          {
            label: "Active",
            value: counts.active,
            color: "text-emerald-400",
            icon: CheckCircle,
            iconColor: "text-emerald-400",
            iconBg: "bg-emerald-500/10",
            border: "border-l-emerald-500",
          },
          {
            label: "Inactive",
            value: counts.inactive,
            color: "text-slate-400",
            icon: PauseCircle,
            iconColor: "text-slate-400",
            iconBg: "bg-slate-500/10",
            border: "border-l-slate-500",
          },
          {
            label: "Expired",
            value: counts.expired,
            color: "text-red-400",
            icon: XCircle,
            iconColor: "text-red-400",
            iconBg: "bg-red-500/10",
            border: "border-l-red-500",
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className={cn("border-l-4", s.border)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    {s.label}
                  </p>
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg",
                      s.iconBg,
                    )}
                  >
                    <Icon className={cn("h-4 w-4", s.iconColor)} />
                  </div>
                </div>
                <p className={cn("mt-1 text-2xl font-bold", s.color)}>
                  {s.value}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
              <Input
                placeholder="Search announcements..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v)}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v)}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Announcement cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/0.5)] py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
            <Megaphone className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.7)]" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-[hsl(var(--foreground))]">
            No announcements found
          </h3>
          <p className="mt-1.5 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">
            {search || typeFilter !== "all" || statusFilter !== "all"
              ? "Try adjusting your search or filters."
              : "Create an announcement to broadcast to desktop app users."}
          </p>
          {!(search || typeFilter !== "all" || statusFilter !== "all") && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground)/0.6)]">
              Use the
              <span className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--primary))]">
                <Plus className="h-3 w-3" /> New Announcement
              </span>
              button above to get started
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              onEdit={() => openEdit(a)}
              onToggleActive={() => toggleActive(a.id)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Announcement" : "New Announcement"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Modify the announcement details below."
                : "Create a new announcement to broadcast to users."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="ann-title">
                Title <span className="text-[hsl(var(--destructive))]">*</span>
              </Label>
              <Input
                id="ann-title"
                placeholder="e.g. Scheduled Maintenance"
                value={form.title}
                onChange={(e) => updateForm({ title: e.target.value })}
                className={errors.title ? "border-[hsl(var(--destructive))]" : ""}
              />
              {errors.title && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.title}
                </p>
              )}
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="ann-message">
                Message <span className="text-[hsl(var(--destructive))]">*</span>
              </Label>
              <Textarea
                id="ann-message"
                placeholder="Describe the announcement..."
                rows={4}
                value={form.message}
                onChange={(e) => updateForm({ message: e.target.value })}
                className={errors.message ? "border-[hsl(var(--destructive))]" : ""}
              />
              {errors.message && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.message}
                </p>
              )}
            </div>

            {/* Type + Priority row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Type */}
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.announcementType}
                  onValueChange={(v) =>
                    updateForm({ announcementType: v as AnnouncementType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(TYPE_CONFIG) as [
                        AnnouncementType,
                        (typeof TYPE_CONFIG)[AnnouncementType],
                      ][]
                    ).map(([key, conf]) => {
                      const Icon = conf.icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <span className="inline-flex items-center gap-2">
                            <Icon className={cn("h-3.5 w-3.5", conf.colorClass)} />
                            {conf.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label htmlFor="ann-priority">Priority (1-10)</Label>
                <Input
                  id="ann-priority"
                  type="number"
                  min={1}
                  max={10}
                  value={form.priority}
                  onChange={(e) =>
                    updateForm({ priority: Number(e.target.value) || 1 })
                  }
                  className={errors.priority ? "border-[hsl(var(--destructive))]" : ""}
                />
                {errors.priority && (
                  <p className="text-xs text-[hsl(var(--destructive))]">
                    {errors.priority}
                  </p>
                )}
              </div>
            </div>

            {/* Action URL + Label row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ann-action-url">Action URL</Label>
                <Input
                  id="ann-action-url"
                  placeholder="https://... or ccf://..."
                  value={form.actionUrl}
                  onChange={(e) => updateForm({ actionUrl: e.target.value })}
                />
                <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                  Optional. Shown as a button in the client app.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ann-action-label">Action Label</Label>
                <Input
                  id="ann-action-label"
                  placeholder='e.g. "Update Now"'
                  value={form.actionLabel}
                  onChange={(e) => updateForm({ actionLabel: e.target.value })}
                />
              </div>
            </div>

            {/* Dismissible toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.dismissible}
                onClick={() => updateForm({ dismissible: !form.dismissible })}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                  form.dismissible
                    ? "bg-[hsl(var(--primary))]"
                    : "bg-[hsl(var(--muted))]",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    form.dismissible ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
              <Label className="cursor-pointer" onClick={() => updateForm({ dismissible: !form.dismissible })}>
                Dismissible
              </Label>
              <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                Allow users to dismiss this announcement
              </span>
            </div>

            {/* Date row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ann-starts">
                  Starts At{" "}
                  <span className="text-[hsl(var(--destructive))]">*</span>
                </Label>
                <Input
                  id="ann-starts"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => updateForm({ startsAt: e.target.value })}
                  className={errors.startsAt ? "border-[hsl(var(--destructive))]" : ""}
                />
                {errors.startsAt && (
                  <p className="text-xs text-[hsl(var(--destructive))]">
                    {errors.startsAt}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ann-expires">Expires At</Label>
                <Input
                  id="ann-expires"
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => updateForm({ expiresAt: e.target.value })}
                />
                <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                  Optional. Leave empty for no expiry.
                </p>
              </div>
            </div>

            {/* Targeting */}
            <div className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Targeting</Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.allTiers}
                    onClick={() => updateForm({ allTiers: !form.allTiers })}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                      form.allTiers
                        ? "bg-[hsl(var(--primary))]"
                        : "bg-[hsl(var(--muted))]",
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                        form.allTiers ? "translate-x-4" : "translate-x-0",
                      )}
                    />
                  </button>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    All tiers
                  </span>
                </div>
              </div>

              {/* Tier chips */}
              <div className="flex flex-wrap gap-2">
                {ALL_TIERS.map((tier) => (
                  <TierToggle
                    key={tier}
                    tier={tier}
                    selected={
                      form.allTiers || form.targetTiers.includes(tier)
                    }
                    onToggle={() => toggleTier(tier)}
                    disabled={form.allTiers}
                  />
                ))}
              </div>

              {/* Org targeting placeholder */}
              <div className="mt-2 rounded-md border border-dashed border-[hsl(var(--border))] p-3 opacity-50">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Target specific organizations — coming soon. This will allow
                  selecting individual orgs to receive the announcement.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
