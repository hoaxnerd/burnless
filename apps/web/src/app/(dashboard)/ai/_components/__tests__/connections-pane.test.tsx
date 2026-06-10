import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/swr";
import { ConnectionsPane } from "../connections-pane";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
beforeEach(() => fetchMock.mockReset());

const CONNS = [
  {
    id: "c1",
    name: "Stripe",
    slug: "stripe",
    ownerScope: "company",
    transport: "streamable_http",
    endpoint: "https://mcp.stripe.com",
    authType: "oauth",
    status: "connected",
    capabilities: { tools: [{ name: "a" }, { name: "b" }] },
    lastError: null,
  },
  {
    id: "c2",
    name: "Linear",
    slug: "linear",
    ownerScope: "personal",
    transport: "streamable_http",
    endpoint: "https://mcp.linear.app/mcp",
    authType: "oauth",
    status: "needs_auth",
    capabilities: null,
    lastError: null,
  },
];

/** SWR hooks need a fetcher; provide the real one (→ stubbed fetch) + a cold cache per test. */
function renderPane() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>
      <ConnectionsPane />
    </SWRConfig>,
  );
}

describe("ConnectionsPane (D11)", () => {
  it("lists connected connections with switches; disabled ids start off", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes("/api/mcp/connections") ? CONNS : { disabledMcpConnections: ["c1"] },
    }));
    renderPane();
    await waitFor(() => screen.getByText("Stripe"));
    const sw = screen.getAllByRole("switch")[0]!;
    expect(sw.getAttribute("aria-checked")).toBe("false"); // c1 disabled
    expect(screen.getByText(/Needs sign-in/)).toBeTruthy(); // c2 not toggleable, shows status
  });

  it("toggling persists the full disabled list via PATCH /api/user-preferences", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return { ok: true, json: async () => ({}) };
      return {
        ok: true,
        json: async () =>
          String(url).includes("/api/mcp/connections") ? CONNS : { disabledMcpConnections: [] },
      };
    });
    renderPane();
    await waitFor(() => screen.getByText("Stripe"));
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patch).toBeTruthy();
      expect(String(patch![0])).toBe("/api/user-preferences");
      expect(
        JSON.parse((patch![1] as RequestInit).body as string),
      ).toMatchObject({ disabledMcpConnections: ["c1"] });
    });
  });

  it("reverts the optimistic toggle when the PATCH fails", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH")
        return { ok: false, json: async () => ({ error: "nope" }) };
      return {
        ok: true,
        json: async () =>
          String(url).includes("/api/mcp/connections") ? CONNS : { disabledMcpConnections: [] },
      };
    });
    renderPane();
    await waitFor(() => screen.getByText("Stripe"));
    const sw = screen.getAllByRole("switch")[0]!;
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    await waitFor(() => {
      expect(screen.getAllByRole("switch")[0]!.getAttribute("aria-checked")).toBe("true");
    });
  });

  it("shows the empty state with a link to /connections", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes("/api/mcp/connections") ? [] : { disabledMcpConnections: [] },
    }));
    renderPane();
    await waitFor(() => screen.getByText(/No connections yet/));
    const link = screen.getByRole("link", { name: /connection/i });
    expect(link.getAttribute("href")).toBe("/connections");
  });
});
