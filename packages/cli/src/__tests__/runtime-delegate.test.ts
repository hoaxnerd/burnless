import { describe, expect, it, vi } from "vitest";
import { UsageError } from "../errors";
import { delegateToArtifact, resolveArtifactPath } from "../runtime";

describe("resolveArtifactPath", () => {
  it("uses BURNLESS_ARTIFACT when set", () => {
    expect(resolveArtifactPath({ BURNLESS_ARTIFACT: "/opt/b/burnless" }, "/home/u")).toBe(
      "/opt/b/burnless",
    );
  });
  it("falls back to ~/.burnless/versions/current/burnless", () => {
    expect(resolveArtifactPath({}, "/home/u")).toBe(
      "/home/u/.burnless/versions/current/burnless",
    );
  });
});

describe("delegateToArtifact", () => {
  it("throws a clear UsageError when the artifact is absent", async () => {
    const spawnFn = vi.fn();
    await expect(
      delegateToArtifact(["node", "burnless", "start"], {
        env: { BURNLESS_ARTIFACT: "/definitely/missing/burnless" },
        spawnFn,
      }),
    ).rejects.toBeInstanceOf(UsageError);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("execs the artifact with the verb argv and inherited stdio when present", async () => {
    const child = { on: vi.fn() } as unknown as { on: ReturnType<typeof vi.fn> };
    const spawnFn = vi.fn(() => child);
    const p = delegateToArtifact(["node", "burnless", "db", "migrate"], {
      env: { BURNLESS_ARTIFACT: "/opt/b/burnless" },
      spawnFn,
      existsFn: () => true,
    });
    const exitCb = (child.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === "exit",
    )?.[1] as (code: number) => void;
    exitCb(0);
    await expect(p).resolves.toBe(0);
    expect(spawnFn).toHaveBeenCalledWith(
      "/opt/b/burnless",
      ["db", "migrate"],
      expect.objectContaining({ stdio: "inherit" }),
    );
  });
});
