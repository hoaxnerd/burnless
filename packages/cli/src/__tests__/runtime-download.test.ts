import { describe, expect, it, vi } from "vitest";
import { delegateToArtifact, LOCAL_VERBS } from "../runtime";

describe("LOCAL_VERBS", () => {
  it("includes update", () => expect(LOCAL_VERBS.has("update")).toBe(true));
});

describe("delegateToArtifact download-on-demand", () => {
  it("calls ensureArtifact when the artifact is absent, then execs it", async () => {
    const calls: string[] = [];
    const ensureFn = vi.fn(async () => { calls.push("ensure"); });
    let present = false;
    const existsFn = (_p: string) => { const was = present; present = true; return was; }; // absent first, present after ensure
    const spawnFn = (_c: string, _a: string[], _o: unknown) => {
      calls.push("spawn");
      return { on: (ev: string, cb: (code: number) => void) => ev === "exit" && cb(0) };
    };
    const code = await delegateToArtifact(["node", "burnless", "start"], {
      env: { BURNLESS_RELEASE_VERSION: "0.1.0" } as NodeJS.ProcessEnv,
      home: "/tmp/x",
      existsFn,
      spawnFn: spawnFn as never,
      ensureFn: ensureFn as never,
    });
    expect(ensureFn).toHaveBeenCalledOnce();
    expect(calls).toEqual(["ensure", "spawn"]);
    expect(code).toBe(0);
  });

  it("rejects (does NOT resolve 0) when the spawn emits an 'error' (launcher not executable / noexec fs)", async () => {
    const spawnFn = (_c: string, _a: string[], _o: unknown) => ({
      on: (ev: string, cb: (arg: number | Error | null) => void) => {
        if (ev === "error") cb(new Error("EACCES: launcher not executable"));
        // no "exit" ever fires
      },
    });
    await expect(
      delegateToArtifact(["node", "burnless", "start"], {
        env: {} as NodeJS.ProcessEnv,
        home: "/tmp/x",
        existsFn: () => true, // artifact present
        spawnFn: spawnFn as never,
      }),
    ).rejects.toThrow(/not executable/);
  });

  it("resolves 1 (not 0) when the child exits with a null code (killed by signal)", async () => {
    const spawnFn = (_c: string, _a: string[], _o: unknown) => ({
      on: (ev: string, cb: (arg: number | Error | null) => void) => {
        if (ev === "exit") cb(null);
      },
    });
    const code = await delegateToArtifact(["node", "burnless", "start"], {
      env: {} as NodeJS.ProcessEnv,
      home: "/tmp/x",
      existsFn: () => true,
      spawnFn: spawnFn as never,
    });
    expect(code).toBe(1);
  });

  it("still throws a clear error if the artifact is STILL absent after ensure (download failed)", async () => {
    const ensureFn = vi.fn(async () => {}); // ensure ran but produced nothing
    await expect(
      delegateToArtifact(["node", "burnless", "start"], {
        env: {} as NodeJS.ProcessEnv, home: "/tmp/x",
        existsFn: () => false, // never present
        ensureFn: ensureFn as never,
      }),
    ).rejects.toThrow();
  });
});
