import { describe, expect, it } from "vitest";
import { resolveLatestVersion, LATEST_VERSION_URL } from "../bootstrap/release";

describe("resolveLatestVersion", () => {
  it("returns the trimmed, v-stripped version from the injected fetcher", async () => {
    const v = await resolveLatestVersion({ fetchText: async () => "v0.2.0\n" });
    expect(v).toBe("0.2.0");
  });
  it("trims whitespace and accepts a bare version (no leading v)", async () => {
    const v = await resolveLatestVersion({ fetchText: async () => "  0.3.1  " });
    expect(v).toBe("0.3.1");
  });
  it("uses the provided url", async () => {
    let seen = "";
    const v = await resolveLatestVersion({
      url: "https://example.test/latest",
      fetchText: async (u) => {
        seen = u;
        return "1.0.0";
      },
    });
    expect(seen).toBe("https://example.test/latest");
    expect(v).toBe("1.0.0");
  });
  it("defaults to LATEST_VERSION_URL when no url is provided", async () => {
    let seen = "";
    await resolveLatestVersion({
      fetchText: async (u) => {
        seen = u;
        return "1.2.3";
      },
    });
    expect(seen).toBe(LATEST_VERSION_URL);
  });
  it("throws when the fetched string is empty", async () => {
    await expect(resolveLatestVersion({ fetchText: async () => "  \n" })).rejects.toThrow(/resolve the latest version/);
  });
});
