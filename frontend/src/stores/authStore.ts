import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;
  mfaPending: boolean;
  mfaSessionId: string | null;
  login: (email: string, password: string) => Promise<void>;
  verifyMfa: (mfaSessionId: string, token: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  clearError: () => void;
  clearMfa: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isLoading: false,
      error: null,
      mfaPending: false,
      mfaSessionId: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          // Try real API first
          const response = await fetch(
            (import.meta.env.VITE_API_URL || '') + '/api/v1/auth/login',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
            }
          );

          if (response.ok) {
            const json = await response.json();
            // Backend wraps in { success, data, error, message } envelope
            const payload = json.data ?? json;

            // MFA required — store session ID and bail before setting tokens
            if (payload.requiresMfa === true) {
              set({
                mfaPending: true,
                mfaSessionId: payload.mfaSessionId,
                isLoading: false,
              });
              return;
            }

            set({
              user: payload.admin ?? payload.user,
              token: payload.accessToken ?? payload.token,
              refreshToken: payload.refreshToken,
              isLoading: false,
            });
            return;
          }

          // If 401 or 403, show actual error from server
          if (response.status === 401 || response.status === 403) {
            const data = await response.json();
            throw new Error(data.message || data.error || 'Invalid credentials');
          }

          throw new Error('Server error');
        } catch (err) {
          // Mock auth only in development mode
          if (import.meta.env.DEV && err instanceof TypeError && err.message.includes('fetch')) {
            console.warn('[DEV] Backend not available, using mock auth');
            await new Promise((r) => setTimeout(r, 500));
            set({
              user: {
                id: 'mock_001',
                email,
                name: email
                  .split('@')[0]
                  .replace(/[._]/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase()),
                role: 'super_admin',
              },
              token: 'mock_' + Date.now(),
              refreshToken: 'mock_refresh_' + Date.now(),
              isLoading: false,
            });
            return;
          }

          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Login failed',
          });
          throw err;
        }
      },

      verifyMfa: async (mfaSessionId: string, token: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(
            (import.meta.env.VITE_API_URL || '') + '/api/v1/auth/mfa/verify',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mfaSessionId, token }),
            }
          );

          if (response.ok) {
            const json = await response.json();
            const payload = json.data ?? json;
            set({
              user: payload.admin ?? payload.user,
              token: payload.accessToken ?? payload.token,
              refreshToken: payload.refreshToken,
              mfaPending: false,
              mfaSessionId: null,
              isLoading: false,
            });
            return;
          }

          const data = await response.json();
          throw new Error(data.message || data.error || 'Invalid MFA code');
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'MFA verification failed',
          });
          throw err;
        }
      },

      clearMfa: () => set({ mfaPending: false, mfaSessionId: null, error: null }),

      logout: () => {
        // Fire and forget - try to notify backend but always clear local state
        const token = get().token;
        if (token && !token.startsWith('mock_')) {
          fetch(
            (import.meta.env.VITE_API_URL || '') + '/api/v1/auth/logout',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            }
          ).catch(() => {
            // Ignore errors - local state is cleared regardless
          });
        }
        set({
          user: null,
          token: null,
          refreshToken: null,
          error: null,
          mfaPending: false,
          mfaSessionId: null,
        });
      },

      refreshAuth: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return;

        // If using mock tokens, skip refresh
        if (refreshToken.startsWith('mock_')) return;

        try {
          const response = await fetch(
            (import.meta.env.VITE_API_URL || '') + '/api/v1/auth/refresh',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken }),
            }
          );

          if (response.ok) {
            const json = await response.json();
            // Backend wraps in { success, data, error, message } envelope
            const payload = json.data ?? json;
            set({
              token: payload.accessToken ?? payload.token,
              refreshToken: payload.refreshToken,
            });
          } else {
            set({ user: null, token: null, refreshToken: null });
          }
        } catch {
          // Network error - keep current session (might be using mock)
          console.warn('Token refresh failed, keeping current session');
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "ccf-auth",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

// Computed selector
export const useIsAuthenticated = () =>
  useAuthStore((state) => !!state.token && !!state.user);
