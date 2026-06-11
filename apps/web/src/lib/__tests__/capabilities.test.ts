import { describe, it, expect, afterEach } from "vitest";
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

describe("getEdition / getCapabilities preset", () => {
  const ORIG = process.env;
  afterEach(() => { process.env = ORIG; });

  it("defaults to self_host when BURNLESS_DEPLOYMENT unset", async () => {
    process.env = { ...ORIG }; delete process.env.BURNLESS_DEPLOYMENT;
    const { getEdition, getCapabilities } = await import("../capabilities");
    expect(getEdition()).toBe("self_host");
    expect(getCapabilities().autoLogin).toBe(true);
    expect(getCapabilities().billing).toBe(false);
  });
  it("uses cloud preset when BURNLESS_DEPLOYMENT=cloud", async () => {
    process.env = { ...ORIG, BURNLESS_DEPLOYMENT: "cloud",
      STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec",
      AI_API_KEY: "k", AUTH_GITHUB_ID: "x", AUTH_GITHUB_SECRET: "y", RESEND_API_KEY: "r" };
    const { getEdition, getCapabilities } = await import("../capabilities");
    expect(getEdition()).toBe("cloud");
    expect(getCapabilities().billing).toBe(true);
    expect(getCapabilities().stdioMcp).toBe(false);
  });
});

describe("per-flag overrides", () => {
  const ORIG = process.env;
  afterEach(() => { process.env = ORIG; });
  it("BURNLESS_CAP_MARKETING_SITE=on enables it under self_host", async () => {
    process.env = { ...ORIG, BURNLESS_CAP_MARKETING_SITE: "on" };
    const { getCapabilities } = await import("../capabilities");
    expect(getCapabilities().marketingSite).toBe(true);
  });
  it("BURNLESS_CAP_AUTO_LOGIN=off disables it under self_host", async () => {
    process.env = { ...ORIG, BURNLESS_CAP_AUTO_LOGIN: "false" };
    const { getCapabilities } = await import("../capabilities");
    expect(getCapabilities().autoLogin).toBe(false);
  });
});

describe("auto-degrade", () => {
  const ORIG = process.env;
  afterEach(() => { process.env = ORIG; });
  it("billing forced off when no payment provider, even if overridden on", async () => {
    process.env = { ...ORIG, BURNLESS_CAP_BILLING: "on" };
    delete process.env.STRIPE_SECRET_KEY; delete process.env.RAZORPAY_KEY_ID;
    const { getCapabilities } = await import("../capabilities");
    expect(getCapabilities().billing).toBe(false);
  });
  it("stdioMcp forced off in cloud even if overridden on", async () => {
    process.env = { ...ORIG, BURNLESS_DEPLOYMENT: "cloud", BURNLESS_CAP_STDIO_MCP: "on" };
    const { getCapabilities } = await import("../capabilities");
    expect(getCapabilities().stdioMcp).toBe(false);
  });
  it("oauthLogin forced off when no OAuth creds", async () => {
    process.env = { ...ORIG, BURNLESS_DEPLOYMENT: "cloud" };
    delete process.env.AUTH_GITHUB_ID; delete process.env.AUTH_GOOGLE_ID;
    const { getCapabilities } = await import("../capabilities");
    expect(getCapabilities().oauthLogin).toBe(false);
  });
});
