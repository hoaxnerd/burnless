// AI-09: GET /api/chat/history surfaces a `resumable` flag derived from the open
// gate's createdAt freshness (30-minute TTL). A genuinely-just-paused run is
// resumable (live gate); an old historical pause is not (restored inert). Task
// 3.3: the gate + its createdAt now come from the turn-event log (getOpenGate),
// while projectTimeline surfaces the live card; the ENDPOINT applies the TTL.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TurnEvent } from "@burnless/ai";

const { mockRequireCompanyAccess, mockGetTurnEvents, mockGetOpenGate } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockGetTurnEvents: vi.fn(),
  mockGetOpenGate: vi.fn(),
}));

const { mockSelect, mockFrom, mockWhere, mockOrderBy } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect },
  aiConversations: { id: "id", companyId: "companyId", userId: "userId", updatedAt: "updatedAt" },
  getTurnEvents: mockGetTurnEvents,
  getOpenGate: mockGetOpenGate,
}));

vi.mock("@/lib/ai-tools", () => ({
  describeToolAction: vi.fn((tool: string) => `do ${tool}`),
  buildDomainToolCategories: vi.fn(() => ({})),
}));
vi.mock("@/lib/domains", () => ({
  domainRegistry: { getActiveTools: vi.fn(async () => []) },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), desc: vi.fn(), asc: vi.fn(), lt: vi.fn() }));
vi.mock("@/lib/pagination", () => ({
  parsePaginationParams: vi.fn().mockReturnValue({ limit: 20, cursor: null }),
  paginatedResponse: vi.fn((rows: unknown[], limit: number) => ({ data: rows.slice(0, limit) })),
}));
vi.mock("@/lib/logger", () => ({ logger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));

const CTX = { userId: "u1", companyId: "c1", role: "admin" };
const makeRequest = (url: string): Request => new Request(url);

let seq = 0;
function ev(partial: Partial<TurnEvent> & { type: TurnEvent["type"]; payload: TurnEvent["payload"] }): TurnEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    conversationId: "conv1",
    seq,
    turnId: "turn1",
    resolvedAt: null,
    createdAt: new Date(),
    ...partial,
  } as TurnEvent;
}

const PERMISSION_PAYLOAD = {
  kind: "permission" as const,
  actions: [{ requestId: "t1", toolName: "create_scenario", toolInput: {} }],
  scenarioId: "base",
  writeScenarioId: null,
};

/** A paused conversation whose gate carries the given createdAt. */
function pausedLog(pauseId: string, createdAt: Date): { events: TurnEvent[]; gate: TurnEvent } {
  const events = [
    ev({ type: "user_message", payload: { text: "go" } }),
    ev({ type: "assistant_step", payload: { text: "" } }),
    ev({ type: "gate", resolvedAt: null, createdAt, payload: { pauseId, ...PERMISSION_PAYLOAD } as TurnEvent["payload"] }),
  ];
  return { events, gate: events[2]! };
}

describe("GET /api/chat/history — resumable flag (AI-09)", () => {
  beforeEach(() => {
    seq = 0;
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockGetTurnEvents.mockResolvedValue([]);
    mockGetOpenGate.mockResolvedValue(null);
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValue([]);
  });

  it("returns resumable:true for a fresh (just-paused) open gate", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    const { events, gate } = pausedLog("p-fresh", new Date()); // now → within TTL
    mockGetTurnEvents.mockResolvedValueOnce(events);
    mockGetOpenGate.mockResolvedValueOnce(gate);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.resumable).toBe(true);
    expect(json.pendingPermission).not.toBeNull();
  });

  it("returns resumable:false for an old (historical) open gate", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    const { events, gate } = pausedLog("p-old", new Date(Date.now() - 60 * 60 * 1000)); // 1h ago
    mockGetTurnEvents.mockResolvedValueOnce(events);
    mockGetOpenGate.mockResolvedValueOnce(gate);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.resumable).toBe(false);
    // The pending payload is still returned; the client renders it inert.
    expect(json.pendingPermission).not.toBeNull();
  });

  it("returns resumable:false when there is no open gate", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    mockGetTurnEvents.mockResolvedValueOnce([
      ev({ type: "user_message", payload: { text: "hi" } }),
      ev({ type: "assistant_step", payload: { text: "done" } }),
      ev({ type: "turn_done", payload: {} }),
    ]);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.resumable).toBe(false);
    expect(json.pendingPermission).toBeNull();
  });
});
