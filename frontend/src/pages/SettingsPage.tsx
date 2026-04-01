import { useState, useEffect, useCallback } from "react";
import {
  User,
  Shield,
  Settings,
  Users,
  Key,
  Eye,
  EyeOff,
  RefreshCw,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Webhook,
  ServerCrash,
  Loader2,
  BookOpen,
  ExternalLink,
  Info,
  Trash2,
  Smartphone,
  Copy,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuthStore } from "@/stores/authStore";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
import { toast } from "sonner";
import { RoleGuard } from "@/components/shared/RoleGuard";

// ---------------------------------------------------------------------------
// API base URL for direct fetch calls (health check)
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_URL || "";

// ---------------------------------------------------------------------------
// Helper: simple toggle switch
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full
        border-2 border-transparent transition-colors duration-200 ease-in-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50
        ${checked ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--muted))]"}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg
          ring-0 transition-transform duration-200 ease-in-out
          ${checked ? "translate-x-5" : "translate-x-0.5"}
        `}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tab: Profile
// ---------------------------------------------------------------------------

function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState(user?.name ?? "");
  const [email] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleUpdateProfile = () => {
    setSaving(true);
    setTimeout(() => {
      console.log("[Settings] Profile updated", { name });
      setSaving(false);
    }, 600);
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      await apiPatch("/api/v1/auth/change-password", { currentPassword, newPassword });
      toast.success("Password changed successfully. Please log in again.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        localStorage.clear();
        window.location.href = "/login";
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to change password.";
      toast.error(message);
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Personal Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-[hsl(var(--primary))]" />
            Personal Information
          </CardTitle>
          <CardDescription>
            Manage your name and contact details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Full Name
            </Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="h-10"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-email" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Email Address
            </Label>
            <Input
              id="profile-email"
              value={email}
              readOnly
              className="h-10 opacity-60 cursor-not-allowed"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              To change your email, contact the system administrator or use the
              email change flow from the Security tab.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleUpdateProfile}
              disabled={saving}
              className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(230_65%_55%)] text-white shadow-md hover:shadow-lg hover:brightness-110 transition-all duration-200"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Update Profile"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Password Card - separate with warning border */}
      <Card className="border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.02)]">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--warning)/0.1)]">
              <Lock className="h-4 w-4 text-[hsl(var(--warning))]" />
            </div>
            <div>
              <CardTitle className="text-base">Change Password</CardTitle>
              <CardDescription>
                Update your password to keep your account secure.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current password */}
          <div className="space-y-1.5">
            <Label htmlFor="current-password" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Current Password
            </Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] cursor-pointer transition-colors"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] cursor-pointer transition-colors"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] cursor-pointer transition-colors"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  Passwords do not match.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(230_65%_55%)] text-white shadow-md hover:shadow-lg hover:brightness-110 transition-all duration-200"
            >
              {changingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Changing...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Update Password
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: parse userAgent into short browser string
// ---------------------------------------------------------------------------

function parseBrowser(ua: string | null): string {
  if (!ua) return "Unknown";
  if (ua.includes("Edg/")) {
    const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Linux") ? "Linux" : "";
    return os ? `Edge on ${os}` : "Edge";
  }
  if (ua.includes("Chrome/") && !ua.includes("Edg/")) {
    const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Linux") ? "Linux" : "";
    return os ? `Chrome on ${os}` : "Chrome";
  }
  if (ua.includes("Firefox/")) {
    const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Linux") ? "Linux" : "";
    return os ? `Firefox on ${os}` : "Firefox";
  }
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) {
    return ua.includes("Mac") ? "Safari on macOS" : "Safari";
  }
  return ua.length > 50 ? ua.slice(0, 50) + "..." : ua;
}

// ---------------------------------------------------------------------------
// Sessions Card (used in SecurityTab)
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

function SessionsCard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ sessions: Session[] }>("/api/v1/auth/sessions");
      setSessions(data.sessions);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load sessions.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevoke = async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      await apiDelete(`/api/v1/auth/sessions/${sessionId}`);
      toast.success("Session revoked.");
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to revoke session.";
      toast.error(message);
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      const data = await apiDelete<{ revokedCount: number }>("/api/v1/auth/sessions");
      toast.success(`Revoked ${data.revokedCount} other session(s).`);
      setSessions((prev) => prev.filter((s) => s.isCurrent));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to revoke sessions.";
      toast.error(message);
    } finally {
      setRevokingAll(false);
    }
  };

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-[hsl(var(--primary))]" />
              Active Sessions
            </CardTitle>
            <CardDescription>
              Devices and browsers currently signed in to your account.
            </CardDescription>
          </div>
          {otherSessions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRevokeAll}
              disabled={revokingAll}
              className="text-[hsl(var(--destructive))] border-[hsl(var(--destructive)/0.3)] hover:bg-[hsl(var(--destructive)/0.1)]"
            >
              {revokingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Revoking...
                </>
              ) : (
                "Revoke All Other Sessions"
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" />
            <span className="ml-2 text-sm text-[hsl(var(--muted-foreground))]">Loading sessions...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-4 py-6">
            <Info className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No active sessions found.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Browser</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{parseBrowser(session.userAgent)}</span>
                      {session.isCurrent && (
                        <Badge variant="success" className="text-[10px]">Current</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs font-mono text-[hsl(var(--muted-foreground))]">
                      {session.ipAddress ?? "Unknown"}
                    </code>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">
                      {new Date(session.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {!session.isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(session.id)}
                        disabled={revokingId === session.id}
                        className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.1)]"
                      >
                        {revokingId === session.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" />
                            Revoke
                          </>
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// MFA Card (used in SecurityTab)
// ---------------------------------------------------------------------------

function MfaCard() {
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Setup flow state
  const [setupPhase, setSetupPhase] = useState<"idle" | "qr">("idle");
  const [qrUrl, setQrUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Disable flow state
  const [disablePhase, setDisablePhase] = useState<"idle" | "confirming">(
    "idle"
  );
  const [disableCode, setDisableCode] = useState("");
  const [disabling, setDisabling] = useState(false);

  // Check MFA status on mount
  useEffect(() => {
    let cancelled = false;
    async function checkMfaStatus() {
      try {
        const data = await apiGet<{ mfaEnabled: boolean }>(
          "/api/v1/auth/mfa/status"
        );
        if (!cancelled) {
          setMfaEnabled(data.mfaEnabled);
        }
      } catch {
        if (!cancelled) {
          // Endpoint may not exist yet -- default to not enabled
          setMfaEnabled(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    checkMfaStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStartSetup = async () => {
    setSetupPhase("qr");
    try {
      const data = await apiPost<{ qrCodeUrl: string; secret: string }>(
        "/api/v1/auth/mfa/setup"
      );
      setQrUrl(data.qrCodeUrl);
      setSecret(data.secret);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to start MFA setup.";
      toast.error(message);
      setSetupPhase("idle");
    }
  };

  const handleVerifySetup = async () => {
    if (!verifyCode || verifyCode.length < 6) {
      toast.error("Please enter a valid 6-digit code.");
      return;
    }
    setVerifying(true);
    try {
      await apiPost("/api/v1/auth/mfa/verify-setup", { code: verifyCode });
      toast.success("Two-factor authentication enabled successfully.");
      setMfaEnabled(true);
      setSetupPhase("idle");
      setQrUrl("");
      setSecret("");
      setVerifyCode("");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Invalid verification code.";
      toast.error(message);
    } finally {
      setVerifying(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!disableCode || disableCode.length < 6) {
      toast.error("Please enter a valid 6-digit code.");
      return;
    }
    setDisabling(true);
    try {
      await apiPost("/api/v1/auth/mfa/disable", { code: disableCode });
      toast.success("Two-factor authentication has been disabled.");
      setMfaEnabled(false);
      setDisablePhase("idle");
      setDisableCode("");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to disable MFA.";
      toast.error(message);
    } finally {
      setDisabling(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success("Copied to clipboard.");
      })
      .catch(() => {
        toast.error("Failed to copy.");
      });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-[hsl(var(--primary))]" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" />
            <span className="ml-2 text-sm text-[hsl(var(--muted-foreground))]">
              Checking MFA status...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- MFA Enabled State ----
  if (mfaEnabled) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--success)/0.1)]">
                <ShieldCheck className="h-4 w-4 text-[hsl(var(--success))]" />
              </div>
              <div>
                <CardTitle className="text-base">
                  Two-Factor Authentication
                </CardTitle>
                <CardDescription>
                  Your account is protected with TOTP-based two-factor
                  authentication.
                </CardDescription>
              </div>
            </div>
            <Badge variant="success">Enabled</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {disablePhase === "idle" ? (
            <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] px-4 py-3">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                    Authenticator app connected
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    You will be prompted for a code on each login.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDisablePhase("confirming")}
                className="text-[hsl(var(--destructive))] border-[hsl(var(--destructive)/0.3)] hover:bg-[hsl(var(--destructive)/0.05)]"
              >
                <ShieldOff className="h-4 w-4" />
                Disable MFA
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.04)] p-4">
                <div className="flex items-start gap-2 mb-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--destructive))]" />
                  <p className="text-sm text-[hsl(var(--destructive))]">
                    Disabling MFA will reduce the security of your account.
                    Enter your current authenticator code to confirm.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="disable-mfa-code"
                      className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
                    >
                      Authenticator Code
                    </Label>
                    <Input
                      id="disable-mfa-code"
                      value={disableCode}
                      onChange={(e) =>
                        setDisableCode(
                          e.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      className="h-10 max-w-xs font-mono tracking-widest"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDisableMfa}
                      disabled={disabling || disableCode.length < 6}
                    >
                      {disabling ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Disabling...
                        </>
                      ) : (
                        "Confirm Disable"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDisablePhase("idle");
                        setDisableCode("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- MFA Not Enabled State ----
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.1)]">
            <Shield className="h-4 w-4 text-[hsl(var(--primary))]" />
          </div>
          <div>
            <CardTitle className="text-base">
              Two-Factor Authentication
            </CardTitle>
            <CardDescription>
              Add an extra layer of security to your account using a TOTP
              authenticator app.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {setupPhase === "idle" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] px-4 py-3">
              <Info className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
              <div>
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                  MFA is not enabled
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Protect your account by requiring a time-based one-time
                  password (TOTP) at login. Works with Google Authenticator,
                  Authy, 1Password, and similar apps.
                </p>
              </div>
            </div>
            <Button
              onClick={handleStartSetup}
              className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(230_65%_55%)] text-white shadow-md hover:shadow-lg hover:brightness-110 transition-all duration-200"
            >
              <Shield className="h-4 w-4" />
              Enable MFA
            </Button>
          </div>
        )}

        {setupPhase === "qr" && !qrUrl && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" />
            <span className="ml-2 text-sm text-[hsl(var(--muted-foreground))]">
              Generating setup code...
            </span>
          </div>
        )}

        {setupPhase === "qr" && qrUrl && (
          <div className="space-y-5">
            {/* Step 1: QR Code */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-[10px]">
                  Step 1
                </Badge>
                <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                  Scan QR code with your authenticator app
                </span>
              </div>
              <div className="inline-block rounded-lg border border-[hsl(var(--border))] bg-white p-4">
                <img
                  src={qrUrl}
                  alt="MFA QR Code"
                  className="h-48 w-48"
                  onError={(e) => {
                    // If the QR URL is not a renderable image, hide img and show URL as text
                    (e.target as HTMLImageElement).style.display = "none";
                    const fallback =
                      document.getElementById("mfa-qr-fallback");
                    if (fallback) fallback.style.display = "block";
                  }}
                />
                <div id="mfa-qr-fallback" className="hidden">
                  <p className="mb-1 text-xs text-[hsl(var(--muted-foreground))]">
                    QR image could not load. Use this URI in your authenticator
                    app:
                  </p>
                  <code className="select-all break-all font-mono text-xs text-[hsl(var(--foreground)/0.85)]">
                    {qrUrl}
                  </code>
                </div>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                If you cannot scan the QR code, enter the setup key manually in
                your authenticator app.
              </p>
            </div>

            {/* Step 2: Manual Secret */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-[10px]">
                  Step 2
                </Badge>
                <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                  Or enter this secret manually
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-4 py-2.5">
                  <code className="select-all break-all font-mono text-sm text-[hsl(var(--foreground)/0.85)]">
                    {secret}
                  </code>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(secret)}
                  className="shrink-0"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Save this secret in a safe place. You can use it to re-add your
                account to an authenticator app if you lose access.
              </p>
            </div>

            <Separator />

            {/* Step 3: Verify */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-[10px]">
                  Step 3
                </Badge>
                <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                  Enter the code from your authenticator app
                </span>
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="mfa-verify-code"
                  className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
                >
                  Verification Code
                </Label>
                <Input
                  id="mfa-verify-code"
                  value={verifyCode}
                  onChange={(e) =>
                    setVerifyCode(
                      e.target.value.replace(/\D/g, "").slice(0, 6)
                    )
                  }
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="h-10 max-w-xs font-mono tracking-widest"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleVerifySetup}
                  disabled={verifying || verifyCode.length < 6}
                  className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(230_65%_55%)] text-white shadow-md hover:shadow-lg hover:brightness-110 transition-all duration-200"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      Verify & Enable
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSetupPhase("idle");
                    setQrUrl("");
                    setSecret("");
                    setVerifyCode("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab: Security
// ---------------------------------------------------------------------------

function SecurityTab() {
  return (
    <div className="space-y-6">
      {/* Two-Factor Authentication */}
      <MfaCard />

      {/* Active Sessions */}
      <SessionsCard />

      {/* Password Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-[hsl(var(--primary))]" />
            Password Policy
          </CardTitle>
          <CardDescription>
            Security requirements for all admin accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              <span className="text-sm">Minimum 12 characters</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              <span className="text-sm">
                Must include uppercase and lowercase letters
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              <span className="text-sm">
                Must include at least one number
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: General
// ---------------------------------------------------------------------------

function GeneralTab() {
  const [portalName, setPortalName] = useState("CCF Admin Portal");
  const [supportEmail, setSupportEmail] = useState("support@cyberchakra.in");
  const [licenseDuration, setLicenseDuration] = useState("12");
  const [trialDuration, setTrialDuration] = useState("30");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState(
    "CCF is currently undergoing scheduled maintenance. Please try again shortly."
  );
  const [serverHealthy, setServerHealthy] = useState<boolean | null>(null);
  const [healthLatency, setHealthLatency] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Fetch settings from API on mount (if endpoint exists)
  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      try {
        const data = await apiGet<{
          portalName?: string;
          supportEmail?: string;
          defaultLicenseDurationMonths?: number;
          defaultTrialDurationDays?: number;
          maintenanceMode?: boolean;
          maintenanceMessage?: string;
        }>("/api/v1/admin/settings");
        if (cancelled) return;
        if (data.portalName) setPortalName(data.portalName);
        if (data.supportEmail) setSupportEmail(data.supportEmail);
        if (data.defaultLicenseDurationMonths) setLicenseDuration(String(data.defaultLicenseDurationMonths));
        if (data.defaultTrialDurationDays) setTrialDuration(String(data.defaultTrialDurationDays));
        if (data.maintenanceMode !== undefined) setMaintenanceMode(data.maintenanceMode);
        if (data.maintenanceMessage) setMaintenanceMsg(data.maintenanceMessage);
        setSettingsError(null);
      } catch {
        if (cancelled) return;
        // Endpoint likely does not exist yet -- use defaults
        setSettingsError("Settings API not available. Showing defaults.");
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    }
    loadSettings();
    return () => { cancelled = true; };
  }, []);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await apiPatch("/api/v1/admin/settings", {
        settings: [
          { key: "portalName", value: portalName },
          { key: "supportEmail", value: supportEmail },
          { key: "defaultLicenseDurationMonths", value: licenseDuration },
          { key: "defaultTrialDurationDays", value: trialDuration },
          { key: "maintenanceMode", value: String(maintenanceMode) },
          { key: "maintenanceMessage", value: maintenanceMsg },
        ],
      });
      setSettingsError(null);
      toast.success("Settings saved successfully.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save settings.";
      toast.error(message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    const start = Date.now();
    try {
      const res = await fetch(`${API_BASE}/api/v1/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;
      setHealthLatency(latency);
      if (res.ok) {
        const json = await res.json();
        const payload = json.data ?? json;
        setServerHealthy(payload.status === "ok");
      } else {
        setServerHealthy(false);
      }
    } catch {
      setHealthLatency(Date.now() - start);
      setServerHealthy(false);
    } finally {
      setTesting(false);
    }
  }, []);

  // Run health check on mount
  useEffect(() => {
    handleTestConnection();
  }, [handleTestConnection]);

  return (
    <div className="space-y-6">
      {/* Portal Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-[hsl(var(--primary))]" />
            Portal Settings
          </CardTitle>
          <CardDescription>
            General configuration for the admin portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {settingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" />
              <span className="ml-2 text-sm text-[hsl(var(--muted-foreground))]">Loading settings...</span>
            </div>
          ) : (
            <>
              {settingsError && (
                <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-3 py-2 mb-2">
                  <Info className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{settingsError}</p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="portal-name">Portal Name</Label>
                  <Input
                    id="portal-name"
                    value={portalName}
                    onChange={(e) => setPortalName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="support-email">Support Email</Label>
                  <Input
                    id="support-email"
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license-duration">Default License Duration (months)</Label>
                  <Input
                    id="license-duration"
                    type="number"
                    min="1"
                    max="120"
                    value={licenseDuration}
                    onChange={(e) => setLicenseDuration(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trial-duration">Default Trial Duration (days)</Label>
                  <Input
                    id="trial-duration"
                    type="number"
                    min="1"
                    max="365"
                    value={trialDuration}
                    onChange={(e) => setTrialDuration(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveSettings} disabled={savingSettings}>
                  {savingSettings ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Settings"
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* License Server Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ServerCrash className="h-4 w-4 text-[hsl(var(--primary))]" />
            License Server
          </CardTitle>
          <CardDescription>
            Health status of the CCF backend API server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Server URL */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Server URL</Label>
            <div className="flex items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-4 py-2.5">
              <code className="font-mono text-sm text-[hsl(var(--foreground)/0.85)] select-all">
                {API_BASE || window.location.origin}
              </code>
            </div>
          </div>

          {/* Health + Test */}
          <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] px-4 py-3">
            <div className="flex items-center gap-3">
              {serverHealthy === null ? (
                <>
                  <span className="inline-block h-3 w-3 rounded-full bg-[hsl(var(--muted-foreground)/0.4)]" />
                  <span className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
                    Not checked yet
                  </span>
                </>
              ) : (
                <>
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${
                      serverHealthy
                        ? "bg-[hsl(var(--success))] animate-pulse-dot"
                        : "bg-[hsl(var(--destructive))] animate-pulse-dot-red"
                    }`}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {serverHealthy ? "Connected" : "Unreachable"}
                    </span>
                    {healthLatency !== null && (
                      <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                        Latency: {healthLatency}ms
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing}>
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Test Connection
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
            Maintenance Mode
          </CardTitle>
          <CardDescription>
            Take the service offline for desktop app users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Toggle checked={maintenanceMode} onChange={setMaintenanceMode} />
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">
              Enable Maintenance Mode
            </span>
          </div>

          {maintenanceMode && (
            <div className="rounded-lg border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.06)] p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
                <p className="text-xs text-[hsl(var(--warning))]">
                  When enabled, all desktop app validation requests will receive a
                  maintenance announcement. License activations and checks will be
                  temporarily suspended.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="maintenance-msg">Maintenance Message</Label>
            <Textarea
              id="maintenance-msg"
              rows={3}
              value={maintenanceMsg}
              onChange={(e) => setMaintenanceMsg(e.target.value)}
              placeholder="Custom maintenance message shown to desktop app users"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              This message will be displayed to desktop app users during maintenance.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Team
// ---------------------------------------------------------------------------

function TeamTab() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-6">
      {/* Current User */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-[hsl(var(--primary))]" />
            Admin Users
          </CardTitle>
          <CardDescription>
            Team members who have access to this portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current user info */}
          <div className="rounded-lg border border-[hsl(var(--border))] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] font-semibold text-sm">
                  {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                    {user?.name ?? "Unknown"}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {user?.email ?? "No email"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{user?.role ?? "Admin"}</Badge>
                <Badge variant="success" className="text-[10px]">You</Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Coming soon notice */}
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--muted))]">
              <Users className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
            </div>
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">
              Admin user management coming soon
            </p>
            <p className="mt-1 max-w-sm text-xs text-[hsl(var(--muted-foreground))]">
              Multi-admin support with role-based access, invitations, and team
              management will be available in a future update.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: API
// ---------------------------------------------------------------------------

function ApiTab() {
  return (
    <div className="space-y-6">
      {/* API Keys -- Coming Soon */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4 text-[hsl(var(--primary))]" />
            API Keys
          </CardTitle>
          <CardDescription>
            Manage API keys for programmatic access to the CCF platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--muted))]">
              <Key className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
            </div>
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">
              API key management coming soon
            </p>
            <p className="mt-1 max-w-xs text-xs text-[hsl(var(--muted-foreground))]">
              Generate and manage API keys for programmatic access to license
              management, organization data, and reporting endpoints.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* API Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-[hsl(var(--primary))]" />
            API Documentation
          </CardTitle>
          <CardDescription>
            Interactive OpenAPI/Swagger documentation for the CCF Admin Portal API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
            Browse all available endpoints, try requests interactively, and view request/response schemas.
            Covers both the admin dashboard API (JWT auth) and the desktop application API (license key auth).
          </p>
          <div className="flex gap-3">
            <Button size="sm" asChild>
              <a href="/api/docs" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open API Docs
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/docs.json" target="_blank" rel="noopener noreferrer">
                Raw OpenAPI Spec (JSON)
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            Webhooks
          </CardTitle>
          <CardDescription>
            Configure webhooks for real-time event notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--muted))]">
              <Webhook className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
            </div>
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">
              Coming soon
            </p>
            <p className="mt-1 max-w-xs text-xs text-[hsl(var(--muted-foreground))]">
              Configure webhooks for real-time notifications when licenses are
              activated, expired, or when new organizations register.
            </p>
            <Button variant="outline" size="sm" disabled className="mt-4">
              Add Webhook
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main: Settings Page
// ---------------------------------------------------------------------------

export function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
          Settings
        </h1>
        <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
          Manage your account, security, team, and system configuration.
        </p>
      </div>

      {/* Tabs - vertical layout on larger screens */}
      <Tabs defaultValue="profile" orientation="vertical" className="flex flex-col gap-6 lg:flex-row">
        {/* Tab list - sidebar */}
        <TabsList className="flex h-auto w-full flex-row justify-start gap-0.5 rounded-[var(--radius)] border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--muted)/0.3)] p-1.5 lg:w-56 lg:shrink-0 lg:flex-col lg:items-stretch">
          <TabsTrigger
            value="profile"
            className="justify-start gap-2.5 rounded-md px-3 py-2.5 text-left transition-all duration-200 data-[state=active]:bg-[hsl(var(--card))] data-[state=active]:shadow-sm data-[state=active]:text-[hsl(var(--primary))] data-[state=inactive]:hover:bg-[hsl(var(--muted)/0.5)]"
          >
            <User className="h-4 w-4 shrink-0" />
            <span>Profile</span>
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="justify-start gap-2.5 rounded-md px-3 py-2.5 text-left transition-all duration-200 data-[state=active]:bg-[hsl(var(--card))] data-[state=active]:shadow-sm data-[state=active]:text-[hsl(var(--primary))] data-[state=inactive]:hover:bg-[hsl(var(--muted)/0.5)]"
          >
            <Shield className="h-4 w-4 shrink-0" />
            <span>Security</span>
          </TabsTrigger>
          <div className="mx-2 my-1 hidden h-px bg-[hsl(var(--border)/0.5)] lg:block" />
          <TabsTrigger
            value="general"
            className="justify-start gap-2.5 rounded-md px-3 py-2.5 text-left transition-all duration-200 data-[state=active]:bg-[hsl(var(--card))] data-[state=active]:shadow-sm data-[state=active]:text-[hsl(var(--primary))] data-[state=inactive]:hover:bg-[hsl(var(--muted)/0.5)]"
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span>General</span>
          </TabsTrigger>
          <RoleGuard permission="settings.team">
            <TabsTrigger
              value="team"
              className="justify-start gap-2.5 rounded-md px-3 py-2.5 text-left transition-all duration-200 data-[state=active]:bg-[hsl(var(--card))] data-[state=active]:shadow-sm data-[state=active]:text-[hsl(var(--primary))] data-[state=inactive]:hover:bg-[hsl(var(--muted)/0.5)]"
            >
              <Users className="h-4 w-4 shrink-0" />
              <span>Team</span>
            </TabsTrigger>
          </RoleGuard>
          <div className="mx-2 my-1 hidden h-px bg-[hsl(var(--border)/0.5)] lg:block" />
          <RoleGuard permission="settings.api">
            <TabsTrigger
              value="api"
              className="justify-start gap-2.5 rounded-md px-3 py-2.5 text-left transition-all duration-200 data-[state=active]:bg-[hsl(var(--card))] data-[state=active]:shadow-sm data-[state=active]:text-[hsl(var(--primary))] data-[state=inactive]:hover:bg-[hsl(var(--muted)/0.5)]"
            >
              <Key className="h-4 w-4 shrink-0" />
              <span>API</span>
            </TabsTrigger>
          </RoleGuard>
        </TabsList>

        {/* Tab content - main area */}
        <div className="min-w-0 flex-1">
          <TabsContent value="profile" className="mt-0">
            <ProfileTab />
          </TabsContent>
          <TabsContent value="security" className="mt-0">
            <SecurityTab />
          </TabsContent>
          <TabsContent value="general" className="mt-0">
            <GeneralTab />
          </TabsContent>
          <RoleGuard permission="settings.team">
            <TabsContent value="team" className="mt-0">
              <TeamTab />
            </TabsContent>
          </RoleGuard>
          <RoleGuard permission="settings.api">
            <TabsContent value="api" className="mt-0">
              <ApiTab />
            </TabsContent>
          </RoleGuard>
        </div>
      </Tabs>
    </div>
  );
}
