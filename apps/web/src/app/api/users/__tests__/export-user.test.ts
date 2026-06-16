import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
}));

const mockGetAuthUser = vi.hoisted(() => vi.fn());
const mockGetTurnEvents = vi.hoisted(() => vi.fn());
const mockProjectTimeline = vi.hoisted(() => vi.fn());

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
  },
  getTurnEvents: mockGetTurnEvents,
  users: { id: "id", name: "name", email: "email", emailVerified: "email_verified", image: "image", createdAt: "created_at", updatedAt: "updated_at" },
  companies: { id: "id" },
  companyMembers: { userId: "user_id", companyId: "company_id" },
  financialAccounts: { companyId: "company_id" },
  transactions: { companyId: "company_id" },
  scenarios: { companyId: "company_id", id: "id" },
  forecastLines: { scenarioId: "scenario_id", id: "id" },
  forecastValues: { forecastLineId: "forecast_line_id" },
  departments: { companyId: "company_id", id: "id" },
  headcountPlans: { scenarioId: "scenario_id" },
  revenueStreams: { scenarioId: "scenario_id" },
  fundingRounds: { companyId: "company_id" },
  metrics: { companyId: "company_id" },
  integrations: { companyId: "company_id" },
  importBatches: { companyId: "company_id" },
  aiFeatureFlags: { companyId: "company_id" },
  aiConversations: { userId: "user_id", companyId: "company_id", id: "id" },
  aiInsightCache: { companyId: "company_id" },
}));

vi.mock("@burnless/ai", () => ({
  projectTimeline: mockProjectTimeline,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthUser: mockGetAuthUser,
  errorResponse: (message: string, status: number) => {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  },
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

import { GET } from "../me/export/route";
import {
  users as usersTable,
  companyMembers as companyMembersTable,
  companies as companiesTable,
  aiConversations as aiConversationsTable,
} from "@burnless/db";

describe("GET /api/users/me/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default chain setup
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, orderBy: vi.fn().mockResolvedValue([]) });
    mockGetTurnEvents.mockResolvedValue([]);
    mockProjectTimeline.mockReturnValue({ messages: [], openGate: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns minimal export when user has no companies", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });

    // First call: user profile
    let callCount = 0;
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: (_cond: unknown) => {
          callCount++;
          if (callCount === 1) {
            // user profile
            return {
              limit: () =>
                Promise.resolve([
                  {
                    id: "user-1",
                    name: "Test User",
                    email: "test@example.com",
                    emailVerified: null,
                    image: null,
                    createdAt: new Date("2026-01-01"),
                    updatedAt: new Date("2026-01-01"),
                  },
                ]),
            };
          }
          // memberships - empty
          return Promise.resolve([]);
        },
      }),
    }));

    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe("test@example.com");
    expect(data.companies).toEqual([]);
    expect(data.memberships).toEqual([]);
  });

  it("sets Content-Disposition header for file download", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });

    let callCount = 0;
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: () =>
                Promise.resolve([
                  {
                    id: "user-1",
                    name: "Test",
                    email: "test@test.com",
                    emailVerified: null,
                    image: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ]),
            };
          }
          return Promise.resolve([]);
        },
      }),
    }));

    const res = await GET();
    const disposition = res.headers.get("content-disposition");
    expect(disposition).toContain("burnless-data-export-");
    expect(disposition).toContain(".json");
  });

  it("does not include passwordHash in export", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });

    let callCount = 0;
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => {
          callCount++;
          if (callCount === 1) {
            return {
              limit: () =>
                Promise.resolve([
                  {
                    id: "user-1",
                    name: "Test",
                    email: "test@test.com",
                    emailVerified: null,
                    image: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ]),
            };
          }
          return Promise.resolve([]);
        },
      }),
    }));

    const res = await GET();
    const text = await res.text();
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("password_hash");
  });

  it("exports per-conversation messages projected from the turn-event log", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });

    // Key the mock off the TABLE passed to `.from()` (the sentinel objects from
    // the @burnless/db mock above) rather than call ordinal — robust to Batch 1
    // query reordering. The first `users` query (profile) takes the `.limit()`
    // path; the rest resolve directly.
    mockSelect.mockImplementation(() => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === usersTable) {
            return {
              limit: () =>
                Promise.resolve([
                  {
                    id: "user-1",
                    name: "Test",
                    email: "test@test.com",
                    emailVerified: null,
                    image: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ]),
            };
          }
          if (table === companyMembersTable) {
            return Promise.resolve([{ companyId: "company-1", userId: "user-1" }]);
          }
          if (table === companiesTable) {
            return Promise.resolve([{ id: "company-1" }]);
          }
          if (table === aiConversationsTable) {
            return Promise.resolve([{ id: "conv-1", companyId: "company-1", userId: "user-1" }]);
          }
          return Promise.resolve([]);
        },
      }),
    }));

    // The export projects each conversation's messages from its turn-event log.
    mockGetTurnEvents.mockResolvedValue([{ id: "e1", type: "user_message", seq: 0 }]);
    mockProjectTimeline.mockReturnValue({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
      openGate: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(mockGetTurnEvents).toHaveBeenCalledWith("conv-1");
    expect(data.aiConversations).toHaveLength(1);
    expect(data.aiConversations[0].id).toBe("conv-1");
    expect(data.aiConversations[0].messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });
});
