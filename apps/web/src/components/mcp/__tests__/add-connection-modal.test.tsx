import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as baseRender, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { AddConnectionModal } from "../add-connection-modal";
import { CapabilityProvider } from "@/components/providers/capability-context";
import { EDITION_PRESETS } from "@/lib/capabilities";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => fetchMock.mockReset());

// The modal reads useCapabilities() to decide whether to show the scope
// toggle (Task 13). Render under the cloud preset (multiTenant: true) so the
// Company/Personal toggle is present, matching these tests' expectations.
function render(ui: ReactElement) {
  return baseRender(
    <CapabilityProvider value={EDITION_PRESETS.cloud}>{ui}</CapabilityProvider>,
  );
}

describe("AddConnectionModal", () => {
  it("opens on the Paste config tab with scope defaulting to Company", () => {
    render(<AddConnectionModal open onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText("Paste config")).toBeTruthy();
    expect(screen.getByPlaceholderText(/paste/i)).toBeTruthy();
    // Selection is ARIA state, not a color class (A11Y-CTRL-04).
    expect(
      screen.getByRole("button", { name: /company/i }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /personal/i }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("submits pasted config + scope and surfaces needs_auth as the OAuth step", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "c9",
        name: "stripe",
        slug: "stripe",
        status: "needs_auth",
        authType: "oauth",
      }),
    });
    render(<AddConnectionModal open onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/paste/i), {
      target: {
        value: `{"stripe":{"type":"http","url":"https://mcp.stripe.com"}}`,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(screen.getByText(/authorize with/i)).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/mcp/connections");
    expect(
      JSON.parse((init as RequestInit).body as string),
    ).toMatchObject({ ownerScope: "company" });
  });

  it("token fallback posts the PAT and never renders it back", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "c9",
          slug: "gh",
          status: "needs_auth",
          authType: "oauth",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "c9", status: "connected", authType: "pat" }),
      });
    const onCreated = vi.fn();
    render(<AddConnectionModal open onClose={() => {}} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText(/paste/i), {
      target: { value: `{"gh":{"type":"http","url":"https://gh.example/mcp"}}` },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByText(/use an access token/i));
    fireEvent.click(screen.getByText(/use an access token/i));
    fireEvent.change(screen.getByLabelText(/access token/i), {
      target: { value: "ghp_abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save token/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/mcp/connections/c9/credentials");
    expect(document.body.textContent).not.toContain("ghp_abc");
  });

  it("surfaces a network-level fetch failure as an inline error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<AddConnectionModal open onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/paste/i), {
      target: {
        value: `{"stripe":{"type":"http","url":"https://mcp.stripe.com"}}`,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/network error/i),
    );
  });

  it("a Continue resolving after Cancel revalidates the grid but never advances the closed modal", async () => {
    let resolveFetch!: (v: unknown) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );
    const onClose = vi.fn();
    const onCreated = vi.fn();
    render(<AddConnectionModal open onClose={onClose} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText(/paste/i), {
      target: {
        value: `{"stripe":{"type":"http","url":"https://mcp.stripe.com"}}`,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    // The POST lands after the close — the row exists server-side.
    resolveFetch({
      ok: true,
      json: async () => ({
        id: "c9",
        name: "stripe",
        slug: "stripe",
        status: "needs_auth",
        authType: "oauth",
      }),
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(screen.queryByText(/authorize with/i)).toBeNull();
  });
});
