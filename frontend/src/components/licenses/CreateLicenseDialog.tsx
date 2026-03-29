import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Copy, Check, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLicenseStore } from "@/stores/licenseStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const createLicenseSchema = z.object({
  organizationId: z.string().min(1, "Organization is required"),
  licenseType: z.enum(["trial", "perpetual", "time_limited", "organization"], {
    required_error: "License type is required",
  }),
  tier: z.enum(["individual", "team", "enterprise", "government"], {
    required_error: "Tier is required",
  }),
  maxActivations: z.coerce
    .number()
    .int("Must be a whole number")
    .min(1, "At least 1 activation required")
    .max(500, "Maximum 500 activations"),
  validUntil: z.string().optional(),
  notes: z.string().max(1000, "Notes must be under 1000 characters").optional(),
});

type CreateLicenseForm = z.infer<typeof createLicenseSchema>;

// ---------------------------------------------------------------------------
// Tier default activations
// ---------------------------------------------------------------------------

const TIER_DEFAULTS: Record<string, number> = {
  individual: 1,
  team: 5,
  enterprise: 25,
  government: 50,
};

// ---------------------------------------------------------------------------
// License type config
// ---------------------------------------------------------------------------

const LICENSE_TYPES = [
  {
    value: "trial",
    label: "Trial",
    description: "Limited evaluation period",
  },
  {
    value: "perpetual",
    label: "Perpetual",
    description: "No expiration date",
  },
  {
    value: "time_limited",
    label: "Time Limited",
    description: "Valid for a set duration",
  },
  {
    value: "organization",
    label: "Organization",
    description: "Org-wide deployment",
  },
] as const;

const TIERS = [
  {
    value: "individual",
    label: "Individual",
    description: "Single user",
    activations: 1,
  },
  {
    value: "team",
    label: "Team",
    description: "Small team",
    activations: 5,
  },
  {
    value: "enterprise",
    label: "Enterprise",
    description: "Large deployment",
    activations: 25,
  },
  {
    value: "government",
    label: "Government",
    description: "Govt. agencies",
    activations: 50,
  },
] as const;

// No mock fallback organizations -- uses real data from the store

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CreateLicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function CreateLicenseDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateLicenseDialogProps) {
  const { createLicense, isActionLoading } = useLicenseStore();
  const { organizations, fetchOrganizations } = useOrganizationStore();

  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  // Derive org list from API data
  const orgList = organizations.map((o) => ({ id: o.id, name: o.name }));

  // Fetch organizations when dialog opens
  useEffect(() => {
    if (open) {
      fetchOrganizations();
      setCreatedKey(null);
      setKeyCopied(false);
    }
  }, [open, fetchOrganizations]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreateLicenseForm>({
    resolver: zodResolver(createLicenseSchema),
    defaultValues: {
      organizationId: "",
      licenseType: "time_limited",
      tier: "team",
      maxActivations: 5,
      validUntil: "",
      notes: "",
    },
  });

  const watchedType = watch("licenseType");
  const watchedTier = watch("tier");

  // Auto-update max activations when tier changes
  useEffect(() => {
    if (watchedTier && TIER_DEFAULTS[watchedTier]) {
      setValue("maxActivations", TIER_DEFAULTS[watchedTier]);
    }
  }, [watchedTier, setValue]);

  const onSubmit = async (data: CreateLicenseForm) => {
    try {
      const payload: Record<string, unknown> = {
        organizationId: data.organizationId,
        licenseType: data.licenseType,
        tier: data.tier,
        maxActivations: data.maxActivations,
        notes: data.notes || undefined,
      };

      // Only include validUntil for non-perpetual types
      // Backend expects ISO 8601 datetime, but the date input gives "YYYY-MM-DD"
      if (data.licenseType !== "perpetual" && data.validUntil) {
        payload.validUntil = new Date(data.validUntil + "T23:59:59.000Z").toISOString();
      }

      const license = await createLicense(payload);
      setCreatedKey(license.licenseKey);
    } catch {
      // Store handles the error state
    }
  };

  const handleClose = () => {
    reset();
    setCreatedKey(null);
    setKeyCopied(false);
    onOpenChange(false);
    if (createdKey) {
      onCreated?.();
    }
  };

  const copyKey = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------

  if (createdKey) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--success)/0.15)]">
              <KeyRound className="h-6 w-6 text-[hsl(var(--success))]" />
            </div>
            <DialogTitle className="text-center">
              License Created
            </DialogTitle>
            <DialogDescription className="text-center">
              The license has been created successfully. Copy the key below and
              share it with the organization. This is the only time the full key
              is shown.
            </DialogDescription>
          </DialogHeader>

          <div className="my-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              License Key
            </p>
            <div className="flex items-center justify-between gap-3">
              <code className="font-mono text-lg font-bold tracking-wider text-[hsl(var(--foreground))]">
                {createdKey}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={copyKey}
              >
                {keyCopied ? (
                  <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ---------------------------------------------------------------------------
  // Form state
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New License</DialogTitle>
          <DialogDescription>
            Issue a new license key to an organization. Configure the type,
            tier, and activation limits below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Organization */}
          <div className="space-y-2">
            <Label htmlFor="organizationId">
              Organization <span className="text-[hsl(var(--destructive))]">*</span>
            </Label>
            <Select
              value={watch("organizationId")}
              onValueChange={(v) => setValue("organizationId", v, { shouldValidate: true })}
            >
              <SelectTrigger
                id="organizationId"
                className={cn(
                  errors.organizationId &&
                    "border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]",
                )}
              >
                <SelectValue placeholder="Select an organization..." />
              </SelectTrigger>
              <SelectContent>
                {orgList.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.organizationId && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {errors.organizationId.message}
              </p>
            )}
          </div>

          {/* 2-column: License Type + Tier */}
          <div className="grid gap-5 sm:grid-cols-2">
            {/* License Type */}
            <div className="space-y-2">
              <Label>
                License Type <span className="text-[hsl(var(--destructive))]">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {LICENSE_TYPES.map((lt) => (
                  <button
                    key={lt.value}
                    type="button"
                    onClick={() =>
                      setValue("licenseType", lt.value, {
                        shouldValidate: true,
                      })
                    }
                    className={cn(
                      "flex flex-col rounded-[var(--radius)] border-2 p-2.5 text-left transition-colors cursor-pointer",
                      watchedType === lt.value
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]"
                        : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.4)]",
                    )}
                  >
                    <span className="text-xs font-semibold text-[hsl(var(--foreground))]">
                      {lt.label}
                    </span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                      {lt.description}
                    </span>
                  </button>
                ))}
              </div>
              {errors.licenseType && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.licenseType.message}
                </p>
              )}
            </div>

            {/* Tier */}
            <div className="space-y-2">
              <Label>
                Tier <span className="text-[hsl(var(--destructive))]">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {TIERS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() =>
                      setValue("tier", t.value, { shouldValidate: true })
                    }
                    className={cn(
                      "flex flex-col rounded-[var(--radius)] border-2 p-2.5 text-left transition-colors cursor-pointer",
                      watchedTier === t.value
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]"
                        : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.4)]",
                    )}
                  >
                    <span className="text-xs font-semibold text-[hsl(var(--foreground))]">
                      {t.label}
                    </span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                      {t.description} ({t.activations})
                    </span>
                  </button>
                ))}
              </div>
              {errors.tier && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.tier.message}
                </p>
              )}
            </div>
          </div>

          {/* 2-column: Max Activations + Valid Until */}
          <div className="grid gap-5 sm:grid-cols-2">
            {/* Max Activations */}
            <div className="space-y-2">
              <Label htmlFor="maxActivations">Max Activations</Label>
              <Input
                id="maxActivations"
                type="number"
                min={1}
                max={500}
                {...register("maxActivations")}
                className={cn(
                  errors.maxActivations &&
                    "border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]",
                )}
              />
              {errors.maxActivations ? (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.maxActivations.message}
                </p>
              ) : (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Default for {watchedTier}: {TIER_DEFAULTS[watchedTier] || 1}
                </p>
              )}
            </div>

            {/* Valid Until (hidden for perpetual) */}
            <div className="space-y-2">
              <Label htmlFor="validUntil">
                Valid Until
                {watchedType === "perpetual" && (
                  <span className="ml-1 text-xs font-normal text-[hsl(var(--muted-foreground))]">
                    (not applicable)
                  </span>
                )}
              </Label>
              <Input
                id="validUntil"
                type="date"
                disabled={watchedType === "perpetual"}
                {...register("validUntil")}
                className={cn(
                  watchedType === "perpetual" && "opacity-50",
                  errors.validUntil &&
                    "border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]",
                )}
              />
              {watchedType === "perpetual" ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Perpetual licenses do not expire.
                </p>
              ) : (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Leave blank to set no expiry.
                </p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Internal notes about this license (optional)..."
              rows={3}
              {...register("notes")}
              className={cn(
                errors.notes &&
                  "border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]",
              )}
            />
            {errors.notes && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {errors.notes.message}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isActionLoading}>
              {isActionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              Create License
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
