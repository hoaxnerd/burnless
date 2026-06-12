import { describe, it, expect, vi, beforeEach } from "vitest";

// The route captures `const CRON_SECRET = process.env.CRON_SECRET` and
// `SKIP_CRON_AUTH` at module-eval time, so seed them before the import below.
vi.hoisted(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.DISABLE_CRON_AUTH = "false";
});

// ── Hoisted boundary mock ────────────────────────────────────────────────────
// Plan Task 4: mock at the delegation boundary (runWeeklyDigest), not internals.
const { mockRunWeeklyDigest } = vi.hoisted(() => ({
  mockRunWeeklyDigest: vi.fn(),
}));

vi.mock("@/lib/cron/weekly-digest", () => ({
  runWeeklyDigest: mockRunWeeklyDigest,
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/lib/api-helpers", () => ({
  withErrorHandler: (handler: (...args: unknown[]) => unknown) => handler,
}));

import { GET } from "../route";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/cron/weekly-digest", { headers });
}

const ENVELOPE = { ok: true as const, generated: 3, total: 5, results: [{ companyId: "c1", status: "sent" }] };

describe("GET /api/cron/weekly-digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunWeeklyDigest.mockResolvedValue(ENVELOPE);
  });

  it("returns the envelope runWeeklyDigest resolves and calls it once on the authed path", async () => {
    const res = await GET(makeRequest({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(ENVELOPE);
    expect(mockRunWeeklyDigest).toHaveBeenCalledTimes(1);
  });

  it("returns 401 (and does not call runWeeklyDigest) with a wrong bearer secret", async () => {
    const res = await GET(makeRequest({ authorization: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    expect(mockRunWeeklyDigest).not.toHaveBeenCalled();
  });

  it("returns 401 (and does not call runWeeklyDigest) with a missing bearer secret", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockRunWeeklyDigest).not.toHaveBeenCalled();
  });
});
