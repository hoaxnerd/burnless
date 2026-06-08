import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AiPermissionsPanel } from "./ai-permissions-panel";

const fetchMock = vi.fn();
vi.mock("@/lib/api-fetch", () => ({ apiFetch: (...a: unknown[]) => fetchMock(...a) }));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, opts?: { method?: string }) => {
    if (url === "/api/ai/permissions" && (!opts || opts.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => ({ defaults: { readMode: "always", writeMode: "ask", deleteMode: "ask", webSearchMode: "always", browserUseMode: "ask" } }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ defaults: { readMode: "always", writeMode: "session", deleteMode: "ask", webSearchMode: "always", browserUseMode: "ask" } }) });
  });
});

describe("AiPermissionsPanel", () => {
  it("loads and shows the five categories", async () => {
    render(<AiPermissionsPanel conversationId={null} />);
    await waitFor(() => expect(screen.getByText(/Create \/ update/i)).toBeTruthy());
    expect(screen.getByText(/Read data/i)).toBeTruthy();
    expect(screen.getByText(/Delete/i)).toBeTruthy();
    expect(screen.getByText(/Web search/i)).toBeTruthy();
    expect(screen.getByText(/Browser use/i)).toBeTruthy();
  });

  it("PUTs a changed mode", async () => {
    render(<AiPermissionsPanel conversationId={null} />);
    await waitFor(() => expect(screen.getByText(/Create \/ update/i)).toBeTruthy());
    // Choose "Allow for session" for the Write category.
    fireEvent.click(screen.getAllByRole("radio", { name: /Allow for session/i })[0]!);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ai/permissions",
        expect.objectContaining({ method: "PUT" })
      )
    );
  });

  it("Delete category does not offer 'Always allow'", async () => {
    render(<AiPermissionsPanel conversationId={null} />);
    await waitFor(() => expect(screen.getByText(/Delete/i)).toBeTruthy());
    // There are fewer "Always allow" buttons than categories because delete omits it.
    const always = screen.queryAllByRole("radio", { name: /Always allow/i });
    expect(always.length).toBe(4); // read, write, web_search, browser_use
  });
});
