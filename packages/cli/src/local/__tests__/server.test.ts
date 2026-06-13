import type { ChildProcess, SpawnOptions } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { startServer } from "../server";

type SpawnFn = (c: string, a: string[], o: SpawnOptions) => ChildProcess;

describe("startServer", () => {
  it("spawns the entry with the provided node binary and PORT/HOSTNAME", () => {
    const spawnFn = vi.fn<SpawnFn>(() => ({}) as ChildProcess);
    startServer({
      entry: "/art/web/apps/web/server.js",
      host: "127.0.0.1",
      port: 2876,
      env: { FOO: "bar" },
      nodeBin: "/art/runtime/bin/node",
      spawnFn,
    });
    expect(spawnFn).toHaveBeenCalledOnce();
    const [cmd, args, optsArg] = spawnFn.mock.calls[0]!;
    expect(cmd).toBe("/art/runtime/bin/node");
    expect(args).toEqual(["/art/web/apps/web/server.js"]);
    const opts = optsArg as SpawnOptions;
    expect((opts.env as NodeJS.ProcessEnv).PORT).toBe("2876");
    expect((opts.env as NodeJS.ProcessEnv).HOSTNAME).toBe("127.0.0.1");
    expect((opts.env as NodeJS.ProcessEnv).FOO).toBe("bar");
  });
  it("defaults nodeBin to the current process Node", () => {
    const spawnFn = vi.fn<SpawnFn>(() => ({}) as ChildProcess);
    startServer({ entry: "/x/server.js", host: "127.0.0.1", port: 2876, env: {}, spawnFn });
    expect(spawnFn.mock.calls[0]![0]).toBe(process.execPath);
  });
});
