import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
  errorResponse: (message: string, status: number) =>
    NextResponse.json({ error: message }, { status }),
}));

const { mockSelect, mockFrom, mockWhere, mockSetSessionDisabledTool, mockGetSessionDisabledTools } =
  vi.hoisted(() => ({
    mockSelect: vi.fn(),
    mockFrom: vi.fn(),
    mockWhere: vi.fn(),
    mockSetSessionDisabledTool: vi.fn(),
    mockGetSessionDisabledTools: vi.fn(),
  }));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect },
  aiConversations: { id: "id", companyId: "companyId" },
  setSessionDisabledTool: mockSetSessionDisabledTool,
  getSessionDisabledTools: mockGetSessionDisabledTools,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { PATCH, GET } from "../session-tools/route";

const CONV = "11111111-1111-1111-1111-111111111111";

function patchReq(body: unknown) {
  return new Request("http://localhost:3000/api/chat/session-tools", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function getReq(conversationId?: string) {
  const url = new URL("http://localhost:3000/api/chat/session-tools");
  if (conversationId !== undefined) url.searchParams.set("conversationId", conversationId);
  return new Request(url, { method: "GET" });
}

describe("PATCH /api/chat/session-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue({ userId: "u1", companyId: "c1", role: "owner" });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    // conversation belongs to the company by default
    mockWhere.mockResolvedValue([{ id: CONV }]);
  });

  it("sets a session-disabled tool and returns the updated map", async () => {
    mockGetSessionDisabledTools.mockResolvedValue({ "builtin:get_metrics": true });

    const res = await PATCH(patchReq({ conversationId: CONV, key: "builtin:get_metrics", disabled: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockSetSessionDisabledTool).toHaveBeenCalledWith(CONV, "builtin:get_metrics", true);
    expect(body).toEqual({ "builtin:get_metrics": true });
  });

  it("returns 404 when the conversation is not in the caller's company", async () => {
    mockWhere.mockResolvedValue([]);

    const res = await PATCH(patchReq({ conversationId: CONV, key: "builtin:x", disabled: true }));
    expect(res.status).toBe(404);
    expect(mockSetSessionDisabledTool).not.toHaveBeenCalled();
  });

  it("returns 400 for a bad body (non-uuid conversationId)", async () => {
    const res = await PATCH(patchReq({ conversationId: "not-a-uuid", key: "x", disabled: true }));
    expect(res.status).toBe(400);
    expect(mockSetSessionDisabledTool).not.toHaveBeenCalled();
  });

  it("returns 400 when disabled is missing", async () => {
    const res = await PATCH(patchReq({ conversationId: CONV, key: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns the auth error when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await PATCH(patchReq({ conversationId: CONV, key: "x", disabled: true }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/chat/session-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue({ userId: "u1", companyId: "c1", role: "owner" });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([{ id: CONV }]);
  });

  it("returns the session-disabled map for an owned conversation", async () => {
    mockGetSessionDisabledTools.mockResolvedValue({ "builtin:get_metrics": true });

    const res = await GET(getReq(CONV));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetSessionDisabledTools).toHaveBeenCalledWith(CONV);
    expect(body).toEqual({ "builtin:get_metrics": true });
  });

  it("returns 404 when the conversation is not in the caller's company", async () => {
    mockWhere.mockResolvedValue([]);

    const res = await GET(getReq(CONV));
    expect(res.status).toBe(404);
    expect(mockGetSessionDisabledTools).not.toHaveBeenCalled();
  });

  it("returns 400 when conversationId is missing", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(400);
    expect(mockGetSessionDisabledTools).not.toHaveBeenCalled();
  });
});
