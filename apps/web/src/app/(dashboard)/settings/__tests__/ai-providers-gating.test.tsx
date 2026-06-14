import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// The AiProvidersManager renders its own SWR hooks. Mock them so the empty
// state renders (and the modal's models hook never hits the network).
vi.mock("@/lib/swr", async (o) => ({
  ...(await o<typeof import("@/lib/swr")>()),
  useAiProviders: () => ({ data: { providers: [] }, isLoading: false }),
  useAiProviderModels: () => ({ data: { models: [] }, isLoading: false }),
}));

import { AiFeaturesTab } from "../ai-features-tab";
import { CapabilityProvider } from "@/components/providers/capability-context";
import { EDITION_PRESETS } from "@/lib/capabilities";
import { DEFAULT_AI_FLAGS } from "@burnless/ai";

const flags = { ...DEFAULT_AI_FLAGS, masterEnabled: true };

const tab = (edition: "self_host" | "cloud") => (
  <CapabilityProvider value={EDITION_PRESETS[edition]}>
    <AiFeaturesTab flags={flags as never} updateFlags={vi.fn()} credits={null} />
  </CapabilityProvider>
);

describe("AI Providers manager gating", () => {
  it("shows on self-host", () => {
    const { queryByText } = render(tab("self_host"));
    expect(queryByText("AI Providers")).toBeInTheDocument();
  });

  it("is hidden on cloud (managedAiProvider ON)", () => {
    const { queryByText } = render(tab("cloud"));
    expect(queryByText("AI Providers")).not.toBeInTheDocument();
  });
});
