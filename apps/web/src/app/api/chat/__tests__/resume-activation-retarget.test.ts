// apps/web/src/app/api/chat/__tests__/resume-activation-retarget.test.ts
//
// Regression (A+B): when an APPROVED permission batch activates a NEW scenario
// mid-turn (create_scenario / activate_scenario), the resume continuation must
// write to that just-created scenario — NOT the gate's original (previously
// active) write target. Pre-fix, gateWriteScenarioId (the stale X) was handed to
// resumeStream, so post-activation writes landed in X instead of the new Y.
//
// Mirrors resume-scenario-safety.test.ts's PGLite + mocked-provider harness: the
// @burnless/db singleton runs against PGLite; auth / rate-limit / context /
// tool-executor / SSE responder are mocked. We CAPTURE the writeScenarioId
// handed to buildChatSSEResponse and assert it equals the newly-activated id.
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
    // The scenarioId a successful create_scenario tool call "returns".
    activatedScenarioId: "",
    capturedWriteScenarioId: undefined as undefined | string | null,
    // Per-action execution targets captured from executeToolCall's options
    // (same-batch variant): toolName → scenarioId it executed against.
    execScenarioByTool: {} as Record<string, string | null | undefined>,
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
  getAiFlags: vi.fn(async () => ({ companionName: "Aria" })),
}));
vi.mock("@/lib/build-ai-context", () => ({
  buildAiContext: vi.fn(async () => ({ contextText: "ctx", snapshot: {} })),
}));
vi.mock("@/lib/ai-usage-tracker", () => ({ setTrackingCompanyId: vi.fn() }));
// The tool executor returns a create_scenario-shaped activation result for
// create_scenario, and a plain success for everything else.
vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: vi.fn(
    async (toolName: string, _input: unknown, opts: { scenarioId?: string | null }) => {
      // Capture the scenario each action executed against (same-batch variant).
      hoisted.execScenarioByTool[toolName] = opts?.scenarioId;
      return toolName === "create_scenario" || toolName === "activate_scenario"
        ? JSON.stringify({ success: true, scenarioId: hoisted.activatedScenarioId, name: "Multi Pause Test" })
        : JSON.stringify({ success: true });
    }
  ),
  logDeniedToolCall: vi.fn(),
  buildDomainToolCategories: () => ({}),
}));
vi.mock("@/lib/domains", () => ({
  domainRegistry: {
    getActiveTools: vi.fn(async () => []),
    getActivePromptSections: vi.fn(async () => []),
    getActiveContextContributors: vi.fn(async () => [
      {
        id: "finance-snapshot",
        domain: "finance",
        sections: async (ctx: { companyId: string }) => {
          const { buildAiContext } = await import("@/lib/build-ai-context");
          const { contextText } = await buildAiContext(ctx.companyId, { id: "base", name: "Baseline", source: "base" });
          return [{ heading: "Current Financial Data", body: contextText }];
        },
      },
    ]),
  },
}));
vi.mock("@/lib/chat-stream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat-stream")>();
  return {
    ...actual,
    buildChatSSEResponse: vi.fn((params: { writeScenarioId: string | null }) => {
      hoisted.capturedWriteScenarioId = params.writeScenarioId;
      return new Response("data: {}\n\n", { headers: { "Content-Type": "text/event-stream" } });
    }),
  };
});

import { createUser, createCompany, createScenario } from "@db-test/factories";
import { db, aiConversations, appendTurnEvent } from "@burnless/db";

function reqWith(headers: Record<string, string>, body: Record<string, unknown>): Request {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method: "POST",
    url: "http://localhost/api/chat/resume",
    headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null },
    json: async () => body,
  } as unknown as Request;
}

describe("resume continuation re-targets the newly-activated scenario (A+B)", () => {
  beforeEach(() => {
    hoisted.capturedWriteScenarioId = undefined;
    hoisted.execScenarioByTool = {};
  });

  it("hands the continuation the just-created scenario, not the gate's original write target", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    hoisted.userId = user.id;
    hoisted.companyId = company.id;

    // X: the scenario the turn paused in / the gate's original write target.
    const prevActive = await createScenario(company.id, {
      name: "Hiring 2 Engineers",
      source: "ai",
      status: "active",
    });
    // Y: the scenario create_scenario will activate. Must exist for the route's
    // read-scenario lookup is on X (gate.scenarioId); Y is only referenced via the
    // tool result, but seed it so it's a real id we can assert against.
    const newlyMade = await createScenario(company.id, {
      name: "Multi Pause Test",
      source: "ai",
      status: "active",
    });
    hoisted.activatedScenarioId = newlyMade.id;

    const [conv] = await db
      .insert(aiConversations)
      .values({ companyId: company.id, userId: user.id, title: "t" })
      .returning();
    const conversationId = conv!.id;

    const turnId = "turn-retarget-1";
    const pauseId = "pause-retarget-1";
    // Approved batch: action 1 activates Y (create_scenario), action 2 is an
    // overlay write (create_revenue_stream) that must land in Y.
    const r1 = "r1-create-scenario";
    const r2 = "r2-create-revenue";

    await appendTurnEvent({ conversationId, turnId, type: "user_message", payload: { text: "do it" } });
    await appendTurnEvent({
      conversationId, turnId, type: "assistant_step",
      payload: {
        toolUses: [
          { id: r1, name: "create_scenario", input: { name: "Multi Pause Test" } },
          { id: r2, name: "create_revenue_stream", input: { name: "Gamma Tier" } },
        ],
      },
    });
    await appendTurnEvent({
      conversationId, turnId, type: "gate",
      payload: {
        pauseId, kind: "permission",
        actions: [
          { requestId: r1, toolName: "create_scenario", toolInput: { name: "Multi Pause Test" } },
          { requestId: r2, toolName: "create_revenue_stream", toolInput: { name: "Gamma Tier" } },
        ],
        scenarioId: prevActive.id,
        writeScenarioId: prevActive.id,
      },
    });

    const { POST } = await import("../resume/route");
    const res = await POST(
      reqWith(
        { "X-Scenario-Id": prevActive.id, Cookie: `active-scenario-id=${prevActive.id}` },
        {
          conversationId,
          pauseId,
          decisions: [
            { requestId: r1, decision: "once" },
            { requestId: r2, decision: "once" },
          ],
        }
      )
    );

    expect(res.status).toBe(200);
    // THE FIX: the continuation targets Y (newly activated), not X (gate original).
    expect(hoisted.capturedWriteScenarioId).toBe(newlyMade.id);
    expect(hoisted.capturedWriteScenarioId).not.toBe(prevActive.id);
  });

  it("executes a same-batch write against the in-batch activated scenario, not the gate's original", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    hoisted.userId = user.id;
    hoisted.companyId = company.id;

    // X: the scenario the turn paused in / the gate's original write target.
    const prevActive = await createScenario(company.id, {
      name: "Hiring 2 Engineers",
      source: "ai",
      status: "active",
    });
    // Y: the scenario create_scenario activates within this same approved batch.
    const newlyMade = await createScenario(company.id, {
      name: "Multi Pause Test",
      source: "ai",
      status: "active",
    });
    hoisted.activatedScenarioId = newlyMade.id;

    const [conv] = await db
      .insert(aiConversations)
      .values({ companyId: company.id, userId: user.id, title: "t" })
      .returning();
    const conversationId = conv!.id;

    const turnId = "turn-retarget-samebatch";
    const pauseId = "pause-retarget-samebatch";
    // ONE approved batch, TWO actions: action 1 create_scenario (activates Y),
    // action 2 create_revenue_stream (overlay write that must land in Y).
    const r1 = "r1-create-scenario";
    const r2 = "r2-create-revenue";

    await appendTurnEvent({ conversationId, turnId, type: "user_message", payload: { text: "do it" } });
    await appendTurnEvent({
      conversationId, turnId, type: "assistant_step",
      payload: {
        toolUses: [
          { id: r1, name: "create_scenario", input: { name: "Multi Pause Test" } },
          { id: r2, name: "create_revenue_stream", input: { name: "Gamma Tier" } },
        ],
      },
    });
    await appendTurnEvent({
      conversationId, turnId, type: "gate",
      payload: {
        pauseId, kind: "permission",
        actions: [
          { requestId: r1, toolName: "create_scenario", toolInput: { name: "Multi Pause Test" } },
          { requestId: r2, toolName: "create_revenue_stream", toolInput: { name: "Gamma Tier" } },
        ],
        scenarioId: prevActive.id,
        writeScenarioId: prevActive.id,
      },
    });

    const { POST } = await import("../resume/route");
    const res = await POST(
      reqWith(
        { "X-Scenario-Id": prevActive.id, Cookie: `active-scenario-id=${prevActive.id}` },
        {
          conversationId,
          pauseId,
          decisions: [
            { requestId: r1, decision: "once" },
            { requestId: r2, decision: "once" },
          ],
        }
      )
    );

    expect(res.status).toBe(200);
    // THE FIX (same-batch): action 2's write executed against Y (the in-batch
    // activated scenario), NOT X (the gate's original target). Pre-fix this was X.
    expect(hoisted.execScenarioByTool["create_revenue_stream"]).toBe(newlyMade.id);
    expect(hoisted.execScenarioByTool["create_revenue_stream"]).not.toBe(prevActive.id);
    // create_scenario itself isn't scenario-scoped; it ran against the gate's
    // original target before any activation re-pointed it.
    expect(hoisted.execScenarioByTool["create_scenario"]).toBe(prevActive.id);
  });
});
