import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: { execute: mockExecute },
}));

vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray) => strings.join(""),
}));

import { GET } from "../route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with ok status when DB is connected", async () => {
    mockExecute.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.db).toBe("connected");
    expect(body.dbLatencyMs).toBeTypeOf("number");
    expect(body.responseMs).toBeTypeOf("number");
    expect(body.uptime).toBeTypeOf("number");
    expect(body.timestamp).toBeDefined();
  });

  it("returns 503 with degraded status when DB fails", async () => {
    mockExecute.mockRejectedValue(new Error("Connection refused"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("error");
    expect(body.dbLatencyMs).toBeNull();
  });

  it("returns version field from env or dev fallback", async () => {
    mockExecute.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET();
    const body = await res.json();

    expect(body.version).toBeDefined();
    expect(typeof body.version).toBe("string");
  });
});
