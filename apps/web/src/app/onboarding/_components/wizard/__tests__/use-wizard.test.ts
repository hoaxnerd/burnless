import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWizard } from "../use-wizard";

const STEPS = ["company", "revenue", "funding", "expenses", "team"] as const;

describe("useWizard", () => {
  it("starts at index 0 and advances/back/skips within bounds", () => {
    const { result } = renderHook(() => useWizard(STEPS));
    expect(result.current.current).toBe("company");
    act(() => result.current.next());
    expect(result.current.current).toBe("revenue");
    act(() => result.current.back());
    expect(result.current.current).toBe("company");
    act(() => result.current.back()); // clamped
    expect(result.current.index).toBe(0);
    act(() => result.current.skip());  // skip == next
    expect(result.current.current).toBe("revenue");
  });
  it("reports isFirst/isLast and goTo", () => {
    const { result } = renderHook(() => useWizard(STEPS));
    expect(result.current.isFirst).toBe(true);
    act(() => result.current.goTo("team"));
    expect(result.current.isLast).toBe(true);
  });
});
