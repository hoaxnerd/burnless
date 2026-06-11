import { describe, it, expect } from "vitest";
import { EDITION_PRESETS, type Capability } from "../capabilities";

const ALL_CAPS: Capability[] = [
  "marketingSite","billing","multiTenant","selfServeSignup","oauthLogin",
  "autoLogin","stdioMcp","planEnforcement","emailVerification",
  "managedAiProvider","integrations","inviteCodes","semanticSearch","dataResidency",
];

describe("EDITION_PRESETS", () => {
  it("defines every capability for both editions", () => {
    for (const ed of ["self_host","cloud"] as const) {
      for (const cap of ALL_CAPS) {
        expect(typeof EDITION_PRESETS[ed][cap]).toBe("boolean");
      }
    }
  });
  it("self_host enables autoLogin + stdioMcp, disables billing + marketingSite", () => {
    expect(EDITION_PRESETS.self_host.autoLogin).toBe(true);
    expect(EDITION_PRESETS.self_host.stdioMcp).toBe(true);
    expect(EDITION_PRESETS.self_host.billing).toBe(false);
    expect(EDITION_PRESETS.self_host.marketingSite).toBe(false);
  });
  it("cloud enables billing + marketingSite + multiTenant, disables autoLogin + stdioMcp", () => {
    expect(EDITION_PRESETS.cloud.billing).toBe(true);
    expect(EDITION_PRESETS.cloud.marketingSite).toBe(true);
    expect(EDITION_PRESETS.cloud.multiTenant).toBe(true);
    expect(EDITION_PRESETS.cloud.autoLogin).toBe(false);
    expect(EDITION_PRESETS.cloud.stdioMcp).toBe(false);
  });
});
