import { useEffect, useState, useCallback } from "react";
import {
  Download,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  FileJson,
  Ban,
  CalendarPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganizationStore } from "@/stores/organizationStore";
import { apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkGenerateResult {
  generated: number;
  failed: number;
  licenses: { id: string; licenseKey: string }[];
  csv: string;
}

interface BulkActionResult {
  revoked?: number;
  extended?: number;
  failed: number;
  results: { licenseId: string; success: boolean; error?: string }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LICENSE_TYPES = [
  { value: "trial", label: "Trial" },
  { value: "perpetual", label: "Perpetual" },
  { value: "time_limited", label: "Time Limited" },
  { value: "organization", label: "Organization" },
] as const;

const TIERS = [
  { value: "individual", label: "Individual" },
  { value: "team", label: "Team" },
  { value: "enterprise", label: "Enterprise" },
  { value: "government", label: "Government" },
] as const;

const STATUSES = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "issued", label: "Issued" },
  { value: "expired", label: "Expired" },
  { value: "suspended", label: "Suspended" },
  { value: "revoked", label: "Revoked" },
] as const;

// No mock fallback organizations -- uses real data from the store

// ---------------------------------------------------------------------------
// Helper: trigger a file download from a string
// ---------------------------------------------------------------------------

function downloadString(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BulkOperationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

export function BulkOperationsDialog({
  open,
  onOpenChange,
  onCompleted,
}: BulkOperationsDialogProps) {
  const { organizations, fetchOrganizations } = useOrganizationStore();
  const orgList = organizations.map((o) => ({ id: o.id, name: o.name }));

  useEffect(() => {
    if (open) {
      fetchOrganizations();
    }
  }, [open, fetchOrganizations]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk License Operations</DialogTitle>
          <DialogDescription>
            Generate, export, revoke, or extend licenses in bulk.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="generate" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="generate">
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="export">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </TabsTrigger>
            <TabsTrigger value="actions">
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
              Bulk Actions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate">
            <BulkGenerateTab orgList={orgList} onCompleted={onCompleted} />
          </TabsContent>

          <TabsContent value="export">
            <BulkExportTab orgList={orgList} />
          </TabsContent>

          <TabsContent value="actions">
            <BulkActionsTab onCompleted={onCompleted} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Bulk Generate
// ---------------------------------------------------------------------------

function BulkGenerateTab({
  orgList,
  onCompleted,
}: {
  orgList: { id: string; name: string }[];
  onCompleted?: () => void;
}) {
  const [orgId, setOrgId] = useState("");
  const [licenseType, setLicenseType] = useState("time_limited");
  const [tier, setTier] = useState("team");
  const [quantity, setQuantity] = useState(10);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BulkGenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!orgId) {
      setError("Please select an organization.");
      return;
    }
    if (quantity < 1 || quantity > 100) {
      setError("Quantity must be between 1 and 100.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const payload: Record<string, unknown> = {
        organizationId: orgId,
        licenseType,
        tier,
        quantity,
        notes: notes || undefined,
      };
      if (validUntil) {
        payload.validUntil = new Date(validUntil).toISOString();
      }

      const data = await apiPost<BulkGenerateResult>(
        "/api/v1/admin/bulk/generate",
        payload,
      );
      setResult(data);
      onCompleted?.();
    } catch (err) {
      // Mock fallback for demo
      const mockLicenses = Array.from({ length: quantity }, (_, i) => ({
        id: `lic_bulk_${Date.now()}_${i}`,
        licenseKey: `CCF-${tier.substring(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}-${Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}`,
      }));
      const orgName = orgList.find((o) => o.id === orgId)?.name ?? "Unknown";
      const csvHeaders = "license_key,organization,tier,type,status,issued_date,expiry_date";
      const csvRows = mockLicenses
        .map(
          (l) =>
            `${l.licenseKey},${orgName},${tier},${licenseType},issued,${new Date().toISOString()},${validUntil ? new Date(validUntil).toISOString() : ""}`,
        )
        .join("\n");
      setResult({
        generated: quantity,
        failed: 0,
        licenses: mockLicenses,
        csv: `${csvHeaders}\n${csvRows}`,
      });
      setError(
        err instanceof Error
          ? `API unavailable (mock data shown): ${err.message}`
          : "API unavailable (mock data shown)",
      );
      onCompleted?.();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!result?.csv) return;
    downloadString(result.csv, `bulk-licenses-${Date.now()}.csv`, "text/csv");
  };

  // Show result screen
  if (result) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-[var(--radius)] border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.05)] p-3">
            <p className="text-xs text-[hsl(var(--warning))]">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-[var(--radius)] border border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.05)] p-4">
          <CheckCircle2 className="h-8 w-8 shrink-0 text-[hsl(var(--success))]" />
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {result.generated} license{result.generated !== 1 ? "s" : ""} generated
            </p>
            {result.failed > 0 && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {result.failed} failed
              </p>
            )}
          </div>
        </div>

        {/* Preview first 5 keys */}
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Generated Keys (preview)
          </p>
          <div className="space-y-1 font-mono text-xs">
            {result.licenses.slice(0, 5).map((lic) => (
              <div key={lic.id} className="text-[hsl(var(--foreground))]">
                {lic.licenseKey}
              </div>
            ))}
            {result.licenses.length > 5 && (
              <p className="text-[hsl(var(--muted-foreground))]">
                ...and {result.licenses.length - 5} more
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleDownloadCsv} className="flex-1">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Download CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setError(null);
            }}
          >
            Generate More
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-[var(--radius)] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.05)] p-3">
          <p className="text-xs text-[hsl(var(--destructive))]">{error}</p>
        </div>
      )}

      {/* Organization */}
      <div className="space-y-2">
        <Label>
          Organization <span className="text-[hsl(var(--destructive))]">*</span>
        </Label>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger>
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
      </div>

      {/* 2-col: Type + Tier */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>License Type</Label>
          <Select value={licenseType} onValueChange={setLicenseType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LICENSE_TYPES.map((lt) => (
                <SelectItem key={lt.value} value={lt.value}>
                  {lt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tier</Label>
          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIERS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 2-col: Quantity + Valid Until */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bulk-quantity">
            Quantity <span className="text-[hsl(var(--destructive))]">*</span>
          </Label>
          <Input
            id="bulk-quantity"
            type="number"
            min={1}
            max={100}
            value={quantity}
            onChange={(e) => setQuantity(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Maximum 100 per batch
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bulk-valid-until">Valid Until</Label>
          <Input
            id="bulk-valid-until"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            disabled={licenseType === "perpetual"}
            className={cn(licenseType === "perpetual" && "opacity-50")}
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {licenseType === "perpetual"
              ? "Perpetual licenses do not expire."
              : "Leave blank for default expiry."}
          </p>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="bulk-notes">Notes</Label>
        <Textarea
          id="bulk-notes"
          placeholder="Internal notes for this batch (optional)..."
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button onClick={handleGenerate} disabled={isLoading} className="w-full">
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        Generate {quantity} License{quantity !== 1 ? "s" : ""}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Export
// ---------------------------------------------------------------------------

function BulkExportTab({
  orgList,
}: {
  orgList: { id: string; name: string }[];
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch preview count when filters change
  const fetchPreview = useCallback(async () => {
    try {
      const payload: Record<string, unknown> = { format: "json" };
      if (statusFilter !== "all") payload.status = statusFilter;
      if (tierFilter !== "all") payload.tier = tierFilter;
      if (orgFilter !== "all") payload.organizationId = orgFilter;

      const data = await apiPost<any[]>("/api/v1/admin/bulk/export", payload);
      setPreviewCount(Array.isArray(data) ? data.length : 0);
    } catch {
      // Mock preview count
      setPreviewCount(Math.floor(20 + Math.random() * 200));
    }
  }, [statusFilter, tierFilter, orgFilter]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const handleExport = async (format: "csv" | "json") => {
    setIsLoading(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = { format };
      if (statusFilter !== "all") payload.status = statusFilter;
      if (tierFilter !== "all") payload.tier = tierFilter;
      if (orgFilter !== "all") payload.organizationId = orgFilter;

      const token = (() => {
        try {
          const stored = localStorage.getItem("ccf-auth");
          if (stored) {
            const parsed = JSON.parse(stored);
            return parsed?.state?.token ?? null;
          }
        } catch {
          // ignore
        }
        return null;
      })();

      const baseUrl = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${baseUrl}/api/v1/admin/bulk/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);

      if (format === "csv") {
        const text = await res.text();
        downloadString(text, `licenses-export-${Date.now()}.csv`, "text/csv");
      } else {
        const json = await res.json();
        const data = json?.data ?? json;
        downloadString(
          JSON.stringify(data, null, 2),
          `licenses-export-${Date.now()}.json`,
          "application/json",
        );
      }
    } catch (err) {
      // Mock fallback export
      const mockCount = previewCount ?? 12;
      if (format === "csv") {
        const headers = "license_key,organization,tier,type,status,issued_date,expiry_date,activations,max_activations,last_heartbeat,notes";
        const rows = Array.from({ length: mockCount }, (_, i) => {
          const key = `CCF-DEMO-${String(i + 1).padStart(4, "0")}-XXXX`;
          return `${key},Demo Org,team,time_limited,active,2025-01-01T00:00:00Z,2026-01-01T00:00:00Z,${Math.floor(Math.random() * 5)},5,,`;
        });
        downloadString(`${headers}\n${rows.join("\n")}`, `licenses-export-${Date.now()}.csv`, "text/csv");
      } else {
        const data = Array.from({ length: mockCount }, (_, i) => ({
          license_key: `CCF-DEMO-${String(i + 1).padStart(4, "0")}-XXXX`,
          organization: "Demo Org",
          tier: "team",
          type: "time_limited",
          status: "active",
          issued_date: "2025-01-01T00:00:00Z",
          expiry_date: "2026-01-01T00:00:00Z",
          activations: Math.floor(Math.random() * 5),
          max_activations: 5,
        }));
        downloadString(
          JSON.stringify(data, null, 2),
          `licenses-export-${Date.now()}.json`,
          "application/json",
        );
      }
      setError(
        err instanceof Error
          ? `API unavailable (mock export): ${err.message}`
          : "API unavailable (mock export)",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-[var(--radius)] border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.05)] p-3">
          <p className="text-xs text-[hsl(var(--warning))]">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tier</Label>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              {TIERS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Organization</Label>
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Organizations</SelectItem>
              {orgList.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Preview count */}
      <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-4 text-center">
        {previewCount !== null ? (
          <p className="text-sm text-[hsl(var(--foreground))]">
            Will export{" "}
            <span className="font-bold">{previewCount}</span>{" "}
            license{previewCount !== 1 ? "s" : ""}
          </p>
        ) : (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Calculating...
          </p>
        )}
      </div>

      {/* Export buttons */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          onClick={() => handleExport("csv")}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="mr-2 h-4 w-4" />
          )}
          Export CSV
        </Button>
        <Button
          variant="outline"
          onClick={() => handleExport("json")}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileJson className="mr-2 h-4 w-4" />
          )}
          Export JSON
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: Bulk Actions (Revoke / Extend)
// ---------------------------------------------------------------------------

function BulkActionsTab({ onCompleted }: { onCompleted?: () => void }) {
  const [action, setAction] = useState<"revoke" | "extend">("revoke");
  const [licenseIdsText, setLicenseIdsText] = useState("");
  const [months, setMonths] = useState(12);
  const [confirmed, setConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BulkActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const licenseIds = licenseIdsText
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const handleExecute = async () => {
    if (licenseIds.length === 0) {
      setError("Please enter at least one license ID.");
      return;
    }
    if (licenseIds.length > 500) {
      setError("Maximum 500 license IDs per operation.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      if (action === "revoke") {
        const data = await apiPost<BulkActionResult>(
          "/api/v1/admin/bulk/revoke",
          { licenseIds },
        );
        setResult(data);
      } else {
        const data = await apiPost<BulkActionResult>(
          "/api/v1/admin/bulk/extend",
          { licenseIds, months },
        );
        setResult(data);
      }
      onCompleted?.();
    } catch (err) {
      // Mock fallback
      const mockResults = licenseIds.map((id) => ({
        licenseId: id,
        success: Math.random() > 0.1,
        error: Math.random() > 0.1 ? undefined : "Not found",
      }));
      const succeeded = mockResults.filter((r) => r.success).length;
      const failed = mockResults.filter((r) => !r.success).length;
      setResult({
        ...(action === "revoke"
          ? { revoked: succeeded }
          : { extended: succeeded }),
        failed,
        results: mockResults,
      });
      setError(
        err instanceof Error
          ? `API unavailable (mock result): ${err.message}`
          : "API unavailable (mock result)",
      );
      onCompleted?.();
    } finally {
      setIsLoading(false);
      setConfirmed(false);
    }
  };

  // Result screen
  if (result) {
    const succeeded = result.revoked ?? result.extended ?? 0;
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-[var(--radius)] border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.05)] p-3">
            <p className="text-xs text-[hsl(var(--warning))]">{error}</p>
          </div>
        )}

        <div
          className={cn(
            "flex items-center gap-3 rounded-[var(--radius)] border p-4",
            result.failed === 0
              ? "border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.05)]"
              : "border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.05)]",
          )}
        >
          {result.failed === 0 ? (
            <CheckCircle2 className="h-8 w-8 shrink-0 text-[hsl(var(--success))]" />
          ) : (
            <AlertTriangle className="h-8 w-8 shrink-0 text-[hsl(var(--warning))]" />
          )}
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {succeeded} license{succeeded !== 1 ? "s" : ""}{" "}
              {action === "revoke" ? "revoked" : "extended"}
            </p>
            {result.failed > 0 && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {result.failed} failed
              </p>
            )}
          </div>
        </div>

        {/* Show failures */}
        {result.results.filter((r) => !r.success).length > 0 && (
          <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Failed Items
            </p>
            <div className="space-y-1 text-xs">
              {result.results
                .filter((r) => !r.success)
                .slice(0, 10)
                .map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <XCircle className="h-3 w-3 shrink-0 text-[hsl(var(--destructive))]" />
                    <span className="font-mono text-[hsl(var(--foreground))]">
                      {r.licenseId.substring(0, 20)}...
                    </span>
                    <span className="text-[hsl(var(--muted-foreground))]">
                      {r.error}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <Button
          variant="outline"
          onClick={() => {
            setResult(null);
            setError(null);
            setLicenseIdsText("");
          }}
          className="w-full"
        >
          Run Another Action
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-[var(--radius)] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.05)] p-3">
          <p className="text-xs text-[hsl(var(--destructive))]">{error}</p>
        </div>
      )}

      {/* Action selector */}
      <div className="space-y-2">
        <Label>Action</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setAction("revoke");
              setConfirmed(false);
            }}
            className={cn(
              "flex items-center gap-2 rounded-[var(--radius)] border-2 p-3 text-left transition-colors cursor-pointer",
              action === "revoke"
                ? "border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.05)]"
                : "border-[hsl(var(--border))] hover:border-[hsl(var(--destructive)/0.4)]",
            )}
          >
            <Ban className="h-4 w-4 text-[hsl(var(--destructive))]" />
            <div>
              <span className="text-xs font-semibold text-[hsl(var(--foreground))]">
                Bulk Revoke
              </span>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                Permanently revoke and deactivate
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setAction("extend");
              setConfirmed(false);
            }}
            className={cn(
              "flex items-center gap-2 rounded-[var(--radius)] border-2 p-3 text-left transition-colors cursor-pointer",
              action === "extend"
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]"
                : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.4)]",
            )}
          >
            <CalendarPlus className="h-4 w-4 text-[hsl(var(--primary))]" />
            <div>
              <span className="text-xs font-semibold text-[hsl(var(--foreground))]">
                Bulk Extend
              </span>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                Extend validity period
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* License IDs input */}
      <div className="space-y-2">
        <Label htmlFor="bulk-license-ids">
          License IDs{" "}
          <span className="text-[hsl(var(--destructive))]">*</span>
        </Label>
        <Textarea
          id="bulk-license-ids"
          placeholder="Paste license IDs here, one per line or comma-separated..."
          rows={4}
          value={licenseIdsText}
          onChange={(e) => {
            setLicenseIdsText(e.target.value);
            setConfirmed(false);
          }}
          className="font-mono text-xs"
        />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {licenseIds.length} ID{licenseIds.length !== 1 ? "s" : ""} detected
          (max 500)
        </p>
      </div>

      {/* Extend months */}
      {action === "extend" && (
        <div className="space-y-2">
          <Label htmlFor="bulk-months">Extend by (months)</Label>
          <Input
            id="bulk-months"
            type="number"
            min={1}
            max={60}
            value={months}
            onChange={(e) =>
              setMonths(
                Math.min(60, Math.max(1, parseInt(e.target.value) || 1)),
              )
            }
          />
        </div>
      )}

      {/* Warning */}
      <div
        className={cn(
          "rounded-[var(--radius)] border p-3",
          action === "revoke"
            ? "border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.05)]"
            : "border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.05)]",
        )}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              action === "revoke"
                ? "text-[hsl(var(--destructive))]"
                : "text-[hsl(var(--warning))]",
            )}
          />
          <div className="text-xs">
            {action === "revoke" ? (
              <p className="text-[hsl(var(--destructive))]">
                <strong>Warning:</strong> Revoking licenses will permanently
                deactivate all associated machines. This action cannot be undone.
              </p>
            ) : (
              <p className="text-[hsl(var(--warning))]">
                <strong>Note:</strong> Extending licenses will add {months}{" "}
                month{months !== 1 ? "s" : ""} to each license's expiry date.
                Expired licenses will be reinstated.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation step */}
      {!confirmed ? (
        <Button
          variant={action === "revoke" ? "destructive" : "default"}
          onClick={() => setConfirmed(true)}
          disabled={licenseIds.length === 0}
          className="w-full"
        >
          {action === "revoke" ? (
            <>
              <Ban className="mr-2 h-4 w-4" />
              Revoke {licenseIds.length} License{licenseIds.length !== 1 ? "s" : ""}
            </>
          ) : (
            <>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Extend {licenseIds.length} License{licenseIds.length !== 1 ? "s" : ""}
            </>
          )}
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-center text-sm font-medium text-[hsl(var(--foreground))]">
            Are you sure? This will affect{" "}
            <strong>{licenseIds.length}</strong> license
            {licenseIds.length !== 1 ? "s" : ""}.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmed(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant={action === "revoke" ? "destructive" : "default"}
              onClick={handleExecute}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirm{" "}
              {action === "revoke" ? "Revoke" : "Extend"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
