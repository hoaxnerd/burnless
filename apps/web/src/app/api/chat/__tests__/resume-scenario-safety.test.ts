// apps/web/src/app/api/chat/__tests__/resume-scenario-safety.test.ts
//
// Plan 5 scenario-safety on the resume route. Mirrors resume.test.ts's PGLite +
// mocked-provider harness verbatim (the @burnless/db singleton is hijacked to
// PGLite so getActivePendingAction / resolvePendingAction / scenario lookups +
// getDefaultScenario run against real Postgres semantics), while auth / rate-limit
// / SSE responder / tool executor are mocked. We exercise the new dual-channel
// guard + decision-4 re-validation:
//   1. cookie/header mismatch → 409
//   2. active scenario differs and was NOT created by this conversation → 409 SCENARIO_CHANGED
//   3. active scenario was created by this conversation → tolerated → 200
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
    capturedSSEParams: null as null | { scenarioId: string; messages: unknown[] },
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
vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: vi.fn(async () => JSON.stringify({ success: true })),
  logDeniedToolCall: vi.fn(),
}));
vi.mock("@/lib/chat-stream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat-stream")>();
  return {
    ...actual,
    buildChatSSEResponse: vi.fn((params: { scenarioId: string; messages: unknown[] }) => {
      hoisted.capturedSSEParams = { scenarioId: params.scenarioId, messages: params.messages };
      return new Response("data: {}\n\n", { headers: { "Content-Type": "text/event-stream" } });
    }),
  };
});

import { createUser, createCompany, createScenario } from "@db-test/factories";
import { db, aiConversations, aiMessages, createPendingAction } from "@burnless/db";

// happy-dom strips the forbidden "Cookie" request header, so we hand-roll a minimal
// Request shape exposing exactly what the route touches (headers.get / json / method
// / url) — letting us set Cookie + X-Scenario-Id for the dual-channel check.
function reqWith(headers: Record<string, string>, body: Record<string, unknown>): Request {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method: "POST",
    url: "http://localhost/api/chat/resume",
    headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null },
    json: async () => body,
  } as unknown as Request;
}

async function seedPermissionPause(opts: {
  activeName: string;
  activeAiConversationId?: string | null;
  toolName?: string;
}) {
  const toolName = opts.toolName ?? "create_revenue_stream";
  const user = await createUser();
  const company = await createCompany(user.id);
  hoisted.userId = user.id;
  hoisted.companyId = company.id;

  // The scenario the paused turn was operating in (also the company default — first
  // by createdAt). The route loads it by pendingRow.scenarioId.
  const baseScenario = await createScenario(company.id, {
    name: "Base Case",
    source: "blank",
    status: "active",
  });
  // A DIFFERENT active scenario the user (or AI) switched to.
  const activeScenario = await createScenario(company.id, {
    name: opts.activeName,
    source: "ai",
    status: "active",
    aiConversationId: opts.activeAiConversationId ?? null,
  });

  const [conv] = await db
    .insert(aiConversations)
    .values({ companyId: company.id, userId: user.id, title: "t" })
    .returning();
  const conversationId = conv!.id;
  await db.insert(aiMessages).values({ conversationId, role: "user", content: "do it" });

  const pauseId = "pause-safety-1";
  const requestId = "r1";
  await createPendingAction({
    conversationId,
    pauseId,
    scenarioId: baseScenario.id,
    // AI-01: this pause models an OVERLAY write (the turn was operating inside
    // baseScenario as a write target), so the write target is non-null. Decision-4
    // gates only when there is a real overlay write target.
    writeScenarioId: baseScenario.id,
    assistantBlocks: [
      { type: "tool_use", id: requestId, name: toolName, input: {} },
    ],
    completedResults: [],
    pending: [{ requestId, toolName, toolInput: {} }],
  });

  return { conversationId, pauseId, requestId, baseScenario, activeScenario };
}

describe("resume scenario safety (Plan 5)", () => {
  beforeEach(() => {
    hoisted.capturedSSEParams = null;
  });

  it("409s on a cookie/header dual-channel mismatch", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    hoisted.userId = user.id;
    hoisted.companyId = company.id;

    const { POST } = await import("../resume/route");
    const res = await POST(
      reqWith(
        { "X-Scenario-Id": "AAA", Cookie: "active-scenario-id=BBB" },
        { conversationId: "cv1", pauseId: "p1", decisions: [{ requestId: "r1", decision: "once" }] }
      )
    );
    expect(res.status).toBe(409);
  });

  it("409 SCENARIO_CHANGED when the active scenario differs and was NOT created by this conversation", async () => {
    const seeded = await seedPermissionPause({ activeName: "Other", activeAiConversationId: null });
    const { POST } = await import("../resume/route");
    const res = await POST(
      reqWith(
        {
          "X-Scenario-Id": seeded.activeScenario.id,
          Cookie: `active-scenario-id=${seeded.activeScenario.id}`,
        },
        {
          conversationId: seeded.conversationId,
          pauseId: seeded.pauseId,
          decisions: [{ requestId: seeded.requestId, decision: "once" }],
        }
      )
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("SCENARIO_CHANGED");
  });

  it("does NOT 409 when the changed-scenario turn only commits a NON-overlay write (create_scenario)", async () => {
    // create_scenario writes a company-scoped row, not the active overlay, so a
    // mid-turn scenario switch doesn't endanger it — decision-4 must not fire.
    const seeded = await seedPermissionPause({
      activeName: "Other",
      activeAiConversationId: null,
      toolName: "create_scenario",
    });
    const { POST } = await import("../resume/route");
    const res = await POST(
      reqWith(
        {
          "X-Scenario-Id": seeded.activeScenario.id,
          Cookie: `active-scenario-id=${seeded.activeScenario.id}`,
        },
        {
          conversationId: seeded.conversationId,
          pauseId: seeded.pauseId,
          decisions: [{ requestId: seeded.requestId, decision: "once" }],
        }
      )
    );
    expect(res.status).toBe(200);
  });

  it("does NOT 409 when the only decision on the changed-scenario turn is Deny", async () => {
    // A declined action never commits, so Deny/Cancel must always pass through even
    // if the active scenario drifted.
    const seeded = await seedPermissionPause({ activeName: "Other", activeAiConversationId: null });
    const { POST } = await import("../resume/route");
    const res = await POST(
      reqWith(
        {
          "X-Scenario-Id": seeded.activeScenario.id,
          Cookie: `active-scenario-id=${seeded.activeScenario.id}`,
        },
        {
          conversationId: seeded.conversationId,
          pauseId: seeded.pauseId,
          decisions: [{ requestId: seeded.requestId, decision: "deny" }],
        }
      )
    );
    expect(res.status).toBe(200);
  });

  it("tolerates a mismatch when the active scenario was created by this conversation", async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    hoisted.userId = user.id;
    hoisted.companyId = company.id;

    const baseScenario = await createScenario(company.id, {
      name: "Base Case",
      source: "blank",
      status: "active",
    });
    const [conv] = await db
      .insert(aiConversations)
      .values({ companyId: company.id, userId: user.id, title: "t" })
      .returning();
    const conversationId = conv!.id;
    await db.insert(aiMessages).values({ conversationId, role: "user", content: "do it" });

    // The AI-created scenario this very conversation produced — decision-4 tolerates it.
    const aiMade = await createScenario(company.id, {
      name: "AI Made",
      source: "ai",
      status: "active",
      aiConversationId: conversationId,
    });

    const pauseId = "pause-safety-1";
    const requestId = "r1";
    await createPendingAction({
      conversationId,
      pauseId,
      scenarioId: baseScenario.id,
      // AI-01: overlay write target — non-null so decision-4 can evaluate the gate.
      writeScenarioId: baseScenario.id,
      assistantBlocks: [
        { type: "tool_use", id: requestId, name: "create_revenue_stream", input: {} },
      ],
      completedResults: [],
      pending: [{ requestId, toolName: "create_revenue_stream", toolInput: {} }],
    });

    const { POST } = await import("../resume/route");
    const res = await POST(
      reqWith(
        { "X-Scenario-Id": aiMade.id, Cookie: `active-scenario-id=${aiMade.id}` },
        { conversationId, pauseId, decisions: [{ requestId, decision: "once" }] }
      )
    );
    expect(res.status).toBe(200);
  });
});
