/**
 * ToolsPane (S3b Task 12) — the orchestrator. Builds the shared {@link ToolsCtx}
 * (session + permanent disabled state + the two enablement callbacks) and renders
 * the three categories in order Connectors → Web → Workspace, then the footer hint
 * and (only with a conversation) the "Reset session grants" button.
 *
 * The three category components are mocked so the orchestrator is exercised in
 * isolation: each mock records the `ctx` it was handed so the tests can invoke
 * `keepPermanent` / `toggleSession` directly and assert the resulting fetches.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/swr";
import type { ToolsCtx } from "../tools-ctx";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Capture the ctx each category receives so tests can drive the callbacks.
const seen: { connectors?: ToolsCtx; web?: ToolsCtx; workspace?: ToolsCtx } = {};

vi.mock("../connectors-category", () => ({
  ConnectorsCategory: ({ ctx }: { ctx: ToolsCtx }) => {
    seen.connectors = ctx;
    return <div data-testid="cat-connectors">Connectors</div>;
  },
}));
vi.mock("../web-category", () => ({
  WebCategory: ({ ctx }: { ctx: ToolsCtx }) => {
    seen.web = ctx;
    return <div data-testid="cat-web">Web</div>;
  },
}));
vi.mock("../workspace-category", () => ({
  WorkspaceCategory: ({ ctx }: { ctx: ToolsCtx }) => {
    seen.workspace = ctx;
    return <div data-testid="cat-workspace">Workspace</div>;
  },
}));

// eslint-disable-next-line import/first
import { ToolsPane } from "../tools-pane";

beforeEach(() => {
  fetchMock.mockReset();
  seen.connectors = undefined;
  seen.web = undefined;
  seen.workspace = undefined;
});

const PREFS = { disabledMcpConnections: ["conn-existing"], disabledBuiltinTools: ["already_off"] };
const SESSION = { "builtin:foo": true };

function renderPane(conversationId: string | null) {
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/user-preferences")) return { ok: true, json: async () => PREFS };
    if (u.includes("/api/chat/session-tools")) return { ok: true, json: async () => SESSION };
    if (u.includes("/api/chat/reset-grants")) return { ok: true, json: async () => ({ ok: true }) };
    if (u.includes("/api/mcp/connections")) return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => ({}) };
  });
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>
      <ToolsPane conversationId={conversationId} />
    </SWRConfig>,
  );
}

function lastPatchTo(fragment: string) {
  return [...fetchMock.mock.calls]
    .reverse()
    .find(
      (c) =>
        String(c[0]).includes(fragment) &&
        (c[1] as RequestInit | undefined)?.method === "PATCH",
    );
}

describe("ToolsPane (S3b Task 12)", () => {
  it("renders the three categories in order Connectors → Web → Workspace + the footer", async () => {
    renderPane("chat-1");
    await waitFor(() => screen.getByTestId("cat-connectors"));
    const ids = [
      screen.getByTestId("cat-connectors"),
      screen.getByTestId("cat-web"),
      screen.getByTestId("cat-workspace"),
    ];
    // Document order: connectors before web before workspace.
    expect(ids[0]!.compareDocumentPosition(ids[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ids[1]!.compareDocumentPosition(ids[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/session/i)).toBeTruthy(); // footer hint mentions session scope
  });

  it("passes permanent + session disabled state into the ctx", async () => {
    renderPane("chat-1");
    await waitFor(() => expect(seen.connectors).toBeTruthy());
    await waitFor(() => expect(seen.connectors!.disabledConnections.has("conn-existing")).toBe(true));
    expect(seen.connectors!.disabledBuiltins.has("already_off")).toBe(true);
    await waitFor(() => expect(seen.connectors!.sessionDisabled["builtin:foo"]).toBe(true));
  });

  it("shows 'Reset session grants' ONLY with a conversation and POSTs reset-grants", async () => {
    renderPane("chat-1");
    const btn = await screen.findByRole("button", { name: /reset session grants/i });
    fireEvent.click(btn);
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) =>
          String(c[0]).includes("/api/chat/reset-grants") &&
          (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeTruthy();
      expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({
        conversationId: "chat-1",
      });
    });
  });

  it("hides the reset button when there is no conversation", async () => {
    renderPane(null);
    await waitFor(() => screen.getByTestId("cat-connectors"));
    expect(screen.queryByRole("button", { name: /reset session grants/i })).toBeNull();
  });

  it("keepPermanent('conn:x', true) PATCHes user-preferences with x added to disabledMcpConnections", async () => {
    renderPane("chat-1");
    await waitFor(() => expect(seen.connectors).toBeTruthy());
    await waitFor(() => expect(seen.connectors!.disabledConnections.has("conn-existing")).toBe(true));
    await act(async () => {
      await seen.connectors!.keepPermanent("conn:x", true);
    });
    const patch = lastPatchTo("/api/user-preferences");
    expect(patch).toBeTruthy();
    const body = JSON.parse((patch![1] as RequestInit).body as string) as {
      disabledMcpConnections: string[];
    };
    expect(body.disabledMcpConnections).toContain("x");
    expect(body.disabledMcpConnections).toContain("conn-existing");
  });

  it("keepPermanent('builtin:foo', true) PATCHes user-preferences disabledBuiltinTools", async () => {
    renderPane("chat-1");
    await waitFor(() => expect(seen.workspace).toBeTruthy());
    await waitFor(() => expect(seen.workspace!.disabledBuiltins.has("already_off")).toBe(true));
    await act(async () => {
      await seen.workspace!.keepPermanent("builtin:bar", true);
    });
    const patch = lastPatchTo("/api/user-preferences");
    expect(patch).toBeTruthy();
    const body = JSON.parse((patch![1] as RequestInit).body as string) as {
      disabledBuiltinTools: string[];
    };
    expect(body.disabledBuiltinTools).toContain("bar");
    expect(body.disabledBuiltinTools).toContain("already_off");
  });

  it("keepPermanent('conntool:c1:t', true) PATCHes the connection's tools endpoint", async () => {
    renderPane("chat-1");
    await waitFor(() => expect(seen.connectors).toBeTruthy());
    await act(async () => {
      await seen.connectors!.keepPermanent("conntool:c1:my_tool", true);
    });
    const patch = lastPatchTo("/api/mcp/connections/c1/tools");
    expect(patch).toBeTruthy();
    expect(JSON.parse((patch![1] as RequestInit).body as string)).toMatchObject({
      toolName: "my_tool",
      enabled: false,
    });
  });

  it("toggleSession PATCHes /api/chat/session-tools", async () => {
    renderPane("chat-1");
    await waitFor(() => expect(seen.connectors).toBeTruthy());
    await act(async () => {
      await seen.connectors!.toggleSession("builtin:baz", true);
    });
    const patch = lastPatchTo("/api/chat/session-tools");
    expect(patch).toBeTruthy();
    expect(JSON.parse((patch![1] as RequestInit).body as string)).toMatchObject({
      conversationId: "chat-1",
      key: "builtin:baz",
      disabled: true,
    });
  });

  it("toggleSession is a no-op when there is no conversation", async () => {
    renderPane(null);
    await waitFor(() => expect(seen.connectors).toBeTruthy());
    await act(async () => {
      await seen.connectors!.toggleSession("builtin:baz", true);
    });
    expect(lastPatchTo("/api/chat/session-tools")).toBeUndefined();
  });
});
