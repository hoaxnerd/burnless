/**
 * POST /api/browser/install — self-host-only Chromium install trigger (#33 C6).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));
const { mockGetCapabilities } = vi.hoisted(() => ({
  mockGetCapabilities: vi.fn(),
}));
const { mockInstallBrowserEngine } = vi.hoisted(() => ({
  mockInstallBrowserEngine: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  errorResponse: async (msg: string, status: number) => {
    const { NextResponse } = await import("next/server");
    return NextResponse.json({ error: msg }, { status });
  },
  withErrorHandler:
    <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
}));

vi.mock("@/lib/capabilities", () => ({
  getCapabilities: mockGetCapabilities,
}));

vi.mock("@/lib/browser-mcp", () => ({
  installBrowserEngine: mockInstallBrowserEngine,
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({
    userId: "user-1",
    companyId: "company-1",
    role: "owner",
  });
});

describe("POST /api/browser/install", () => {
  it("400s when stdioMcp capability is off (cloud / self-host only)", async () => {
    mockGetCapabilities.mockReturnValue({ stdioMcp: false });
    const res = await (POST as () => Promise<Response>)();
    expect(res.status).toBe(400);
    expect(mockInstallBrowserEngine).not.toHaveBeenCalled();
  });

  it("401s when unauthenticated", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    mockGetCapabilities.mockReturnValue({ stdioMcp: true });
    const res = await (POST as () => Promise<Response>)();
    expect(res.status).toBe(401);
    expect(mockInstallBrowserEngine).not.toHaveBeenCalled();
  });

  it("200s and returns install status when self-host + authed", async () => {
    mockGetCapabilities.mockReturnValue({ stdioMcp: true });
    mockInstallBrowserEngine.mockResolvedValue({ ok: true, log: "Chromium installed" });
    const res = await (POST as () => Promise<Response>)();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockInstallBrowserEngine).toHaveBeenCalledTimes(1);
  });
});
