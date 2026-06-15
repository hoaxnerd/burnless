import { describe, it, expect } from "vitest";
import { resolveOpenBrowser } from "../commands/start";

describe("resolveOpenBrowser", () => {
  it("respects explicit --open / --no-open over the prompt", async () => {
    expect(await resolveOpenBrowser({ open: true,  noOpen: false, confirmFn: async () => false })).toBe(true);
    expect(await resolveOpenBrowser({ open: false, noOpen: true,  confirmFn: async () => true  })).toBe(false);
  });
  it("falls back to the interactive confirm (default yes) when no flag", async () => {
    expect(await resolveOpenBrowser({ confirmFn: async () => true  })).toBe(true);
    expect(await resolveOpenBrowser({ confirmFn: async () => false })).toBe(false);
  });
});
