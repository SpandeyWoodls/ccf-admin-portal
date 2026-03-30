import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("admin", "super_admin"));

// ─── Config ────────────────────────────────────────────────────────────────

const GITHUB_API = "https://api.github.com";
const GITHUB_PAT = process.env.GITHUB_PAT || "";
const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER || "SpandeyWoodls";
const GITHUB_REPO = process.env.GITHUB_REPO_NAME || "cyber-chakra-forensics";

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Ensures GITHUB_PAT is configured before making any GitHub API calls.
 * Throws an AppError with a helpful message if not set.
 */
function requireGitHubPat(): void {
  if (!GITHUB_PAT) {
    throw new AppError(
      503,
      "GITHUB_PAT is not configured. Set it in your .env file to enable GitHub integration.",
      "GITHUB_PAT_MISSING",
    );
  }
}

/**
 * Helper for GitHub REST API calls. Handles auth headers and error responses.
 */
async function githubFetch(path: string, options: RequestInit = {}): Promise<any> {
  requireGitHubPat();

  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_PAT}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      res.status === 401 || res.status === 403 ? 502 : res.status,
      `GitHub API error (${res.status}): ${body}`,
      "GITHUB_API_ERROR",
    );
  }

  // Some GitHub endpoints return 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

/**
 * Validates a version string as semver (e.g. "2.1.0", "3.0.0-beta.1").
 */
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;

function isValidSemver(version: string): boolean {
  return SEMVER_REGEX.test(version);
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const triggerBuildSchema = z.object({
  version: z.string().min(1).max(30),
  channel: z.enum(["stable", "beta", "rc"]).default("stable"),
  releaseNotes: z.string().optional().nullable(),
  workflowFileName: z.string().default("release.yml"),
  ref: z.string().default("windows-port"),
});

const importAssetsSchema = z.object({
  releaseId: z.string().uuid(),
  githubReleaseId: z.number().int().positive().optional(),
});

// ─── POST /trigger-build ───────────────────────────────────────────────────
// Triggers a GitHub Actions workflow_dispatch on the desktop app repo and
// creates a draft Release record in the database.
//
// Body: { version, channel, releaseNotes?, workflowFileName?, ref? }

router.post(
  "/trigger-build",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = triggerBuildSchema.parse(req.body);

      // 1. Validate semver
      if (!isValidSemver(body.version)) {
        throw new AppError(
          400,
          `Invalid semver version "${body.version}". Expected format: MAJOR.MINOR.PATCH (e.g. 2.1.0)`,
          "INVALID_VERSION",
        );
      }

      // 2. Check version doesn't already exist in DB
      const existing = await prisma.release.findFirst({
        where: { version: body.version },
      });

      if (existing) {
        throw new AppError(
          409,
          `Release version ${body.version} already exists (id: ${existing.id}, channel: ${existing.channel})`,
          "VERSION_EXISTS",
        );
      }

      // 3. Trigger GitHub Actions workflow_dispatch
      const workflowPath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${body.workflowFileName}/dispatches`;

      await githubFetch(workflowPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: body.ref,
          inputs: {
            version: body.version,
            channel: body.channel,
            release_notes: body.releaseNotes ?? "",
          },
        }),
      });

      // 4. Create a draft release in our DB
      const release = await prisma.release.create({
        data: {
          version: body.version,
          channel: body.channel,
          severity: "optional",
          title: `v${body.version}`,
          releaseNotes: body.releaseNotes ?? null,
          // publishedAt is left null -- this is a draft
        },
      });

      // 5. Try to find the workflow run that was just dispatched
      // (GitHub may take a moment to create it, so we attempt a quick lookup)
      let workflowRunId: number | null = null;
      try {
        // Small delay to let GitHub register the run
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const runsResponse = await githubFetch(
          `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${body.workflowFileName}/runs?per_page=5&event=workflow_dispatch`,
        );

        if (runsResponse?.workflow_runs?.length > 0) {
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          // Find the most recent workflow_dispatch run created in the last 5 minutes
          const recentRun = runsResponse.workflow_runs.find(
            (run: any) => run.event === "workflow_dispatch" && run.created_at >= fiveMinutesAgo,
          );
          if (recentRun) {
            workflowRunId = recentRun.id as number;
            // Persist the run ID to the Release record for future lookups
            await prisma.release.update({
              where: { id: release.id },
              // @ts-ignore -- workflowRunId exists in DB but prisma client needs regeneration
              data: { workflowRunId: BigInt(recentRun.id) },
            });
          }
        }
      } catch {
        // Non-fatal: we can still return success without the run ID
      }

      // 6. Audit log
      await logAudit({
        adminUserId: req.admin!.id,
        action: "trigger_release_build",
        resourceType: "release",
        resourceId: release.id,
        newValues: {
          version: body.version,
          channel: body.channel,
          workflowFileName: body.workflowFileName,
          ref: body.ref,
          workflowRunId,
        },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.status(201).json({
        success: true,
        data: {
          releaseId: release.id,
          version: release.version,
          channel: release.channel,
          workflowRunId,
          githubRepo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
          message: workflowRunId
            ? `Build triggered. Workflow run ID: ${workflowRunId}`
            : "Build triggered. Workflow run ID will be available shortly.",
        },
        error: null,
        message: `Release build for v${body.version} triggered on GitHub Actions`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /build-status ─────────────────────────────────────────────────────
// Fetches the current build status from GitHub Actions for a given release.
// Returns a shape matching the frontend's BuildStatusResponse interface:
//   { id, status, targets?, logs?, startedAt?, completedAt? }
//
// Query: ?releaseId=xxx or ?workflowRunId=yyy

router.get(
  "/build-status",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const releaseId = req.query.releaseId as string | undefined;
      const workflowRunIdParam = req.query.workflowRunId as string | undefined;

      if (!releaseId && !workflowRunIdParam) {
        throw new AppError(
          400,
          "Either releaseId or workflowRunId query parameter is required",
          "MISSING_PARAMETER",
        );
      }

      let workflowRunId: number | undefined;
      let release: any = null;

      if (workflowRunIdParam) {
        workflowRunId = parseInt(workflowRunIdParam, 10);
        if (isNaN(workflowRunId)) {
          throw new AppError(400, "workflowRunId must be a number", "INVALID_PARAMETER");
        }
      }

      // If releaseId is provided, look up the release
      if (releaseId) {
        release = await prisma.release.findUnique({
          where: { id: releaseId },
          include: { assets: true },
        });

        if (!release) {
          throw new AppError(404, "Release not found", "NOT_FOUND");
        }

        // Use the stored workflowRunId if available
        if (!workflowRunId && release.workflowRunId) {
          workflowRunId = Number(release.workflowRunId);
        }

        // If still no workflowRunId, poll GitHub for recent workflow_dispatch runs
        if (!workflowRunId) {
          try {
            const runsResponse = await githubFetch(
              `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?per_page=10&event=workflow_dispatch`,
            );

            if (runsResponse?.workflow_runs?.length > 0) {
              const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

              // Find the most recent workflow_dispatch run created in the last 5 minutes
              // Runs are returned sorted by created_at descending, so the first match wins
              const matchingRun = runsResponse.workflow_runs.find((run: any) => {
                if (run.event !== "workflow_dispatch") return false;
                if (run.created_at < fiveMinutesAgo) return false;
                return true;
              });

              if (matchingRun) {
                workflowRunId = matchingRun.id as number;
                // Persist so future polls skip the search
                await prisma.release.update({
                  where: { id: release.id },
                  // @ts-ignore -- workflowRunId exists in DB but prisma client needs regeneration
                  data: { workflowRunId: BigInt(matchingRun.id) },
                });
              }
            }
          } catch (err: any) {
            if (err instanceof AppError && err.code === "GITHUB_PAT_MISSING") {
              throw err;
            }
            if (err instanceof AppError && err.message.includes("403")) {
              throw new AppError(
                502,
                "GitHub PAT does not have permission to access workflow runs. Ensure the token has the 'actions:read' scope.",
                "GITHUB_PERMISSION_DENIED",
              );
            }
            // Non-fatal for other errors: fall through to pending response
          }
        }
      }

      // Helper: return a "pending/queued" response while the run hasn't appeared yet
      const pendingResponse = (message: string) =>
        res.json({
          success: true,
          data: {
            id: releaseId || "",
            status: "queued" as const,
            targets: [],
            logs: [],
            startedAt: null,
            completedAt: null,
          },
          error: null,
          message,
        });

      // If we still don't have a workflowRunId, return pending status.
      // The frontend will keep polling every 5s until the run appears.
      if (!workflowRunId) {
        pendingResponse("Build triggered, waiting for GitHub Actions to start...");
        return;
      }

      // Fetch workflow run details from GitHub
      let workflowRun: any = null;
      let jobs: any[] = [];

      try {
        workflowRun = await githubFetch(
          `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${workflowRunId}`,
        );

        const jobsResponse = await githubFetch(
          `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${workflowRunId}/jobs`,
        );

        jobs = jobsResponse?.jobs || [];
      } catch (err: any) {
        if (err instanceof AppError && err.code === "GITHUB_PAT_MISSING") {
          throw err;
        }
        if (err instanceof AppError && err.message.includes("403")) {
          throw new AppError(
            502,
            "GitHub PAT does not have permission to read workflow runs. Ensure the token has the 'actions:read' scope.",
            "GITHUB_PERMISSION_DENIED",
          );
        }
        // If the run was deleted or isn't accessible yet, return pending
        pendingResponse("Workflow run not accessible yet. Retrying...");
        return;
      }

      // Map GitHub run status to the frontend's expected status values
      // GitHub uses: queued | in_progress | completed (with conclusion: success | failure | cancelled)
      // Frontend expects: queued | building | success | failed | cancelled
      let frontendStatus: "queued" | "building" | "success" | "failed" | "cancelled";
      if (workflowRun.status === "completed") {
        if (workflowRun.conclusion === "success") {
          frontendStatus = "success";
        } else if (workflowRun.conclusion === "cancelled") {
          frontendStatus = "cancelled";
        } else {
          frontendStatus = "failed";
        }
      } else if (workflowRun.status === "in_progress") {
        frontendStatus = "building";
      } else {
        frontendStatus = "queued";
      }

      // Map GitHub jobs to the frontend's BuildTarget shape
      const targets = jobs.map((job: any) => {
        // Infer platform/arch from job name (e.g. "Build Windows x64", "Build Linux")
        const nameLower = (job.name || "").toLowerCase();
        let platform = "unknown";
        let arch = "x86_64";

        if (nameLower.includes("windows") || nameLower.includes("win")) {
          platform = "windows";
        } else if (nameLower.includes("linux")) {
          platform = "linux";
        } else if (nameLower.includes("android")) {
          platform = "android";
        } else if (nameLower.includes("macos") || nameLower.includes("mac")) {
          platform = "macos";
        }

        if (nameLower.includes("arm64") || nameLower.includes("aarch64")) {
          arch = "arm64";
        } else if (nameLower.includes("x64") || nameLower.includes("x86_64") || nameLower.includes("amd64")) {
          arch = "x86_64";
        }

        // Map job status to target status
        let targetStatus: "pending" | "building" | "success" | "error";
        if (job.status === "completed") {
          targetStatus = job.conclusion === "success" ? "success" : "error";
        } else if (job.status === "in_progress") {
          targetStatus = "building";
        } else {
          targetStatus = "pending";
        }

        // Calculate elapsed seconds
        let elapsed = 0;
        if (job.started_at) {
          const end = job.completed_at ? new Date(job.completed_at) : new Date();
          elapsed = Math.round((end.getTime() - new Date(job.started_at).getTime()) / 1000);
        }

        // Estimate progress based on completed steps
        let progress = 0;
        const totalSteps = (job.steps || []).length;
        if (totalSteps > 0) {
          const completedSteps = (job.steps || []).filter(
            (s: any) => s.status === "completed",
          ).length;
          progress = Math.round((completedSteps / totalSteps) * 100);
        }
        if (targetStatus === "success") progress = 100;

        return {
          platform: platform !== "unknown" ? platform : job.name,
          arch,
          status: targetStatus,
          progress,
          elapsed,
          error: job.conclusion === "failure" ? `Job "${job.name}" failed` : undefined,
        };
      });

      // Build a simple log from job step names and their statuses
      const logs: string[] = [];
      for (const job of jobs) {
        for (const step of job.steps || []) {
          const icon =
            step.conclusion === "success"
              ? "[ok]"
              : step.conclusion === "failure"
                ? "[FAIL]"
                : step.status === "in_progress"
                  ? "[...]"
                  : "[ ]";
          logs.push(`${icon} ${job.name} > ${step.name}`);
        }
      }

      res.json({
        success: true,
        data: {
          id: releaseId || String(workflowRunId),
          status: frontendStatus,
          targets,
          logs,
          startedAt: workflowRun.run_started_at || workflowRun.created_at || null,
          completedAt:
            workflowRun.status === "completed" ? workflowRun.updated_at : null,
        },
        error: null,
        message: `Build status: ${frontendStatus}`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /github-releases/:version ─────────────────────────────────────────
// Fetches a specific GitHub Release by tag to get asset download URLs.
// GitHub Releases use tag names like "v2.1.0" so we prepend "v" if missing.

router.get(
  "/github-releases/:version",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const version = req.params.version as string;

      if (!version || !isValidSemver(version)) {
        throw new AppError(
          400,
          `Invalid version format: "${version}". Expected semver (e.g. 2.1.0)`,
          "INVALID_VERSION",
        );
      }

      // GitHub Releases typically use "v" prefix in tags
      const tag = version.startsWith("v") ? version : `v${version}`;

      let ghRelease: any;
      try {
        ghRelease = await githubFetch(
          `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${tag}`,
        );
      } catch (err: any) {
        // If "v" prefix didn't work, try without it
        if (err instanceof AppError && err.message.includes("404")) {
          try {
            ghRelease = await githubFetch(
              `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${version}`,
            );
          } catch {
            throw new AppError(
              404,
              `GitHub Release not found for tag "${tag}" or "${version}"`,
              "GITHUB_RELEASE_NOT_FOUND",
            );
          }
        } else {
          throw err;
        }
      }

      const assets = (ghRelease.assets || []).map((asset: any) => ({
        id: asset.id,
        name: asset.name,
        size: asset.size,
        downloadUrl: asset.browser_download_url,
        contentType: asset.content_type,
        downloadCount: asset.download_count,
        createdAt: asset.created_at,
        updatedAt: asset.updated_at,
      }));

      res.json({
        success: true,
        data: {
          id: ghRelease.id,
          tagName: ghRelease.tag_name,
          name: ghRelease.name,
          body: ghRelease.body,
          draft: ghRelease.draft,
          prerelease: ghRelease.prerelease,
          htmlUrl: ghRelease.html_url,
          createdAt: ghRelease.created_at,
          publishedAt: ghRelease.published_at,
          assets,
        },
        error: null,
        message: `Found GitHub Release "${ghRelease.name}" with ${assets.length} asset(s)`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /import-assets ───────────────────────────────────────────────────
// Fetches assets from a GitHub Release and creates ReleaseAsset records
// in our database, linking them to an existing draft Release.
//
// Body: { releaseId, githubReleaseId? }

router.post(
  "/import-assets",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = importAssetsSchema.parse(req.body);

      // 1. Verify the release exists and is not yet published
      const release = await prisma.release.findUnique({
        where: { id: body.releaseId },
        include: { assets: true },
      });

      if (!release) {
        throw new AppError(404, "Release not found", "NOT_FOUND");
      }

      if (release.publishedAt) {
        throw new AppError(
          400,
          "Cannot import assets into a published release. Block it and create a new one.",
          "RELEASE_PUBLISHED",
        );
      }

      // 2a. If githubReleaseId not provided, look up by version tag
      if (!body.githubReleaseId) {
        const tag = `v${release.version}`;
        let ghByTag: any = null;
        try {
          ghByTag = await githubFetch(
            `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${tag}`,
          );
        } catch {
          // Try without "v" prefix as fallback
          try {
            ghByTag = await githubFetch(
              `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${release.version}`,
            );
          } catch {
            // Neither tag format found
          }
        }
        if (!ghByTag) {
          throw new AppError(
            404,
            `No GitHub Release found for tag "${tag}". Use the Release Wizard to trigger a build first.`,
            "GITHUB_RELEASE_NOT_FOUND",
          );
        }
        body.githubReleaseId = ghByTag.id;
      }

      // 2b. Fetch the GitHub Release by ID
      const ghRelease = await githubFetch(
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${body.githubReleaseId}`,
      );

      if (!ghRelease.assets || ghRelease.assets.length === 0) {
        throw new AppError(
          404,
          `GitHub Release #${body.githubReleaseId} has no assets to import`,
          "NO_GITHUB_ASSETS",
        );
      }

      // 3. Map GitHub assets to our platform/packageType conventions
      const platformMap: Record<string, { platform: "windows" | "linux" | "android"; arch: string; packageType: string }> = {};

      // Build a lookup for common Tauri/desktop naming patterns
      function inferAssetMeta(filename: string): { platform: "windows" | "linux" | "android"; arch: string; packageType: string } | null {
        const lower = filename.toLowerCase();

        // Windows installers
        if (lower.endsWith(".msi")) return { platform: "windows", arch: "x86_64", packageType: "msi" };
        if (lower.endsWith(".exe") && lower.includes("setup")) return { platform: "windows", arch: "x86_64", packageType: "nsis" };
        if (lower.endsWith(".exe")) return { platform: "windows", arch: "x86_64", packageType: "exe" };

        // Linux packages
        if (lower.endsWith(".deb")) return { platform: "linux", arch: "x86_64", packageType: "deb" };
        if (lower.endsWith(".rpm")) return { platform: "linux", arch: "x86_64", packageType: "rpm" };
        if (lower.endsWith(".appimage")) return { platform: "linux", arch: "x86_64", packageType: "appimage" };
        if (lower.endsWith(".tar.gz") && lower.includes("linux")) return { platform: "linux", arch: "x86_64", packageType: "tar.gz" };

        // Android
        if (lower.endsWith(".apk")) return { platform: "android", arch: "arm64", packageType: "apk" };

        // Tauri updater signatures
        if (lower.endsWith(".sig")) return null; // Skip signature files for now

        // Generic fallback
        if (lower.includes("win") || lower.includes("windows")) return { platform: "windows", arch: "x86_64", packageType: "unknown" };
        if (lower.includes("linux")) return { platform: "linux", arch: "x86_64", packageType: "unknown" };
        if (lower.includes("android")) return { platform: "android", arch: "arm64", packageType: "unknown" };

        return null;
      }

      // 4. Delete existing assets if any (re-import scenario)
      if (release.assets.length > 0) {
        await prisma.releaseAsset.deleteMany({ where: { releaseId: release.id } });
      }

      // 5. Create ReleaseAsset records
      const importedAssets: any[] = [];
      const skippedAssets: string[] = [];

      for (const ghAsset of ghRelease.assets) {
        const meta = inferAssetMeta(ghAsset.name);
        if (!meta) {
          skippedAssets.push(ghAsset.name);
          continue;
        }

        const asset = await prisma.releaseAsset.create({
          data: {
            releaseId: release.id,
            platform: meta.platform,
            arch: meta.arch,
            packageType: meta.packageType,
            filename: ghAsset.name,
            fileSize: Number(ghAsset.size),
            sha256Hash: "pending-verification", // SHA256 not available from GitHub API
            downloadUrl: ghAsset.browser_download_url,
            signature: null,
          },
        });

        importedAssets.push(asset);
      }

      // 6. Update release notes from GitHub if ours are empty
      if (!release.releaseNotes && ghRelease.body) {
        await prisma.release.update({
          where: { id: release.id },
          data: { releaseNotes: ghRelease.body },
        });
      }

      // 7. Update gitCommitSha if available from GitHub tag
      if (!release.gitCommitSha && ghRelease.target_commitish) {
        await prisma.release.update({
          where: { id: release.id },
          data: { gitCommitSha: ghRelease.target_commitish },
        });
      }

      // 8. Audit log
      await logAudit({
        adminUserId: req.admin!.id,
        action: "import_release_assets",
        resourceType: "release",
        resourceId: release.id,
        newValues: {
          githubReleaseId: body.githubReleaseId,
          githubReleaseName: ghRelease.name,
          importedCount: importedAssets.length,
          skippedFiles: skippedAssets,
        },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({
        success: true,
        data: {
          releaseId: release.id,
          imported: importedAssets.length,
          skipped: skippedAssets,
          assets: importedAssets.map((a) => ({
            id: a.id,
            platform: a.platform,
            arch: a.arch,
            packageType: a.packageType,
            filename: a.filename,
            fileSize: Number(a.fileSize),
            downloadUrl: a.downloadUrl,
          })),
        },
        error: null,
        message: `Imported ${importedAssets.length} asset(s) from GitHub Release "${ghRelease.name}"${skippedAssets.length > 0 ? `. Skipped ${skippedAssets.length} file(s): ${skippedAssets.join(", ")}` : ""}`,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
