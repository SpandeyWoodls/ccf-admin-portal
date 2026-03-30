import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function parsePagination(query: Record<string, unknown>) {
  const result = paginationSchema.safeParse(query);
  if (!result.success) {
    return { page: 1, pageSize: 20 };
  }
  return result.data;
}
