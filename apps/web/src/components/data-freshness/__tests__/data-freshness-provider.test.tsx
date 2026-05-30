import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { DataFreshnessProvider } from "../data-freshness-provider";
import { publishMutation, MUTATION_SYNC_KEY, resetMutationBusForTesting } from "@/lib/mutation-bus";

beforeEach(() => { refresh.mockClear(); resetMutationBusForTesting(); vi.useFakeTimers(); });

describe("DataFreshnessProvider", () => {
  it("does NOT refresh on a same-tab event (the component owns same-tab refresh)", () => {
    render(<DataFreshnessProvider><div /></DataFreshnessProvider>);
    act(() => { publishMutation({ domain: "expenses", method: "PATCH", at: 1 }); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does NOT refresh a cross-tab event immediately; refreshes on focus", () => {
    render(<DataFreshnessProvider><div /></DataFreshnessProvider>);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: MUTATION_SYNC_KEY,
        newValue: JSON.stringify({ domain: "team", method: "POST", at: 2 }),
      }));
      vi.advanceTimersByTime(350);
    });
    expect(refresh).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
