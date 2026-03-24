import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const mockCreateProvider = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/ai", () => ({
  createProvider: mockCreateProvider,
}));

import { POST } from "../route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai-features/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const authCtx = { userId: "user-1", companyId: "company-1", role: "admin" };

describe("ai-features/test-connection POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(authCtx);
    mockRequireRole.mockReturnValue(null);
  });

  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await POST(makeRequest({ provider: "openai", apiKey: "sk-test" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(makeRequest({ provider: "openai", apiKey: "sk-test" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when provider init fails", async () => {
    mockCreateProvider.mockReturnValue(null);
    const res = await POST(makeRequest({ provider: "openai", apiKey: "sk-test" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it("returns ok when connection succeeds", async () => {
    mockCreateProvider.mockReturnValue({
      complete: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Hello!" }],
      }),
    });
    const res = await POST(makeRequest({ provider: "anthropic", apiKey: "sk-ant-test" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.response).toBe("Hello!");
  });

  it("returns 400 when provider call fails", async () => {
    mockCreateProvider.mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error("Invalid API key")),
    });
    const res = await POST(makeRequest({ provider: "openai", apiKey: "bad-key" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Invalid API key");
  });

  it("allows ollama without apiKey", async () => {
    mockCreateProvider.mockReturnValue({
      complete: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Hi" }],
      }),
    });
    const res = await POST(makeRequest({ provider: "ollama" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("requires apiKey for non-ollama providers", async () => {
    const res = await POST(makeRequest({ provider: "openai" }));
    expect(res.status).toBe(400);
  });

  it("accepts optional model and baseUrl", async () => {
    mockCreateProvider.mockReturnValue({
      complete: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "OK" }],
      }),
    });
    const res = await POST(makeRequest({
      provider: "openrouter",
      apiKey: "sk-or-test",
      model: "anthropic/claude-3-haiku",
      baseUrl: "https://openrouter.ai/api/v1",
    }));
    expect(res.status).toBe(200);
    expect(mockCreateProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openrouter",
        model: "anthropic/claude-3-haiku",
        baseUrl: "https://openrouter.ai/api/v1",
      }),
    );
  });
});
