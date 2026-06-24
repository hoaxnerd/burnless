import { describe, it, expect } from "vitest";
import { buildSystemMessage, buildSystemPrompt } from "../prompts";
import type { ContextSection } from "../domain-contracts";
import type { PromptSection } from "../domain-contracts";
import { resolveContextSections } from "../chat";

describe("buildSystemMessage — context sections", () => {
  it("back-compat: a string renders identically to the legacy finance block", () => {
    const out = buildSystemMessage("MRR: $10,000");
    expect(out).toContain(buildSystemPrompt());
    expect(out).toContain("## Current Financial Data\n\nMRR: $10,000");
  });

  it("composes multiple sections as '## {heading}\\n\\n{body}' joined by blank lines", () => {
    const sections: ContextSection[] = [
      { heading: "Current Financial Data", body: "MRR: $10,000" },
      { heading: "What you should know about this company", body: "- Pre-seed" },
    ];
    const out = buildSystemMessage(sections);
    expect(out).toContain("## Current Financial Data\n\nMRR: $10,000\n\n## What you should know about this company\n\n- Pre-seed");
  });

  it("orders sections by `order` ascending (stable for ties)", () => {
    const out = buildSystemMessage([
      { heading: "B", body: "b", order: 10 },
      { heading: "A", body: "a", order: 0 },
    ]);
    expect(out.indexOf("## A")).toBeLessThan(out.indexOf("## B"));
  });

  it("a single string and the equivalent single section produce identical output", () => {
    const asString = buildSystemMessage("MRR: $10,000");
    const asSection = buildSystemMessage([{ heading: "Current Financial Data", body: "MRR: $10,000" }]);
    expect(asSection).toBe(asString);
  });
});

describe("buildSystemMessage — promptSections", () => {
  it("byte-identical when promptSections is omitted vs. passed as empty array", () => {
    const withoutParam = buildSystemMessage([{ heading: "X", body: "y" }], "Companion", "interactive", false, undefined);
    const withEmpty = buildSystemMessage([{ heading: "X", body: "y" }], "Companion", "interactive", false, undefined, []);
    expect(withEmpty).toBe(withoutParam);
  });

  it("inserts promptSection body AFTER buildSystemPrompt output and BEFORE the --- separator", () => {
    const sections: PromptSection[] = [{ id: "d", domain: "d", body: "EXTRA GUIDANCE" }];
    const out = buildSystemMessage([{ heading: "X", body: "y" }], "Companion", "interactive", false, undefined, sections);
    const promptEnd = buildSystemPrompt("Companion", "interactive", false);
    const idxPromptEnd = out.indexOf(promptEnd) + promptEnd.length;
    const idxExtra = out.indexOf("EXTRA GUIDANCE");
    const idxSeparator = out.indexOf("\n\n---\n\n");
    expect(idxExtra).toBeGreaterThan(idxPromptEnd);
    expect(idxExtra).toBeLessThan(idxSeparator);
    expect(out).toContain("EXTRA GUIDANCE");
  });

  it("sorts multiple promptSections by order ascending", () => {
    const sections: PromptSection[] = [
      { id: "b", domain: "d", body: "SECTION_B", order: 10 },
      { id: "a", domain: "d", body: "SECTION_A", order: 1 },
    ];
    const out = buildSystemMessage([{ heading: "X", body: "y" }], "Companion", "interactive", false, undefined, sections);
    expect(out.indexOf("SECTION_A")).toBeLessThan(out.indexOf("SECTION_B"));
  });
});

describe("resolveContextSections", () => {
  it("returns explicit contextSections when present", () => {
    const sections = [{ heading: "X", body: "y" }];
    expect(resolveContextSections({ contextSections: sections })).toBe(sections);
  });

  it("wraps legacy financialContext into a single Current Financial Data section", () => {
    expect(resolveContextSections({ financialContext: "MRR: $10,000" }))
      .toEqual([{ heading: "Current Financial Data", body: "MRR: $10,000" }]);
  });

  it("defaults to one empty Current Financial Data section when neither is set", () => {
    expect(resolveContextSections({}))
      .toEqual([{ heading: "Current Financial Data", body: "" }]);
  });

  it("prefers contextSections over financialContext when both are set", () => {
    const sections = [{ heading: "X", body: "y" }];
    expect(resolveContextSections({ contextSections: sections, financialContext: "ignored" }))
      .toBe(sections);
  });
});
