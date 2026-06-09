import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const success = vi.fn();
const error = vi.fn();

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success, error }),
}));

import { useMutationFeedback } from "../use-mutation-feedback";

beforeEach(() => {
  success.mockClear();
  error.mockClear();
});

describe("useMutationFeedback", () => {
  it("toasts success and returns the result", async () => {
    const { result } = renderHook(() => useMutationFeedback<string>());
    let out: string | undefined;
    await act(async () => {
      out = await result.current.run(async () => "ok", { success: "Saved" });
    });
    expect(out).toBe("ok");
    expect(success).toHaveBeenCalledWith("Saved", { description: undefined });
    expect(error).not.toHaveBeenCalled();
  });

  it("normalizes a thrown FetchError into a friendly toast (not raw JSON)", async () => {
    const { result } = renderHook(() => useMutationFeedback());
    const thrown = Object.assign(new Error("Request failed"), {
      status: 409,
      info: { error: "Conflict detected" },
    });
    let out: unknown;
    await act(async () => {
      out = await result.current.run(async () => {
        throw thrown;
      });
    });
    expect(out).toBeUndefined();
    expect(error).toHaveBeenCalledWith("Conflict detected");
  });

  it("respects silentError", async () => {
    const { result } = renderHook(() => useMutationFeedback());
    await act(async () => {
      await result.current.run(
        async () => {
          throw new Error("boom");
        },
        { silentError: true },
      );
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("runOrThrow re-throws after toasting", async () => {
    const { result } = renderHook(() => useMutationFeedback());
    await expect(
      act(async () => {
        await result.current.runOrThrow(async () => {
          throw new Error("nope");
        });
      }),
    ).rejects.toThrow("nope");
    expect(error).toHaveBeenCalled();
  });
});
