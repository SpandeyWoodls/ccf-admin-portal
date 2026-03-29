import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Shield, Loader2, Eye, EyeOff, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuthStore } from "@/stores/authStore";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/dashboard";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = useCallback(async (data: LoginFormData) => {
    clearError();
    setDemoMode(false);
    try {
      await login(data.email, data.password);
      // Check if we ended up with a mock token (backend was unavailable)
      const token = useAuthStore.getState().token;
      if (token?.startsWith('mock_')) {
        setDemoMode(true);
      }
      navigate(from, { replace: true });
    } catch {
      // Error is handled by the store
    }
  }, [clearError, login, navigate, from]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))]">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary)/0.05)] via-transparent to-[hsl(var(--primary)/0.03)]" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)`,
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo and title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] shadow-lg shadow-[hsl(var(--primary)/0.3)]">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            CCF Admin Portal
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Cyber Chakra Forensics Management System
          </p>
        </div>

        <Card className="border-[hsl(var(--border))] shadow-xl">
          <CardHeader className="pb-4">
            <h2 className="text-center text-lg font-semibold text-[hsl(var(--foreground))]">
              Sign in to your account
            </h2>
            <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
              Enter your credentials to access the admin dashboard
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Server error message */}
              {error && (
                <div className="rounded-lg border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.08)] p-3 text-sm text-[hsl(var(--destructive))]">
                  <p className="font-medium">{error}</p>
                  {error === 'Server error' && (
                    <p className="mt-1 text-xs opacity-75">
                      The server encountered an unexpected error. Please try again later.
                    </p>
                  )}
                </div>
              )}

              {/* Demo mode indicator */}
              {demoMode && (
                <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] p-3 text-xs text-[hsl(var(--primary))]">
                  <WifiOff className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>Demo Mode</strong> — Backend not available. Using local mock authentication.
                  </span>
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@ccf.gov.in"
                  autoComplete="email"
                  autoFocus
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-[hsl(var(--destructive))]">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <a
                    href="#"
                    className="text-xs text-[hsl(var(--primary))] hover:underline"
                  >
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-[hsl(var(--destructive))]">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
          Secure access for authorized personnel only.
          <br />
          All sessions are monitored and logged.
        </p>
      </div>
    </div>
  );
}
