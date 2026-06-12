/**
 * ConnectorsCategory (S3b Task 9) — one row per visible MCP connection inside
 * the collapsible Connectors section. Connected → EnableSwitch (key `conn:<id>`);
 * non-connected → StatusPill. Expanding a connector lists its tools via
 * `useMcpConnectionTools` (mono name + PermClassTag + per-tool EnableSwitch,
 * key `conntool:<id>:<tool>`). Empty → inline "Add a connection →" link.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/swr";
import { ConnectorsCategory } from "../connectors-category";
import type { ToolsCtx } from "../tools-ctx";

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
    name: "GitHub",
    slug: "github",
    ownerScope: "personal",
    transport: "streamable_http",
    endpoint: "https://mcp.github.com",
    authType: "oauth",
    status: "needs_auth",
    capabilities: null,
    lastError: null,
  },
];

const TOOLS = [
  { name: "list_invoices", description: null, enabled: true, permClass: "read", permClassOverride: null },
  { name: "refund_charge", description: null, enabled: false, permClass: "delete", permClassOverride: null },
];

function makeCtx(over: Partial<ToolsCtx> = {}): ToolsCtx {
  return {
    conversationId: "chat-1",
    sessionDisabled: {},
    disabledConnections: new Set(),
    disabledBuiltins: new Set(),
    toggleSession: vi.fn(async () => {}),
    keepPermanent: vi.fn(async () => {}),
    ...over,
  };
}

function renderCat(ctx: ToolsCtx) {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>
      <ConnectorsCategory ctx={ctx} />
    </SWRConfig>,
  );
}

describe("ConnectorsCategory (S3b Task 9)", () => {
  it("renders a row per connection: connected → switch, pending → status pill", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("/api/mcp/connections") ? CONNS : {}),
    }));
    renderCat(makeCtx());
    await waitFor(() => screen.getByText("Stripe"));
    expect(screen.getByText("GitHub")).toBeTruthy();
    // connected Stripe → an enablement switch
    expect(screen.getByRole("switch", { name: /Use Stripe in chat/i })).toBeTruthy();
    // pending GitHub → status pill, no switch
    expect(screen.getByText(/Needs sign-in/i)).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /Use GitHub in chat/i })).toBeNull();
  });

  it("expanding a connector lists its tools (mono name + perm chip + switch)", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => {
        const u = String(url);
        if (u.includes("/tools")) return TOOLS;
        if (u.includes("/api/mcp/connections")) return CONNS;
        return {};
      },
    }));
    renderCat(makeCtx());
    await waitFor(() => screen.getByText("Stripe"));
    fireEvent.click(screen.getByRole("button", { name: /expand stripe/i }));
    await waitFor(() => screen.getByText("list_invoices"));
    expect(screen.getByText("refund_charge")).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Enable list_invoices/i })).toBeTruthy();
  });

  it("empty → shows the inline 'Add a connection →' link to /connections", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("/api/mcp/connections") ? [] : {}),
    }));
    renderCat(makeCtx());
    await waitFor(() => screen.getByText(/No connections yet/i));
    const link = screen.getByRole("link", { name: /connection/i });
    expect(link.getAttribute("href")).toBe("/connections");
  });

  it("a connection in disabledConnections renders the switch off", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("/api/mcp/connections") ? CONNS : {}),
    }));
    renderCat(makeCtx({ disabledConnections: new Set(["c1"]) }));
    await waitFor(() => screen.getByText("Stripe"));
    const sw = screen.getByRole("switch", { name: /Use Stripe in chat/i });
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });

  it("expander button name uses the connection name (unique per row)", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("/api/mcp/connections") ? CONNS : {}),
    }));
    renderCat(makeCtx());
    await waitFor(() => screen.getByText("Stripe"));
    // Each connected connector gets a uniquely-named expander (derived from name).
    expect(screen.getByRole("button", { name: /expand stripe/i })).toBeTruthy();
    // GitHub is non-connected → no expander.
    expect(screen.queryByRole("button", { name: /expand github/i })).toBeNull();
  });
});
