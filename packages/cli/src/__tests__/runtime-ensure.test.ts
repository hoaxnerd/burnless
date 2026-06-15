import { describe, it, expect, vi, beforeEach } from "vitest";

const ensureVendoredNode = vi.fn();
const ensureArtifact = vi.fn();
vi.mock("../bootstrap/node-provision", () => ({ ensureVendoredNode }));
vi.mock("../bootstrap/release", () => ({ ensureArtifact }));

import { defaultEnsure } from "../runtime";

describe("defaultEnsure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureVendoredNode.mockResolvedValue({ provisioned: true, path: "/h/.burnless/runtime/bin/node" });
    ensureArtifact.mockResolvedValue("/h/.burnless/versions/9.9.9");
  });

  it("provisions the vendored node BEFORE the artifact", async () => {
    await defaultEnsure({ version: "9.9.9", home: "/h", env: {} });
    expect(ensureVendoredNode).toHaveBeenCalledWith({ home: "/h", env: {} });
    expect(ensureArtifact).toHaveBeenCalledWith({ version: "9.9.9", home: "/h" });
    // ordering: node provisioned first
    expect(ensureVendoredNode.mock.invocationCallOrder[0]!)
      .toBeLessThan(ensureArtifact.mock.invocationCallOrder[0]!);
  });
});
