import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readInstanceEnv } from "../local/home";
import { persistAiConfig, runFirstRunAiSetup, shouldOfferAiSetup } from "../local/first-run-ai";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(os.tmpdir(), "bl-frai-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("shouldOfferAiSetup", () => {
  it("offers on a TTY with no AI configured", () => {
    expect(shouldOfferAiSetup({ isTTY: true, env: {} })).toBe(true);
  });
  it("does not offer when AI_PROVIDER is set", () => {
    expect(shouldOfferAiSetup({ isTTY: true, env: { AI_PROVIDER: "openrouter" } })).toBe(false);
  });
  it("does not offer when a known key is set", () => {
    expect(shouldOfferAiSetup({ isTTY: true, env: { AI_API_KEY: "x" } })).toBe(false);
    expect(shouldOfferAiSetup({ isTTY: true, env: { OPENROUTER_API_KEY: "x" } })).toBe(false);
  });
  it("does not offer when not a TTY", () => {
    expect(shouldOfferAiSetup({ isTTY: false, env: {} })).toBe(false);
  });
});

describe("persistAiConfig", () => {
  it("writes AI_PROVIDER/AI_API_KEY/AI_BASE_URL to instance.env + env", () => {
    const env: NodeJS.ProcessEnv = {};
    persistAiConfig({ kind: "openrouter", apiKey: "sk-x", baseUrl: "https://openrouter.ai/api/v1", home, env });
    const file = readInstanceEnv(home);
    expect(file.AI_PROVIDER).toBe("openrouter");
    expect(file.AI_API_KEY).toBe("sk-x");
    expect(file.AI_BASE_URL).toBe("https://openrouter.ai/api/v1");
    expect(env.AI_PROVIDER).toBe("openrouter");
  });
});

describe("runFirstRunAiSetup", () => {
  it("skips when the user declines to choose a kind", async () => {
    const r = await runFirstRunAiSetup({
      home, chooseKind: async () => null, readApiKey: async () => "", verify: async () => ({ ok: true, detail: "" }),
    });
    expect(r.configured).toBe(false);
    expect(readInstanceEnv(home).AI_PROVIDER).toBeUndefined();
  });
  it("persists when the key verifies", async () => {
    const r = await runFirstRunAiSetup({
      home, chooseKind: async () => "openrouter", readApiKey: async () => "sk-good", verify: async () => ({ ok: true, detail: "Reachable" }),
    });
    expect(r.configured).toBe(true);
    expect(readInstanceEnv(home).AI_PROVIDER).toBe("openrouter");
    expect(readInstanceEnv(home).AI_API_KEY).toBe("sk-good");
  });
  it("does NOT persist when verification fails", async () => {
    const r = await runFirstRunAiSetup({
      home, chooseKind: async () => "openrouter", readApiKey: async () => "sk-bad", verify: async () => ({ ok: false, detail: "HTTP 401" }),
    });
    expect(r.configured).toBe(false);
    expect(readInstanceEnv(home).AI_PROVIDER).toBeUndefined();
  });
});
