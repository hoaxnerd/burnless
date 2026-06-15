import { describe, it, expect } from "vitest";
import {
  PINNED_NODE_VERSION,
  nodeTargetFor,
  nodeTarballName,
  nodeBaseUrl,
  vendoredNodePath,
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
