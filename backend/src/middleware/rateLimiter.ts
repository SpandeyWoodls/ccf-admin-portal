import rateLimit from "express-rate-limit";

// Strict limit for login attempts (prevent brute force)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 min
  message: { success: false, error: "Too many login attempts, try again in 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
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
