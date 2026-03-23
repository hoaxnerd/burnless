import { describe, it, expect, vi, beforeEach } from "vitest";

// Must be in vi.hoisted to run before module-level const CRON_SECRET = process.env.CRON_SECRET
vi.hoisted(() => {
  process.env.CRON_SECRET = "test-cron-secret";
});

const { mockSelect, mockFrom, mockInsert, mockValues, mockOnConflictDoUpdate, mockUpdate, mockSet, mockUpdateWhere } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockOnConflictDoUpdate: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  companies: { id: "id", ownerId: "ownerId" },
  users: { id: "id", email: "email" },
  weeklyDigests: {
    companyId: "companyId",
    weekStart: "weekStart",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

const { mockComputeWeeklyDigest, mockBuildDeterministicSummary } = vi.hoisted(() => ({
  mockComputeWeeklyDigest: vi.fn(),
  mockBuildDeterministicSummary: vi.fn(),
}));
vi.mock("@/lib/compute-digest", () => ({
  computeWeeklyDigest: mockComputeWeeklyDigest,
  buildDeterministicSummary: mockBuildDeterministicSummary,
}));

const { mockGenerateDigestNarrative } = vi.hoisted(() => ({
  mockGenerateDigestNarrative: vi.fn(),
}));
vi.mock("@/lib/digest-narrative", () => ({
  generateDigestNarrative: mockGenerateDigestNarrative,
}));

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  email: { provider: { send: mockSend } },
}));

vi.mock("@/lib/email/templates", () => ({
  weeklyDigestEmail: vi.fn().mockReturnValue({
    subject: "Weekly Digest",
    html: "<p>digest</p>",
    text: "digest",
  }),
}));

const { mockGetAiFlags } = vi.hoisted(() => ({
  mockGetAiFlags: vi.fn(),
}));
vi.mock("@/lib/ai-feature-flags", () => ({
  getAiFlags: mockGetAiFlags,
}));

vi.mock("@/lib/api-helpers", () => ({
  withErrorHandler: (handler: (...args: unknown[]) => unknown) => handler,
}));

import { GET } from "../route";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/cron/weekly-digest", {
    headers: {
      authorization: `Bearer test-cron-secret`,
      ...headers,
    },
  });
}

describe("GET /api/cron/weekly-digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Insert chain
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockOnConflictDoUpdate.mockResolvedValue([]);

    // Update chain
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue([]);
  });

  it("returns 401 with wrong auth secret", async () => {
    const req = new Request("http://localhost:3000/api/cron/weekly-digest", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns ok with empty results when no companies exist", async () => {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.total).toBe(0);
    expect(body.generated).toBe(0);
    expect(body.results).toEqual([]);
  });

  it("skips companies with digest feature disabled", async () => {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockResolvedValue([{ id: "c1", name: "Co1", ownerId: "u1" }]);

    mockGetAiFlags.mockResolvedValue({
      features: { weeklyDigest: false },
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.results[0].status).toBe("skipped_disabled");
    expect(body.generated).toBe(0);
  });

  it("skips companies without scenario data", async () => {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockResolvedValue([{ id: "c1", name: "Co1", ownerId: "u1" }]);

    mockGetAiFlags.mockResolvedValue({
      features: { weeklyDigest: true },
    });
    mockComputeWeeklyDigest.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.results[0].status).toBe("skipped_no_scenario");
  });

  it("handles errors gracefully and continues processing", async () => {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockResolvedValue([
      { id: "c1", name: "Co1", ownerId: "u1" },
      { id: "c2", name: "Co2", ownerId: "u2" },
    ]);

    mockGetAiFlags.mockRejectedValueOnce(new Error("DB error"));
    mockGetAiFlags.mockResolvedValueOnce({
      features: { weeklyDigest: false },
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.results[0].status).toContain("error");
    expect(body.results[1].status).toBe("skipped_disabled");
  });
});
