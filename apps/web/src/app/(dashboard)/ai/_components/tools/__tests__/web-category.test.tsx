/**
 * WebCategory (S3b Task 10) — the Web section: a web-search row (enablement
 * EnableSwitch + webSearchMode posture) and a browser-use row that is hidden on
 * cloud (`stdioMcp` off), shows a setup card when not-ready (self-host), and a
 * browserUseMode posture when ready.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/swr";
import { CapabilityProvider } from "@/components/providers/capability-context";
import type { Capabilities } from "@/lib/capabilities";
import { WebCategory } from "../web-category";
import type { ToolsCtx } from "../tools-ctx";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
beforeEach(() => fetchMock.mockReset());

const PERMS = {
  defaults: {
    readMode: "always",
    writeMode: "ask",
    deleteMode: "ask",
    webSearchMode: "always",
    browserUseMode: "ask",
  },
};

function caps(over: Partial<Capabilities> = {}): Capabilities {
  return {
    oauthLogin: false,
    autoLogin: true,
    stdioMcp: true,
    planEnforcement: false,
    ...over,
  } as Capabilities;
}

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

function renderCat(ctx: ToolsCtx, c: Capabilities, avail: unknown = { connected: true, chromiumInstalled: true }) {
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/ai/permissions")) return { ok: true, json: async () => PERMS };
    if (u.includes("/api/browser/availability")) return { ok: true, json: async () => avail };
    if (u.includes("/api/browser/install")) return { ok: true, json: async () => ({ ok: true }) };
    return { ok: true, json: async () => ({}) };
  });
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>
      <CapabilityProvider value={c}>
        <WebCategory ctx={ctx} />
      </CapabilityProvider>
    </SWRConfig>,
  );
}

describe("WebCategory (S3b Task 10)", () => {
  it("web-search row: enablement switch + posture segmented control", async () => {
    // Browser not-ready → exactly one posture radiogroup (web search).
    renderCat(makeCtx(), caps(), { connected: false, chromiumInstalled: false });
    await waitFor(() => screen.getByText("Web search"));
    expect(screen.getByRole("switch", { name: /web search/i })).toBeTruthy();
    // posture radiogroup with Always selected (webSearchMode = always)
    const always = screen.getByRole("radio", { name: /always/i });
    expect(always.getAttribute("aria-checked")).toBe("true");
  });

  it("toggling web search off routes BOTH search_web and read_webpage through session layer", async () => {
    const toggleSession = vi.fn(async () => {});
    renderCat(makeCtx({ toggleSession }), caps());
    await waitFor(() => screen.getByText("Web search"));
    fireEvent.click(screen.getByRole("switch", { name: /web search/i }));
    await waitFor(() => expect(toggleSession).toHaveBeenCalledWith("builtin:search_web", true));
    expect(toggleSession).toHaveBeenCalledWith("builtin:read_webpage", true);
  });

  it("changing web-search posture PUTs /api/ai/permissions", async () => {
    // Browser not-ready → only the web-search posture radiogroup is present.
    renderCat(makeCtx(), caps(), { connected: false, chromiumInstalled: false });
    await waitFor(() => screen.getByText("Web search"));
    fireEvent.click(screen.getByRole("radio", { name: /ask first/i }));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "PUT",
      );
      expect(put).toBeTruthy();
      expect(String(put![0])).toBe("/api/ai/permissions");
      expect(JSON.parse((put![1] as RequestInit).body as string)).toMatchObject({
        webSearchMode: "ask",
      });
    });
  });

  it("browser-use row is HIDDEN when stdioMcp capability is off (cloud)", async () => {
    renderCat(makeCtx(), caps({ stdioMcp: false }));
    await waitFor(() => screen.getByText("Web search"));
    expect(screen.queryByText(/Browser use/i)).toBeNull();
  });

  it("browser-use not-ready → setup card + Set up browser button calls install then revalidates", async () => {
    renderCat(makeCtx(), caps(), { connected: false, chromiumInstalled: false });
    await waitFor(() => screen.getByText(/Set up browser control/i));
    fireEvent.click(screen.getByRole("button", { name: /set up browser/i }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) =>
          String(c[0]).includes("/api/browser/install") &&
          (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeTruthy();
    });
  });

  it("browser-use ready → posture segmented (browserUseMode), no setup card", async () => {
    renderCat(makeCtx(), caps(), { connected: true, chromiumInstalled: true });
    await waitFor(() => screen.getByText(/Browser use/i));
    expect(screen.queryByText(/Set up browser control/i)).toBeNull();
    // two posture radiogroups now exist (web search + browser use)
    expect(screen.getAllByRole("radiogroup").length).toBe(2);
  });
});
