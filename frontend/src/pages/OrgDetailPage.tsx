import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Save,
  X,
  Mail,
  Phone,
  MapPin,
  FileText,
  Building2,
  KeyRound,
  Users,
  Clock,
  CheckCircle2,
  UserPlus,
  Loader2,
  Globe,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  useOrganizationStore,
  type OrganizationDetail,
  type OrgActivity,
} from "@/stores/organizationStore";
import { RoleGuard } from "@/components/shared/RoleGuard";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

const typeConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  law_enforcement: { label: "Law Enforcement", variant: "default" },
  government: { label: "Government", variant: "secondary" },
  forensic_lab: { label: "Forensic Lab", variant: "outline" },
  private_lab: { label: "Private Lab", variant: "outline" },
  academic: { label: "Academic", variant: "outline" },
  educational: { label: "Educational", variant: "outline" },
  corporate: { label: "Corporate", variant: "secondary" },
  private: { label: "Private", variant: "secondary" },
  individual: { label: "Individual", variant: "outline" },
};

function getTypeInfo(type: string) {
  return (
    typeConfig[type] || {
      label: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      variant: "outline" as const,
    }
  );
}

const statusBadge: Record<
  string,
  { variant: "success" | "destructive" | "warning" | "default"; label: string }
> = {
  active: { variant: "success", label: "Active" },
  expired: { variant: "destructive", label: "Expired" },
  suspended: { variant: "warning", label: "Suspended" },
  revoked: { variant: "destructive", label: "Revoked" },
};

// ---------------------------------------------------------------------------
// Activity icon mapper
// ---------------------------------------------------------------------------

function getActivityIcon(action: string) {
  if (action.includes("activated") || action.includes("created")) {
    return { Icon: CheckCircle2, color: "text-[hsl(var(--success))]" };
  }
  if (action.includes("contact") || action.includes("added")) {
    return { Icon: UserPlus, color: "text-[hsl(var(--chart-1))]" };
  }
  if (action.includes("renewed") || action.includes("license")) {
    return { Icon: KeyRound, color: "text-[hsl(var(--chart-4))]" };
  }
  if (action.includes("updated")) {
    return { Icon: Pencil, color: "text-[hsl(var(--chart-2))]" };
  }
  return { Icon: Clock, color: "text-[hsl(var(--muted-foreground))]" };
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek} week${diffWeek > 1 ? "s" : ""} ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Add Contact form schema
// ---------------------------------------------------------------------------

const addContactSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email").or(z.literal("")),
  phone: z.string().optional(),
  designation: z.string().optional(),
});

type AddContactFormData = z.infer<typeof addContactSchema>;

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-10 w-72" />
      <Card>
        <CardContent className="p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function OrgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    selectedOrg: org,
    isLoading,
    error,
    fetchOrganization,
    updateOrganization,
    addContact,
    clearSelectedOrg,
  } = useOrganizationStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<OrganizationDetail>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState(false);

  const contactForm = useForm<AddContactFormData>({
    resolver: zodResolver(addContactSchema),
    defaultValues: { name: "", email: "", phone: "", designation: "" },
  });

  // Fetch on mount
  useEffect(() => {
    if (id) fetchOrganization(id);
    return () => clearSelectedOrg();
  }, [id, fetchOrganization, clearSelectedOrg]);

  // Populate edit data when org loads
  useEffect(() => {
    if (org) {
      setEditData({
        name: org.name,
        email: org.email,
        phone: org.phone,
        address: org.address,
        city: org.city,
        state: org.state,
        gstin: org.gstin,
        panNumber: org.panNumber,
        notes: org.notes,
      });
    }
  }, [org]);

  // Loading state
  if (isLoading || !org) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/organizations")}
          className="gap-1.5 text-[hsl(var(--muted-foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Organizations
        </Button>
        <DetailSkeleton />
      </div>
    );
  }

  const typeInfo = getTypeInfo(org.orgType);
  const initials = org.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const contacts = org.contacts || [];
  const licenses = org.licenses || [];
  const activities = (org.activities || []) as OrgActivity[];

  // ---- Edit handlers ----

  const handleStartEdit = () => setIsEditing(true);

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditData({
      name: org.name,
      email: org.email,
      phone: org.phone,
      address: org.address,
      city: org.city,
      state: org.state,
      gstin: org.gstin,
      panNumber: org.panNumber,
      notes: org.notes,
    });
  };

  const handleSaveEdit = async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      await updateOrganization(id, {
        name: editData.name ?? undefined,
        email: editData.email ?? undefined,
        phone: editData.phone ?? undefined,
        address: editData.address ?? undefined,
        city: editData.city ?? undefined,
        state: editData.state ?? undefined,
        gstin: editData.gstin ?? undefined,
        pan_number: editData.panNumber ?? undefined,
        notes: editData.notes ?? undefined,
      } as Record<string, unknown>);
      toast.success("Organization updated");
      setIsEditing(false);
    } catch {
      toast.error("Failed to update organization");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditField = (field: string, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  // ---- Add contact handler ----

  const handleAddContact = async (data: AddContactFormData) => {
    if (!id) return;
    setIsAddingContact(true);
    try {
      await addContact(id, {
        name: data.name,
        email: data.email,
        phone: data.phone || "",
        designation: data.designation || "",
      });
      toast.success("Contact added", {
        description: `${data.name} has been added.`,
      });
      contactForm.reset();
      setShowAddContact(false);
    } catch {
      toast.error("Failed to add contact");
    } finally {
      setIsAddingContact(false);
    }
  };

  // ---- Info grid data ----

  const infoItems = [
    { icon: Mail, label: "Email", value: org.email, field: "email" },
    { icon: Phone, label: "Phone", value: org.phone, field: "phone" },
    { icon: FileText, label: "GSTIN", value: org.gstin, field: "gstin" },
    {
      icon: MapPin,
      label: "Address",
      value: [org.address, org.city, org.state].filter(Boolean).join(", ") || null,
      field: "address",
    },
    { icon: Globe, label: "Website", value: org.website, field: null },
    {
      icon: Clock,
      label: "Member Since",
      value: new Date(org.createdAt).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      field: null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/organizations")}
        className="gap-1.5 text-[hsl(var(--muted-foreground))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Organizations
      </Button>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.05)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error} &mdash; showing cached data.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] text-lg font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-3">
              {isEditing ? (
                <Input
                  value={editData.name || ""}
                  onChange={(e) => handleEditField("name", e.target.value)}
                  className="h-8 text-xl font-bold w-64"
                />
              ) : (
                <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">
                  {org.name}
                </h1>
              )}
              <Badge variant={typeInfo.variant} className="text-[10px]">
                {typeInfo.label}
              </Badge>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  org.isActive
                    ? "bg-[hsl(var(--success))]"
                    : "bg-[hsl(var(--muted-foreground))]"
                }`}
              />
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                {org.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEdit}
                disabled={isSaving}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </>
          ) : (
            <RoleGuard permission="organizations.edit">
              <Button variant="outline" size="sm" onClick={handleStartEdit}>
                <Pencil className="h-4 w-4" />
                Edit Organization
              </Button>
            </RoleGuard>
          )}
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {infoItems.map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--muted))]">
                  <item.icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    {item.label}
                  </p>
                  {isEditing && item.field ? (
                    <Input
                      value={
                        (editData as Record<string, string | null | undefined>)[
                          item.field
                        ] ?? ""
                      }
                      onChange={(e) =>
                        handleEditField(item.field!, e.target.value)
                      }
                      className="mt-1 h-7 text-sm"
                    />
                  ) : (
                    <p className="mt-0.5 truncate text-sm font-medium text-[hsl(var(--foreground))]">
                      {item.value || (
                        <span className="text-[hsl(var(--muted-foreground))] italic">
                          Not set
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Notes (if present and not editing) */}
      {org.notes && !isEditing && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))] mb-1.5">
              Notes
            </p>
            <p className="text-sm text-[hsl(var(--foreground))] leading-relaxed">
              {org.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="licenses">
        <TabsList>
          <TabsTrigger value="licenses">
            <KeyRound className="mr-1.5 h-3.5 w-3.5" />
            Licenses ({licenses.length})
          </TabsTrigger>
          <TabsTrigger value="contacts">
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Contacts ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* ---- Licenses Tab ---- */}
        <TabsContent value="licenses">
          <Card>
            <CardContent className="p-0">
              {licenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <KeyRound className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
                  <p className="mt-3 text-sm font-medium text-[hsl(var(--foreground))]">
                    No licenses
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    This organization has no licenses assigned.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>License Key</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Activations</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {licenses.map((lic) => {
                      const licStatus =
                        statusBadge[lic.status] || statusBadge.active;
                      return (
                        <TableRow
                          key={lic.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/licenses/${lic.id}`)}
                        >
                          <TableCell className="font-mono text-xs font-medium">
                            {lic.licenseKey}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className="text-[10px] capitalize"
                            >
                              {lic.tier}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={licStatus.variant}
                              className="text-[10px]"
                            >
                              {licStatus.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                            {lic.currentActivations}/{lic.maxActivations}
                          </TableCell>
                          <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                            {lic.validUntil
                              ? new Date(lic.validUntil).toLocaleDateString(
                                  "en-IN",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )
                              : "Perpetual"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Contacts Tab ---- */}
        <TabsContent value="contacts">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Contacts</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddContact(!showAddContact)}
                >
                  <UserPlus className="h-4 w-4" />
                  {showAddContact ? "Cancel" : "Add Contact"}
                </Button>
              </div>
            </CardHeader>

            {/* Inline add-contact form */}
            {showAddContact && (
              <CardContent className="pt-0 pb-4">
                <form
                  onSubmit={contactForm.handleSubmit(handleAddContact)}
                  className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-4"
                >
                  <h4 className="mb-3 text-sm font-medium text-[hsl(var(--foreground))]">
                    New Contact
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="add-cnt-name" className="text-xs">
                        Name *
                      </Label>
                      <Input
                        id="add-cnt-name"
                        placeholder="Full name"
                        {...contactForm.register("name")}
                      />
                      {contactForm.formState.errors.name && (
                        <p className="text-xs text-[hsl(var(--destructive))]">
                          {contactForm.formState.errors.name.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="add-cnt-email" className="text-xs">
                        Email
                      </Label>
                      <Input
                        id="add-cnt-email"
                        type="email"
                        placeholder="email@example.com"
                        {...contactForm.register("email")}
                      />
                      {contactForm.formState.errors.email && (
                        <p className="text-xs text-[hsl(var(--destructive))]">
                          {contactForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="add-cnt-phone" className="text-xs">
                        Phone
                      </Label>
                      <Input
                        id="add-cnt-phone"
                        placeholder="+91 98765 43210"
                        {...contactForm.register("phone")}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="add-cnt-desg" className="text-xs">
                        Designation
                      </Label>
                      <Input
                        id="add-cnt-desg"
                        placeholder="Nodal Officer"
                        {...contactForm.register("designation")}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        contactForm.reset();
                        setShowAddContact(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isAddingContact}
                    >
                      {isAddingContact && (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      )}
                      Add Contact
                    </Button>
                  </div>
                </form>
              </CardContent>
            )}

            <CardContent className="p-0">
              {contacts.length === 0 && !showAddContact ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
                  <p className="mt-3 text-sm font-medium text-[hsl(var(--foreground))]">
                    No contacts
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Add a contact to this organization.
                  </p>
                </div>
              ) : contacts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((contact) => {
                      const cInitials = contact.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2);
                      return (
                        <TableRow key={contact.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-7 w-7">
                                <AvatarFallback className="bg-[hsl(var(--muted))] text-[9px] font-semibold">
                                  {cInitials}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">
                                {contact.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                            {contact.designation || contact.role || "--"}
                          </TableCell>
                          <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                            {contact.email || "--"}
                          </TableCell>
                          <TableCell className="text-sm text-[hsl(var(--muted-foreground))]">
                            {contact.phone || "--"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Activity Tab ---- */}
        <TabsContent value="activity">
          <Card>
            <CardContent className="p-6">
              {activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
                  <p className="mt-3 text-sm font-medium text-[hsl(var(--foreground))]">
                    No activity
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Activity events will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-0">
                  {activities.map((event, idx) => {
                    const { Icon, color } = getActivityIcon(event.action);
                    return (
                      <div
                        key={event.id}
                        className="relative flex gap-4 pb-6 last:pb-0"
                      >
                        {idx < activities.length - 1 && (
                          <div className="absolute left-[11px] top-8 h-[calc(100%-16px)] w-px bg-[hsl(var(--border))]" />
                        )}
                        <div className="relative z-10 mt-0.5">
                          <Icon className={`h-6 w-6 ${color}`} />
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                            {event.details || event.action}
                          </p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            {formatRelativeTime(event.createdAt)}
                            {event.adminUser && (
                              <span>
                                {" "}
                                &middot; {event.adminUser.name}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
