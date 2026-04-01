import rateLimit from "express-rate-limit";

// Strict limit for login attempts (prevent brute force)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 min
  message: { success: false, error: "Too many login attempts, try again in 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limit for MFA verification (prevent brute force on 6-digit codes)
// 6-digit TOTP = 1,000,000 possibilities; 5 attempts per 15 min makes brute
// force infeasible within the 30-second TOTP window.
export const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, error: "MFA_RATE_LIMITED", message: "Too many MFA attempts. Try again in 15 minutes." },
});

// Limit for password change attempts (prevent brute force on current password)
export const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 min
  message: { success: false, error: "Too many password change attempts, try again in 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limit for admin password reset (prevent abuse of super_admin privilege)
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, error: "RESET_RATE_LIMITED", message: "Too many password reset attempts. Try again in 15 minutes." },
});

// Medium limit for admin API
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100, // 100 requests per minute
  message: { success: false, error: "Rate limit exceeded" },
});

// Generous limit for desktop app public API
export const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 per minute per IP (heartbeat + validate + announcements)
  message: { success: false, error: null, message: "Rate limit exceeded" },
});

// Tight limit for license activation (prevent abuse)
export const activationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 activations per hour
  message: { success: false, error: null, message: "Activation rate limit exceeded" },
});

// ─── Account lockout tracking (per-email, not per-IP) ──────────────────────
// Tracks failed login attempts per email address with tiered lockout:
//   >= 5 failures  → locked for 15 minutes
//   >= 10 failures → locked for 1 hour
// Successful login resets the counter.

interface LockoutEntry {
  count: number;
  lastAttempt: number;        // epoch ms of the most recent failed attempt
  lockedUntil: number | null; // epoch ms, or null if not locked
}

const failedAttempts = new Map<string, LockoutEntry>();

// Clean up stale lockout entries every 30 minutes.
// Removes entries whose last failed attempt was more than 2 hours ago.
setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000; // 2 hours
  for (const [email, entry] of failedAttempts) {
    if (now - entry.lastAttempt > maxAge) {
      failedAttempts.delete(email);
    }
  }
}, 30 * 60 * 1000);

/**
 * Check whether the account identified by `email` is currently locked out.
 * Returns the lockout entry if locked (with lockedUntil in the future),
 * or null if the account is free to attempt login.
 */
export function getAccountLockout(email: string): LockoutEntry | null {
  const entry = failedAttempts.get(email.toLowerCase());
  if (!entry) return null;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) return entry;
  return null;
}

/**
 * Record a failed login attempt for the given email. Applies tiered lockout:
 *   >= 10 failures → locked for 1 hour
 *   >= 5 failures  → locked for 15 minutes
 * Returns true if the account is now locked.
 */
export function recordFailedLogin(email: string): boolean {
  const key = email.toLowerCase();
  const current = failedAttempts.get(key) || { count: 0, lastAttempt: 0, lockedUntil: null };

  // If previously locked but now expired, reset
  if (current.lockedUntil && current.lockedUntil <= Date.now()) {
    current.count = 0;
    current.lockedUntil = null;
  }

  current.count++;
  current.lastAttempt = Date.now();

  if (current.count >= 10) {
    current.lockedUntil = Date.now() + 60 * 60 * 1000; // 1 hour
  } else if (current.count >= 5) {
    current.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
  }

  failedAttempts.set(key, current);
  return current.lockedUntil !== null && current.lockedUntil > Date.now();
}

/**
 * Clear the lockout counter on successful login.
 */
export function clearFailedLogins(email: string): void {
  failedAttempts.delete(email.toLowerCase());
}
