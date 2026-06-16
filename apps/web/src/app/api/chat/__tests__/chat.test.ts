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

const { mockAppendTurnEvent, mockResolveOpenGate, mockGetOpenGate, mockGetTurnEvents } = vi.hoisted(() => ({
  mockAppendTurnEvent: vi.fn(),
  mockResolveOpenGate: vi.fn(),
  mockGetOpenGate: vi.fn(),
  mockGetTurnEvents: vi.fn(),
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
  // Task 2.3: the new turn reads + resolves any open gate before it starts.
  getOpenGate: mockGetOpenGate,
  resolveOpenGate: mockResolveOpenGate,
  // Phase 3 reader flip: the chat POST builds the model context by projecting
  // the turn-event log from getTurnEvents.
  getTurnEvents: mockGetTurnEvents,
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

vi.mock("@burnless/ai", async () => {
  // Use the REAL projectModelThread so the parity test verifies the actual
  // projection the route relies on (not a stub).
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
    mockResolveOpenGate.mockResolvedValue(undefined);
    // Default: no open gate (most turns) — abandoned-gate cancel path skipped.
    mockGetOpenGate.mockResolvedValue(null);
    // Default: empty turn-event log (Phase 3 reader flip) — fresh conversation.
    mockGetTurnEvents.mockResolvedValue([]);

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

  it("Phase 3 reader flip: builds the model thread by projecting the turn-event log", async () => {
    mockReturning.mockResolvedValue([
      { id: "log-conv", companyId: "c1", userId: "u1" },
    ]);

    // A representative log: a prior user/assistant turn with a tool call + result,
    // then the current turn's user_message (appended by Task 2.1 before this read).
    const events = [
      { id: "e1", conversationId: "log-conv", seq: 1, turnId: "t1", type: "user_message", payload: { text: "What is my runway?" }, resolvedAt: null, createdAt: new Date() },
      { id: "e2", conversationId: "log-conv", seq: 2, turnId: "t1", type: "assistant_step", payload: { text: "Let me check.", toolUses: [{ id: "tu1", name: "get_metric", input: { metric: "runway" } }] }, resolvedAt: null, createdAt: new Date() },
      { id: "e3", conversationId: "log-conv", seq: 3, turnId: "t1", type: "tool_result", payload: { toolUseId: "tu1", toolName: "get_metric", result: "18 months", kind: "executed" }, resolvedAt: null, createdAt: new Date() },
      { id: "e4", conversationId: "log-conv", seq: 4, turnId: "t1", type: "assistant_step", payload: { text: "Your runway is 18 months." }, resolvedAt: null, createdAt: new Date() },
      // Control events must be skipped without breaking the thread.
      { id: "e5", conversationId: "log-conv", seq: 5, turnId: "t1", type: "turn_done", payload: {}, resolvedAt: null, createdAt: new Date() },
      // Current turn's user_message (Task 2.1 appended it before the projection).
      { id: "e6", conversationId: "log-conv", seq: 6, turnId: "t2", type: "user_message", payload: { text: "And my burn?" }, resolvedAt: null, createdAt: new Date() },
    ];
    mockGetTurnEvents.mockResolvedValue(events);
    // conversationId provided → conversation-ownership lookup must find the row.
    mockWhere
      .mockResolvedValueOnce([{ id: "log-conv" }]) // #1 conversation lookup found
      .mockResolvedValueOnce([{ id: "s1", name: "Base Case", source: "blank", companyId: "c1" }]); // scenario lookup (unused; no body.scenarioId)

    const { POST } = await import("../route");
    await POST(makeRequest({ message: "And my burn?", conversationId: "log-conv" }));

    // The projection is read from the LOG (getTurnEvents), not aiMessages.
    expect(mockGetTurnEvents).toHaveBeenCalledWith("log-conv");

    const params = mockBuildChatSSEResponse.mock.calls[0]![0];
    expect(params.messages).toEqual([
      { role: "user", content: "What is my runway?" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "tu1", name: "get_metric", input: { metric: "runway" } },
        ],
      },
      { role: "user", content: [{ type: "tool_result", toolUseId: "tu1", content: "18 months" }] },
      { role: "assistant", content: [{ type: "text", text: "Your runway is 18 months." }] },
      { role: "user", content: "And my burn?" },
    ]);

    // The current turn's user_message is the LATEST turn in the projected thread.
    expect(params.messages.at(-1)).toEqual({ role: "user", content: "And my burn?" });
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

  it("Task 2.3: resolves any open gate before the new turn starts", async () => {
    mockReturning.mockResolvedValue([
      { id: "gate-conv", companyId: "c1", userId: "u1" },
    ]);

    const { POST } = await import("../route");
    await POST(makeRequest({ message: "new question" }));

    expect(mockResolveOpenGate).toHaveBeenCalledWith("gate-conv");
  });

  it("Task 2.3 FIX 2: abandoned permission gate → declined cancel per gated tool_use BEFORE resolveOpenGate", async () => {
    mockReturning.mockResolvedValue([
      { id: "abandon-conv", companyId: "c1", userId: "u1" },
    ]);
    // An open permission gate listing two gated tool_uses (requestId = tool_use id).
    mockGetOpenGate.mockResolvedValue({
      turnId: "old-turn",
      payload: {
        pauseId: "p-old",
        kind: "permission",
        actions: [{ requestId: "tu-gated-1" }, { requestId: "tu-gated-2" }],
      },
    });

    const order: string[] = [];
    mockAppendTurnEvent.mockImplementation(async (e: { type: string }) => {
      order.push(`append:${e.type}`);
      return { id: "evt" };
    });
    mockResolveOpenGate.mockImplementation(async () => { order.push("resolve"); });

    const { POST } = await import("../route");
    await POST(makeRequest({ message: "actually, never mind" }));

    // A declined cancel tool_result for EACH gated tool_use, tagged with the gate's
    // OWN turnId (groups with the abandoned turn).
    const cancels = mockAppendTurnEvent.mock.calls
      .map((c) => c[0] as { type: string; turnId: string; payload: Record<string, unknown> })
      .filter((e) => e.type === "tool_result" && e.payload.kind === "declined");
    expect(cancels).toHaveLength(2);
    expect(cancels.map((c) => c.payload.toolUseId).sort()).toEqual(["tu-gated-1", "tu-gated-2"]);
    expect(cancels.every((c) => c.turnId === "old-turn")).toBe(true);
    expect(cancels.every((c) => typeof c.payload.result === "string" && (c.payload.result as string).includes("superseded"))).toBe(true);

    // Cancels are appended BEFORE the gate is resolved (so the open gate still exists
    // when we read it) and before the new user_message.
    const firstResolve = order.indexOf("resolve");
    const lastCancel = order.lastIndexOf("append:tool_result");
    const userMsg = order.indexOf("append:user_message");
    expect(lastCancel).toBeLessThan(firstResolve);
    expect(lastCancel).toBeLessThan(userMsg);
  });

  it("Task 2.3 FIX 2: abandoned input gate → single declined cancel for gatedToolUseId", async () => {
    mockReturning.mockResolvedValue([
      { id: "abandon-input", companyId: "c1", userId: "u1" },
    ]);
    mockGetOpenGate.mockResolvedValue({
      turnId: "old-input-turn",
      payload: { pauseId: "p-in", kind: "input", spec: {}, gatedToolUseId: "tu-input" },
    });

    const { POST } = await import("../route");
    await POST(makeRequest({ message: "stop" }));

    const cancels = mockAppendTurnEvent.mock.calls
      .map((c) => c[0] as { type: string; turnId: string; payload: Record<string, unknown> })
      .filter((e) => e.type === "tool_result" && e.payload.kind === "declined");
    expect(cancels).toHaveLength(1);
    expect(cancels[0]!.payload.toolUseId).toBe("tu-input");
    expect(cancels[0]!.turnId).toBe("old-input-turn");
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

    // where() calls in order (Phase 3: history read removed — projects the log):
    // 1. conversation lookup → found
    // 2. Scenario lookup (db.select().from().where()) → found scenario
    mockWhere
      .mockResolvedValueOnce([{ id: "custom-conversation-id" }]) // #1 conversation lookup found
      .mockResolvedValueOnce([
        { id: "custom-scenario-id", name: "Custom", source: "ai", companyId: "c1" },
      ]); // #2 scenario found

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
