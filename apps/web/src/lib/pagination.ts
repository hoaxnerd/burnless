/**
 * Cursor-based pagination utilities for API list endpoints.
 *
 * Usage in a route:
 *   const { limit, cursor } = parsePaginationParams(request);
 *   const rows = await db.select()...limit(limit + 1);
 *   return NextResponse.json(paginatedResponse(rows, limit));
 */

/** Default and maximum page sizes. */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface PaginationParams {
  limit: number;
  cursor: string | null;
}

/**
 * Parse pagination query parameters from a request URL.
 *
 * Supports:
 *   ?limit=50    — items per page (default 50, max 200)
 *   ?cursor=xxx  — opaque cursor for next page (typically an ID or timestamp)
 */
export function parsePaginationParams(request: Request): PaginationParams {
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor");

  let limit = DEFAULT_PAGE_SIZE;
  if (rawLimit) {
    const parsed = parseInt(rawLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_PAGE_SIZE);
    }
  }

  return { limit, cursor };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    count: number;
  };
}

/**
 * Build a paginated response from query results.
 *
 * The caller should fetch `limit + 1` rows. If we get more than `limit`,
 * there are more pages. The extra row is stripped from the response.
 *
 * @param rows - Query results (fetch limit + 1 to detect next page)
 * @param limit - The requested page size
 * @param cursorField - The field to use as cursor for the next page (default: "id")
 */
export function paginatedResponse<T extends Record<string, unknown>>(
  rows: T[],
  limit: number,
  cursorField: keyof T = "id" as keyof T,
): PaginatedResponse<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = data[data.length - 1];
  const nextCursor = hasMore && lastItem ? String(lastItem[cursorField]) : null;

  return {
    data,
    pagination: {
      hasMore,
      nextCursor,
      count: data.length,
    },
  };
}
