import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The connect card pulls in apiFetch (connect POST) and useLocale (last-sync
// formatting). Mock both so the tab mounts in isolation.
vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({ fmtDate: (d: Date | string) => `DATE(${String(d)})` }),
}));

import { IntegrationsTab } from "@/components/integrations/integrations-tab";
import type { ConnectedIntegration } from "@/components/integrations/integrations-data";
import { CapabilityProvider } from "@/components/providers/capability-context";
import { EDITION_PRESETS } from "@/lib/capabilities";

// Helper: render the tab for a given connected-Stripe row, with integrations
// capability ON (cloud preset enables it).
function renderTab(connected: ConnectedIntegration[]) {
  return render(
    <CapabilityProvider value={EDITION_PRESETS.cloud}>
      <IntegrationsTab
        connectedIntegrations={connected}
        notifiedIntegrations={new Set()}
        setNotifiedIntegrations={() => {}}
        disconnectIntegration={() => {}}
        onConnected={() => {}}
        getIntegrationStatus={(type) =>
          connected.some((i) => i.type === type && i.status === "active")
            ? "connected"
            : "available"
        }
        getConnectedId={(type) => connected.find((i) => i.type === type)?.id ?? null}
      />
    </CapabilityProvider>,
  );
}

describe("C3.2 — connected Stripe row renders the health view (reachability)", () => {
  it("surfaces the error indicator (role=alert) when lastError is set", () => {
    renderTab([
      {
        id: "int_stripe",
        type: "stripe",
        status: "active",
        lastSyncAt: "2026-06-26T00:00:00.000Z",
        lastError: "Stripe API timed out",
      },
    ]);

    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
    expect(alert.textContent).toMatch(/Stripe API timed out/);
  });

  it("renders the formatted last-sync and no alert when healthy (no lastError)", () => {
    renderTab([
      {
        id: "int_stripe",
        type: "stripe",
        status: "active",
        lastSyncAt: "2026-06-26T00:00:00.000Z",
        lastError: null,
      },
    ]);

    // last-sync routed through fmtDate proves the card's connected view rendered.
    expect(screen.getByText(/DATE\(/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
