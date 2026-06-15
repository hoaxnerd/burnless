/**
 * API helpers test suite — BUR-68
 *
 * Tests the shared API validation and RBAC logic used across all routes
 * including revenue-streams, metrics, and other endpoints.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { logInfoMock, logErrorMock } = vi.hoisted(() => ({
  logInfoMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

// Mock auth and db before importing api-helpers
vi.mock("../auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));
vi.mock("@burnless/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  companyMembers: {},
  companies: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));
vi.mock("../logger", () => ({
  logger: () => ({ info: logInfoMock, error: logErrorMock, warn: vi.fn(), debug: vi.fn() }),
}));

import { requireRole, errorResponse, parseBody, withErrorHandler } from "../api-helpers";

describe("errorResponse", () => {
  it("returns JSON error with correct status", async () => {
    const res = errorResponse("Not found", 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("returns 400 for validation errors", async () => {
    const res = errorResponse("scenarioId required", 400);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("scenarioId required");
  });

  it("returns 401 for unauthorized", async () => {
    const res = errorResponse("Unauthorized", 401);
    expect(res.status).toBe(401);
  });
});

describe("requireRole", () => {
  it("allows owner for any role", () => {
    expect(requireRole({ role: "owner" }, "viewer")).toBeNull();
    expect(requireRole({ role: "owner" }, "editor")).toBeNull();
    expect(requireRole({ role: "owner" }, "admin")).toBeNull();
    expect(requireRole({ role: "owner" }, "owner")).toBeNull();
  });

  it("allows admin for admin and below", () => {
    expect(requireRole({ role: "admin" }, "viewer")).toBeNull();
    expect(requireRole({ role: "admin" }, "editor")).toBeNull();
    expect(requireRole({ role: "admin" }, "admin")).toBeNull();
  });

  it("blocks admin from owner-only actions", async () => {
    const res = requireRole({ role: "admin" }, "owner");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("allows editor for editor and viewer", () => {
    expect(requireRole({ role: "editor" }, "viewer")).toBeNull();
    expect(requireRole({ role: "editor" }, "editor")).toBeNull();
  });

  it("blocks editor from admin actions", async () => {
    const res = requireRole({ role: "editor" }, "admin");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toContain("admin");
  });

  it("blocks viewer from editor actions", async () => {
    const res = requireRole({ role: "viewer" }, "editor");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("blocks viewer from all write operations", () => {
    expect(requireRole({ role: "viewer" }, "editor")).not.toBeNull();
    expect(requireRole({ role: "viewer" }, "admin")).not.toBeNull();
    expect(requireRole({ role: "viewer" }, "owner")).not.toBeNull();
  });

  it("allows viewer to view", () => {
    expect(requireRole({ role: "viewer" }, "viewer")).toBeNull();
  });

  it("blocks unknown roles", () => {
    const res = requireRole({ role: "unknown" }, "viewer");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });
});

describe("withErrorHandler — logging (E2)", () => {
  beforeEach(() => {
    logInfoMock.mockReset();
    logErrorMock.mockReset();
  });

  it("logs a concise info completion line on success (method, path, status, duration)", async () => {
    const handler = withErrorHandler(async (_request: Request) =>
      errorResponse("ok", 200)
    );
    const req = new Request("http://localhost/api/metrics?secret=should-not-log", {
      method: "GET",
      headers: { "x-request-id": "req-123" },
    });
    await handler(req);

    expect(logInfoMock).toHaveBeenCalledTimes(1);
    const [ctx, msg] = logInfoMock.mock.calls[0]!;
    expect(ctx).toMatchObject({
      requestId: "req-123",
      method: "GET",
      pathname: "/api/metrics",
      status: 200,
    });
    expect(typeof (ctx as { durationMs: number }).durationMs).toBe("number");
    expect(msg).toBe("GET /api/metrics 200");
    // Never logs query strings / bodies.
    expect(JSON.stringify({ ctx, msg })).not.toContain("secret");
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("logs an error line and returns a safe 500 when the handler throws", async () => {
    const handler = withErrorHandler(async (_request: Request) => {
      throw new Error("boom: connection refused at 10.0.0.1:5432");
    });
    const req = new Request("http://localhost/api/transactions", { method: "POST" });
    const res = await handler(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");

    expect(logErrorMock).toHaveBeenCalledTimes(1);
    const [ctx, msg] = logErrorMock.mock.calls[0]!;
    expect(ctx).toMatchObject({ method: "POST", pathname: "/api/transactions" });
    expect((ctx as { err: Error }).err).toBeInstanceOf(Error);
    expect(msg).toBe("POST /api/transactions failed");
    // The thrown 500 path must NOT also emit a success info line.
    expect(logInfoMock).not.toHaveBeenCalled();
  });

  it("does not throw when the handler takes no Request arg (declared () => …)", async () => {
    const handler = withErrorHandler(async () => errorResponse("ok", 204));
    const res = await (handler as () => Promise<Response>)();
    expect(res.status).toBe(204);
    expect(logInfoMock).toHaveBeenCalledTimes(1);
    const [ctx] = logInfoMock.mock.calls[0]!;
    expect(ctx).toMatchObject({ method: "UNKNOWN", pathname: "unknown", status: 204 });
  });
});

describe("parseBody", () => {
  const testSchema = {
    parse: (data: unknown) => {
      const d = data as Record<string, unknown>;
      if (!d.name || typeof d.name !== "string") {
        throw new Error("name is required");
      }
      return { name: d.name as string };
    },
  };

  it("parses valid JSON body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ name: "SaaS Revenue" }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await parseBody(req, testSchema);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.name).toBe("SaaS Revenue");
    }
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const result = await parseBody(req, testSchema);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
    }
  });

  it("returns 400 when schema validation fails", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ notName: 123 }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await parseBody(req, testSchema);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
    }
  });
});
