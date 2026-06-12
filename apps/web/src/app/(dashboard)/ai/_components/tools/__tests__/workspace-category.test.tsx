/**
 * WorkspaceCategory (S3b Task 11) — three posture rows (read/write/delete; delete
 * has no "always") over /api/ai/permissions, plus the collapsible "Individual
 * built-in tools" disclosure (client-side search + per-tool EnableSwitch keyed
 * `builtin:<name>`). web_search/browser_use built-ins are NOT listed here (they
 * live in the Web category).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/swr";
import { WorkspaceCategory } from "../workspace-category";
import type { ToolsCtx } from "../tools-ctx";

vi.mock("@burnless/ai", () => ({
  listBuiltinToolsForControl: () => [
    { name: "get_metrics", category: "read" },
    { name: "create_scenario", category: "write" },
    { name: "record_transaction", category: "write" },
    { name: "delete_scenario", category: "delete" },
    { name: "search_web", category: "web_search" }, // must be excluded
  ],
}));

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
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes("/api/ai/permissions"))
      return { ok: true, json: async () => PERMS };
    return { ok: true, json: async () => ({}) };
  });
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>
      <WorkspaceCategory ctx={ctx} />
    </SWRConfig>,
  );
}

describe("WorkspaceCategory (S3b Task 11)", () => {
  it("renders three posture rows; delete row has no 'Always' option", async () => {
    renderCat(makeCtx());
    await waitFor(() => screen.getByText("Read data"));
    expect(screen.getByText(/Create/i)).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
    // read/write rows offer 3 options (Always present); delete offers 2.
    const groups = screen.getAllByRole("radiogroup");
    expect(groups.length).toBe(3);
    // exactly two "Always" radios (read + write), none for delete
    expect(screen.getAllByRole("radio", { name: /always/i }).length).toBe(2);
  });

  it("changing a posture row PUTs /api/ai/permissions with that mode", async () => {
    renderCat(makeCtx());
    await waitFor(() => screen.getByText("Read data"));
    // read defaults to always → click "This chat" (session) in the read row.
    const readGroup = screen.getAllByRole("radiogroup")[0]!;
    const sessionRadio = within(readGroup).getByRole("radio", { name: /this chat/i });
    fireEvent.click(sessionRadio);
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "PUT",
      );
      expect(put).toBeTruthy();
      expect(JSON.parse((put![1] as RequestInit).body as string)).toMatchObject({
        readMode: "session",
      });
    });
  });

  it("built-in tools disclosure expands → search input + per-tool switches", async () => {
    renderCat(makeCtx());
    await waitFor(() => screen.getByText("Read data"));
    // collapsed by default — tools not shown
    expect(screen.queryByText("get_metrics")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /individual built-in tools/i }));
    await waitFor(() => screen.getByText("get_metrics"));
    // search_web excluded (web category owns it)
    expect(screen.queryByText("search_web")).toBeNull();
    // per-tool switch present
    expect(screen.getByRole("switch", { name: /enable get_metrics/i })).toBeTruthy();
    expect(screen.getByRole("searchbox")).toBeTruthy();
  });

  it("search filters the built-in tool list by name", async () => {
    renderCat(makeCtx());
    await waitFor(() => screen.getByText("Read data"));
    fireEvent.click(screen.getByRole("button", { name: /individual built-in tools/i }));
    await waitFor(() => screen.getByText("get_metrics"));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "scenario" } });
    expect(screen.getByText("create_scenario")).toBeTruthy();
    expect(screen.getByText("delete_scenario")).toBeTruthy();
    expect(screen.queryByText("get_metrics")).toBeNull();
  });

  it("disclosure label shows the off-count from disabledBuiltins", async () => {
    renderCat(makeCtx({ disabledBuiltins: new Set(["record_transaction"]) }));
    await waitFor(() => screen.getByText("Read data"));
    expect(screen.getByText(/1 off/i)).toBeTruthy();
  });
});
