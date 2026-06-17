// apps/web/src/app/api/chat/__tests__/resume-mcp.test.ts
//
// MCP-specific behavior on the resume route (Task 14 plumbing review fixes):
//   1. An approved MCP write is NOT an overlay write — a mid-pause scenario
//      switch must NOT trip the SCENARIO_CHANGED 409 (MCP tools never touch the
//      scenario overlay).
//   2. A "for session" grant on an MCP tool uses the DYNAMIC category map — an
//      MCP tool classified "delete" grants the delete category, not "write".
// Mirrors the resume.test.ts PGLite harness; assembleMcpTools is mocked so the
// dynamic category map is deterministic.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

import "@db-test/setup";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

const { hoisted } = vi.hoisted(() => ({
  hoisted: {
    companyId: "",
    userId: "",
    executedTools: [] as string[],
  },
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: vi.fn(async () => ({
    userId: hoisted.userId,
    companyId: hoisted.companyId,
    role: "owner" as const,
  })),
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("@/lib/api-rate-limit", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/ai-feature-flags", () => ({
  checkAiFeatureAllowed: vi.fn(async () => ({ allowed: true, creditStatus: null })),
  getCompanyProviderConfig: vi.fn(async () => undefined),
  getAiFlags: vi.fn(async () => ({ companionName: "Aria", masterEnabled: true, features: {} })),
}));
vi.mock("@/lib/build-ai-context", () => ({
  buildAiContext: vi.fn(async () => ({ contextText: "ctx", snapshot: {} })),
}));
vi.mock("@/lib/ai-usage-tracker", () => ({ setTrackingCompanyId: vi.fn() }));
vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: vi.fn(async (tool: string) => {
    hoisted.executedTools.push(tool);
    return JSON.stringify({ success: true });
  }),
  logDeniedToolCall: vi.fn(),
}));
// Deterministic dynamic category map: refund is classified DELETE by the server
// hints, send_reminder WRITE.
vi.mock("@/lib/ai-tools/mcp", () => ({
  assembleMcpTools: vi.fn(async () => ({
    tools: [],
    categories: {
      mcp__stripe__refund: "delete",
      mcp__stripe__send_reminder: "write",
    },
  })),
}));
vi.mock("@/lib/chat-stream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat-stream")>();
  return {
    ...actual,
    buildChatSSEResponse: vi.fn(() =>
      new Response("data: {}\n\n", { headers: { "Content-Type": "text/event-stream" } })),
  };
});

import { createUser, createCompany, createScenario } from "@db-test/factories";
import { db, aiConversations, appendTurnEvent, getSessionGrants } from "@burnless/db";

// happy-dom strips the forbidden "Cookie" request header; hand-roll the minimal
// Request shape (headers.get / json / method / url) like resume-scenario-safety.
function reqWith(headers: Record<string, string>, body: Record<string, unknown>): Request {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method: "POST",
    url: "http://localhost/api/chat/resume",
    headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null },
    json: async () => body,
  } as unknown as Request;
}

async function seedMcpPause(toolName: string) {
  const user = await createUser();
  const company = await createCompany(user.id);
  hoisted.userId = user.id;
  hoisted.companyId = company.id;

  const baseScenario = await createScenario(company.id, {
    name: "Base Case",
    source: "blank",
    status: "active",
  });
  const otherScenario = await createScenario(company.id, {
    name: "Other",
    source: "ai",
    status: "active",
    aiConversationId: null,
  });

  const [conv] = await db
    .insert(aiConversations)
    .values({ companyId: company.id, userId: user.id, title: "t" })
    .returning();
  const conversationId = conv!.id;

  const turnId = "turn-mcp-1";
  const pauseId = "pause-mcp-1";
  const requestId = "r1";
  // Durable log: user_message → assistant_step → UNRESOLVED permission gate.
  await appendTurnEvent({ conversationId, turnId, type: "user_message", payload: { text: "do it" } });
  await appendTurnEvent({
    conversationId, turnId, type: "assistant_step",
    payload: { toolUses: [{ id: requestId, name: toolName, input: {} }] },
  });
  await appendTurnEvent({
    conversationId, turnId, type: "gate",
    payload: {
      pauseId, kind: "permission",
      actions: [{ requestId, toolName, toolInput: {} }],
      scenarioId: baseScenario.id,
      writeScenarioId: baseScenario.id,
    },
  });

  return { conversationId, pauseId, requestId, baseScenario, otherScenario };
}

describe("resume route — MCP pending actions", () => {
  beforeEach(() => {
    hoisted.executedTools.length = 0;
  });

  it("a mid-pause scenario switch with an approved MCP write does NOT 409 (MCP never touches the overlay)", async () => {
    const seeded = await seedMcpPause("mcp__stripe__send_reminder");
    const { POST } = await import("../resume/route");
    const res = await POST(
      reqWith(
        {
          "X-Scenario-Id": seeded.otherScenario.id,
          Cookie: `active-scenario-id=${seeded.otherScenario.id}`,
        },
        {
          conversationId: seeded.conversationId,
          pauseId: seeded.pauseId,
          decisions: [{ requestId: seeded.requestId, decision: "once" }],
        }
      )
    );
    expect(res.status).toBe(200);
    expect(hoisted.executedTools).toEqual(["mcp__stripe__send_reminder"]);
  });

  it('a "for session" grant on a dynamically-delete MCP tool grants DELETE (the category the card showed), not write', async () => {
    const seeded = await seedMcpPause("mcp__stripe__refund");
    const { POST } = await import("../resume/route");
    const res = await POST(
      reqWith(
        {},
        {
          conversationId: seeded.conversationId,
          pauseId: seeded.pauseId,
          decisions: [{ requestId: seeded.requestId, decision: "session" }],
        }
      )
    );
    expect(res.status).toBe(200);
    const grants = await getSessionGrants(seeded.conversationId);
    expect(grants.delete).toBe(true);
    expect(grants.write).toBeUndefined();
  });
});
