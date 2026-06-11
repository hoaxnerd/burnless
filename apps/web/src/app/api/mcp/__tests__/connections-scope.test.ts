import { describe, it, expect, afterEach, vi } from "vitest";

// The route module value-imports server-only deps (api-helpers → next-auth,
// @burnless/db, next/cache) that don't resolve in the vitest node env. We only
// exercise the PURE `resolveOwnerScope` helper, which depends solely on
// `getCapabilities()` (real, reads process.env) — so stub the heavy deps to
// make the module importable without touching the capability path under test.
vi.mock("@/lib/api-helpers", () => ({
  withErrorHandler: (fn: unknown) => fn,
  requireCompanyAccess: vi.fn(),
  requireRole: vi.fn(),
  parseBody: vi.fn(),
}));
vi.mock("@burnless/db", () => ({
  listVisibleConnections: vi.fn(),
  createMcpConnection: vi.fn(),
  updateMcpConnection: vi.fn(),
  getDecryptedMcpSecret: vi.fn(),
}));
vi.mock("@burnless/mcp", () => ({
  parseMcpConfig: vi.fn(),
  McpConfigError: class extends Error {},
}));
vi.mock("@/lib/mcp/probe", () => ({
  probeConnection: vi.fn(),
  specFromRow: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

describe("resolveOwnerScope", () => {
  const ORIG = process.env;
  afterEach(() => {
    process.env = ORIG;
  });
  it("forces company under self_host", async () => {
    process.env = { ...ORIG };
    delete process.env.BURNLESS_DEPLOYMENT;
    const { resolveOwnerScope } = await import("../connections/route");
    expect(resolveOwnerScope("personal")).toBe("company");
  });
  it("honors personal under cloud", async () => {
    process.env = { ...ORIG, BURNLESS_DEPLOYMENT: "cloud" };
    const { resolveOwnerScope } = await import("../connections/route");
    expect(resolveOwnerScope("personal")).toBe("personal");
  });
});
