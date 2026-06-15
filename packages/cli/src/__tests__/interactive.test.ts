import { describe, it, expect, vi } from "vitest";
import { resolveConfirm } from "../interactive";

describe("resolveConfirm", () => {
  it("returns true immediately when assumeYes", async () => {
    const r = await resolveConfirm({ message: "x", default: false, assumeYes: true,
      stdinTTY: false, ttyAvailable: false, askClack: vi.fn(), askTty: vi.fn() });
    expect(r).toBe(true);
  });
  it("returns the default when fully headless (no tty anywhere)", async () => {
    const askClack = vi.fn(); const askTty = vi.fn();
    const r = await resolveConfirm({ message: "x", default: true,
      stdinTTY: false, ttyAvailable: false, askClack, askTty });
    expect(r).toBe(true);
    expect(askClack).not.toHaveBeenCalled();
    expect(askTty).not.toHaveBeenCalled();
  });
  it("uses clack when stdin is a TTY", async () => {
    const askClack = vi.fn().mockResolvedValue(false); const askTty = vi.fn();
    const r = await resolveConfirm({ message: "x", default: true,
      stdinTTY: true, ttyAvailable: true, askClack, askTty });
    expect(r).toBe(false);
    expect(askClack).toHaveBeenCalledOnce();
    expect(askTty).not.toHaveBeenCalled();
  });
  it("reattaches /dev/tty when stdin is not a TTY but /dev/tty is available (installer pipe)", async () => {
    const askClack = vi.fn(); const askTty = vi.fn().mockResolvedValue(true);
    const r = await resolveConfirm({ message: "x", default: false,
      stdinTTY: false, ttyAvailable: true, askClack, askTty });
    expect(r).toBe(true);
    expect(askTty).toHaveBeenCalledOnce();
    expect(askClack).not.toHaveBeenCalled();
  });
});
