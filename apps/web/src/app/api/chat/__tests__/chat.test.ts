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

const { mockAppendTurnEvent } = vi.hoisted(() => ({
  mockAppendTurnEvent: vi.fn(),
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
  // Plan 5: stale-pause auto-resolve guard runs on every turn — default to no
  // active pending action so the existing scenarios stay unaffected.
  getActivePendingAction: vi.fn().mockResolvedValue(undefined),
  resolvePendingAction: vi.fn().mockResolvedValue(undefined),
  // S3b §11 disabled-tools overlay: default to nothing disabled so existing
  // scenarios stay unaffected.
  getSessionDisabledTools: vi.fn().mockResolvedValue({}),
  getDisabledBuiltinTools: vi.fn().mockResolvedValue([]),
  // Phase 2 dual-write: the chat POST appends a user_message turn-event next to
  // the existing aiMessages user-row insert.
  appendTurnEvent: mockAppendTurnEvent,
  aiConversations: {
    id: "id",
    companyId: "companyId",
    userId: "userId",
    updatedAt: "updatedAt",
  },
  aiMessages: {
    conversationId: "conversationId",
    role: "role",
    createdAt: "createdAt",
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

vi.mock("@burnless/ai", () => ({
  chatStream: mockChatStream,
  resolvePermission: vi.fn(() => "allow"),
  categorizeToolName: vi.fn(() => "read"),
  BUILTIN_PERMISSION_DEFAULTS: {
    read: "always",
    write: "ask",
    delete: "ask",
    web_search: "always",
    browser_use: "ask",
  },
}));

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

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no rate limiting
    mockApplyRateLimit.mockResolvedValue(null);

    // Default: authenticated
    mockRequireCompanyAccess.mockResolvedValue(CTX);

    // Default: AI allowed
    mockCheckAiFeatureAllowed.mockResolvedValue({
      allowed: true,
      creditStatus: null,
    });

    // Default: DB chain setup
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

    // Default: scenario exists
    mockGetDefaultScenario.mockResolvedValue({
      id: "s1",
      name: "Base Case",
      source: "blank",
    });

    // Default: AI context built
    mockBuildAiContext.mockResolvedValue({
      contextText: "Company has $500K cash, $50K monthly burn.",
      snapshot: {},
    });

    // Default: provider config
    mockGetCompanyProviderConfig.mockResolvedValue(null);

    // Default: AI flags
    mockGetAiFlags.mockResolvedValue({ companionName: "Aria" });

    // Default: override count
    mockGetOverrideCount.mockResolvedValue(0);

    // Default: turn-event append resolves (Phase 2 dual-write).
    mockAppendTurnEvent.mockResolvedValue({ id: "evt1" });

    // Default: shared SSE responder returns a basic streaming response
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

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ message: "Hello" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApplyRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ message: "Hello" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for missing message field", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid request body");
  });

  it("returns 400 for empty message string", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ message: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when AI feature is disabled", async () => {
    mockCheckAiFeatureAllowed.mockResolvedValue({
      allowed: false,
      reason: "AI features are disabled",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ message: "Hello" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("disabled");
  });

  it("returns 403 when budget exceeded", async () => {
    mockCheckAiFeatureAllowed.mockResolvedValue({
      allowed: false,
      reason: "Budget exceeded",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ message: "Hello" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when AI credits exhausted", async () => {
    mockCheckAiFeatureAllowed.mockResolvedValue({
      allowed: false,
      reason: "AI credits exhausted for this month",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ message: "Hello" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("credits exhausted");
  });

  it("returns 404 when conversation not found", async () => {
    // First where: conversation lookup → empty array = not found
    mockWhere.mockResolvedValueOnce([]); // conversation lookup → not found

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({ message: "Hello", conversationId: "nonexistent" })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Conversation not found");
  });

  it("returns 404 when no scenario exists", async () => {
    mockGetDefaultScenario.mockResolvedValue(null);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ message: "Hello" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("scenario");
  });

  it("delegates to the shared SSE responder", async () => {
    // DB: insert conversation returns id for the freshly created conversation
    mockReturning.mockResolvedValue([
      { id: "new-conv", companyId: "c1", userId: "u1" },
    ]);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ message: "What is my burn rate?" }));

    expect(res.status).toBe(200);
    expect(mockBuildChatSSEResponse).toHaveBeenCalledOnce();
    const params = mockBuildChatSSEResponse.mock.calls[0]![0];
    expect(params.companyId).toBe("c1");
    expect(params.userId).toBe("u1");
    expect(params.conversationId).toBe("new-conv"); // freshly created conversation
  });

  it("passes the conversation message history to the responder", async () => {
    mockReturning.mockResolvedValue([
      { id: "conv1", companyId: "c1", userId: "u1" },
    ]);

    const { POST } = await import("../route");
    await POST(makeRequest({ message: "Hi" }));

    const params = mockBuildChatSSEResponse.mock.calls[0]![0];
    expect(Array.isArray(params.messages)).toBe(true);
    expect(params.financialContext).toContain("$500K cash");
    expect(params.companionName).toBe("Aria");
  });

  it("dual-writes: aiMessages user row AND a user_message turn-event", async () => {
    mockReturning.mockResolvedValue([
      { id: "dual-conv", companyId: "c1", userId: "u1" },
    ]);

    const { POST } = await import("../route");
    await POST(makeRequest({ message: "What is my runway?" }));

    // OLD store still written: an aiMessages row with role "user" + the text.
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", content: "What is my runway?" })
    );

    // NEW log written: a user_message turn-event whose payload.text matches,
    // tagged with the conversationId + a turnId.
    expect(mockAppendTurnEvent).toHaveBeenCalledOnce();
    const evt = mockAppendTurnEvent.mock.calls[0]![0];
    expect(evt.type).toBe("user_message");
    expect(evt.conversationId).toBe("dual-conv");
    expect(typeof evt.turnId).toBe("string");
    expect(evt.turnId.length).toBeGreaterThan(0);
    expect(evt.payload).toEqual({ text: "What is my runway?" });

    // The SAME turnId is threaded into the streaming layer.
    const params = mockBuildChatSSEResponse.mock.calls[0]![0];
    expect(params.turnId).toBe(evt.turnId);
  });

  it("includes credit warning when credits >= 80% used", async () => {
    mockCheckAiFeatureAllowed.mockResolvedValue({
      allowed: true,
      creditStatus: { percentUsed: 85, warning: true },
    });
    mockReturning.mockResolvedValue([{ id: "conv1" }]);

    const { POST } = await import("../route");
    await POST(makeRequest({ message: "Test" }));

    const params = mockBuildChatSSEResponse.mock.calls[0]![0];
    expect(params.creditWarning).toContain("85%");
  });

  it("creates new conversation when conversationId not provided", async () => {
    mockReturning.mockResolvedValue([{ id: "new-conv" }]);

    const { POST } = await import("../route");
    await POST(makeRequest({ message: "First message" }));

    // Should have called insert for conversation creation
    expect(mockInsert).toHaveBeenCalled();
  });

  it("passes scenarioId to scenario lookup when provided", async () => {
    mockReturning.mockResolvedValue([{ id: "conv1" }]);

    // where() calls in order:
    // 1. conversation lookup → found
    // 2. Load conversation history → needs .orderBy() → []
    // 3. Scenario lookup (db.select().from().where()) → found scenario
    mockWhere
      .mockResolvedValueOnce([{ id: "custom-conversation-id" }]) // #1 conversation lookup found
      .mockReturnValueOnce({ orderBy: mockOrderBy }) // #2 history → chain to orderBy
      .mockResolvedValueOnce([
        { id: "custom-scenario-id", name: "Custom", source: "ai", companyId: "c1" },
      ]); // #3 scenario found
    mockOrderBy.mockResolvedValueOnce([]); // history messages empty

    const { POST } = await import("../route");
    await POST(
      makeRequest({
        message: "Test",
        conversationId: "custom-conversation-id",
        scenarioId: "custom-scenario-id",
      })
    );

    expect(mockSelect).toHaveBeenCalled();
  });

  it("calls setTrackingCompanyId on each request", async () => {
    async function* fakeStream() {
      yield { type: "done" as const };
    }
    mockChatStream.mockReturnValue(fakeStream());
    mockReturning.mockResolvedValue([{ id: "conv1" }]);

    const { POST } = await import("../route");
    await POST(makeRequest({ message: "Track me" }));

    expect(mockSetTrackingCompanyId).toHaveBeenCalledWith("c1");
  });
});
