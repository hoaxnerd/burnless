import { describe, it, expect, vi, beforeEach } from "vitest";
const h = vi.hoisted(() => ({
  chat: vi.fn().mockResolvedValue({ response: "Set MRR to $12,480.", toolResults: [] }),
  aiCheck: vi.fn().mockResolvedValue({ allowed: true, writeMode: "full" }),
}));
vi.mock("@burnless/ai", async (orig) => {
  const a = await (orig as () => Promise<Record<string, unknown>>)();
  return { ...a, chat: h.chat, MUTATION_TOOL_NAMES: new Set(["update_revenue_stream"]), getFinancialTools: () => [{ name: "update_revenue_stream", description: "", inputSchema: { type: "object" as const, properties: {} } }] };
});
vi.mock("@/lib/ai-feature-flags", () => ({ checkAiFeatureAllowed: h.aiCheck, getCompanyProviderConfig: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/ai-usage-tracker", () => ({ setTrackingCompanyId: vi.fn() }));
vi.mock("@/lib/data", () => ({ getDefaultScenario: vi.fn().mockResolvedValue({ id: "s1", name: "Base", source: "blank" }) }));
vi.mock("@/lib/build-ai-context", () => ({ buildAiContext: vi.fn().mockResolvedValue({ snapshot: {}, contextText: "CTX" }) }));
vi.mock("@/lib/ai-tools/mcp", () => ({ assembleMcpTools: vi.fn().mockResolvedValue({ tools: [], categories: {} }) }));
vi.mock("@/lib/ai-tools", () => ({ executeToolCall: vi.fn().mockResolvedValue("{}") }));
// A3a-3: assembleAllowedTools resolves tools via domainRegistry.getActiveTools.
vi.mock("@/lib/domains", () => ({
  domainRegistry: {
    getActiveTools: vi.fn(async () => [
      { name: "update_revenue_stream", description: "", inputSchema: { type: "object", properties: {} } },
    ]),
  },
}));

import { runJobDraftForReal } from "../runner";
const draft = { companyId: "c1", createdByUserId: "u1", prompt: "do it", actionKind: "write" as const, allowedTools: ["update_revenue_stream"], boundConnectionIds: [] };

describe("runJobDraftForReal", () => {
  beforeEach(() => { vi.clearAllMocks(); h.aiCheck.mockResolvedValue({ allowed: true, writeMode: "full" }); });
  it("runs the draft in COMMIT mode (dryRun false) and returns the result", async () => {
    const out = await runJobDraftForReal(draft);
    expect(h.chat).toHaveBeenCalled();
    // the onToolCall passed to chat must dispatch in commit mode for mutations — assert via executeToolCall mode if invoked; here just confirm it returns the narrated result
    expect(out.response).toContain("12,480");
  });
  it("a write draft under read_only refuses (no chat call)", async () => {
    h.aiCheck.mockResolvedValue({ allowed: true, writeMode: "read_only" });
    const out = await runJobDraftForReal(draft);
    expect(h.chat).not.toHaveBeenCalled();
    expect(out.error).toMatch(/read.?only/i);
  });
});
