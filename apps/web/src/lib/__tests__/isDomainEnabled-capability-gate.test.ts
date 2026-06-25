/**
 * Tests for the isDomainEnabled capability gate (A6-1).
 *
 * These tests verify that:
 * - A module declaring `capability: "skills"` is disabled when that capability is off.
 * - A module declaring `capability: "skills"` is enabled when that capability is on.
 * - A module with no `capability` field is unaffected by the gate.
 * - The core short-circuit (finance) is unchanged.
 *
 * The domainRegistry and getAiFlags are mocked. getCapabilities() reads process.env
 * at call time, so env manipulation controls capability values without re-importing.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// ── Registry mock ─────────────────────────────────────────────────────────────

// Mutable store so each test controls what modules the registry reports.
let registryModules: Array<{
  id: string;
  core?: boolean;
  capability?: string;
}> = [];

vi.mock("@/lib/domains/registry", () => ({
  domainRegistry: {
    getAll: vi.fn(() => registryModules),
  },
}));

// Per-company flags: always return "enabled" (not under test here).
vi.mock("@/lib/ai-feature-flags", () => ({
  getAiFlags: vi.fn(async () => ({ features: {} })),
}));

// ── Import isDomainEnabled once — getCapabilities() reads env at call time ───
// This works because getCapabilities() uses process.env inline, not at import.

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("isDomainEnabled — capability gate (A6-1)", () => {
  const ORIG = process.env;

  afterEach(() => {
    process.env = ORIG;
    registryModules = [];
  });

  it("disables a domain whose module.capability is off in the edition (cloud)", async () => {
    // skills is OFF in cloud edition.
    registryModules = [{ id: "skills", capability: "skills" }];
    process.env = { ...ORIG, BURNLESS_DEPLOYMENT: "cloud" };
    const { isDomainEnabled } = await import("@/lib/domain-gating");
    const result = await isDomainEnabled("skills", {});
    expect(result).toBe(false);
  });

  it("enables a domain whose module.capability is on in the edition (self_host)", async () => {
    // skills is ON in self_host edition.
    registryModules = [{ id: "skills", capability: "skills" }];
    process.env = { ...ORIG }; delete process.env["BURNLESS_DEPLOYMENT"]; // self_host
    const { isDomainEnabled } = await import("@/lib/domain-gating");
    const result = await isDomainEnabled("skills", {});
    expect(result).toBe(true);
  });

  it("skills capability can be overridden on via BURNLESS_CAP_SKILLS=on in cloud", async () => {
    registryModules = [{ id: "skills", capability: "skills" }];
    process.env = { ...ORIG, BURNLESS_DEPLOYMENT: "cloud", BURNLESS_CAP_SKILLS: "on" };
    const { isDomainEnabled } = await import("@/lib/domain-gating");
    const result = await isDomainEnabled("skills", {});
    expect(result).toBe(true);
  });

  it("skills capability can be overridden off via BURNLESS_CAP_SKILLS=off in self_host", async () => {
    registryModules = [{ id: "skills", capability: "skills" }];
    process.env = { ...ORIG, BURNLESS_CAP_SKILLS: "off" };
    delete process.env["BURNLESS_DEPLOYMENT"]; // ensure self_host
    const { isDomainEnabled } = await import("@/lib/domain-gating");
    const result = await isDomainEnabled("skills", {});
    expect(result).toBe(false);
  });

  it("a module with no capability field is unaffected by the capability gate", async () => {
    // company-knowledge has no capability field — still passes through to per-company check.
    registryModules = [{ id: "company-knowledge" }];
    // Even in cloud, no capability declared → gate is skipped.
    process.env = { ...ORIG, BURNLESS_DEPLOYMENT: "cloud" };
    const { isDomainEnabled } = await import("@/lib/domain-gating");
    // companyId not provided → per-company check skipped → returns true.
    const result = await isDomainEnabled("company-knowledge", {});
    expect(result).toBe(true);
  });

  it("core domain short-circuits before the capability gate (always enabled)", async () => {
    // Hypothetical module that is core:true but also declares capability: "skills".
    // Core short-circuit must win → always enabled even if capability is off.
    registryModules = [{ id: "finance", core: true, capability: "skills" }];
    process.env = { ...ORIG, BURNLESS_DEPLOYMENT: "cloud" }; // skills off in cloud
    const { isDomainEnabled } = await import("@/lib/domain-gating");
    const result = await isDomainEnabled("finance", {});
    expect(result).toBe(true);
  });

  it("unknown domain (not in registry) is unblocked by capability gate (mod is undefined)", async () => {
    // No module for this domain → mod is undefined → capability gate is skipped.
    registryModules = [];
    process.env = { ...ORIG };
    const { isDomainEnabled } = await import("@/lib/domain-gating");
    // No companyId → per-company check skipped → true.
    const result = await isDomainEnabled("nonexistent-domain", {});
    expect(result).toBe(true);
  });
});
