/**
 * DomainRegistry unit tests (A3a-2).
 *
 * Tests: registration, duplicate detection, getEnabled filtering, getActive* methods.
 * isDomainEnabled is mocked so registry.test.ts has no DB dependency.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DomainModule } from "../contracts";
import type { ToolDefinition, ContextContributor, PromptSection } from "@burnless/ai";

// ── Mock isDomainEnabled so we control which domains are "enabled" ────────────
// Must be declared before the registry import (hoisted by vitest).
const enabledDomains = new Set<string>(["always-on"]);

vi.mock("@/lib/capabilities", () => ({
  isDomainEnabled: vi.fn(async (id: string) => enabledDomains.has(id)),
  requireDomainEnabled: vi.fn(async () => null),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `Tool ${name}`,
    inputSchema: { type: "object", properties: {}, required: [] },
  };
}

function makeContributor(id: string): ContextContributor {
  return {
    id,
    domain: "test",
    sections: vi.fn(async () => []),
  };
}

function makeModule(
  id: string,
  opts: Partial<DomainModule> = {},
  toolNames: string[] = []
): DomainModule {
  return {
    id,
    tools: toolNames.map(makeTool),
    handlers: {},
    contextContributors: [],
    promptSections: [],
    navEntries: [],
    ...opts,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DomainRegistry", () => {
  // Re-import a fresh registry instance for each test group (avoid singleton bleed).
  let DomainRegistry: typeof import("../registry").DomainRegistry;
  let domainRegistry: import("../registry").DomainRegistry;

  beforeEach(async () => {
    vi.resetModules();
    // Re-mock after resetModules
    vi.mock("@/lib/capabilities", () => ({
      isDomainEnabled: vi.fn(async (id: string) => enabledDomains.has(id)),
      requireDomainEnabled: vi.fn(async () => null),
    }));
    const mod = await import("../registry");
    DomainRegistry = mod.DomainRegistry;
    domainRegistry = new DomainRegistry();
    enabledDomains.clear();
    enabledDomains.add("always-on");
  });

  // ── Registration ────────────────────────────────────────────────────────────

  it("registers a module and returns it via getAll()", () => {
    const m = makeModule("test-mod");
    domainRegistry.register(m);
    expect(domainRegistry.getAll()).toContain(m);
  });

  it("throws on duplicate module id", () => {
    domainRegistry.register(makeModule("dup"));
    expect(() => domainRegistry.register(makeModule("dup"))).toThrow(
      /duplicate module id "dup"/
    );
  });

  it("throws on duplicate tool name across modules", () => {
    domainRegistry.register(makeModule("modA", {}, ["shared-tool"]));
    expect(() =>
      domainRegistry.register(makeModule("modB", {}, ["shared-tool"]))
    ).toThrow(/duplicate tool name "shared-tool"/);
  });

  it("allows different tool names across modules", () => {
    domainRegistry.register(makeModule("modA", {}, ["tool-a"]));
    domainRegistry.register(makeModule("modB", {}, ["tool-b"]));
    expect(domainRegistry.getAll()).toHaveLength(2);
  });

  // ── getEnabled filtering ────────────────────────────────────────────────────

  it("getEnabled includes enabled modules", async () => {
    const m = makeModule("always-on");
    domainRegistry.register(m);
    const enabled = await domainRegistry.getEnabled({ companyId: "c1" });
    expect(enabled).toContain(m);
  });

  it("getEnabled excludes disabled modules", async () => {
    const m = makeModule("disabled-domain");
    domainRegistry.register(m);
    const enabled = await domainRegistry.getEnabled({ companyId: "c1" });
    expect(enabled).not.toContain(m);
  });

  it("core modules are always enabled (isDomainEnabled must return true for them)", async () => {
    // Simulate: isDomainEnabled returns true for core domains.
    const { isDomainEnabled } = await import("@/lib/capabilities");
    vi.mocked(isDomainEnabled).mockImplementation(async (id) =>
      id === "core-mod" ? true : false
    );

    const m = makeModule("core-mod", { core: true });
    domainRegistry.register(m);
    const enabled = await domainRegistry.getEnabled({ companyId: "c1" });
    expect(enabled).toContain(m);
  });

  it("non-core disabled domain is excluded from getEnabled", async () => {
    const { isDomainEnabled } = await import("@/lib/capabilities");
    vi.mocked(isDomainEnabled).mockImplementation(async (id) =>
      id === "finance" ? true : false
    );

    const disabled = makeModule("non-core-disabled", { core: false });
    domainRegistry.register(disabled);
    const enabled = await domainRegistry.getEnabled({ companyId: "c1" });
    expect(enabled).not.toContain(disabled);
  });

  // ── getActiveTools ──────────────────────────────────────────────────────────

  it("getActiveTools returns tools from enabled modules only", async () => {
    const { isDomainEnabled } = await import("@/lib/capabilities");
    vi.mocked(isDomainEnabled).mockImplementation(async (id) => id === "enabled-mod");

    const enabled = makeModule("enabled-mod", {}, ["tool-x"]);
    const disabled = makeModule("disabled-mod", {}, ["tool-y"]);
    domainRegistry.register(enabled);
    domainRegistry.register(disabled);

    const tools = await domainRegistry.getActiveTools({ companyId: "c1" });
    expect(tools.map((t) => t.name)).toContain("tool-x");
    expect(tools.map((t) => t.name)).not.toContain("tool-y");
  });

  // ── getActiveContextContributors ────────────────────────────────────────────

  it("getActiveContextContributors returns contributors from enabled modules only", async () => {
    const { isDomainEnabled } = await import("@/lib/capabilities");
    vi.mocked(isDomainEnabled).mockImplementation(async (id) => id === "contrib-mod");

    const contributor = makeContributor("c1");
    const m = makeModule("contrib-mod", { contextContributors: [contributor] });
    const disabledMod = makeModule("other-mod", {
      contextContributors: [makeContributor("c2")],
    });
    domainRegistry.register(m);
    domainRegistry.register(disabledMod);

    const contributors = await domainRegistry.getActiveContextContributors({ companyId: "c1" });
    expect(contributors).toContain(contributor);
    expect(contributors.map((c) => c.id)).not.toContain("c2");
  });

  // ── getActivePromptSections ─────────────────────────────────────────────────

  it("getActivePromptSections returns sections from enabled modules only", async () => {
    const { isDomainEnabled } = await import("@/lib/capabilities");
    vi.mocked(isDomainEnabled).mockImplementation(async (id) => id === "ps-mod");

    const section: PromptSection = { id: "sec1", domain: "ps-mod", body: "hi" };
    const m = makeModule("ps-mod", { promptSections: [section] });
    const other = makeModule("other-ps-mod", {
      promptSections: [{ id: "sec2", domain: "other", body: "bye" }],
    });
    domainRegistry.register(m);
    domainRegistry.register(other);

    const sections = await domainRegistry.getActivePromptSections({ companyId: "c1" });
    expect(sections).toContain(section);
    expect(sections.map((s) => s.id)).not.toContain("sec2");
  });

  // ── getActiveMcpExposedTools ────────────────────────────────────────────────

  it("getActiveMcpExposedTools excludes tools matching mcpExclude predicate", async () => {
    const { isDomainEnabled } = await import("@/lib/capabilities");
    vi.mocked(isDomainEnabled).mockImplementation(async () => true);

    const m = makeModule("mcp-mod", {
      mcpExclude: (t) => t.name === "excluded-tool",
    }, ["exposed-tool", "excluded-tool"]);
    domainRegistry.register(m);

    const exposed = await domainRegistry.getActiveMcpExposedTools({ companyId: "c1" });
    expect(exposed.map((t) => t.name)).toContain("exposed-tool");
    expect(exposed.map((t) => t.name)).not.toContain("excluded-tool");
  });

  it("getActiveMcpExposedTools exposes all tools when no mcpExclude is set", async () => {
    const { isDomainEnabled } = await import("@/lib/capabilities");
    vi.mocked(isDomainEnabled).mockImplementation(async () => true);

    const m = makeModule("no-exclude-mod", {}, ["tool-a", "tool-b"]);
    domainRegistry.register(m);

    const exposed = await domainRegistry.getActiveMcpExposedTools({ companyId: "c1" });
    expect(exposed.map((t) => t.name)).toContain("tool-a");
    expect(exposed.map((t) => t.name)).toContain("tool-b");
  });
});
