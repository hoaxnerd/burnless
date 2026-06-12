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

const {
  mockSelect, mockFrom, mockWhere,
  mockResetSessionGrants, mockResetSessionDisabledTools,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockResetSessionGrants: vi.fn(),
  mockResetSessionDisabledTools: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect },
  aiConversations: { id: "id", companyId: "companyId" },
  resetSessionGrants: mockResetSessionGrants,
  resetSessionDisabledTools: mockResetSessionDisabledTools,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { POST } from "../reset-grants/route";

const CONV = "conv-1";

function postReq(body: unknown) {
  return new Request("http://localhost:3000/api/chat/reset-grants", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/chat/reset-grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue({ userId: "u1", companyId: "c1", role: "owner" });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([{ id: CONV }]);
  });

  it("clears BOTH the session grants and the session-disabled tools map", async () => {
    const res = await POST(postReq({ conversationId: CONV }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(mockResetSessionGrants).toHaveBeenCalledWith(CONV);
    expect(mockResetSessionDisabledTools).toHaveBeenCalledWith(CONV);
  });

  it("returns 404 when the conversation is not in the caller's company", async () => {
    mockWhere.mockResolvedValue([]);

    const res = await POST(postReq({ conversationId: CONV }));
    expect(res.status).toBe(404);
    expect(mockResetSessionGrants).not.toHaveBeenCalled();
    expect(mockResetSessionDisabledTools).not.toHaveBeenCalled();
  });

  it("returns 400 for a bad body", async () => {
    const res = await POST(postReq({ conversationId: "" }));
    expect(res.status).toBe(400);
  });
});
