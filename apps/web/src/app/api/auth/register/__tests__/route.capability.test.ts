import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// @/lib/api-helpers transitively imports ./auth → next-auth, which fails to
// resolve under the web vitest env. Mock it to a pass-through withErrorHandler
// so the real register route (and the real PGLite DB flow) load cleanly. The
// gate itself is the requireCapability call inside the handler — unaffected.
vi.mock("@/lib/api-helpers", () => ({
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

const ENV = { ...process.env };
beforeEach(() => {
  vi.resetModules();
  (process.env as Record<string, string>).NODE_ENV = "test";
});
afterEach(() => { process.env = { ...ENV }; vi.restoreAllMocks(); });

async function postRegister(body: unknown) {
  const { POST } = await import("../route");
  return POST(new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("register selfServeSignup gate", () => {
  it("403 on self_host (selfServeSignup off)", async () => {
    process.env.BURNLESS_DEPLOYMENT = "self_host";
    delete process.env.BURNLESS_CAP_SELF_SERVE_SIGNUP;
    const res = await postRegister({ email: "a@b.com", password: "Abcdef12" });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("CAPABILITY_DISABLED");
  });

  it("allows past the gate on cloud (selfServeSignup on)", async () => {
    process.env.BURNLESS_DEPLOYMENT = "cloud";
    const res = await postRegister({ email: "a@b.com", password: "Abcdef12" });
    expect(res.status).not.toBe(403); // proceeds to normal create/validation flow
  });
});
