import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Building2, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useOrganizationStore } from "@/stores/organizationStore";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const createOrgSchema = z.object({
  name: z
    .string()
    .min(2, "Organization name must be at least 2 characters")
    .max(200, "Organization name is too long"),
  type: z.enum(
    [
      "government",
      "law_enforcement",
      "corporate",
      "academic",
      "private_lab",
      "individual",
    ],
    { required_error: "Please select an organization type" },
  ),
  email: z
    .string()
    .email("Please enter a valid email")
    .or(z.literal(""))
    .optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(2).default("IN"),
  gstin: z
    .string()
    .regex(/^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, {
      message: "Invalid GSTIN format",
    })
    .optional()
    .or(z.literal("")),
  pan_number: z
    .string()
    .regex(/^$|^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, {
      message: "Invalid PAN format (e.g., ABCDE1234F)",
    })
    .optional()
    .or(z.literal("")),
  notes: z.string().max(2000).optional(),
  // Primary contact (optional section)
  contact_name: z.string().max(200).optional(),
  contact_email: z
    .string()
    .email("Please enter a valid contact email")
    .or(z.literal(""))
    .optional(),
  contact_phone: z.string().max(20).optional(),
  contact_designation: z.string().max(100).optional(),
});

type CreateOrgFormData = z.infer<typeof createOrgSchema>;

// ---------------------------------------------------------------------------
// Org type options
// ---------------------------------------------------------------------------

const ORG_TYPE_OPTIONS = [
  { value: "government", label: "Government" },
  { value: "law_enforcement", label: "Law Enforcement" },
  { value: "corporate", label: "Corporate" },
  { value: "academic", label: "Academic" },
  { value: "private_lab", label: "Private Lab" },
  { value: "individual", label: "Individual" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrgDialog({ open, onOpenChange }: CreateOrgDialogProps) {
  const createOrganization = useOrganizationStore(
    (s) => s.createOrganization,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateOrgFormData>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: {
      name: "",
      type: undefined,
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      country: "IN",
      gstin: "",
      pan_number: "",
      notes: "",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      contact_designation: "",
    },
  });

  const selectedType = watch("type");

  const onSubmit = async (data: CreateOrgFormData) => {
    setIsSubmitting(true);
    try {
      // Auto-generate slug from the name (lowercase, hyphens, no special chars)
      const slug = data.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const payload: Record<string, unknown> = {
        name: data.name,
        slug,
        orgType: data.type, // backend expects "orgType", not "type"
        email: data.email || undefined,
        phone: data.phone || undefined,
        address: data.address || undefined,
        city: data.city || undefined,
        state: data.state || undefined,
        country: data.country || "IN",
        gstin: data.gstin || undefined,
        panNumber: data.pan_number || undefined, // backend expects "panNumber", not "pan_number"
        notes: data.notes || undefined,
      };

      // Only include primary contact as a separate addContact call after creation
      // The backend create endpoint doesn't accept nested contacts
      const contactData = data.contact_name?.trim()
        ? {
            name: data.contact_name.trim(),
            email: data.contact_email || undefined,
            phone: data.contact_phone || undefined,
            designation: data.contact_designation || undefined,
          }
        : null;

      const org = await createOrganization(payload);

      // If a primary contact was provided, add it to the newly created org
      if (contactData && org?.id) {
        try {
          const { addContact } = useOrganizationStore.getState();
          await addContact(org.id, contactData);
        } catch {
          // Contact creation is best-effort; org was already created
        }
      }
      toast.success("Organization created", {
        description: `${data.name} has been created successfully.`,
      });
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Failed to create organization", {
        description: "Please try again or check your connection.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!isSubmitting) {
      if (!nextOpen) reset();
      onOpenChange(nextOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5 text-[hsl(var(--primary))]" />
            Create Organization
          </DialogTitle>
          <DialogDescription>
            Add a new organization to the platform. Fields marked with * are
            required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* ---- Organization details ---- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Name */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="org-name">
                Organization Name <span className="text-[hsl(var(--destructive))]">*</span>
              </Label>
              <Input
                id="org-name"
                placeholder="e.g. Mumbai Cyber Cell"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label>
                Organization Type <span className="text-[hsl(var(--destructive))]">*</span>
              </Label>
              <Select
                value={selectedType}
                onValueChange={(val) =>
                  setValue("type", val as CreateOrgFormData["type"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {ORG_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.type.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="org-email">Email</Label>
              <Input
                id="org-email"
                type="email"
                placeholder="org@example.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="org-phone">Phone</Label>
              <Input
                id="org-phone"
                placeholder="+91 22 1234 5678"
                {...register("phone")}
              />
            </div>

            {/* Address */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="org-address">Address</Label>
              <Input
                id="org-address"
                placeholder="Street address"
                {...register("address")}
              />
            </div>

            {/* City */}
            <div className="space-y-1.5">
              <Label htmlFor="org-city">City</Label>
              <Input
                id="org-city"
                placeholder="Mumbai"
                {...register("city")}
              />
            </div>

            {/* State */}
            <div className="space-y-1.5">
              <Label htmlFor="org-state">State</Label>
              <Input
                id="org-state"
                placeholder="Maharashtra"
                {...register("state")}
              />
            </div>

            {/* Country */}
            <div className="space-y-1.5">
              <Label htmlFor="org-country">Country</Label>
              <Input
                id="org-country"
                placeholder="IN"
                maxLength={2}
                {...register("country")}
              />
            </div>

            {/* GSTIN */}
            <div className="space-y-1.5">
              <Label htmlFor="org-gstin">GSTIN</Label>
              <Input
                id="org-gstin"
                placeholder="27AABCU9603R1ZM"
                className="uppercase"
                {...register("gstin")}
              />
              {errors.gstin && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.gstin.message}
                </p>
              )}
            </div>

            {/* PAN */}
            <div className="space-y-1.5">
              <Label htmlFor="org-pan">PAN Number</Label>
              <Input
                id="org-pan"
                placeholder="ABCDE1234F"
                className="uppercase"
                {...register("pan_number")}
              />
              {errors.pan_number && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.pan_number.message}
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="org-notes">Notes</Label>
              <Textarea
                id="org-notes"
                placeholder="Additional information about this organization..."
                rows={3}
                {...register("notes")}
              />
            </div>
          </div>

          {/* ---- Primary Contact ---- */}
          <Separator />

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              <User className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              Primary Contact
              <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">
                (optional)
              </span>
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cnt-name">Name</Label>
                <Input
                  id="cnt-name"
                  placeholder="Inspector Rahul Patil"
                  {...register("contact_name")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cnt-email">Email</Label>
                <Input
                  id="cnt-email"
                  type="email"
                  placeholder="contact@example.com"
                  {...register("contact_email")}
                />
                {errors.contact_email && (
                  <p className="text-xs text-[hsl(var(--destructive))]">
                    {errors.contact_email.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cnt-phone">Phone</Label>
                <Input
                  id="cnt-phone"
                  placeholder="+91 98765 43210"
                  {...register("contact_phone")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cnt-designation">Designation</Label>
                <Input
                  id="cnt-designation"
                  placeholder="Nodal Officer"
                  {...register("contact_designation")}
                />
              </div>
            </div>
          </div>

          {/* ---- Footer ---- */}
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Organization
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
