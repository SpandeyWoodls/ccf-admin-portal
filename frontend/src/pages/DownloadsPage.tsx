import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import {
  Download,
  Monitor,
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Shield,
  Clock,
  TrendingUp,
  Package,
  FileDown,
  AlertTriangle,
  ExternalLink,
  HardDrive,
  Fingerprint,
  ArrowDownToLine,
  Search,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useReleaseStore } from "@/stores/releaseStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DownloadAsset {
  id: string;
  platform: string;
  arch: string;
  packageType: string;
  filename: string;
  fileSize: number;
  sha256Hash: string;
  downloadUrl: string;
  signature: string | null;
}

interface DownloadRelease {
  id: string;
  version: string;
  title: string;
  channel: string;
  severity: string;
  publishedAt: string;
  releaseNotes: string;
  assets: DownloadAsset[];
  _count: { downloads: number };
}

interface DownloadStats {
  totalThisMonth: number;
  byPlatform: { platform: string; count: number }[];
  byVersion: { version: string; count: number }[];
  trend: number; // percentage change from last month
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 1)} ${units[i]}`;
}

function truncateSha(sha: string, length = 12): string {
  if (sha.length <= length) return sha;
  return sha.substring(0, length) + "\u2026";
}

function parseSeverity(severity: string): {
  label: string;
  variant: "default" | "destructive" | "secondary" | "outline";
  className: string;
} {
  switch (severity) {
    case "critical":
      return {
        label: "Critical",
        variant: "destructive",
        className:
          "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/20",
      };
    case "recommended":
      return {
        label: "Recommended",
        variant: "default",
        className:
          "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/20",
      };
    default:
      return {
        label: "Optional",
        variant: "secondary",
        className:
          "bg-slate-500/15 text-slate-400 border-slate-500/30 hover:bg-slate-500/20",
      };
  }
}

function parseChannel(channel: string): {
  label: string;
  className: string;
} {
  switch (channel) {
    case "stable":
      return {
        label: "Stable",
        className:
          "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      };
    case "beta":
      return {
        label: "Beta",
        className:
          "bg-violet-500/15 text-violet-400 border-violet-500/30",
      };
    case "rc":
      return {
        label: "RC",
        className:
          "bg-blue-500/15 text-blue-400 border-blue-500/30",
      };
    default:
      return {
        label: channel,
        className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
      };
  }
}

function getPlatformMeta(platform: string): {
  icon: typeof Monitor;
  label: string;
  color: string;
  gradient: string;
} {
  switch (platform.toLowerCase()) {
    case "windows":
      return {
        icon: Monitor,
        label: "Windows x64",
        color: "text-sky-400",
        gradient: "from-sky-500/20 to-sky-600/5",
      };
    case "linux":
      return {
        icon: Terminal,
        label: "Linux x64",
        color: "text-orange-400",
        gradient: "from-orange-500/20 to-orange-600/5",
      };
    default:
      return {
        icon: HardDrive,
        label: platform,
        color: "text-slate-400",
        gradient: "from-slate-500/20 to-slate-600/5",
      };
  }
}

function getPackageLabel(packageType: string): string {
  const map: Record<string, string> = {
    nsis: "NSIS Installer",
    msi: "MSI Installer",
    appimage: "AppImage",
    deb: "DEB Package",
    rpm: "RPM Package",
    tar: "Tarball",
    dmg: "DMG Image",
  };
  return map[packageType.toLowerCase()] || packageType.toUpperCase();
}

function parseReleaseNotes(notes: string): string[] {
  return notes
    .split("\n")
    .filter((line) => line.trim().startsWith("-") || line.trim().startsWith("*"))
    .map((line) => line.replace(/^[\s]*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function parseReleaseNoteSections(
  notes: string
): { heading: string; items: string[] }[] {
  const sections: { heading: string; items: string[] }[] = [];
  let currentSection: { heading: string; items: string[] } | null = null;

  for (const line of notes.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("##")) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        heading: trimmed.replace(/^#+\s*/, ""),
        items: [],
      };
    } else if (
      (trimmed.startsWith("-") || trimmed.startsWith("*")) &&
      currentSection
    ) {
      currentSection.items.push(
        trimmed.replace(/^[-*]\s*/, "").trim()
      );
    }
  }
  if (currentSection && currentSection.items.length > 0)
    sections.push(currentSection);

  // Fallback: if no sections were parsed, make a single "Changes" section
  if (sections.length === 0) {
    const items = parseReleaseNotes(notes);
    if (items.length > 0) sections.push({ heading: "Changes", items });
  }

  return sections;
}


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyHashButton({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      const input = document.createElement("textarea");
      input.value = hash;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [hash]);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCopy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-mono transition-all duration-200 cursor-pointer",
              "border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)]",
              "hover:bg-[hsl(var(--muted))] hover:border-[hsl(var(--border))]",
              copied &&
                "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
            )}
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
            )}
            <span className="text-[hsl(var(--muted-foreground))]">
              {copied ? "Copied!" : truncateSha(hash)}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm">
          <p className="font-mono text-[11px] break-all">{hash}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AssetCard({
  asset,
  isPrimary,
}: {
  asset: DownloadAsset;
  isPrimary?: boolean;
}) {
  const meta = getPlatformMeta(asset.platform);
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border border-[hsl(var(--border))] transition-all duration-300",
        "bg-gradient-to-b",
        meta.gradient,
        "hover:border-[hsl(var(--primary)/0.4)] hover:shadow-lg hover:shadow-[hsl(var(--primary)/0.06)]",
        isPrimary && "ring-1 ring-[hsl(var(--primary)/0.2)]"
      )}
    >
      {/* Platform header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
            "bg-[hsl(var(--muted)/0.6)] group-hover:bg-[hsl(var(--muted))]"
          )}
        >
          <Icon className={cn("h-5 w-5", meta.color)} />
        </div>
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {meta.label}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {getPackageLabel(asset.packageType)}
          </p>
        </div>
      </div>

      {/* File info */}
      <div className="px-5 pb-3">
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <HardDrive className="h-3 w-3" />
          <span>{formatFileSize(asset.fileSize)}</span>
          <span className="text-[hsl(var(--border))]">|</span>
          <span className="font-mono truncate max-w-[140px]">
            {asset.filename}
          </span>
        </div>
      </div>

      {/* Download button */}
      <div className="px-5 pb-3">
        <Button
          className={cn(
            "w-full gap-2 font-semibold transition-all duration-200",
            "bg-[hsl(var(--primary))] text-white",
            "hover:bg-[hsl(var(--primary)/0.9)] hover:shadow-md hover:shadow-[hsl(var(--primary)/0.25)]",
            "active:scale-[0.98]"
          )}
          onClick={() => {
            // In production: track download then redirect
            window.open(asset.downloadUrl, "_blank");
          }}
        >
          <ArrowDownToLine className="h-4 w-4" />
          Download
        </Button>
      </div>

      {/* Hash verification */}
      <div className="border-t border-[hsl(var(--border)/0.5)] px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground)/0.7)]">
            <Fingerprint className="h-3 w-3" />
            SHA-256
          </div>
          <CopyHashButton hash={asset.sha256Hash} />
        </div>
      </div>
    </div>
  );
}

function LatestReleaseCard({ release }: { release: DownloadRelease }) {
  const severityMeta = parseSeverity(release.severity);
  const channelMeta = parseChannel(release.channel);
  const sections = parseReleaseNoteSections(release.releaseNotes);

  // Separate primary assets (one per platform) and secondary assets
  const platformPrimary = new Map<string, DownloadAsset>();
  const secondaryAssets: DownloadAsset[] = [];

  for (const asset of release.assets) {
    const key = asset.platform;
    if (!platformPrimary.has(key)) {
      platformPrimary.set(key, asset);
    } else {
      secondaryAssets.push(asset);
    }
  }

  const primaryAssets = Array.from(platformPrimary.values());

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      {/* Top accent bar */}
      <div
        className={cn(
          "h-1 w-full",
          release.severity === "critical"
            ? "bg-gradient-to-r from-red-500 via-red-400 to-orange-500"
            : release.severity === "recommended"
              ? "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500"
              : "bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(var(--primary)/0.7)] to-[hsl(var(--primary)/0.4)]"
        )}
      />

      <div className="p-6 sm:p-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <Badge
                variant="outline"
                className="border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] px-2.5 py-0.5 text-xs font-bold"
              >
                LATEST
              </Badge>
              <h2 className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-2xl">
                v{release.version}
              </h2>
            </div>
            <p className="text-base text-[hsl(var(--muted-foreground))]">
              {release.title}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-[11px] font-semibold", channelMeta.className)}
            >
              {channelMeta.label}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-[11px] font-semibold",
                severityMeta.className
              )}
            >
              {severityMeta.label}
            </Badge>
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[hsl(var(--muted-foreground))]">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {format(new Date(release.publishedAt), "MMMM d, yyyy")}
            </span>
            <span className="text-[hsl(var(--muted-foreground)/0.5)]">
              ({formatDistanceToNow(new Date(release.publishedAt), { addSuffix: true })})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" />
            <span>{release._count.downloads.toLocaleString()} downloads</span>
          </div>
        </div>

        {/* Separator */}
        <Separator className="my-6 bg-[hsl(var(--border)/0.5)]" />

        {/* Platform download cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {primaryAssets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} isPrimary />
          ))}
        </div>

        {/* Secondary formats */}
        {secondaryAssets.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[hsl(var(--muted-foreground)/0.7)]">
              Also available:
            </span>
            {secondaryAssets.map((asset) => (
              <a
                key={asset.id}
                href={asset.downloadUrl}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--muted)/0.6)] hover:border-[hsl(var(--primary)/0.3)]"
              >
                <FileDown className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                {getPackageLabel(asset.packageType)}
                <span className="text-[hsl(var(--muted-foreground))]">
                  ({formatFileSize(asset.fileSize)})
                </span>
              </a>
            ))}
          </div>
        )}

        {/* Changelog */}
        {sections.length > 0 && (
          <div className="mt-6 rounded-xl border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--muted)/0.2)] p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground)/0.7)]">
              What's New
            </h3>
            <div className="space-y-3">
              {sections.map((section) => (
                <div key={section.heading}>
                  <p className="mb-1.5 text-xs font-semibold text-[hsl(var(--foreground)/0.8)]">
                    {section.heading}
                  </p>
                  <ul className="space-y-1">
                    {section.items.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-sm text-[hsl(var(--muted-foreground))]"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--primary)/0.5)]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviousReleaseRow({ release }: { release: DownloadRelease }) {
  const [expanded, setExpanded] = useState(false);
  const severityMeta = parseSeverity(release.severity);
  const channelMeta = parseChannel(release.channel);
  const sections = parseReleaseNoteSections(release.releaseNotes);

  // Separate primary assets (one per platform) and secondary
  const platformPrimary = new Map<string, DownloadAsset>();
  const secondaryAssets: DownloadAsset[] = [];

  for (const asset of release.assets) {
    const key = asset.platform;
    if (!platformPrimary.has(key)) {
      platformPrimary.set(key, asset);
    } else {
      secondaryAssets.push(asset);
    }
  }

  const primaryAssets = Array.from(platformPrimary.values());

  return (
    <div
      className={cn(
        "rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-all duration-200",
        expanded && "ring-1 ring-[hsl(var(--primary)/0.15)]"
      )}
    >
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[hsl(var(--accent)/0.3)] cursor-pointer"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--muted)/0.5)]">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[hsl(var(--foreground))]">
              v{release.version}
            </span>
            <Badge
              variant="outline"
              className={cn("text-[10px] font-semibold", channelMeta.className)}
            >
              {channelMeta.label}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-semibold",
                severityMeta.className
              )}
            >
              {severityMeta.label}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
            {release.title}
          </p>
        </div>

        <div className="hidden items-center gap-5 text-xs text-[hsl(var(--muted-foreground))] sm:flex">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {format(new Date(release.publishedAt), "MMM d, yyyy")}
          </div>
          <div className="flex items-center gap-1.5">
            <Download className="h-3 w-3" />
            {release._count.downloads.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5">
            <Package className="h-3 w-3" />
            {release.assets.length} assets
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[hsl(var(--border)/0.5)] px-5 py-5">
          {/* Date meta on mobile */}
          <div className="mb-4 flex flex-wrap gap-4 text-xs text-[hsl(var(--muted-foreground))] sm:hidden">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {format(new Date(release.publishedAt), "MMM d, yyyy")}
            </div>
            <div className="flex items-center gap-1.5">
              <Download className="h-3 w-3" />
              {release._count.downloads.toLocaleString()} downloads
            </div>
          </div>

          {/* Download cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {primaryAssets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>

          {/* Secondary formats */}
          {secondaryAssets.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-[hsl(var(--muted-foreground)/0.7)]">
                Also available:
              </span>
              {secondaryAssets.map((asset) => (
                <a
                  key={asset.id}
                  href={asset.downloadUrl}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--muted)/0.6)]"
                >
                  <FileDown className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                  {getPackageLabel(asset.packageType)}
                  <span className="text-[hsl(var(--muted-foreground))]">
                    ({formatFileSize(asset.fileSize)})
                  </span>
                </a>
              ))}
            </div>
          )}

          {/* Changelog */}
          {sections.length > 0 && (
            <div className="mt-4 rounded-lg border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--muted)/0.15)] p-4">
              <div className="space-y-2.5">
                {sections.map((section) => (
                  <div key={section.heading}>
                    <p className="mb-1 text-xs font-semibold text-[hsl(var(--foreground)/0.7)]">
                      {section.heading}
                    </p>
                    <ul className="space-y-0.5">
                      {section.items.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-xs text-[hsl(var(--muted-foreground))]"
                        >
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--primary)/0.4)]" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatsCards({ stats }: { stats: DownloadStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total downloads */}
      <Card className="border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <CardContent className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Downloads This Month
              </p>
              <p className="mt-0.5 text-xl font-bold text-[hsl(var(--foreground))]">
                {stats.totalThisMonth.toLocaleString()}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.1)]">
              <Download className="h-4 w-4 text-[hsl(var(--primary))]" />
            </div>
          </div>
          {stats.trend !== 0 && (
            <div className="mt-1.5 flex items-center gap-1 text-xs">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="font-medium text-emerald-400">
                +{stats.trend}%
              </span>
              <span className="text-[hsl(var(--muted-foreground)/0.6)]">
                vs last month
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform breakdown */}
      {stats.byPlatform.map((p) => {
        const meta = getPlatformMeta(p.platform);
        const Icon = meta.icon;
        const pct = stats.totalThisMonth > 0 ? Math.round((p.count / stats.totalThisMonth) * 100) : 0;
        return (
          <Card
            key={p.platform}
            className="border-[hsl(var(--border))] bg-[hsl(var(--card))]"
          >
            <CardContent className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    {meta.label}
                  </p>
                  <p className="mt-0.5 text-xl font-bold text-[hsl(var(--foreground))]">
                    {p.count.toLocaleString()}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--muted)/0.5)]">
                  <Icon className={cn("h-4 w-4", meta.color)} />
                </div>
              </div>
              {/* Percentage bar */}
              <div className="mt-1.5">
                <div className="flex items-center justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
                  <span>{pct}% of total</span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[hsl(var(--muted)/0.5)]">
                  <div
                    className="h-full rounded-full bg-[hsl(var(--primary)/0.6)] transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Total releases */}
      <Card className="border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <CardContent className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Published Releases
              </p>
              <p className="mt-0.5 text-xl font-bold text-[hsl(var(--foreground))]">
                {stats.byVersion.length}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <Package className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <div className="mt-1.5 text-[10px] text-[hsl(var(--muted-foreground)/0.6)]">
            Across stable, beta, and RC channels
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      {/* Stats skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-16" />
                </div>
                <Skeleton className="h-10 w-10 rounded-xl" />
              </div>
              <Skeleton className="mt-3 h-2 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Latest release skeleton */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8">
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[hsl(var(--border))] p-5 space-y-3"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-6 w-full" />
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-full max-w-md" />
          <Skeleton className="h-3 w-full max-w-sm" />
        </div>
      </div>

      {/* Previous releases skeleton */}
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4"
          >
            <div className="flex items-center gap-4">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function DownloadsPage() {
  const navigate = useNavigate();
  const {
    releases: storeReleases,
    isLoading: loading,
    fetchReleases,
  } = useReleaseStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  // Fetch published releases on mount
  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  // Map store releases to download releases (only published ones)
  const releases: DownloadRelease[] = useMemo(
    () =>
      storeReleases
        .filter((r) => r.publishedAt !== null && !r.isBlocked)
        .map((r) => ({
          id: r.id,
          version: r.version,
          title: r.title,
          channel: r.channel,
          severity: r.severity,
          publishedAt: r.publishedAt!,
          releaseNotes: r.releaseNotes || "",
          assets: [],
          _count: { downloads: r._count?.downloads ?? 0 },
        })),
    [storeReleases],
  );

  // Compute stats from real data
  const stats: DownloadStats | null = useMemo(() => {
    if (releases.length === 0) return null;
    const totalDownloads = releases.reduce(
      (sum, r) => sum + r._count.downloads,
      0,
    );
    const platformMap = new Map<string, number>();
    const versionMap = new Map<string, number>();
    for (const r of releases) {
      versionMap.set(r.version, r._count.downloads);
      for (const a of r.assets) {
        platformMap.set(
          a.platform,
          (platformMap.get(a.platform) || 0) + r._count.downloads,
        );
      }
    }
    return {
      totalThisMonth: totalDownloads,
      byPlatform: Array.from(platformMap.entries()).map(([platform, count]) => ({
        platform,
        count,
      })),
      byVersion: Array.from(versionMap.entries()).map(([version, count]) => ({
        version,
        count,
      })),
      trend: 0,
    };
  }, [releases]);

  // Filter releases
  const filteredReleases = useMemo(() => {
    return releases.filter((r) => {
      const matchesSearch =
        searchQuery === "" ||
        r.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesChannel =
        channelFilter === "all" || r.channel === channelFilter;
      return matchesSearch && matchesChannel;
    });
  }, [releases, searchQuery, channelFilter]);

  const latestRelease = filteredReleases[0] ?? null;
  const previousReleases = filteredReleases.slice(1);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Cyber Chakra Forensics"
              className="h-10 w-10 shrink-0 rounded-xl object-contain bg-[hsl(var(--muted)/0.5)] p-1"
            />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                Software Distribution
              </h1>
              <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
                {loading
                  ? "Loading releases..."
                  : releases.length === 0
                    ? "Manage and distribute CMF software releases"
                    : `${releases.length} published ${releases.length === 1 ? "release" : "releases"} available`}
              </p>
            </div>
          </div>
        </div>

        {/* Filters - only show when there are releases to filter */}
        {!loading && releases.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground)/0.5)]" />
              <Input
                placeholder="Search versions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 pl-9 text-sm bg-[hsl(var(--card))] border-[hsl(var(--border))]"
              />
            </div>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-32 bg-[hsl(var(--card))] border-[hsl(var(--border))]">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="stable">Stable</SelectItem>
                <SelectItem value="beta">Beta</SelectItem>
                <SelectItem value="rc">RC</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* Download stats */}
          {stats && <StatsCards stats={stats} />}

          {/* Security notice for critical releases */}
          {latestRelease && latestRelease.severity === "critical" && (
            <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div>
                <p className="text-sm font-semibold text-red-400">
                  Critical Security Update Available
                </p>
                <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
                  Version {latestRelease.version} contains critical security
                  fixes. All users are strongly advised to update immediately.
                </p>
              </div>
            </div>
          )}

          {/* Latest release */}
          {latestRelease && <LatestReleaseCard release={latestRelease} />}

          {/* Previous releases */}
          {previousReleases.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                  Previous Releases
                </h2>
                <Separator className="flex-1 bg-[hsl(var(--border)/0.5)]" />
              </div>

              <div className="space-y-3">
                {previousReleases.map((release) => (
                  <PreviousReleaseRow key={release.id} release={release} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {filteredReleases.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/0.5)] py-24 px-6">
              {/* Illustration area */}
              <div className="relative mb-4">
                <div className="absolute -inset-5 rounded-full bg-[hsl(var(--primary)/0.06)]" />
                <div className="absolute -inset-10 rounded-full bg-[hsl(var(--primary)/0.03)]" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
                  <UploadCloud className="h-10 w-10 text-[hsl(var(--muted-foreground)/0.5)]" />
                </div>
              </div>

              {searchQuery || channelFilter !== "all" ? (
                <>
                  <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                    No releases found
                  </h3>
                  <p className="mt-2 max-w-sm text-center text-sm text-[hsl(var(--muted-foreground))]">
                    Try adjusting your search or channel filter to find the release you're looking for.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-5 gap-2"
                    onClick={() => {
                      setSearchQuery("");
                      setChannelFilter("all");
                    }}
                  >
                    Clear Filters
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                    No downloads available yet
                  </h3>
                  <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                    Publish a release from the Releases page to make software installers available for download here.
                  </p>
                  <Button
                    size="lg"
                    className="mt-6 gap-2.5 bg-[hsl(var(--primary))] px-8 text-white shadow-lg shadow-[hsl(var(--primary)/0.2)] hover:bg-[hsl(var(--primary)/0.9)] hover:shadow-xl hover:shadow-[hsl(var(--primary)/0.25)]"
                    onClick={() => navigate("/releases")}
                  >
                    <Package className="h-5 w-5" />
                    Go to Releases
                  </Button>
                </>
              )}

              {/* Security notice integrated into empty state */}
              <div className="mt-10 flex items-start gap-2.5 rounded-lg border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.1)] p-3.5 max-w-lg text-xs text-[hsl(var(--muted-foreground)/0.6)]">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary)/0.4)]" />
                <p>
                  All installers are code-signed and include SHA-256 checksums for
                  integrity verification. Downloads are logged for audit compliance.
                </p>
              </div>
            </div>
          )}

          {/* Footer note - only when releases exist */}
          {filteredReleases.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--muted)/0.15)] p-4 text-xs text-[hsl(var(--muted-foreground)/0.7)]">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary)/0.5)]" />
              <div>
                <p>
                  All installers are code-signed and include SHA-256 checksums for
                  integrity verification. Always verify the hash before deploying
                  to production forensic workstations. Downloads are logged for
                  audit compliance.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
