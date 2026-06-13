import { describe, it, expect, expectTypeOf } from "vitest";
import type { ConfigItemDescriptor, WizardItemKind } from "../config-item";
import { aiConfigDescriptor } from "../ai-config-descriptor";

describe("config-item seam", () => {
  it("WizardItemKind admits 'configuration' | 'data'", () => {
    expectTypeOf<WizardItemKind>().toEqualTypeOf<"configuration" | "data">();

    // both literals must be assignable to the union
    const configuration: WizardItemKind = "configuration";
    const data: WizardItemKind = "data";
    expectTypeOf(configuration).toMatchTypeOf<WizardItemKind>();
    expectTypeOf(data).toMatchTypeOf<WizardItemKind>();
  });

  it("an AI-config descriptor satisfies ConfigItemDescriptor", () => {
    const aiConfig = {
      id: "ai-config",
      kind: "configuration",
      // Wording does NOT claim same-session autofill: enrichment already ran at
      // the website step, so a provider configured here powers AI features going
      // forward (chat, insights, a later session), not the current suggestions.
      title: "Connect your AI",
      description: "Bring your own provider to power chat, insights and automations.",
      hiddenWhenCapability: "managedAiProvider",
      skippable: true,
      render: (_ref) => null,
    } satisfies ConfigItemDescriptor;

    expectTypeOf(aiConfig.kind).toEqualTypeOf<"configuration">();
    expectTypeOf(aiConfig.id).toBeString();
    expectTypeOf(aiConfig.skippable).toBeBoolean();
  });

  // The production descriptor instance the wizard reads (load-bearing seam).
  describe("aiConfigDescriptor (production instance)", () => {
    it("is a configuration item gated on managedAiProvider, optional", () => {
      expect(aiConfigDescriptor.kind).toBe("configuration");
      expect(aiConfigDescriptor.id).toBe("ai-config");
      expect(aiConfigDescriptor.hiddenWhenCapability).toBe("managedAiProvider");
      expect(aiConfigDescriptor.skippable).toBe(true);
    });

    it("carries a title + description the wizard reads (no autofill claim)", () => {
      expect(aiConfigDescriptor.title).toBeTruthy();
      expect(aiConfigDescriptor.description).toBeTruthy();
      // Must NOT claim same-session autofill (enrichment already ran upfront).
      expect(aiConfigDescriptor.description.toLowerCase()).not.toContain("autofill");
    });

    it("render returns a node (descriptor drives the panel)", () => {
      const node = aiConfigDescriptor.render({ current: null });
      expect(node).toBeTruthy();
    });
  });
});
