import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CapabilityProvider } from "@/components/providers/capability-context";
import { EDITION_PRESETS, type Capabilities } from "@/lib/capabilities";

// The three tab panels pull in SWR hooks + heavy MCP/integrations subtrees.
// This test is about the tab CONTROL (segments + gating + panel switch), so
// stub each panel with a marker. Real panel behavior is covered elsewhere.
vi.mock("@/components/mcp/connections-grid", () => ({
  ConnectionsGrid: () => <div data-testid="panel-connected">connected-grid</div>,
}));
vi.mock("@/components/mcp/your-mcp-tab", () => ({
  YourMcpTab: () => <div data-testid="panel-your-mcp">your-mcp</div>,
}));
vi.mock("@/components/integrations/integrations-tab-container", () => ({
  IntegrationsTabContainer: () => (
    <div data-testid="panel-integrations">integrations</div>
  ),
}));

// connections-tabs reads `?tab=` via useSearchParams. Each test sets the params.
let mockParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockParams,
}));

import { ConnectionsTabs } from "@/components/mcp/connections-tabs";

function renderTabs(caps: Capabilities, params = "") {
  mockParams = new URLSearchParams(params);
  return render(
    <CapabilityProvider value={caps}>
      <ConnectionsTabs mcpEndpoint="https://x/mcp" userRole="owner" />
    </CapabilityProvider>,
  );
}

const withIntegrations = EDITION_PRESETS.cloud; // integrations: true
const withoutIntegrations = {
  ...EDITION_PRESETS.cloud,
  integrations: false,
} as Capabilities;

describe("ConnectionsTabs — Integrations as a gated third tab", () => {
  beforeEach(() => {
    mockParams = new URLSearchParams();
  });

  it("shows 3 segments incl. Integrations and labels the first 'Connected MCPs' when integrations is on", () => {
    renderTabs(withIntegrations);
    const group = screen.getByRole("radiogroup", { name: "MCP view" });
    const segments = within(group).getAllByRole("radio");
    expect(segments).toHaveLength(3);
    const labels = segments.map((s) => s.textContent);
    expect(labels).toEqual(["Connected MCPs", "Your MCP", "Integrations"]);
  });

  it("shows only 2 segments and no Integrations when the capability is off", () => {
    renderTabs(withoutIntegrations);
    const group = screen.getByRole("radiogroup", { name: "MCP view" });
    const segments = within(group).getAllByRole("radio");
    expect(segments).toHaveLength(2);
    const labels = segments.map((s) => s.textContent);
    expect(labels).toEqual(["Connected MCPs", "Your MCP"]);
    expect(within(group).queryByText("Integrations")).toBeNull();
  });

  it("renders the Integrations panel when ?tab=integrations and the capability is on", () => {
    renderTabs(withIntegrations, "tab=integrations");
    expect(screen.getByTestId("panel-integrations")).toBeTruthy();
    expect(screen.queryByTestId("panel-connected")).toBeNull();
  });

  it("falls back to the Connected panel when ?tab=integrations but the capability is off", () => {
    renderTabs(withoutIntegrations, "tab=integrations");
    expect(screen.getByTestId("panel-connected")).toBeTruthy();
    expect(screen.queryByTestId("panel-integrations")).toBeNull();
  });
});
