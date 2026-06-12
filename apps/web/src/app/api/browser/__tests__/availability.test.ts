import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

const { mockIsBrowserUseAvailable } = vi.hoisted(() => ({
  mockIsBrowserUseAvailable: vi.fn(),
}));

vi.mock("@/lib/browser-mcp", () => ({
  isBrowserUseAvailable: mockIsBrowserUseAvailable,
}));

import { GET } from "../availability/route";

describe("GET /api/browser/availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "u1",
      companyId: "c1",
      role: "owner",
    });
  });

  it("returns the { connected, chromiumInstalled } shape from isBrowserUseAvailable", async () => {
    mockIsBrowserUseAvailable.mockResolvedValue({ connected: true, chromiumInstalled: false });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ connected: true, chromiumInstalled: false });
    expect(mockIsBrowserUseAvailable).toHaveBeenCalledWith("c1", "u1");
  });

  it("stays callable and returns the shape even when both are false", async () => {
    mockIsBrowserUseAvailable.mockResolvedValue({ connected: false, chromiumInstalled: false });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ connected: false, chromiumInstalled: false });
  });

  it("returns the auth error when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockIsBrowserUseAvailable).not.toHaveBeenCalled();
  });
});
