import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockCreateProvider, mockComplete } = vi.hoisted(() => ({
  mockCreateProvider: vi.fn(),
  mockComplete: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@burnless/ai", () => ({
  createProvider: mockCreateProvider,
}));

const CTX = { userId: "u1", companyId: "c1", role: "admin" };

describe("POST /api/ai-features/test-connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { POST } = await import("../test-connection/route");
    const res = await POST(
      new Request("http://localhost/api/ai-features/test-connection", {
        method: "POST",
        body: JSON.stringify({ provider: "anthropic", apiKey: "sk-test" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ ...CTX, role: "viewer" });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    );

    const { POST } = await import("../test-connection/route");
    const res = await POST(
      new Request("http://localhost/api/ai-features/test-connection", {
        method: "POST",
        body: JSON.stringify({ provider: "anthropic", apiKey: "sk-test" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid body (missing provider)", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockRequireRole.mockReturnValue(null);

    const { POST } = await import("../test-connection/route");
    const res = await POST(
      new Request("http://localhost/api/ai-features/test-connection", {
        method: "POST",
        body: JSON.stringify({ apiKey: "sk-test" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid body (invalid provider)", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockRequireRole.mockReturnValue(null);

    const { POST } = await import("../test-connection/route");
    const res = await POST(
      new Request("http://localhost/api/ai-features/test-connection", {
        method: "POST",
        body: JSON.stringify({ provider: "gemini", apiKey: "sk-test" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when provider fails to initialize", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockRequireRole.mockReturnValue(null);
    mockCreateProvider.mockReturnValue(null);

    const { POST } = await import("../test-connection/route");
    const res = await POST(
      new Request("http://localhost/api/ai-features/test-connection", {
        method: "POST",
        body: JSON.stringify({ provider: "anthropic", apiKey: "sk-test" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it("returns ok: true on successful connection", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockRequireRole.mockReturnValue(null);
    mockComplete.mockResolvedValue({
      content: [{ type: "text", text: "Hi there!" }],
      stopReason: "end_turn",
    });
    mockCreateProvider.mockReturnValue({ complete: mockComplete });

    const { POST } = await import("../test-connection/route");
    const res = await POST(
      new Request("http://localhost/api/ai-features/test-connection", {
        method: "POST",
        body: JSON.stringify({ provider: "anthropic", apiKey: "sk-ant-valid" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.response).toBe("Hi there!");
  });

  it("returns ok: false with error message on provider error", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockRequireRole.mockReturnValue(null);
    mockComplete.mockRejectedValue(new Error("Invalid API key"));
    mockCreateProvider.mockReturnValue({ complete: mockComplete });

    const { POST } = await import("../test-connection/route");
    const res = await POST(
      new Request("http://localhost/api/ai-features/test-connection", {
        method: "POST",
        body: JSON.stringify({ provider: "openai", apiKey: "sk-bad-key" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid API key");
  });

  it("truncates long responses to 100 chars", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockRequireRole.mockReturnValue(null);
    const longText = "a".repeat(200);
    mockComplete.mockResolvedValue({
      content: [{ type: "text", text: longText }],
      stopReason: "end_turn",
    });
    mockCreateProvider.mockReturnValue({ complete: mockComplete });

    const { POST } = await import("../test-connection/route");
    const res = await POST(
      new Request("http://localhost/api/ai-features/test-connection", {
        method: "POST",
        body: JSON.stringify({ provider: "anthropic", apiKey: "sk-test" }),
      })
    );
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.response.length).toBe(100);
  });

  it("passes model and baseUrl to createProvider when provided", async () => {
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockRequireRole.mockReturnValue(null);
    mockComplete.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      stopReason: "end_turn",
    });
    mockCreateProvider.mockReturnValue({ complete: mockComplete });

    const { POST } = await import("../test-connection/route");
    await POST(
      new Request("http://localhost/api/ai-features/test-connection", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          apiKey: "sk-or-test",
          model: "anthropic/claude-sonnet-4-20250514",
          baseUrl: "https://openrouter.ai/api/v1",
        }),
      })
    );

    expect(mockCreateProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openrouter",
        apiKey: "sk-or-test",
        model: "anthropic/claude-sonnet-4-20250514",
        baseUrl: "https://openrouter.ai/api/v1",
      })
    );
  });
});
