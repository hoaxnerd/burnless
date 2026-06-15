import { describe, it, expect, vi } from "vitest";
import {
  PINNED_NODE_VERSION,
  nodeTargetFor,
  nodeTarballName,
  nodeBaseUrl,
  vendoredNodePath,
  isMuslLinux,
  ensureVendoredNode,
} from "../node-provision";

describe("nodeTargetFor", () => {
  it("maps supported platform/arch pairs", () => {
    expect(nodeTargetFor("linux", "x64")).toEqual({ os: "linux", arch: "x64" });
    expect(nodeTargetFor("linux", "arm64")).toEqual({ os: "linux", arch: "arm64" });
    expect(nodeTargetFor("darwin", "x64")).toEqual({ os: "darwin", arch: "x64" });
    expect(nodeTargetFor("darwin", "arm64")).toEqual({ os: "darwin", arch: "arm64" });
  });
  it("returns null for unsupported platform/arch", () => {
    expect(nodeTargetFor("win32", "x64")).toBeNull();
    expect(nodeTargetFor("linux", "ia32")).toBeNull();
  });
});

describe("nodeTarballName", () => {
  it("builds the nodejs.org tarball name", () => {
    expect(nodeTarballName("v22.14.0", { os: "linux", arch: "arm64" }))
      .toBe("node-v22.14.0-linux-arm64.tar.gz");
  });
});

describe("nodeBaseUrl", () => {
  it("defaults to nodejs.org/dist", () => {
    expect(nodeBaseUrl({})).toBe("https://nodejs.org/dist");
  });
  it("honors BURNLESS_NODE_DIST_URL override", () => {
    expect(nodeBaseUrl({ BURNLESS_NODE_DIST_URL: "file:///tmp/nodedist" }))
      .toBe("file:///tmp/nodedist");
  });
});

describe("vendoredNodePath", () => {
  it("points at <home>/.burnless/runtime/bin/node", () => {
    expect(vendoredNodePath("/h")).toBe("/h/.burnless/runtime/bin/node");
  });
});

describe("PINNED_NODE_VERSION", () => {
  it("is the pinned version", () => {
    expect(PINNED_NODE_VERSION).toBe("v22.14.0");
  });
});

describe("isMuslLinux", () => {
  const exists = (present: string[]) => (p: string) => present.includes(p);
  it("true when /etc/alpine-release exists", () => {
    expect(isMuslLinux({ platform: "linux", existsFn: exists(["/etc/alpine-release"]) })).toBe(true);
  });
  it("true when a /lib/ld-musl-* loader exists", () => {
    expect(isMuslLinux({ platform: "linux", existsFn: exists(["/lib/ld-musl-aarch64.so.1"]) })).toBe(true);
  });
  it("false on glibc linux", () => {
    expect(isMuslLinux({ platform: "linux", existsFn: exists([]) })).toBe(false);
  });
  it("false on darwin regardless", () => {
    expect(isMuslLinux({ platform: "darwin", existsFn: exists(["/etc/alpine-release"]) })).toBe(false);
  });
});

describe("ensureVendoredNode", () => {
  it("is a no-op on musl/Alpine (apk node is used instead)", async () => {
    const download = vi.fn();
    const res = await ensureVendoredNode({
      home: "/h", env: {}, platform: "linux", arch: "arm64",
      isMusl: true, existsFn: () => false, downloadAndExtractFn: download,
    });
    expect(res).toEqual({ provisioned: false, reason: "musl" });
    expect(download).not.toHaveBeenCalled();
  });
  it("returns the existing path without downloading when already present", async () => {
    const download = vi.fn();
    const res = await ensureVendoredNode({
      home: "/h", env: {}, platform: "linux", arch: "x64",
      isMusl: false, existsFn: (p) => p === "/h/.burnless/runtime/bin/node",
      downloadAndExtractFn: download,
    });
    expect(res).toEqual({ provisioned: true, path: "/h/.burnless/runtime/bin/node" });
    expect(download).not.toHaveBeenCalled();
  });
  it("downloads + extracts the pinned node when absent (glibc)", async () => {
    const download = vi.fn().mockResolvedValue(undefined);
    const res = await ensureVendoredNode({
      home: "/h", env: {}, platform: "linux", arch: "x64",
      isMusl: false, existsFn: () => false, downloadAndExtractFn: download,
    });
    expect(download).toHaveBeenCalledWith({
      url: "https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.gz",
      shasumsUrl: "https://nodejs.org/dist/v22.14.0/SHASUMS256.txt",
      tarballName: "node-v22.14.0-linux-x64.tar.gz",
      destRuntimeDir: "/h/.burnless/runtime",
    });
    expect(res).toEqual({ provisioned: true, path: "/h/.burnless/runtime/bin/node" });
  });
  it("throws on unsupported platform", async () => {
    await expect(ensureVendoredNode({
      home: "/h", env: {}, platform: "win32", arch: "x64", isMusl: false,
    })).rejects.toThrow(/unsupported/i);
  });
});
