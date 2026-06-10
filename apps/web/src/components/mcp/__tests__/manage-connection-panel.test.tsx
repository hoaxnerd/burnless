import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/swr";
import { ManageConnectionPanel } from "../manage-connection-panel";
import type { McpConnectionDto } from "../types";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
beforeEach(() => fetchMock.mockReset());

const CONN: McpConnectionDto = {
  id: "c1",
  name: "Stripe",
  slug: "stripe",
  ownerScope: "company" as const,
  transport: "streamable_http" as const,
  endpoint: "https://mcp.stripe.com",
  authType: "oauth" as const,
  status: "connected" as const,
  capabilities: null,
  lastError: null,
};
const TOOLS = [
  { name: "list_invoices", description: "List", enabled: true, permClass: "read", permClassOverride: null },
  { name: "refund_charge", description: null, enabled: false, permClass: "delete", permClassOverride: null },
];

/** SWR hooks need a fetcher; provide the real one (→ stubbed fetch) + a cold cache per test. */
function renderPanel(connection: McpConnectionDto | null, onClose: () => void = () => {}) {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>
      <ManageConnectionPanel connection={connection} onClose={onClose} />
    </SWRConfig>,
  );
}

describe("ManageConnectionPanel", () => {
  it("lists tools with perm tags and switch state", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => TOOLS });
    renderPanel(CONN);
    await waitFor(() => screen.getByText("list_invoices"));
    expect(screen.getByText("read")).toBeTruthy();
    expect(screen.getByText("delete")).toBeTruthy();
    const switches = screen.getAllByRole("switch");
    expect(switches[0]!.getAttribute("aria-checked")).toBe("true");
    expect(switches[1]!.getAttribute("aria-checked")).toBe("false");
  });

  it("toggling a tool PATCHes the prefs API", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => TOOLS })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    renderPanel(CONN);
    await waitFor(() => screen.getByText("list_invoices"));
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "PATCH",
      );
      expect(call).toBeTruthy();
      expect(String(call![0])).toBe("/api/mcp/connections/c1/tools");
      expect(
        JSON.parse((call![1] as RequestInit).body as string),
      ).toMatchObject({ toolName: "list_invoices", enabled: false });
    });
  });

  it("reverts the optimistic toggle when the PATCH fails", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => TOOLS })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "nope" }) });
    renderPanel(CONN);
    await waitFor(() => screen.getByText("list_invoices"));
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    await waitFor(() => {
      expect(screen.getAllByRole("switch")[0]!.getAttribute("aria-checked")).toBe("true");
    });
  });

  it("Remove connection confirms, DELETEs, and closes", async () => {
    const onClose = vi.fn();
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => TOOLS })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    renderPanel(CONN, onClose);
    await waitFor(() => screen.getByText("list_invoices"));
    fireEvent.click(screen.getByRole("button", { name: /remove connection/i }));
    // ConfirmDialog (destructive) → confirm.
    fireEvent.click(await screen.findByRole("button", { name: /^remove$/i }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
      );
      expect(call).toBeTruthy();
      expect(String(call![0])).toBe("/api/mcp/connections/c1");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows an Authenticate action when the connection needs auth", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    renderPanel({ ...CONN, status: "needs_auth" });
    expect(
      await screen.findByRole("button", { name: /authenticate/i }),
    ).toBeTruthy();
  });
});
