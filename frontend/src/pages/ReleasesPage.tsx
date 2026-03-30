import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, formatDistanceToNow } from "date-fns";
import {
  Plus,
  Package,
  Download,
  Eye,
  Wand2,
  ShieldBan,
  Rocket,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertTriangle,
  Monitor,
  CircleDot,
  Clock,
  Search,
  Tag,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Github,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useReleaseStore,
  type Release,
  type ReleaseAsset,
} from "@/stores/releaseStore";
import { RoleGuard } from "@/components/shared/RoleGuard";
import { useCan } from "@/lib/rbac";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
}

function truncateSha(sha: string, length = 12): string {
  if (sha.length <= length) return sha;
  return sha.substring(0, length) + "...";
}

function platformLabel(platform: string): string {
  const map: Record<string, string> = {
    windows: "Windows",
    linux: "Linux",
    macos: "macOS",
    android: "Android",
    ios: "iOS",
  };
  return map[platform.toLowerCase()] || platform;
}

function archLabel(arch: string): string {
  const map: Record<string, string> = {
    x86_64: "x64",
    aarch64: "ARM64",
    armv7: "ARMv7",
    i686: "x86",
    amd64: "x64",
  };
  return map[arch.toLowerCase()] || arch;
}

function packageTypeLabel(pkg: string): string {
  const map: Record<string, string> = {
    nsis: "NSIS Installer",
    msi: "MSI",
    appimage: "AppImage",
    deb: "Debian Package",
    rpm: "RPM Package",
    dmg: "DMG",
    snap: "Snap",
    flatpak: "Flatpak",
  };
  return map[pkg.toLowerCase()] || pkg;
}

// ---------------------------------------------------------------------------
// Local release type (extends store Release with assets/detail fields)
// ---------------------------------------------------------------------------

interface PageRelease extends Omit<Release, "_count"> {
  releaseNotes: string;
  assets: ReleaseAsset[];
  minVersion?: string | null;
  blockReason?: string | null;
  _count: { downloads: number };
}


// ---------------------------------------------------------------------------
// Configs
// ---------------------------------------------------------------------------

type ReleaseStatus = "draft" | "published" | "blocked";

function getReleaseStatus(release: PageRelease): ReleaseStatus {
  if (release.isBlocked) return "blocked";
  if (release.publishedAt) return "published";
  return "draft";
}

const statusConfig: Record<
  ReleaseStatus,
  { label: string; variant: "success" | "destructive" | "secondary"; dotColor: string }
> = {
  draft: {
    label: "Draft",
    variant: "secondary",
    dotColor: "bg-[hsl(var(--muted-foreground))]",
  },
  published: {
    label: "Published",
    variant: "success",
    dotColor: "bg-[hsl(var(--success))]",
  },
  blocked: {
    label: "Blocked",
    variant: "destructive",
    dotColor: "bg-[hsl(var(--destructive))]",
  },
};

const channelConfig: Record<string, { label: string; className: string }> = {
  stable: {
    label: "stable",
    className:
      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  beta: {
    label: "beta",
    className:
      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  },
  rc: {
    label: "rc",
    className:
      "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
};

const severityConfig: Record<string, { label: string; className: string }> = {
  critical: {
    label: "critical",
    className:
      "bg-red-500/15 text-red-400 border-red-500/30",
  },
  recommended: {
    label: "recommended",
    className:
      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  optional: {
    label: "optional",
    className:
      "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
};

const platformIconColor: Record<string, string> = {
  windows: "text-sky-400",
  linux: "text-amber-400",
  macos: "text-zinc-300",
};

// ---------------------------------------------------------------------------
// Zod Schema for Create Release
// ---------------------------------------------------------------------------

const semverRegex =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const createReleaseSchema = z.object({
  version: z
    .string()
    .min(1, "Version is required")
    .regex(semverRegex, "Must be a valid semver (e.g., 2.1.0 or 2.2.0-beta.1)"),
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  channel: z.enum(["stable", "beta", "rc"], {
    required_error: "Channel is required",
  }),
  severity: z.enum(["critical", "recommended", "optional"], {
    required_error: "Severity is required",
  }),
  releaseNotes: z.string().optional(),
  forceUpdate: z.boolean().default(false),
  minVersion: z
    .string()
    .optional()
    .refine(
      (val) => !val || semverRegex.test(val),
      "Must be a valid semver if provided"
    ),
});

type CreateReleaseForm = z.infer<typeof createReleaseSchema>;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))] cursor-pointer"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3 w-3 text-[hsl(var(--success))]" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.1)]">
            <Icon className="h-4 w-4 text-[hsl(var(--primary))]" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] leading-none">
              {title}
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">
                {value}
              </p>
              {description && (
                <p className="truncate text-[10px] text-[hsl(var(--muted-foreground))]">
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats skeleton */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-14" />
                </div>
                <Skeleton className="h-10 w-10 rounded-lg" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Release card skeletons */}
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-5 w-48" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-24" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block Reason Dialog
// ---------------------------------------------------------------------------

function BlockDialog({
  open,
  onOpenChange,
  onConfirm,
  version,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  version: string;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block Release v{version}</DialogTitle>
          <DialogDescription>
            Blocking this release will prevent new installations and updates.
            Existing installations will not be affected.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="block-reason">Reason for blocking</Label>
          <Textarea
            id="block-reason"
            placeholder="Describe why this release is being blocked..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim()}
            onClick={() => {
              onConfirm(reason.trim());
              setReason("");
              onOpenChange(false);
            }}
          >
            <ShieldBan className="h-4 w-4" />
            Block Release
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Assets Detail Table
// ---------------------------------------------------------------------------

function AssetsTable({ assets }: { assets: ReleaseAsset[] }) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border)/0.6)] py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted)/0.7)]">
          <Package className="h-6 w-6 text-[hsl(var(--muted-foreground)/0.6)]" />
        </div>
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
          No assets uploaded yet
        </p>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground)/0.5)]">
          Upload platform installers to this release
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[hsl(var(--border))]">
            <th className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Platform
            </th>
            <th className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Arch
            </th>
            <th className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Package
            </th>
            <th className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Filename
            </th>
            <th className="pb-2 pr-4 text-right text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Size
            </th>
            <th className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              SHA256
            </th>
            <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              URL
            </th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr
              key={asset.id}
              className="border-b border-[hsl(var(--border)/0.5)] last:border-0"
            >
              <td className="py-2.5 pr-4 font-medium">
                {platformLabel(asset.platform)}
              </td>
              <td className="py-2.5 pr-4 text-[hsl(var(--muted-foreground))]">
                {archLabel(asset.arch)}
              </td>
              <td className="py-2.5 pr-4 text-[hsl(var(--muted-foreground))]">
                {packageTypeLabel(asset.packageType)}
              </td>
              <td className="py-2.5 pr-4">
                <span className="font-mono text-xs">{asset.filename}</span>
              </td>
              <td className="py-2.5 pr-4 text-right text-[hsl(var(--muted-foreground))]">
                {formatFileSize(asset.fileSize)}
              </td>
              <td className="py-2.5 pr-4">
                <div className="flex items-center gap-1">
                  <code className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
                    {truncateSha(asset.sha256Hash)}
                  </code>
                  <CopyButton text={asset.sha256Hash} />
                </div>
              </td>
              <td className="py-2.5">
                <a
                  href={asset.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[hsl(var(--primary))] hover:underline"
                >
                  Download
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Release Notes Renderer (pre-formatted)
// ---------------------------------------------------------------------------

function ReleaseNotes({ content }: { content: string }) {
  // Simple markdown-to-display: render headings and list items with basic styling
  const lines = content.split("\n");
  return (
    <div className="space-y-1 text-sm">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <h4
              key={i}
              className="mt-2 text-sm font-semibold text-[hsl(var(--foreground))]"
            >
              {line.replace("## ", "")}
            </h4>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <h3
              key={i}
              className="mt-3 text-base font-bold text-[hsl(var(--foreground))]"
            >
              {line.replace("# ", "")}
            </h3>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <p
              key={i}
              className="pl-4 text-[hsl(var(--muted-foreground))] before:content-['\2022_'] before:text-[hsl(var(--primary))]"
            >
              {line.replace("- ", "")}
            </p>
          );
        }
        if (line.trim() === "") {
          return <div key={i} className="h-1" />;
        }
        return (
          <p key={i} className="text-[hsl(var(--muted-foreground))]">
            {line}
          </p>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Release Card
// ---------------------------------------------------------------------------

function ReleaseCard({
  release,
  onPublish,
  onBlock,
  onDelete,
  onEdit,
  onImportAssets,
  isImporting,
}: {
  release: PageRelease;
  onPublish: (id: string) => void;
  onBlock: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (release: PageRelease) => void;
  onImportAssets: (id: string) => void;
  isImporting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = getReleaseStatus(release);
  const statusCfg = statusConfig[status];
  const channelCfg = channelConfig[release.channel] || channelConfig.stable;
  const severityCfg = severityConfig[release.severity] || severityConfig.optional;

  const publishedDate = release.publishedAt
    ? format(new Date(release.publishedAt), "dd MMM yyyy")
    : null;
  const createdDate = format(new Date(release.createdAt), "dd MMM yyyy");
  const timeAgo = release.publishedAt
    ? formatDistanceToNow(new Date(release.publishedAt), { addSuffix: true })
    : formatDistanceToNow(new Date(release.createdAt), { addSuffix: true });

  return (
    <Card
      className={cn(
        "transition-all duration-200 hover:shadow-md",
        status === "blocked" && "border-[hsl(var(--destructive)/0.3)]",
        release.forceUpdate &&
          status === "published" &&
          "border-[hsl(var(--warning)/0.4)]"
      )}
    >
      <CardContent className="p-0">
        {/* Main card content */}
        <div className="p-5">
          {/* Top section: version + badges + status */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">
                  v{release.version}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    channelCfg.className
                  )}
                >
                  {channelCfg.label}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                    severityCfg.className
                  )}
                >
                  {severityCfg.label}
                </span>
                {release.forceUpdate && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    Force
                  </span>
                )}
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {release.title}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    statusCfg.dotColor
                  )}
                />
                <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                  {statusCfg.label}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(release)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onImportAssets(release.id)}
                    disabled={isImporting}
                  >
                    {isImporting ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Github className="mr-2 h-3.5 w-3.5" />
                    )}
                    Import from GitHub
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {status === "published" && (
                    <DropdownMenuItem
                      className="text-[hsl(var(--destructive))]"
                      onClick={() => onBlock(release.id)}
                    >
                      <ShieldBan className="mr-2 h-3.5 w-3.5" />
                      Block Version
                    </DropdownMenuItem>
                  )}
                  {status === "draft" && (
                    <DropdownMenuItem
                      className="text-[hsl(var(--destructive))]"
                      onClick={() => onDelete(release.id)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Middle: meta row */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {publishedDate || createdDate}
              <span className="opacity-60">({timeAgo})</span>
            </span>
            <span className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              <span className="font-semibold text-[hsl(var(--foreground))]">
                {release._count.downloads.toLocaleString()}
              </span>
              downloads
            </span>
            {release.minVersion && (
              <span className="text-[10px]">
                min: v{release.minVersion}
              </span>
            )}
            {release.assets.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {release.assets.map((asset) => (
                  <span
                    key={asset.id}
                    className="inline-flex items-center gap-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--foreground))]"
                  >
                    <Monitor
                      className={cn(
                        "h-2.5 w-2.5",
                        platformIconColor[asset.platform] || "text-zinc-400"
                      )}
                    />
                    {platformLabel(asset.platform)} {archLabel(asset.arch)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions row */}
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-[hsl(var(--border)/0.5)] pt-3.5">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpanded(!expanded)}
              >
                <Eye className="h-3.5 w-3.5" />
                {expanded ? "Collapse" : "Details"}
                {expanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <RoleGuard permission="releases.publish">
                {status === "draft" && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0}>
                          <Button
                            size="sm"
                            disabled={!release.assets || release.assets.length === 0}
                            onClick={() => onPublish(release.id)}
                          >
                            <Rocket className="h-3.5 w-3.5" />
                            Publish
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {(!release.assets || release.assets.length === 0) && (
                        <TooltipContent>
                          <p>Import assets before publishing</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
              </RoleGuard>
              <RoleGuard permission="releases.block">
                {status === "published" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[hsl(var(--destructive)/0.4)] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.1)]"
                    onClick={() => onBlock(release.id)}
                  >
                    <ShieldBan className="h-3.5 w-3.5" />
                    Block
                  </Button>
                )}
              </RoleGuard>
            </div>
          </div>

          {/* Blocked reason banner */}
          {status === "blocked" && release.blockReason && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.05)] px-3 py-2">
              <ShieldBan className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--destructive))]" />
              <p className="text-xs text-[hsl(var(--destructive))]">
                <span className="font-medium">Blocked:</span>{" "}
                {release.blockReason}
              </p>
            </div>
          )}
        </div>

        {/* Expanded detail section */}
        {expanded && (
          <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)]">
            <div className="p-5 space-y-5">
              {/* Release Notes */}
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Release Notes
                </h4>
                <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                  <ReleaseNotes content={release.releaseNotes} />
                </div>
              </div>

              {/* Assets Table */}
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Distribution Assets
                </h4>
                <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                  {release.assets.length === 0 ? (
                    <div className="text-center py-6">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted)/0.7)] mx-auto">
                        <Package className="h-6 w-6 text-[hsl(var(--muted-foreground)/0.6)]" />
                      </div>
                      <p className="text-sm text-[hsl(var(--muted-foreground))] mt-3">No assets yet</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground)/0.5)] mt-1 mb-3">
                        Import platform installers from your GitHub release
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onImportAssets(release.id)}
                        disabled={isImporting}
                      >
                        {isImporting ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Import from GitHub
                      </Button>
                    </div>
                  ) : (
                    <AssetsTable assets={release.assets} />
                  )}
                </div>
              </div>

              {/* Download Stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                    Total Downloads
                  </p>
                  <p className="mt-1 text-xl font-bold text-[hsl(var(--foreground))]">
                    {release._count.downloads.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                    Assets
                  </p>
                  <p className="mt-1 text-xl font-bold text-[hsl(var(--foreground))]">
                    {release.assets.length}
                  </p>
                </div>
                <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                    Created
                  </p>
                  <p className="mt-1 text-sm font-medium text-[hsl(var(--foreground))]">
                    {format(new Date(release.createdAt), "dd MMM yyyy, HH:mm")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Create Release Dialog
// ---------------------------------------------------------------------------

function CreateReleaseDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: CreateReleaseForm) => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isValid },
  } = useForm<CreateReleaseForm>({
    resolver: zodResolver(createReleaseSchema),
    mode: "onChange",
    defaultValues: {
      version: "",
      title: "",
      channel: undefined,
      severity: undefined,
      releaseNotes: "",
      forceUpdate: false,
      minVersion: "",
    },
  });

  const onSubmit = (data: CreateReleaseForm) => {
    onCreate(data);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Release</DialogTitle>
          <DialogDescription>
            Create a draft release. You can publish it after uploading assets.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Version */}
          <div className="space-y-1.5">
            <Label htmlFor="version">
              Version <span className="text-[hsl(var(--destructive))]">*</span>
            </Label>
            <Input
              id="version"
              placeholder="2.2.0 or 2.3.0-beta.1"
              {...register("version")}
            />
            {errors.version && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {errors.version.message}
              </p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">
              Title <span className="text-[hsl(var(--destructive))]">*</span>
            </Label>
            <Input
              id="title"
              placeholder="Security Patch - CVE-2026-XXXX"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Channel & Severity Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Channel <span className="text-[hsl(var(--destructive))]">*</span>
              </Label>
              <Controller
                name="channel"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stable">Stable</SelectItem>
                      <SelectItem value="beta">Beta</SelectItem>
                      <SelectItem value="rc">Release Candidate</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.channel && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.channel.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Severity{" "}
                <span className="text-[hsl(var(--destructive))]">*</span>
              </Label>
              <Controller
                name="severity"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="recommended">Recommended</SelectItem>
                      <SelectItem value="optional">Optional</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.severity && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.severity.message}
                </p>
              )}
            </div>
          </div>

          {/* Release Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="releaseNotes">Release Notes</Label>
            <Textarea
              id="releaseNotes"
              placeholder="## What's New&#10;- Feature description&#10;&#10;## Bug Fixes&#10;- Fix description"
              rows={6}
              {...register("releaseNotes")}
            />
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
              Supports markdown formatting
            </p>
          </div>

          {/* Force Update & Min Version Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="minVersion">Minimum Version</Label>
              <Input
                id="minVersion"
                placeholder="2.0.0 (optional)"
                {...register("minVersion")}
              />
              {errors.minVersion && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.minVersion.message}
                </p>
              )}
            </div>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2.5">
                <Controller
                  name="forceUpdate"
                  control={control}
                  render={({ field }) => (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={field.value}
                      onClick={() => field.onChange(!field.value)}
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                        field.value
                          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                          : "border-[hsl(var(--input))] bg-transparent"
                      )}
                    >
                      {field.value && <Check className="h-3.5 w-3.5" />}
                    </button>
                  )}
                />
                <div>
                  <span className="text-sm font-medium">Force Update</span>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Require users to update
                  </p>
                </div>
              </label>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid}>
              <Plus className="h-4 w-4" />
              Create Draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit Release Dialog
// ---------------------------------------------------------------------------

const editReleaseSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  channel: z.enum(["stable", "beta", "rc"], {
    required_error: "Channel is required",
  }),
  severity: z.enum(["critical", "recommended", "optional"], {
    required_error: "Severity is required",
  }),
  releaseNotes: z.string().optional(),
});

type EditReleaseForm = z.infer<typeof editReleaseSchema>;

function EditReleaseDialog({
  open,
  onOpenChange,
  onSave,
  release,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: EditReleaseForm) => void;
  release: PageRelease;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isValid },
  } = useForm<EditReleaseForm>({
    resolver: zodResolver(editReleaseSchema),
    mode: "onChange",
    defaultValues: {
      title: release.title,
      channel: release.channel as "stable" | "beta" | "rc",
      severity: release.severity as "critical" | "recommended" | "optional",
      releaseNotes: release.releaseNotes || "",
    },
  });

  const onSubmit = (data: EditReleaseForm) => {
    onSave(data);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Release v{release.version}</DialogTitle>
          <DialogDescription>
            Update release details. Version cannot be changed after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">
              Title <span className="text-[hsl(var(--destructive))]">*</span>
            </Label>
            <Input
              id="edit-title"
              placeholder="Security Patch - CVE-2026-XXXX"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Channel & Severity Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Channel <span className="text-[hsl(var(--destructive))]">*</span>
              </Label>
              <Controller
                name="channel"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stable">Stable</SelectItem>
                      <SelectItem value="beta">Beta</SelectItem>
                      <SelectItem value="rc">Release Candidate</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.channel && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.channel.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Severity{" "}
                <span className="text-[hsl(var(--destructive))]">*</span>
              </Label>
              <Controller
                name="severity"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="recommended">Recommended</SelectItem>
                      <SelectItem value="optional">Optional</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.severity && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  {errors.severity.message}
                </p>
              )}
            </div>
          </div>

          {/* Release Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-releaseNotes">Release Notes</Label>
            <Textarea
              id="edit-releaseNotes"
              placeholder="## What's New&#10;- Feature description"
              rows={6}
              {...register("releaseNotes")}
            />
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
              Supports markdown formatting
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid}>
              <Pencil className="h-4 w-4" />
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ReleasesPage() {
  const navigate = useNavigate();
  const {
    releases: storeReleases,
    isLoading,
    fetchReleases,
    createRelease,
    publishRelease,
    blockRelease,
    deleteRelease,
    updateRelease,
    importAssets,
  } = useReleaseStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<PageRelease | null>(null);
  const [editTarget, setEditTarget] = useState<PageRelease | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isImporting, setIsImporting] = useState(false);

  // Fetch releases on mount
  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  // Map store releases to page releases (add default fields for assets etc.)
  const releases: PageRelease[] = useMemo(
    () =>
      storeReleases.map((r) => ({
        ...r,
        releaseNotes: r.releaseNotes || "",
        assets: [],
        minVersion: null,
        blockReason: null,
        _count: { downloads: r._count?.downloads ?? 0 },
      })),
    [storeReleases],
  );

  // Computed stats
  const stats = useMemo(() => {
    const published = releases.filter((r) => r.publishedAt && !r.isBlocked).length;
    const totalDownloads = releases.reduce((sum, r) => sum + r._count.downloads, 0);
    return { total: releases.length, published, totalDownloads };
  }, [releases]);

  // Filtered releases
  const filteredReleases = useMemo(() => {
    return releases.filter((r) => {
      if (channelFilter !== "all" && r.channel !== channelFilter) return false;
      if (statusFilter !== "all") {
        const s = getReleaseStatus(r);
        if (s !== statusFilter) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          r.version.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          (r.releaseNotes && r.releaseNotes.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [releases, channelFilter, statusFilter, searchQuery]);

  // Handlers
  const handleCreate = async (data: CreateReleaseForm) => {
    try {
      await createRelease({
        version: data.version,
        channel: data.channel,
        severity: data.severity,
        title: data.title,
        releaseNotes: data.releaseNotes || "",
        forceUpdate: data.forceUpdate,
        minVersion: data.minVersion || null,
      });
    } catch {
      // Error is set in the store
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await publishRelease(id);
      toast.success("Release published!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to publish";
      if (msg.includes("without assets")) {
        toast.error("Import assets from GitHub before publishing");
      } else {
        toast.error(msg);
      }
    }
  };

  const handleBlock = async (id: string, reason: string) => {
    await blockRelease(id, reason);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this draft release? This cannot be undone.")) return;
    try {
      await deleteRelease(id);
      toast.success("Release deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleImportAssets = async (releaseId: string) => {
    setIsImporting(true);
    try {
      await importAssets(releaseId);
      toast.success("Assets imported from GitHub");
      fetchReleases();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import assets");
    } finally {
      setIsImporting(false);
    }
  };

  const handleEdit = async (data: EditReleaseForm) => {
    if (!editTarget) return;
    try {
      await updateRelease(editTarget.id, data);
      toast.success("Release updated");
      setEditTarget(null);
      fetchReleases();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update release");
    }
  };

  if (isLoading && releases.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-28" />
            <Skeleton className="mt-1.5 h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            Releases
          </h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Manage software releases and distribution channels.
          </p>
        </div>
        <RoleGuard permission="releases.create">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/release-wizard")}>
              <Wand2 className="h-4 w-4" />
              Release Wizard
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New Release
            </Button>
          </div>
        </RoleGuard>
      </div>

      {/* Stats Bar */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Total Releases"
          value={stats.total}
          icon={Tag}
          description={`${releases.filter((r) => !r.publishedAt && !r.isBlocked).length} drafts`}
        />
        <StatCard
          title="Published"
          value={stats.published}
          icon={CircleDot}
          description="Active releases"
        />
        <StatCard
          title="Downloads"
          value={stats.totalDownloads.toLocaleString()}
          icon={Download}
          description="All time"
        />
      </div>

      {/* Filters -- single compact row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <Input
            placeholder="Search by version, title, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="stable">Stable</SelectItem>
            <SelectItem value="beta">Beta</SelectItem>
            <SelectItem value="rc">RC</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Release Cards */}
      {filteredReleases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/0.5)] py-24 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.08)]">
            <Package className="h-10 w-10 text-[hsl(var(--primary)/0.5)]" />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-[hsl(var(--foreground))]">
            {searchQuery || channelFilter !== "all" || statusFilter !== "all"
              ? "No matching releases"
              : "No releases yet"}
          </h3>
          <p className="mt-2 max-w-md text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
            {searchQuery || channelFilter !== "all" || statusFilter !== "all"
              ? "Try adjusting your search query or filters to find what you're looking for."
              : "Releases let you distribute software builds to your users. Create your first release to get started."}
          </p>
          {!(searchQuery || channelFilter !== "all" || statusFilter !== "all") && (
            <RoleGuard permission="releases.create">
              <Button className="mt-6" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Your First Release
              </Button>
            </RoleGuard>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReleases.map((release) => (
            <ReleaseCard
              key={release.id}
              release={release}
              onPublish={handlePublish}
              onBlock={(id) => {
                const target = releases.find((r) => r.id === id);
                if (target) setBlockTarget(target);
              }}
              onDelete={handleDelete}
              onEdit={(r) => setEditTarget(r)}
              onImportAssets={handleImportAssets}
              isImporting={isImporting}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {filteredReleases.length > 0 && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Showing {filteredReleases.length} of {releases.length} releases
        </p>
      )}

      {/* Create Release Dialog */}
      <CreateReleaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreate}
      />

      {/* Block Dialog */}
      {blockTarget && (
        <BlockDialog
          open={!!blockTarget}
          onOpenChange={(open) => {
            if (!open) setBlockTarget(null);
          }}
          onConfirm={(reason) => {
            handleBlock(blockTarget.id, reason);
            setBlockTarget(null);
          }}
          version={blockTarget.version}
        />
      )}

      {/* Edit Release Dialog */}
      {editTarget && (
        <EditReleaseDialog
          open={!!editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          onSave={handleEdit}
          release={editTarget}
        />
      )}
    </div>
  );
}
