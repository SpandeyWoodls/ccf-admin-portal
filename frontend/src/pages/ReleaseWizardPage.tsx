import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  AlertTriangle,
  RefreshCw,
  X,
  Monitor,
  Terminal,
  Shield,
  Rocket,
  FileText,
  Copy,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/api";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = 1 | 2 | 3;
type Channel = "stable" | "beta" | "rc";
type RolloutStrategy = "immediate" | "staged" | "targeted";

interface BuildTarget {
  platform: string;
  arch: string;
  status: "pending" | "building" | "success" | "error";
  progress: number;
  elapsed: number;
  filename?: string;
  fileSize?: number;
  sha256?: string;
  error?: string;
}

interface BuildStatusResponse {
  id: string;
  status: "queued" | "building" | "success" | "failed" | "cancelled";
  targets: BuildTarget[];
  logs: string[];
  startedAt?: string;
  completedAt?: string;
}

interface StagedRolloutStage {
  percentage: number;
  soakHours: number;
}

// ---------------------------------------------------------------------------
// Semver validation
// ---------------------------------------------------------------------------

const semverRegex =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function isValidSemver(version: string): boolean {
  return semverRegex.test(version.trim());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function truncateSha(sha: string, length = 12): string {
  if (!sha) return "";
  if (sha.length <= length) return sha;
  return sha.substring(0, length) + "...";
}

// ---------------------------------------------------------------------------
// Checkbox component (matches existing pattern)
// ---------------------------------------------------------------------------

function WizardCheckbox({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
          checked
            ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
            : "border-[hsl(var(--input))] bg-transparent"
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" />}
      </button>
      <div>
        <span className="text-sm font-medium">{label}</span>
        {description && (
          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
            {description}
          </p>
        )}
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Radio option component
// ---------------------------------------------------------------------------

function RadioOption({
  selected,
  onSelect,
  label,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer",
        selected
          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] shadow-sm"
          : "border-[hsl(var(--border))] bg-transparent text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.3)] hover:text-[hsl(var(--foreground))]"
      )}
    >
      <div
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors",
          selected
            ? "border-[hsl(var(--primary))]"
            : "border-[hsl(var(--muted-foreground)/0.4)]"
        )}
      >
        {selected && (
          <div className="h-2 w-2 rounded-full bg-[hsl(var(--primary))]" />
        )}
      </div>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

const STEPS = [
  { num: 1, label: "Version & Notes", icon: FileText },
  { num: 2, label: "Build", icon: Package },
  { num: 3, label: "Publish", icon: Rocket },
] as const;

function Stepper({ current, completed }: { current: WizardStep; completed: Set<number> }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, idx) => {
        const isCompleted = completed.has(step.num);
        const isCurrent = current === step.num;
        const isPending = !isCompleted && !isCurrent;
        const Icon = step.icon;

        return (
          <div key={step.num} className="flex items-center">
            {/* Step indicator */}
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300",
                  isCompleted &&
                    "border-[hsl(var(--success))] bg-[hsl(var(--success))] text-white",
                  isCurrent &&
                    "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]",
                  isPending &&
                    "border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={cn(
                  "text-sm font-medium whitespace-nowrap transition-colors",
                  isCompleted && "text-[hsl(var(--success))]",
                  isCurrent && "text-[hsl(var(--foreground))]",
                  isPending && "text-[hsl(var(--muted-foreground))]"
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-4 h-0.5 w-16 rounded-full transition-colors duration-300",
                  completed.has(step.num)
                    ? "bg-[hsl(var(--success))]"
                    : "bg-[hsl(var(--border))]"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Build progress bar
// ---------------------------------------------------------------------------

function BuildProgressBar({
  target,
}: {
  target: BuildTarget;
}) {
  const platformName =
    target.platform === "windows"
      ? "Windows"
      : target.platform === "linux"
        ? "Linux"
        : target.platform;
  const archName = target.arch === "x86_64" || target.arch === "amd64" ? "x64" : target.arch;

  const platformIcon =
    target.platform === "windows" ? (
      <Monitor className="h-4 w-4" />
    ) : (
      <Terminal className="h-4 w-4" />
    );

  const statusColor =
    target.status === "success"
      ? "text-[hsl(var(--success))]"
      : target.status === "error"
        ? "text-[hsl(var(--destructive))]"
        : "text-[hsl(var(--muted-foreground))]";

  const barColor =
    target.status === "success"
      ? "bg-[hsl(var(--success))]"
      : target.status === "error"
        ? "bg-[hsl(var(--destructive))]"
        : "bg-[hsl(var(--primary))]";

  const statusLabel =
    target.status === "pending"
      ? "Queued"
      : target.status === "building"
        ? "Building..."
        : target.status === "success"
          ? "Complete"
          : "Failed";

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("text-[hsl(var(--muted-foreground))]")}>
            {platformIcon}
          </span>
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {platformName} {archName}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("text-xs font-medium", statusColor)}>
            {statusLabel}
          </span>
          {target.status === "building" && (
            <span className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
              <Clock className="h-3 w-3" />
              {formatElapsed(target.elapsed)}
            </span>
          )}
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            barColor,
            target.status === "building" && "animate-pulse"
          )}
          style={{ width: `${target.progress}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CopyButton
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
    </button>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Version & Notes
// ---------------------------------------------------------------------------

function StepVersionNotes({
  version,
  setVersion,
  channel,
  setChannel,
  releaseNotes,
  setReleaseNotes,
  forceUpdate,
  setForceUpdate,
  onNext,
}: {
  version: string;
  setVersion: (v: string) => void;
  channel: Channel;
  setChannel: (c: Channel) => void;
  releaseNotes: string;
  setReleaseNotes: (n: string) => void;
  forceUpdate: boolean;
  setForceUpdate: (v: boolean) => void;
  onNext: () => void;
}) {
  const versionTouched = useRef(false);
  const notesTouched = useRef(false);

  const versionError =
    versionTouched.current && version.trim() !== "" && !isValidSemver(version)
      ? "Must be a valid semver (e.g., 2.1.0 or 2.2.0-beta.1)"
      : versionTouched.current && version.trim() === ""
        ? "Version is required"
        : null;

  const notesError =
    notesTouched.current && releaseNotes.trim() === ""
      ? "Release notes are required"
      : null;

  const canProceed =
    version.trim() !== "" &&
    isValidSemver(version) &&
    releaseNotes.trim() !== "";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Version */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          Version <span className="text-[hsl(var(--destructive))]">*</span>
        </Label>
        <Input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          onBlur={() => {
            versionTouched.current = true;
          }}
          placeholder="2.1.0"
          className={cn(
            versionError &&
              "border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]"
          )}
        />
        {versionError ? (
          <p className="text-xs text-[hsl(var(--destructive))]">{versionError}</p>
        ) : (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Must be semver (e.g., 2.1.0, 2.2.0-beta.1)
          </p>
        )}
      </div>

      {/* Channel */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Channel</Label>
        <div className="flex flex-wrap gap-2">
          <RadioOption
            selected={channel === "stable"}
            onSelect={() => setChannel("stable")}
            label="Stable"
          />
          <RadioOption
            selected={channel === "beta"}
            onSelect={() => setChannel("beta")}
            label="Beta"
          />
          <RadioOption
            selected={channel === "rc"}
            onSelect={() => setChannel("rc")}
            label="RC"
          />
        </div>
      </div>

      {/* Release Notes */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          Release Notes <span className="text-[hsl(var(--destructive))]">*</span>
        </Label>
        <Textarea
          value={releaseNotes}
          onChange={(e) => setReleaseNotes(e.target.value)}
          onBlur={() => {
            notesTouched.current = true;
          }}
          placeholder={"## What's New\n- Fixed WhatsApp parser\n- Improved performance"}
          rows={8}
          className={cn(
            "font-mono text-sm",
            notesError &&
              "border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]"
          )}
        />
        {notesError ? (
          <p className="text-xs text-[hsl(var(--destructive))]">{notesError}</p>
        ) : (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Supports Markdown
          </p>
        )}
      </div>

      {/* Force Update */}
      <WizardCheckbox
        checked={forceUpdate}
        onChange={setForceUpdate}
        label="Force Update"
        description="Critical security patches - require all users to update"
      />

      {/* Actions */}
      <div className="flex justify-end pt-2">
        <Button onClick={onNext} disabled={!canProceed}>
          Start Build
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Build Monitor
// ---------------------------------------------------------------------------

function StepBuild({
  version,
  channel,
  buildId,
  releaseNotes,
  onBuildStarted,
  onNext,
  onCancel,
}: {
  version: string;
  channel: Channel;
  releaseNotes: string;
  buildId: string | null;
  onBuildStarted: (id: string) => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  const [buildStatus, setBuildStatus] = useState<BuildStatusResponse | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [elapsedTimers, setElapsedTimers] = useState<Record<string, number>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start build if no buildId yet
  useEffect(() => {
    if (buildId) return;

    let cancelled = false;
    async function startBuild() {
      try {
        const res = await apiPost<{ releaseId: string; buildId?: string }>("/api/v1/admin/release-wizard/trigger-build", {
          version,
          channel,
          releaseNotes,
        });
        if (!cancelled) {
          onBuildStarted(res.releaseId || res.buildId || "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to start build");
        }
      }
    }
    startBuild();
    return () => {
      cancelled = true;
    };
  }, [buildId, version, channel, onBuildStarted]);

  // Poll build status
  useEffect(() => {
    if (!buildId) return;

    async function fetchStatus() {
      try {
        const res = await apiGet<BuildStatusResponse>(
          `/api/v1/admin/release-wizard/build-status?releaseId=${buildId}`
        );
        setBuildStatus(res);
        setLogs(res.logs || []);
        setError(null);

        // Stop polling if terminal state
        if (res.status === "success" || res.status === "failed" || res.status === "cancelled") {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      } catch (err) {
        // Don't stop polling on transient errors
        console.error("Build status poll error:", err);
      }
    }

    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 5000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [buildId]);

  // Elapsed time counter
  useEffect(() => {
    if (!buildStatus || buildStatus.status === "success" || buildStatus.status === "failed" || buildStatus.status === "cancelled") {
      return;
    }

    timerRef.current = setInterval(() => {
      setElapsedTimers((prev) => {
        const next: Record<string, number> = { ...prev };
        for (const t of buildStatus.targets) {
          if (t.status === "building") {
            next[`${t.platform}-${t.arch}`] = (prev[`${t.platform}-${t.arch}`] ?? t.elapsed) + 1;
          }
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [buildStatus]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleCancel = async () => {
    if (buildId) {
      try {
        await apiPost("/api/v1/admin/release-wizard/cancel-build", { buildId });
      } catch {
        // best-effort cancel
      }
    }
    onCancel();
  };

  const handleRetry = () => {
    setError(null);
    setBuildStatus(null);
    setLogs([]);
    setElapsedTimers({});
    onBuildStarted(""); // Reset to trigger new build
  };

  const isTerminal = buildStatus?.status === "success" || buildStatus?.status === "failed" || buildStatus?.status === "cancelled";
  const isSuccess = buildStatus?.status === "success";
  const isFailed = buildStatus?.status === "failed";

  // Merge elapsed timers into targets for display
  const displayTargets = (buildStatus?.targets || []).map((t) => ({
    ...t,
    elapsed: elapsedTimers[`${t.platform}-${t.arch}`] ?? t.elapsed,
  }));

  // Error state - no build could start
  if (error && !buildStatus) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--destructive)/0.1)]">
              <AlertTriangle className="h-7 w-7 text-[hsl(var(--destructive))]" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-[hsl(var(--foreground))]">
                Build Failed to Start
              </p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{error}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onCancel}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleRetry}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading / no status yet
  if (!buildStatus) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="text-center">
          <p className="text-base font-semibold text-[hsl(var(--foreground))]">
            Initiating build for v{version} ({channel})
          </p>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Preparing build environment...
          </p>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Title */}
      <div className="text-center">
        {isSuccess ? (
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-[hsl(var(--success))]" />
            <p className="text-lg font-semibold text-[hsl(var(--success))]">
              Build Successful
            </p>
          </div>
        ) : isFailed ? (
          <div className="flex items-center justify-center gap-2">
            <XCircle className="h-6 w-6 text-[hsl(var(--destructive))]" />
            <p className="text-lg font-semibold text-[hsl(var(--destructive))]">
              Build Failed
            </p>
          </div>
        ) : (
          <div>
            <p className="text-base font-semibold text-[hsl(var(--foreground))]">
              Building v{version}{" "}
              <Badge variant="secondary" className="ml-1 text-xs">
                {channel}
              </Badge>
            </p>
          </div>
        )}
      </div>

      {/* Build targets */}
      <div className="space-y-3">
        {displayTargets.map((target) => (
          <BuildProgressBar key={`${target.platform}-${target.arch}`} target={target} />
        ))}
      </div>

      {/* Build artifacts (on success) */}
      {isSuccess && displayTargets.some((t) => t.filename) && (
        <Card className="border-[hsl(var(--success)/0.3)]">
          <CardContent className="py-4">
            <div className="space-y-3">
              {displayTargets
                .filter((t) => t.status === "success" && t.filename)
                .map((t) => {
                  const platformLabel =
                    t.platform === "windows"
                      ? "Windows"
                      : t.platform === "linux"
                        ? "Linux"
                        : t.platform;
                  return (
                    <div
                      key={`${t.platform}-${t.arch}-artifact`}
                      className="flex items-start justify-between gap-4 rounded-lg bg-[hsl(var(--muted)/0.5)] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                          {platformLabel}
                        </p>
                        <p className="mt-0.5 truncate text-sm font-medium text-[hsl(var(--foreground))]">
                          {t.filename}
                        </p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
                          {t.fileSize != null && <span>{formatFileSize(t.fileSize)}</span>}
                          {t.sha256 && (
                            <span className="flex items-center gap-1">
                              SHA256: {truncateSha(t.sha256)}
                              <CopyButton text={t.sha256} />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Build Log */}
      {logs.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setLogsExpanded((v) => !v)}
            className="mb-2 flex w-full items-center gap-2 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors cursor-pointer"
          >
            <Terminal className="h-4 w-4" />
            Build Log
            {logsExpanded ? (
              <ChevronUp className="ml-auto h-4 w-4" />
            ) : (
              <ChevronDown className="ml-auto h-4 w-4" />
            )}
          </button>
          {logsExpanded && (
            <div className="max-h-52 overflow-y-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--foreground)/0.03)] p-3 font-mono text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
              {logs.map((line, i) => (
                <div key={i} className="flex gap-2">
                  <span className="select-none text-[hsl(var(--muted-foreground)/0.4)]">&gt;</span>
                  <span>{line}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-2">
        {!isTerminal ? (
          <>
            <div />
            <Button variant="outline" onClick={handleCancel}>
              <X className="h-4 w-4" />
              Cancel Build
            </Button>
          </>
        ) : isFailed ? (
          <>
            <Button variant="outline" onClick={onCancel}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button onClick={handleRetry}>
              <RefreshCw className="h-4 w-4" />
              Retry Build
            </Button>
          </>
        ) : isSuccess ? (
          <>
            <div />
            <Button onClick={onNext}>
              Continue to Publish
              <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Publish & Rollout
// ---------------------------------------------------------------------------

function StepPublish({
  version,
  channel,
  releaseNotes,
  forceUpdate,
  buildId,
  onBack,
  onPublish,
  isPublishing,
}: {
  version: string;
  channel: Channel;
  releaseNotes: string;
  forceUpdate: boolean;
  buildId: string | null;
  onBack: () => void;
  onPublish: (config: {
    rolloutStrategy: RolloutStrategy;
    stages: StagedRolloutStage[];
    sendEmail: boolean;
    createAnnouncement: boolean;
  }) => void;
  isPublishing: boolean;
}) {
  const [rolloutStrategy, setRolloutStrategy] = useState<RolloutStrategy>("immediate");
  const [stages, setStages] = useState<StagedRolloutStage[]>([
    { percentage: 5, soakHours: 24 },
    { percentage: 25, soakHours: 24 },
    { percentage: 50, soakHours: 24 },
    { percentage: 100, soakHours: 0 },
  ]);
  const [sendEmail, setSendEmail] = useState(false);
  const [createAnnouncement, setCreateAnnouncement] = useState(false);

  const updateStage = (index: number, field: "percentage" | "soakHours", value: number) => {
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Summary */}
      <div className="rounded-lg border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.04)] p-4">
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
          Ready to publish{" "}
          <span className="font-semibold text-[hsl(var(--primary))]">v{version}</span>
          {" "}
          <Badge variant="secondary" className="text-xs">
            {channel}
          </Badge>
          {forceUpdate && (
            <Badge variant="warning" className="ml-2 text-xs">
              Force Update
            </Badge>
          )}
        </p>
      </div>

      {/* Rollout Strategy */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Rollout Strategy</Label>
        <div className="flex flex-wrap gap-2">
          <RadioOption
            selected={rolloutStrategy === "immediate"}
            onSelect={() => setRolloutStrategy("immediate")}
            label="Immediate (100%)"
          />
          <RadioOption
            selected={rolloutStrategy === "staged"}
            onSelect={() => setRolloutStrategy("staged")}
            label="Staged"
          />
          <RadioOption
            selected={rolloutStrategy === "targeted"}
            onSelect={() => setRolloutStrategy("targeted")}
            label="Targeted"
          />
        </div>
      </div>

      {/* Staged rollout config */}
      {rolloutStrategy === "staged" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Staged Rollout Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stages.map((stage, idx) => {
              const isLast = idx === stages.length - 1;
              return (
                <div key={idx} className="flex items-center gap-3">
                  <span className="w-16 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                    Stage {idx + 1}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={stage.percentage}
                      onChange={(e) => updateStage(idx, "percentage", Number(e.target.value))}
                      className="h-8 w-16 text-center text-sm"
                    />
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">%</span>
                  </div>
                  {!isLast && (
                    <>
                      <ArrowRight className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">soak</span>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          max={168}
                          value={stage.soakHours}
                          onChange={(e) => updateStage(idx, "soakHours", Number(e.target.value))}
                          className="h-8 w-16 text-center text-sm"
                        />
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">hrs</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Targeted info */}
      {rolloutStrategy === "targeted" && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Targeted rollout allows you to push this release to specific organizations.
              You can select target organizations after publishing.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Notifications */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Notifications</Label>
        <div className="space-y-2.5">
          <WizardCheckbox
            checked={sendEmail}
            onChange={setSendEmail}
            label="Send email notification to all organizations"
            description="Notify organization admins about this release"
          />
          <WizardCheckbox
            checked={createAnnouncement}
            onChange={setCreateAnnouncement}
            label="Create in-app announcement"
            description="Show a banner to all users in the application"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={() => onPublish({ rolloutStrategy, stages, sendEmail, createAnnouncement })}
          disabled={isPublishing}
        >
          {isPublishing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Publishing...
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" />
              Publish Release
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Wizard Page
// ---------------------------------------------------------------------------

export function ReleaseWizardPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Step 1 state
  const [version, setVersion] = useState("");
  const [channel, setChannel] = useState<Channel>("stable");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [forceUpdate, setForceUpdate] = useState(false);

  // Step 2 state
  const [buildId, setBuildId] = useState<string | null>(null);

  // Step 3 state
  const [isPublishing, setIsPublishing] = useState(false);

  const handleStep1Next = useCallback(() => {
    setCompletedSteps((prev) => new Set([...prev, 1]));
    setCurrentStep(2);
  }, []);

  const handleBuildStarted = useCallback((id: string) => {
    if (id) {
      setBuildId(id);
    } else {
      setBuildId(null);
    }
  }, []);

  const handleStep2Next = useCallback(() => {
    setCompletedSteps((prev) => new Set([...prev, 2]));
    setCurrentStep(3);
  }, []);

  const handleStep2Cancel = useCallback(() => {
    setBuildId(null);
    setCurrentStep(1);
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.delete(1);
      return next;
    });
  }, []);

  const handlePublishBack = useCallback(() => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.delete(2);
      return next;
    });
    setCurrentStep(2);
  }, []);

  const handlePublish = useCallback(
    async (config: {
      rolloutStrategy: RolloutStrategy;
      stages: StagedRolloutStage[];
      sendEmail: boolean;
      createAnnouncement: boolean;
    }) => {
      setIsPublishing(true);
      try {
        await apiPost(`/api/v1/admin/releases/${buildId}/publish`, {
          releaseId: buildId,
          version,
          channel,
          releaseNotes,
          forceUpdate,
          rolloutStrategy: config.rolloutStrategy,
          stages: config.rolloutStrategy === "staged" ? config.stages : undefined,
          sendEmail: config.sendEmail,
          createAnnouncement: config.createAnnouncement,
        });
        setCompletedSteps((prev) => new Set([...prev, 3]));
        toast.success(`Release v${version} published successfully!`);
        navigate("/releases");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to publish release"
        );
      } finally {
        setIsPublishing(false);
      }
    },
    [buildId, version, channel, releaseNotes, forceUpdate, navigate]
  );

  return (
    <div className="page-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            Release Wizard
          </h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Create, build, and publish a new release.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/releases")}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>

      {/* Stepper */}
      <Card className="hover:shadow-sm">
        <CardContent className="py-5">
          <Stepper current={currentStep} completed={completedSteps} />
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card className="hover:shadow-sm">
        <CardContent className="py-8">
          {currentStep === 1 && (
            <StepVersionNotes
              version={version}
              setVersion={setVersion}
              channel={channel}
              setChannel={setChannel}
              releaseNotes={releaseNotes}
              setReleaseNotes={setReleaseNotes}
              forceUpdate={forceUpdate}
              setForceUpdate={setForceUpdate}
              onNext={handleStep1Next}
            />
          )}
          {currentStep === 2 && (
            <StepBuild
              version={version}
              channel={channel}
              releaseNotes={releaseNotes}
              buildId={buildId}
              onBuildStarted={handleBuildStarted}
              onNext={handleStep2Next}
              onCancel={handleStep2Cancel}
            />
          )}
          {currentStep === 3 && (
            <StepPublish
              version={version}
              channel={channel}
              releaseNotes={releaseNotes}
              forceUpdate={forceUpdate}
              buildId={buildId}
              onBack={handlePublishBack}
              onPublish={handlePublish}
              isPublishing={isPublishing}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
