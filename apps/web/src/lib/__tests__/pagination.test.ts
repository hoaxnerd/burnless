import { describe, it, expect } from "vitest";
import {
  parsePaginationParams,
  paginatedResponse,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../pagination";

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/test");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

describe("parsePaginationParams", () => {
  it("returns defaults when no params", () => {
    const { limit, cursor } = parsePaginationParams(makeRequest());
    expect(limit).toBe(DEFAULT_PAGE_SIZE);
    expect(cursor).toBeNull();
  });

  it("parses limit and cursor", () => {
    const { limit, cursor } = parsePaginationParams(
      makeRequest({ limit: "25", cursor: "abc123" })
    );
    expect(limit).toBe(25);
    expect(cursor).toBe("abc123");
  });

  it("clamps limit to MAX_PAGE_SIZE", () => {
    const { limit } = parsePaginationParams(makeRequest({ limit: "999" }));
    expect(limit).toBe(MAX_PAGE_SIZE);
  });

  it("ignores invalid limit values", () => {
    expect(parsePaginationParams(makeRequest({ limit: "abc" })).limit).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePaginationParams(makeRequest({ limit: "-5" })).limit).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePaginationParams(makeRequest({ limit: "0" })).limit).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe("paginatedResponse", () => {
  it("returns hasMore=false when rows <= limit", () => {
    const rows = [{ id: "1" }, { id: "2" }];
    const result = paginatedResponse(rows, 5);
    expect(result.data).toHaveLength(2);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.count).toBe(2);
  });

  it("returns hasMore=true and nextCursor when rows > limit", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = paginatedResponse(rows, 2);
    expect(result.data).toHaveLength(2);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextCursor).toBe("b");
    expect(result.pagination.count).toBe(2);
  });

  it("supports custom cursor field", () => {
    const rows = [
      { id: "1", createdAt: "2024-01-01" },
      { id: "2", createdAt: "2024-01-02" },
      { id: "3", createdAt: "2024-01-03" },
    ];
    const result = paginatedResponse(rows, 2, "createdAt");
    expect(result.pagination.nextCursor).toBe("2024-01-02");
  });

  it("handles empty results", () => {
    const result = paginatedResponse([], 10);
    expect(result.data).toHaveLength(0);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.count).toBe(0);
  });

  it("handles exactly limit rows (no extra)", () => {
    const rows = [{ id: "1" }, { id: "2" }, { id: "3" }];
    const result = paginatedResponse(rows, 3);
    expect(result.data).toHaveLength(3);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
  });
});
