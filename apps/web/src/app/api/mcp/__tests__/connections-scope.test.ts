import { describe, it, expect, afterEach } from "vitest";

// `resolveOwnerScope` lives in its own sibling module (`connections/owner-scope.ts`),
// NOT in `route.ts` — the Next.js App Router rejects non-HTTP-method exports from a
// route file at build time. The helper depends solely on `getCapabilities()` (real,
// reads process.env), so no server deps need stubbing.

describe("resolveOwnerScope", () => {
  const ORIG = process.env;
  afterEach(() => {
    process.env = ORIG;
  });
  it("forces company under self_host", async () => {
    process.env = { ...ORIG };
    delete process.env.BURNLESS_DEPLOYMENT;
    const { resolveOwnerScope } = await import("../connections/owner-scope");
    expect(resolveOwnerScope("personal")).toBe("company");
  });
  it("honors personal under cloud", async () => {
    process.env = { ...ORIG, BURNLESS_DEPLOYMENT: "cloud" };
    const { resolveOwnerScope } = await import("../connections/owner-scope");
    expect(resolveOwnerScope("personal")).toBe("personal");
  });
});
