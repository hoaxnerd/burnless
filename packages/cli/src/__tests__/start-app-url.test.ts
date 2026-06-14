import { describe, expect, it } from "vitest";
import { defaultAppUrlForLoopback } from "../commands/start";

describe("defaultAppUrlForLoopback (S5 P4 11a — CSRF allowlist OOTB)", () => {
  it("returns the bind origin when no allowlist var is set on a loopback host", () => {
    expect(defaultAppUrlForLoopback("127.0.0.1", 2876, {})).toBe("http://127.0.0.1:2876");
  });

  it("handles localhost and ::1 loopback aliases", () => {
    expect(defaultAppUrlForLoopback("localhost", 3000, {})).toBe("http://localhost:3000");
    expect(defaultAppUrlForLoopback("::1", 2876, {})).toBe("http://[::1]:2876");
  });

  it("defers when NEXT_PUBLIC_APP_URL is explicitly set", () => {
    expect(defaultAppUrlForLoopback("127.0.0.1", 2876, { NEXT_PUBLIC_APP_URL: "https://my.host" })).toBeNull();
  });

  it("defers when ALLOWED_ORIGINS is explicitly set (the runtime-effective allowlist var)", () => {
    expect(defaultAppUrlForLoopback("127.0.0.1", 2876, { ALLOWED_ORIGINS: "https://my.host" })).toBeNull();
  });

  it("does NOT auto-set for a non-loopback bind (operator provides the real domain)", () => {
    expect(defaultAppUrlForLoopback("0.0.0.0", 2876, {})).toBeNull();
    expect(defaultAppUrlForLoopback("192.168.1.10", 2876, {})).toBeNull();
  });
});
