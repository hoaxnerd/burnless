/**
 * Session manager (spec §4.2/§4.6): credential-bound lookup (hijack guard),
 * 30-min lazy idle eviction, terminate → gone, globalThis singleton.
 */
import { describe, it, expect, vi } from "vitest";
import {
  McpSessionManager,
  getMcpSessionManager,
  type McpSessionState,
} from "../server/session-manager";

function fakeBridge() {
  return { close: vi.fn(async () => {}) };
}

function makeState(): McpSessionState {
  return { scenarioId: null, scopes: ["read"] };
}

describe("McpSessionManager", () => {
  it("create → get roundtrip with the same credential", () => {
    const mgr = new McpSessionManager();
    const session = mgr.create({
      bridge: fakeBridge() as never,
      state: makeState(),
      credentialKey: "pat:tok-1",
      clientInfo: { name: "test", version: "1" },
    });
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mgr.get(session.id, "pat:tok-1")?.id).toBe(session.id);
  });

  it("a different credential gets 404 semantics (null) — hijack guard", () => {
    const mgr = new McpSessionManager();
    const session = mgr.create({
      bridge: fakeBridge() as never,
      state: makeState(),
      credentialKey: "pat:tok-1",
      clientInfo: null,
    });
    expect(mgr.get(session.id, "pat:tok-OTHER")).toBeNull();
    // and the legitimate credential still works (no destructive side effect)
    expect(mgr.get(session.id, "pat:tok-1")).not.toBeNull();
  });

  it("unknown id → null", () => {
    const mgr = new McpSessionManager();
    expect(mgr.get("00000000-0000-4000-a000-000000000000", "pat:x")).toBeNull();
  });

  it("terminate closes the bridge and forgets the session", async () => {
    const mgr = new McpSessionManager();
    const bridge = fakeBridge();
    const session = mgr.create({
      bridge: bridge as never,
      state: makeState(),
      credentialKey: "pat:tok-1",
      clientInfo: null,
    });
    expect(await mgr.terminate(session.id)).toBe(true);
    expect(bridge.close).toHaveBeenCalledOnce();
    expect(mgr.get(session.id, "pat:tok-1")).toBeNull();
    expect(await mgr.terminate(session.id)).toBe(false);
  });

  it("evicts sessions idle > 30 min lazily on access", () => {
    let now = 1_000_000;
    const mgr = new McpSessionManager(30 * 60 * 1000, () => now);
    const bridge = fakeBridge();
    const session = mgr.create({
      bridge: bridge as never,
      state: makeState(),
      credentialKey: "pat:tok-1",
      clientInfo: null,
    });
    now += 29 * 60 * 1000;
    expect(mgr.get(session.id, "pat:tok-1")).not.toBeNull(); // touch resets idle
    now += 31 * 60 * 1000;
    expect(mgr.get(session.id, "pat:tok-1")).toBeNull();
    expect(bridge.close).toHaveBeenCalled();
  });

  it("getMcpSessionManager returns a globalThis singleton", () => {
    expect(getMcpSessionManager()).toBe(getMcpSessionManager());
  });
});
