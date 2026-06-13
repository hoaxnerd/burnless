import { describe, it, expectTypeOf } from "vitest";
import type { ConfigItemDescriptor, WizardItemKind } from "../config-item";

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
      title: "Connect your AI",
      description: "Add an AI provider so the data steps can autofill.",
      hiddenWhenCapability: "managedAiProvider",
      skippable: true,
      render: (_ref) => null,
    } satisfies ConfigItemDescriptor;

    expectTypeOf(aiConfig.kind).toEqualTypeOf<"configuration">();
    expectTypeOf(aiConfig.id).toBeString();
    expectTypeOf(aiConfig.skippable).toBeBoolean();
  });
});
