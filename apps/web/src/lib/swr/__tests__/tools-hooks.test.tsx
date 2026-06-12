/**
 * S3b AI Tools pane — SWR wiring for the built-in browser-availability row and
 * the per-conversation session-disabled tool map.
 */
import { describe, it, expect, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import { KEYS } from "../keys";
import {
  useBrowserAvailability,
  useSessionDisabledTools,
  type UserPreferencesDto,
} from "../hooks";

function withSwr(node: React.ReactNode, fetcher: (key: string) => Promise<unknown>) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, fetcher }}>
      {node}
    </SWRConfig>,
  );
}

describe("AI Tools pane SWR keys", () => {
  it("exposes the browser-availability + session-disabled keys", () => {
    expect(KEYS.browserAvailability).toBe("/api/browser/availability");
    expect(KEYS.sessionDisabledTools("conv-1")).toBe(
      "/api/chat/session-tools?conversationId=conv-1",
    );
  });

  it("UserPreferencesDto includes disabledBuiltinTools", () => {
    // Type-level assertion: the field must be assignable.
    const dto: UserPreferencesDto = { disabledBuiltinTools: ["builtin:get_metrics"] };
    expect(dto.disabledBuiltinTools).toEqual(["builtin:get_metrics"]);
  });
});

describe("useBrowserAvailability", () => {
  it("fetches the availability endpoint", async () => {
    const fetcher = vi.fn(async () => ({ connected: true, chromiumInstalled: true }));
    function Probe() {
      const { data } = useBrowserAvailability();
      return <span data-testid="v">{data ? String(data.connected) : "—"}</span>;
    }
    const { getByTestId } = withSwr(<Probe />, fetcher);

    await waitFor(() => expect(getByTestId("v").textContent).toBe("true"));
    expect(fetcher).toHaveBeenCalledWith(KEYS.browserAvailability);
  });
});

describe("useSessionDisabledTools", () => {
  it("fetches the keyed endpoint when a conversation is active", async () => {
    const fetcher = vi.fn(async () => ({ "builtin:get_metrics": true }));
    function Probe() {
      const { data } = useSessionDisabledTools("conv-1");
      return <span data-testid="v">{data ? JSON.stringify(data) : "—"}</span>;
    }
    const { getByTestId } = withSwr(<Probe />, fetcher);

    await waitFor(() =>
      expect(getByTestId("v").textContent).toBe('{"builtin:get_metrics":true}'),
    );
    expect(fetcher).toHaveBeenCalledWith(KEYS.sessionDisabledTools("conv-1"));
  });

  it("does not fetch when conversationId is null", async () => {
    const fetcher = vi.fn(async () => ({}));
    function Probe() {
      useSessionDisabledTools(null);
      return <span data-testid="v">x</span>;
    }
    withSwr(<Probe />, fetcher);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
