import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddConnectionModal } from "../add-connection-modal";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => fetchMock.mockReset());

describe("AddConnectionModal", () => {
  it("opens on the Paste config tab with scope defaulting to Company", () => {
    render(<AddConnectionModal open onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText("Paste config")).toBeTruthy();
    expect(screen.getByPlaceholderText(/paste/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /company/i }).className,
    ).toMatch(/border-brand-500/);
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
});
