/**
 * Desktop app response format helpers.
 *
 * The Rust desktop app expects every response in the shape:
 * { success: boolean, data: T | null, error: string | null, message: string }
 */

export interface DesktopApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  message: string;
}

export function desktopResponse<T = unknown>(
  success: boolean,
  data?: T | null,
  error?: string | null,
  message?: string,
): DesktopApiResponse<T> {
  return {
    success,
    data: data ?? null,
    error: error ?? null,
    message: message ?? "",
  };
}

/**
 * Admin panel response wrapper - used for paginated lists.
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
