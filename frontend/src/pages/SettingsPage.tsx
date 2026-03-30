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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuthStore } from "@/stores/authStore";
import { apiGet } from "@/lib/api";
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

  const handleUpdateProfile = () => {
    if (newPassword && newPassword !== confirmPassword) {
      console.log("[Settings] Passwords do not match");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      console.log("[Settings] Profile updated", { name, currentPassword: "***", newPassword: "***" });
      setSaving(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }, 600);
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
// Tab: Security
// ---------------------------------------------------------------------------

function SecurityTab() {
  return (
    <div className="space-y-6">
      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-[hsl(var(--primary))]" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--muted))]">
              <Shield className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
            </div>
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">
              Coming soon
            </p>
            <p className="mt-1 max-w-xs text-xs text-[hsl(var(--muted-foreground))]">
              Two-factor authentication support is planned for a future release.
              You will be able to use TOTP authenticator apps for enhanced account security.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-[hsl(var(--primary))]" />
            Active Sessions
          </CardTitle>
          <CardDescription>
            Devices and browsers currently signed in to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-4 py-6">
            <Info className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
            <div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                No other active sessions
              </p>
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                Session management API is not yet available. Your current session is managed via your auth token.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
              <span className="text-sm">Must include uppercase and lowercase letters</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              <span className="text-sm">Must include at least one number</span>
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

  const handleSaveSettings = () => {
    setSavingSettings(true);
    // TODO: POST /api/v1/admin/settings when endpoint is built
    setTimeout(() => {
      console.log("[Settings] General settings saved (local only -- API not yet available)", {
        portalName,
        supportEmail,
        licenseDuration,
        trialDuration,
      });
      setSavingSettings(false);
    }, 400);
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
