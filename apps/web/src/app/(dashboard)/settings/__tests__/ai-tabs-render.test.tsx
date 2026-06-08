import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { DEFAULT_AI_FLAGS } from "@burnless/ai";
import type { AiProviderConfig } from "@/components/ai/ai-feature-context";

vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));

// AiPermissionsPanel pulls in SWR + apiFetch; stub it so the tab mounts cleanly.
vi.mock("@/app/(dashboard)/ai/_components/ai-permissions-panel", () => ({
  AiPermissionsPanel: () => <div data-testid="ai-permissions-panel" />,
}));

// AiDashboardTab data hook + locale formatting.
vi.mock("@/lib/swr", () => ({
  useAiDashboard: () => ({ data: null, isLoading: false }),
}));
vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({
    fmtCurrency: (n: number) => `$${n}`,
    fmtPercent: (n: number) => `${n}%`,
  }),
}));

import { AiFeaturesTab } from "../ai-features-tab";
import { AiDashboardTab } from "../ai-dashboard-tab";
import { tabs } from "../settings-data";

const providerConfig: AiProviderConfig = {
  byokEnabled: false,
  aiProvider: null,
  aiApiKey: null,
  aiModel: null,
  aiBaseUrl: null,
};

describe("SET-07 — AI settings tabs are shipped", () => {
  it("settings tabs list includes the AI Features + AI Dashboard entries", () => {
    const keys = tabs.map((t) => t.key);
    expect(keys).toContain("ai");
    expect(keys).toContain("ai-dashboard");
  });

  it("AiFeaturesTab mounts without throwing against live flags", () => {
    expect(() =>
      render(
        <AiFeaturesTab
          flags={DEFAULT_AI_FLAGS}
          updateFlags={vi.fn()}
          credits={null}
          providerConfig={providerConfig}
        />
      )
    ).not.toThrow();
  });

  it("AiFeaturesTab mounts with master switch ON (provider section reachable)", () => {
    expect(() =>
      render(
        <AiFeaturesTab
          flags={{ ...DEFAULT_AI_FLAGS, masterEnabled: true }}
          updateFlags={vi.fn()}
          credits={null}
          providerConfig={{ ...providerConfig, byokEnabled: true }}
        />
      )
    ).not.toThrow();
  });

  it("AiDashboardTab mounts without throwing", () => {
    expect(() => render(<AiDashboardTab />)).not.toThrow();
  });
});
