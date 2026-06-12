import { describe, it, expect } from "vitest";
import { POST } from "../route";
import { NO_AUTOLOGIN_COOKIE } from "@/lib/auto-login";

describe("POST /api/auth/suppress-autologin", () => {
  it("sets the suppression cookie", async () => {
    const res = await POST();
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${NO_AUTOLOGIN_COOKIE}=1`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(res.status).toBe(200);
  });
});
