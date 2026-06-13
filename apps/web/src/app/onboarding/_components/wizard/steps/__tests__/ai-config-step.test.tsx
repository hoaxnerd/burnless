import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render } from "@testing-library/react";

// AiConfigStep renders AiProvidersManager, which self-fetches via SWR. Mock the
// hooks so the empty state renders (and the modal's models hook never hits the
// network) — same pattern as ai-providers-gating.test.tsx.
vi.mock("@/lib/swr", async (o) => ({
  ...(await o<typeof import("@/lib/swr")>()),
  useAiProviders: () => ({ data: { providers: [] }, isLoading: false }),
  useAiProviderModels: () => ({ data: { models: [] }, isLoading: false }),
}));

import { AiConfigStep } from "../ai-config-step";
import type { WizardStepHandle } from "../../types";

describe("AiConfigStep", () => {
  it("renders the AiProvidersManager content + empty state", () => {
    const ref = createRef<WizardStepHandle>();
    const { queryByText } = render(<AiConfigStep ref={ref} />);
    expect(queryByText("AI Providers")).toBeInTheDocument();
    expect(queryByText("No AI provider connected")).toBeInTheDocument();
  });

  it("renders the step heading", () => {
    const ref = createRef<WizardStepHandle>();
    const { queryByText } = render(<AiConfigStep ref={ref} />);
    expect(queryByText(/connect your ai/i)).toBeInTheDocument();
  });

  it("submit() resolves true even with zero providers (optional step)", async () => {
    const ref = createRef<WizardStepHandle>();
    render(<AiConfigStep ref={ref} />);
    expect(ref.current).not.toBeNull();
    const ok = await ref.current!.submit();
    expect(ok).toBe(true);
  });
});
