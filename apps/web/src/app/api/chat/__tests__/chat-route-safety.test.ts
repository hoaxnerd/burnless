// apps/web/src/app/api/chat/__tests__/chat-route-safety.test.ts
//
// Plan 5 scenario-safety + open-gate cleanup on the main chat route. Mirrors chat.test.ts's
// mocked-DB harness verbatim (auth / rate-limit / feature-flags / SSE responder /
// tool executor all mocked; the db chain is a plain mock), and adds:
//   - the real (unmocked) scenario-middleware for the dual-channel guard.
// scenario-middleware reads request.headers.get("Cookie"); happy-dom strips the
// forbidden "Cookie" header off a real Request, so the mismatch test uses a hand-
// rolled minimal Request shape (mirrors resume-scenario-safety.test.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockOrderBy,
  mockInsert,
  mockValues,
  mockReturning,
  mockUpdate,
  mockSet,
  mockInnerJoin,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockOrderBy: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockInnerJoin: vi.fn(),
}));

const { mockApplyRateLimit } = vi.hoisted(() => ({
  mockApplyRateLimit: vi.fn(),
}));

const { mockCheckAiFeatureAllowed, mockGetCompanyProviderConfig } = vi.hoisted(
  () => ({
    mockCheckAiFeatureAllowed: vi.fn(),
    mockGetCompanyProviderConfig: vi.fn(),
  })
);

const { mockChatStream } = vi.hoisted(() => ({
  mockChatStream: vi.fn(),
}));

const { mockExecuteToolCall } = vi.hoisted(() => ({
  mockExecuteToolCall: vi.fn(),
}));

const { mockBuildAiContext } = vi.hoisted(() => ({
  mockBuildAiContext: vi.fn(),
}));

const { mockGetDefaultScenario } = vi.hoisted(() => ({
  mockGetDefaultScenario: vi.fn(),
}));

const { mockSetTrackingCompanyId } = vi.hoisted(() => ({
  mockSetTrackingCompanyId: vi.fn(),
}));

const { mockGetAiFlags } = vi.hoisted(() => ({
  mockGetAiFlags: vi.fn(),
}));

const { mockGetOverrideCount } = vi.hoisted(() => ({
  mockGetOverrideCount: vi.fn(),
}));

const { mockBuildChatSSEResponse } = vi.hoisted(() => ({
  mockBuildChatSSEResponse: vi.fn(),
}));

const { mockResolveOpenGate } = vi.hoisted(() => ({
  mockResolveOpenGate: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/api-rate-limit", () => ({
  applyRateLimit: mockApplyRateLimit,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  getOverrideCount: mockGetOverrideCount,
  getPermissionDefaults: vi.fn().mockResolvedValue(null),
  getSessionGrants: vi.fn().mockResolvedValue({}),
  // S3b §11 disabled-tools overlay: default to nothing disabled.
  getSessionDisabledTools: vi.fn().mockResolvedValue({}),
  getDisabledBuiltinTools: vi.fn().mockResolvedValue([]),
  // The chat POST appends a user_message turn-event (sole conversation store).
  appendTurnEvent: vi.fn().mockResolvedValue({ id: "evt1" }),
  // The chat POST reads + resolves any open gate before the new turn (frees the
  // single-open slot, replacing the retired stale-pending-action cleanup).
  getOpenGate: vi.fn().mockResolvedValue(null),
  resolveOpenGate: mockResolveOpenGate,
  // Phase 3 reader flip: chat POST projects the turn-event log for model context.
  getTurnEvents: vi.fn().mockResolvedValue([]),
  aiConversations: {
    id: "id",
    companyId: "companyId",
    userId: "userId",
    updatedAt: "updatedAt",
  },
  scenarios: { id: "id", companyId: "companyId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  asc: vi.fn(),
  gte: vi.fn(),
}));

vi.mock("@/lib/ai-feature-flags", () => ({
  checkAiFeatureAllowed: mockCheckAiFeatureAllowed,
  getCompanyProviderConfig: mockGetCompanyProviderConfig,
  getAiFlags: mockGetAiFlags,
}));

vi.mock("@burnless/ai", async () => {
  const actual = await vi.importActual<typeof import("@burnless/ai")>("@burnless/ai");
  return {
    chatStream: mockChatStream,
    resolvePermission: vi.fn(() => "allow"),
    categorizeToolName: vi.fn(() => "read"),
    projectModelThread: actual.projectModelThread,
    BUILTIN_PERMISSION_DEFAULTS: {
      read: "always",
      write: "ask",
      delete: "ask",
      web_search: "always",
      browser_use: "ask",
    },
  };
});

vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: mockExecuteToolCall,
}));

// MCP tools assembly (spec §3.4): empty for these tests — no connected servers.
vi.mock("@/lib/ai-tools/mcp", () => ({
  assembleMcpTools: vi.fn().mockResolvedValue({ tools: [], handlers: {} }),
}));

vi.mock("@/lib/chat-stream", () => ({
  buildChatSSEResponse: mockBuildChatSSEResponse,
}));

vi.mock("@/lib/build-ai-context", () => ({
  buildAiContext: mockBuildAiContext,
}));

vi.mock("@/lib/data", () => ({
  getDefaultScenario: mockGetDefaultScenario,
}));

vi.mock("@/lib/ai-usage-tracker", () => ({
  setTrackingCompanyId: mockSetTrackingCompanyId,
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const CTX = { userId: "u1", companyId: "c1", role: "admin" };

// happy-dom strips the forbidden "Cookie" request header, so hand-roll a minimal
// Request shape exposing exactly what the route touches (headers.get / json /
// method / url) — letting us set Cookie + X-Scenario-Id for the dual-channel check.
function reqWith(
  headers: Record<string, string>,
  body: Record<string, unknown>
): Request {
  const lower = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    method: "POST",
    url: "http://localhost/api/chat",
    headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null },
    json: async () => body,
  } as unknown as Request;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("chat route scenario safety + open-gate cleanup (Plan 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockApplyRateLimit.mockResolvedValue(null);
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockCheckAiFeatureAllowed.mockResolvedValue({
      allowed: true,
      creditStatus: null,
    });

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin });
    mockInnerJoin.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({
      limit: mockLimit,
      orderBy: mockOrderBy,
      returning: mockReturning,
    });
    mockOrderBy.mockResolvedValue([]);
    mockLimit.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([
      { id: "conv1", companyId: "c1", userId: "u1" },
    ]);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });

    mockGetDefaultScenario.mockResolvedValue({
      id: "s1",
      name: "Base Case",
      source: "blank",
    });
    mockBuildAiContext.mockResolvedValue({
      contextText: "Company has $500K cash, $50K monthly burn.",
      snapshot: {},
    });
    mockGetCompanyProviderConfig.mockResolvedValue(null);
    mockGetAiFlags.mockResolvedValue({ companionName: "Aria" });
    mockGetOverrideCount.mockResolvedValue(0);

    mockResolveOpenGate.mockResolvedValue(undefined);

    mockBuildChatSSEResponse.mockImplementation(
      () =>
        new Response("data: {}\n\n", {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        })
    );
  });

  it("409s on a cookie/header dual-channel mismatch", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      reqWith(
        { "X-Scenario-Id": "AAA", Cookie: "active-scenario-id=BBB" },
        { message: "hi", conversationId: "cv1" }
      )
    );
    expect(res.status).toBe(409);
  });

  it("resolves any open gate before a new turn starts (frees the single-open slot)", async () => {
    mockReturning.mockResolvedValue([{ id: "new-conv" }]);

    const { POST } = await import("../route");
    const res = await POST(reqWith({}, { message: "new turn" }));
    expect(res.status).toBe(200);
    // Unconditional resolve (cheap no-op when no gate is open) — replaces the
    // retired stale-pending-action cleanup.
    expect(mockResolveOpenGate).toHaveBeenCalledWith("new-conv");
  });
});
