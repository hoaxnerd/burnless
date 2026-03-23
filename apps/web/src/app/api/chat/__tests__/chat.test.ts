import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockRequireCompanyAccess, mockGetCompanyPlan } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockGetCompanyPlan: vi.fn(),
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

const { mockCanPerformAction } = vi.hoisted(() => ({
  mockCanPerformAction: vi.fn(),
}));

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

const { mockInitAiUsageTracking } = vi.hoisted(() => ({
  mockInitAiUsageTracking: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  getCompanyPlan: mockGetCompanyPlan,
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
}));

vi.mock("@/lib/feature-gate", () => ({
  canPerformAction: mockCanPerformAction,
}));

vi.mock("@burnless/ai", () => ({
  chatStream: mockChatStream,
}));

vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: mockExecuteToolCall,
}));

vi.mock("@/lib/build-ai-context", () => ({
  buildAiContext: mockBuildAiContext,
}));

vi.mock("@/lib/data", () => ({
  getDefaultScenario: mockGetDefaultScenario,
}));

vi.mock("@/lib/ai-usage-tracker", () => ({
  initAiUsageTracking: mockInitAiUsageTracking,
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

async function readStream(response: Response): Promise<string[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    events.push(decoder.decode(value));
  }
  return events;
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
      budgetStatus: null,
      writeMode: "full",
    });

    // Default: plan allows AI messages
    mockGetCompanyPlan.mockResolvedValue("pro");
    mockCanPerformAction.mockReturnValue({ allowed: true });

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
      type: "base",
    });

    // Default: AI context built
    mockBuildAiContext.mockResolvedValue({
      contextText: "Company has $500K cash, $50K monthly burn.",
      snapshot: {},
    });

    // Default: provider config
    mockGetCompanyProviderConfig.mockResolvedValue(null);
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

  it("returns 403 when monthly message limit reached", async () => {
    mockCanPerformAction.mockReturnValue({
      allowed: false,
      reason: "Monthly AI message limit reached (10/10)",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ message: "Hello" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("limit");
  });

  it("returns 404 when conversation not found", async () => {
    // where() is awaited and destructured as array in the route:
    //   const [existing] = await db.select(...).from(...).where(...)
    // First where: monthly messages (innerJoin chain)
    // Second where: conversation lookup → empty array = not found
    mockWhere
      .mockResolvedValueOnce([]) // monthly messages
      .mockResolvedValueOnce([]); // conversation lookup → not found

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

  it("returns streaming response with correct headers", async () => {
    // Mock chatStream to yield a simple text + done
    async function* fakeStream() {
      yield { type: "text" as const, content: "Your burn rate is $50K/mo." };
      yield { type: "done" as const };
    }
    mockChatStream.mockReturnValue(fakeStream());

    // DB: insert conversation returns id
    mockReturning.mockResolvedValue([
      { id: "conv1", companyId: "c1", userId: "u1" },
    ]);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ message: "What is my burn rate?" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("streams conversation_id event first", async () => {
    async function* fakeStream() {
      yield { type: "text" as const, content: "Hello" };
      yield { type: "done" as const };
    }
    mockChatStream.mockReturnValue(fakeStream());
    mockReturning.mockResolvedValue([
      { id: "conv1", companyId: "c1", userId: "u1" },
    ]);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ message: "Hi" }));
    const events = await readStream(res);

    // First event should contain conversation_id
    expect(events[0]).toContain("conversation_id");
    expect(events[0]).toContain("conv1");
  });

  it("includes budget warning header when budget >= 80%", async () => {
    mockCheckAiFeatureAllowed.mockResolvedValue({
      allowed: true,
      budgetStatus: { percentUsed: 85, warning: true },
      writeMode: "full",
    });

    async function* fakeStream() {
      yield { type: "text" as const, content: "Ok" };
      yield { type: "done" as const };
    }
    mockChatStream.mockReturnValue(fakeStream());
    mockReturning.mockResolvedValue([{ id: "conv1" }]);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ message: "Test" }));

    expect(res.headers.get("X-AI-Budget-Warning")).toContain("85%");
  });

  it("creates new conversation when conversationId not provided", async () => {
    async function* fakeStream() {
      yield { type: "done" as const };
    }
    mockChatStream.mockReturnValue(fakeStream());
    mockReturning.mockResolvedValue([{ id: "new-conv" }]);

    const { POST } = await import("../route");
    await POST(makeRequest({ message: "First message" }));

    // Should have called insert for conversation creation
    expect(mockInsert).toHaveBeenCalled();
  });

  it("passes scenarioId to scenario lookup when provided", async () => {
    async function* fakeStream() {
      yield { type: "done" as const };
    }
    mockChatStream.mockReturnValue(fakeStream());
    mockReturning.mockResolvedValue([{ id: "conv1" }]);

    // where() calls in order:
    // 1. Monthly messages (via innerJoin chain) → []
    // 2. Load conversation history → needs .orderBy() → []
    // 3. Scenario lookup (db.select().from().where()) → found scenario
    mockWhere
      .mockResolvedValueOnce([]) // #1 monthly messages
      .mockReturnValueOnce({ orderBy: mockOrderBy }) // #2 history → chain to orderBy
      .mockResolvedValueOnce([
        { id: "custom-scenario-id", name: "Custom", type: "custom", companyId: "c1" },
      ]); // #3 scenario found
    mockOrderBy.mockResolvedValueOnce([]); // history messages empty

    const { POST } = await import("../route");
    await POST(
      makeRequest({
        message: "Test",
        scenarioId: "custom-scenario-id",
      })
    );

    expect(mockSelect).toHaveBeenCalled();
  });

  it("calls initAiUsageTracking on each request", async () => {
    async function* fakeStream() {
      yield { type: "done" as const };
    }
    mockChatStream.mockReturnValue(fakeStream());
    mockReturning.mockResolvedValue([{ id: "conv1" }]);

    const { POST } = await import("../route");
    await POST(makeRequest({ message: "Track me" }));

    expect(mockInitAiUsageTracking).toHaveBeenCalled();
  });
});
