import { create } from "zustand";
import { apiGet, apiPost } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildJob {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface BuildAsset {
  name: string;
  platform: string;
  size: number;
  downloadUrl: string;
  sha256: string;
  signature: string | null;
}

export interface BuildStatus {
  runId: number;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | null;
  jobs: BuildJob[];
  assets: BuildAsset[];
  htmlUrl: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface ReleaseWizardState {
  // Step tracking
  currentStep: number; // 1, 2, 3

  // Step 1: Version & Notes
  version: string;
  channel: "stable" | "beta" | "rc";
  releaseNotes: string;
  forceUpdate: boolean;

  // Step 2: Build
  releaseId: string | null;
  buildStatus: BuildStatus | null;
  isBuildPolling: boolean;
  buildError: string | null;

  // Step 3: Publish
  rolloutStrategy: "immediate" | "staged" | "targeted";
  stages: { percentage: number; soakHours: number }[];
  sendEmail: boolean;
  createAnnouncement: boolean;

  // Loading states
  isTriggering: boolean;
  isPublishing: boolean;
  error: string | null;

  // Actions
  setStep: (step: number) => void;
  setVersion: (v: string) => void;
  setChannel: (c: "stable" | "beta" | "rc") => void;
  setReleaseNotes: (n: string) => void;
  setForceUpdate: (f: boolean) => void;
  setRolloutStrategy: (s: "immediate" | "staged" | "targeted") => void;

  triggerBuild: () => Promise<void>;
  pollBuildStatus: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  importAssets: () => Promise<void>;
  publishRelease: () => Promise<void>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_STAGES = [
  { percentage: 10, soakHours: 24 },
  { percentage: 50, soakHours: 24 },
  { percentage: 100, soakHours: 0 },
];

const initialState = {
  currentStep: 1,
  version: "",
  channel: "stable" as const,
  releaseNotes: "",
  forceUpdate: false,
  releaseId: null as string | null,
  buildStatus: null as BuildStatus | null,
  isBuildPolling: false,
  buildError: null as string | null,
  rolloutStrategy: "immediate" as const,
  stages: DEFAULT_STAGES,
  sendEmail: false,
  createAnnouncement: false,
  isTriggering: false,
  isPublishing: false,
  error: null as string | null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map common GitHub/backend errors to user-friendly messages. */
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("pat") || lower.includes("token") || lower.includes("unauthorized")) {
    return "GitHub Personal Access Token is not configured or has expired. Please check Settings > Integrations.";
  }
  if (lower.includes("not found") || lower.includes("404")) {
    return "GitHub repository not found. Verify the repository name in Settings > Integrations.";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "GitHub API rate limit exceeded. Please wait a few minutes and try again.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Network error — unable to reach the server. Check your connection and try again.";
  }

  return msg || "An unexpected error occurred.";
}

// Polling interval handle lives outside the store so it isn't serialised.
let pollingTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useReleaseWizardStore = create<ReleaseWizardState>()(
  (set, get) => ({
    ...initialState,

    // -- Simple setters -------------------------------------------------------

    setStep: (step) => set({ currentStep: step }),
    setVersion: (v) => set({ version: v }),
    setChannel: (c) => set({ channel: c }),
    setReleaseNotes: (n) => set({ releaseNotes: n }),
    setForceUpdate: (f) => set({ forceUpdate: f }),
    setRolloutStrategy: (s) => set({ rolloutStrategy: s }),

    // -- Step 2: Trigger build ------------------------------------------------

    triggerBuild: async () => {
      const { version, channel, releaseNotes } = get();

      set({ isTriggering: true, error: null, buildError: null });

      try {
        const result = await apiPost<{ releaseId: string; runId: number }>(
          "/api/v1/admin/release-wizard/trigger-build",
          { version, channel, releaseNotes },
        );

        set({
          releaseId: result.releaseId,
          buildStatus: {
            runId: result.runId,
            status: "queued",
            conclusion: null,
            jobs: [],
            assets: [],
            htmlUrl: "",
            createdAt: new Date().toISOString(),
          },
          isTriggering: false,
        });

        // Automatically advance to step 2 and start polling
        set({ currentStep: 2 });
        get().startPolling();
      } catch (err) {
        set({
          isTriggering: false,
          error: friendlyError(err),
          buildError: friendlyError(err),
        });
      }
    },

    // -- Step 2: Poll build status -------------------------------------------

    pollBuildStatus: async () => {
      const { releaseId } = get();
      if (!releaseId) return;

      try {
        const status = await apiGet<BuildStatus>(
          `/api/v1/admin/release-wizard/build-status?releaseId=${encodeURIComponent(releaseId)}`,
        );

        set({ buildStatus: status, buildError: null });

        // Automatically stop polling when the build is no longer running
        if (status.status === "completed") {
          get().stopPolling();
        }
      } catch (err) {
        set({ buildError: friendlyError(err) });
        // Don't stop polling on transient errors -- the next tick may succeed.
      }
    },

    startPolling: () => {
      // Prevent duplicate timers
      if (pollingTimer) return;

      set({ isBuildPolling: true });

      // Fire immediately, then every 5 seconds
      get().pollBuildStatus();

      pollingTimer = setInterval(() => {
        get().pollBuildStatus();
      }, 5_000);
    },

    stopPolling: () => {
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
      set({ isBuildPolling: false });
    },

    // -- Step 2 -> 3: Import assets ------------------------------------------

    importAssets: async () => {
      const { releaseId } = get();
      if (!releaseId) return;

      set({ error: null });

      try {
        await apiPost<void>("/api/v1/admin/release-wizard/import-assets", {
          releaseId,
        });

        // Advance to publish step
        set({ currentStep: 3 });
      } catch (err) {
        set({ error: friendlyError(err) });
      }
    },

    // -- Step 3: Publish ------------------------------------------------------

    publishRelease: async () => {
      const { releaseId, rolloutStrategy, stages, sendEmail, createAnnouncement } =
        get();
      if (!releaseId) return;

      set({ isPublishing: true, error: null });

      try {
        await apiPost<void>(`/api/v1/admin/releases/${releaseId}/publish`, {
          rolloutStrategy,
          stages: rolloutStrategy === "staged" ? stages : undefined,
          sendEmail,
          createAnnouncement,
        });

        set({ isPublishing: false });
      } catch (err) {
        set({
          isPublishing: false,
          error: friendlyError(err),
        });
      }
    },

    // -- Reset ----------------------------------------------------------------

    reset: () => {
      // Make sure we clean up any running timer
      get().stopPolling();
      set({ ...initialState, stages: [...DEFAULT_STAGES] });
    },
  }),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useWizardStep = () =>
  useReleaseWizardStore((s) => s.currentStep);

export const useWizardBuildStatus = () =>
  useReleaseWizardStore((s) => s.buildStatus);

export const useWizardIsBuilding = () =>
  useReleaseWizardStore((s) => s.isBuildPolling || s.isTriggering);

export const useWizardError = () =>
  useReleaseWizardStore((s) => s.error ?? s.buildError);
