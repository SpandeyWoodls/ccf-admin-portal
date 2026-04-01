import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  Eye,
  EyeOff,
  WifiOff,
  Lock,
  User,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, verifyMfa, isLoading, error, clearError, mfaPending, mfaSessionId, clearMfa } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [totpCode, setTotpCode] = useState("");

  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname ||
    "/dashboard";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = useCallback(
    async (data: LoginFormData) => {
      clearError();
      setDemoMode(false);
      try {
        await login(data.email, data.password);
        const state = useAuthStore.getState();
        // If MFA is required, stay on the page — the MFA form will appear
        if (state.mfaPending) return;
        if (state.token?.startsWith("mock_")) setDemoMode(true);
        navigate(from, { replace: true });
      } catch {
        // handled by store
      }
    },
    [clearError, login, navigate, from],
  );

  const onMfaSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!mfaSessionId || totpCode.length !== 6) return;
      clearError();
      try {
        await verifyMfa(mfaSessionId, totpCode);
        navigate(from, { replace: true });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "MFA verification failed");
      }
    },
    [mfaSessionId, totpCode, clearError, verifyMfa, navigate, from],
  );

  const handleBackToLogin = useCallback(() => {
    clearMfa();
    setTotpCode("");
  }, [clearMfa]);

  return (
    <div className="flex min-h-screen bg-[#f0f4f8]">
      {/* ── Left Panel: Branding ── */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-center px-16 xl:px-24 relative overflow-hidden">
        {/* Subtle background circles */}
        {/* Binary code background pattern */}
        <div className="absolute inset-0 overflow-hidden select-none pointer-events-none">
          <div className="absolute inset-0 text-blue-200/20 text-xs font-mono leading-6 break-all p-8" style={{ wordSpacing: '0.5em' }}>
            {Array.from({ length: 40 }, (_, i) => (
              <div key={i} className="whitespace-nowrap overflow-hidden">
                {Array.from({ length: 60 }, () => Math.random() > 0.5 ? '1' : '0').join(' ')}
              </div>
            ))}
          </div>
        </div>

        {/* Subtle blurs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-100/30 blur-3xl" />
        <div className="absolute -bottom-40 -right-20 w-80 h-80 rounded-full bg-blue-50/40 blur-3xl" />

        {/* Centered content */}
        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Big wolf logo */}
          <div className="mb-10">
            <div className="relative">
              <div className="w-64 h-64 xl:w-80 xl:h-80 rounded-full bg-gradient-to-b from-slate-700 to-slate-900 shadow-2xl shadow-blue-900/20 flex items-center justify-center p-2">
                <img
                  src="/logo.png"
                  alt="Cyber Chakra"
                  className="w-full h-full rounded-full object-contain"
                />
              </div>
              {/* Glow ring */}
              <div className="absolute inset-0 rounded-full border-2 border-blue-400/20 animate-pulse" />
            </div>
          </div>

          {/* Accent line */}
          <div className="w-12 h-1 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full mb-6" />

          {/* Tagline */}
          <h2 className="text-2xl xl:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-500 mb-4">
            Data Security is Our Supreme Duty
          </h2>

          <p className="text-gray-400 text-sm max-w-sm leading-relaxed">
            Protecting India's digital infrastructure with indigenous,
            AI-powered forensic solutions
          </p>
        </div>
      </div>

      {/* ── Right Panel: Login Form ── */}
      <div className="flex w-full lg:w-[45%] items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Login card */}
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8 relative overflow-hidden">
            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600" />

            {/* Avatar circle */}
            <div className="flex justify-center mb-5">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-2 border-blue-200 bg-blue-50/50 flex items-center justify-center">
                  <User className="h-8 w-8 text-blue-300" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-500 border-2 border-white" />
              </div>
            </div>

            {/* Welcome text */}
            <p className="text-center text-xs font-medium tracking-widest text-gray-400 uppercase mb-1">
              Welcome Back
            </p>
            <h2 className="text-center text-2xl font-bold text-blue-600 mb-6">
              Admin Portal
            </h2>

            {/* Error message */}
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                <p className="font-medium">{error}</p>
              </div>
            )}

            {/* Demo mode */}
            {demoMode && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-600">
                <WifiOff className="h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Demo Mode</strong> — Backend not available.
                </span>
              </div>
            )}

            {mfaPending ? (
              /* ── MFA Verification Form ── */
              <form onSubmit={onMfaSubmit} className="space-y-5">
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-600">
                  <KeyRound className="h-3.5 w-3.5 shrink-0" />
                  <span>Enter the 6-digit code from your authenticator app.</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold tracking-wider text-gray-400 uppercase mb-2">
                    Verification Code
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      autoFocus
                      value={totpCode}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setTotpCode(v);
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50/50 py-3 pl-10 pr-4 text-sm text-gray-800 tracking-[0.3em] text-center font-mono placeholder:text-gray-300 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                {/* Verify button */}
                <button
                  type="submit"
                  disabled={isLoading || totpCode.length !== 6}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:shadow-blue-500/30 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Verify
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                {/* Back button */}
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 py-3 text-sm font-medium text-gray-500 transition-all hover:bg-gray-50 hover:text-gray-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Sign In
                </button>
              </form>
            ) : (
              /* ── Email / Password Form ── */
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Email */}
                <div>
                  <label className="block text-[11px] font-semibold tracking-wider text-gray-400 uppercase mb-2">
                    Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    <input
                      type="email"
                      placeholder="admin@cyberchakra.in"
                      autoComplete="email"
                      autoFocus
                      className="w-full rounded-lg border border-gray-200 bg-gray-50/50 py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-300 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      {...register("email")}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[11px] font-semibold tracking-wider text-gray-400 uppercase mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="w-full rounded-lg border border-gray-200 bg-gray-50/50 py-3 pl-10 pr-10 text-sm text-gray-800 placeholder:text-gray-300 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      {...register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 cursor-pointer transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                {/* Sign In button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:shadow-blue-500/30 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Footer inside card */}
            <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Encrypted & Secure</span>
            </div>
          </div>

          {/* Bottom text */}
          <p className="mt-5 text-center text-xs text-gray-400">
            Cyber Chakra Technology &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>

      {/* Mobile: show logo above form */}
      <div className="lg:hidden absolute top-6 left-6 flex items-center gap-3">
        <img src="/logo.png" alt="Cyber Chakra" className="h-10 w-10 rounded-full" />
        <div>
          <p className="text-sm font-bold text-gray-900">Cyber Chakra</p>
          <p className="text-[10px] font-semibold tracking-widest text-blue-600 uppercase">
            Digital Forensics
          </p>
        </div>
      </div>
    </div>
  );
}

