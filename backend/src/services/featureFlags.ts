/**
 * CCF Admin Portal - Feature Flags Service
 *
 * Feature flags are stored in the `Setting` table with the prefix `feature.`.
 * This service provides a cached, typed interface for reading them.
 *
 * Naming convention:
 *   feature.<category>.<flag_name>
 *
 * Examples:
 *   feature.beta.new_dashboard      = "true" | "false"
 *   feature.debug.panel             = "true" | "false"
 *   feature.limit.max_export_rows   = "10000"
 *
 * Values are cached in-memory with a 60-second TTL to avoid hitting the
 * database on every request.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── In-memory cache ────────────────────────────────────────────────────────

let cache: Map<string, string> = new Map();
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

async function loadFlags(): Promise<Map<string, string>> {
  const now = Date.now();
  if (now - cacheTimestamp < CACHE_TTL_MS && cache.size > 0) {
    return cache;
  }

  const settings = await prisma.setting.findMany({
    where: { key: { startsWith: "feature." } },
  });

  cache = new Map(settings.map((s) => [s.key, s.value]));
  cacheTimestamp = now;
  return cache;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check whether a boolean feature flag is enabled.
 *
 * @param flag  Flag name with or without the `feature.` prefix.
 *              e.g., "beta.new_dashboard" or "feature.beta.new_dashboard"
 * @returns     `true` if the value is `"true"` or `"1"`, `false` otherwise.
 */
export async function isFeatureEnabled(flag: string): Promise<boolean> {
  const flags = await loadFlags();
  const key = flag.startsWith("feature.") ? flag : `feature.${flag}`;
  const value = flags.get(key);
  return value === "true" || value === "1";
}

/**
 * Get the raw string value of a feature flag.
 *
 * @param flag  Flag name with or without the `feature.` prefix.
 * @returns     The string value, or `null` if the flag is not set.
 */
export async function getFeatureValue(
  flag: string,
): Promise<string | null> {
  const flags = await loadFlags();
  const key = flag.startsWith("feature.") ? flag : `feature.${flag}`;
  return flags.get(key) ?? null;
}

/**
 * Get all feature flags as a flat object.
 * Keys are returned WITHOUT the `feature.` prefix for easier consumption
 * by the frontend and desktop app.
 *
 * @returns  e.g., `{ "beta.new_dashboard": "true", "debug.panel": "false" }`
 */
export async function getAllFeatureFlags(): Promise<Record<string, string>> {
  const flags = await loadFlags();
  const result: Record<string, string> = {};
  for (const [key, value] of flags) {
    // Strip the "feature." prefix
    result[key.replace(/^feature\./, "")] = value;
  }
  return result;
}

/**
 * Force the in-memory cache to refresh on the next read.
 * Call this after updating a setting via the admin API.
 */
export function invalidateCache(): void {
  cacheTimestamp = 0;
}
