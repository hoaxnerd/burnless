// apps/web/src/app/api/chat/__tests__/resume-plan.test.ts
//
// Plan-pause resume path. Mirrors resume-input.test.ts's PGLite + mocked-provider
// harness: the @burnless/db singleton is hijacked to PGLite (real query
// semantics for getActivePendingAction / resolvePendingAction / conversation +
// scenario lookups), while the SSE responder + tool executor + auth boundaries
// are mocked. Here we prove the route's kind:"plan" branch: it synthesizes a
// tool_result for the propose_plan tool_use id carrying the user-approved plan,
// reconstructs the message history, and re-streams.
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
vi.mock("@/lib/chat-stream", () => ({
  buildChatSSEResponse: vi.fn((params: { scenarioId: string; messages: unknown[] }) => {
    hoisted.capturedSSEParams = { scenarioId: params.scenarioId, messages: params.messages };
    return new Response("data: {}\n\n", { headers: { "Content-Type": "text/event-stream" } });
  }),
}));

import { createUser, createCompany, createScenario } from "@db-test/factories";
import { db, aiConversations, appendTurnEvent } from "@burnless/db";

async function seedPlanPause() {
  const user = await createUser();
  const company = await createCompany(user.id);
  hoisted.userId = user.id;
  hoisted.companyId = company.id;

  const scenario = await createScenario(company.id, { name: "Base Case", source: "blank", status: "active" });

  const [conv] = await db
    .insert(aiConversations)
    .values({ companyId: company.id, userId: user.id, title: "t" })
    .returning();
  const conversationId = conv!.id;

  const turnId = "turn-plan";
  const pauseId = "p-plan";
  // Durable log: user_message → assistant_step (propose_plan) → UNRESOLVED plan
  // gate carrying the proposed spec + gated tool_use id.
  await appendTurnEvent({ conversationId, turnId, type: "user_message", payload: { text: "model a hire" } });
  await appendTurnEvent({
    conversationId, turnId, type: "assistant_step",
    payload: { toolUses: [{ id: "tu-p", name: "propose_plan", input: {} }] },
  });
  await appendTurnEvent({
    conversationId, turnId, type: "gate",
    payload: {
      pauseId, kind: "plan",
      gatedToolUseId: "tu-p",
      spec: { title: "Model hire", steps: [{ id: "step-1", kind: "tool", title: "Add hire", toolName: "create_headcount" }] },
      scenarioId: scenario.id,
      writeScenarioId: scenario.id,
    },
  });
  return { conversationId, pauseId };
}

describe("POST /api/chat/resume — plan approval (PGLite)", () => {
  beforeEach(() => { hoisted.capturedSSEParams = null; });

  it("synthesizes a tool_result from the approved (edited) plan and resumes", async () => {
    const { conversationId, pauseId } = await seedPlanPause();
    const approved = { title: "Model hire", steps: [{ id: "step-1", kind: "tool", title: "Add hire (kept)", toolName: "create_headcount" }] };
    const { POST } = await import("../resume/route");
    const res = await POST(new Request("http://localhost/api/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, pauseId, plan: approved }),
    }));
    expect(res.status).toBe(200);
    const passed = hoisted.capturedSSEParams as { messages: { role: string; content: unknown }[] };
    const last = passed.messages.at(-1)!;
    const toolResult = (last.content as { type: string; toolUseId: string; content: string }[])
      .find((b) => b.toolUseId === "tu-p")!;
    expect(JSON.parse(toolResult.content)).toMatchObject({ approved: true, plan: { title: "Model hire" } });
  });

  it("falls back to the stored plan when no edited plan is supplied", async () => {
    const { conversationId, pauseId } = await seedPlanPause();
    const { POST } = await import("../resume/route");
    const res = await POST(new Request("http://localhost/api/chat/resume", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, pauseId }),
    }));
    expect(res.status).toBe(200);
    const passed = hoisted.capturedSSEParams as { messages: { content: unknown }[] };
    const last = passed.messages.at(-1)!;
    const tr = (last.content as { toolUseId: string; content: string }[]).find((b) => b.toolUseId === "tu-p")!;
    expect(JSON.parse(tr.content).plan.steps).toHaveLength(1);
    expect(JSON.parse(tr.content).plan.steps[0].title).toBe("Add hire"); // proves the STORED spec is used, not an edited one
  });
});
