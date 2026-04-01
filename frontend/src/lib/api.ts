const BASE_URL = import.meta.env.VITE_API_URL || "";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  try {
    const stored = localStorage.getItem("ccf-auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.token ?? null;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function getRefreshToken(): string | null {
  try {
    const stored = localStorage.getItem("ccf-auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.refreshToken ?? null;
    }
  } catch {}
  return null;
}

let isRefreshing = false;

async function tryRefreshToken(): Promise<boolean> {
  if (isRefreshing) return false;
  const refreshToken = getRefreshToken();
  if (!refreshToken || refreshToken.startsWith("mock_")) return false;

  isRefreshing = true;
  try {
    const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const json = await res.json();
    const data = json.data ?? json;

    // Update stored tokens
    const stored = localStorage.getItem("ccf-auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      parsed.state.token = data.accessToken ?? data.token;
      parsed.state.refreshToken = data.refreshToken;
      localStorage.setItem("ccf-auth", JSON.stringify(parsed));
    }
    return true;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Try token refresh before logging out
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry original request with new token
      const newToken = getToken();
      if (newToken) headers["Authorization"] = `Bearer ${newToken}`;
      const retryRes = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (retryRes.ok || retryRes.status !== 401) {
        // Process retry response through the same logic below
        if (retryRes.status === 204) return undefined as T;
        if (!retryRes.ok) {
          const errorBody = await retryRes.json().catch(() => ({}));
          throw new ApiError(retryRes.status, errorBody.message || `Request failed with status ${retryRes.status}`);
        }
        const json = await retryRes.json();
        if (json !== null && typeof json === "object" && "success" in json && "data" in json) {
          return json.data as T;
        }
        return json as T;
      }
    }
    localStorage.removeItem("ccf-auth");
    window.location.href = "/login";
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorBody.message || `Request failed with status ${res.status}`
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const json = await res.json();

  // Unwrap the backend envelope { success, data, error, message }
  // If the response has the envelope shape, return data; otherwise return as-is
  if (
    json !== null &&
    typeof json === "object" &&
    "success" in json &&
    "data" in json
  ) {
    return json.data as T;
  }

  return json as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PATCH", path, body);
}

export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}

export { ApiError };
