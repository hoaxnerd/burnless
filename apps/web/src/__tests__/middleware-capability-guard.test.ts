import { describe, it, expect } from "vitest";
import { resolveCapabilityGuard } from "../proxy";
import type { Capabilities } from "../lib/capabilities";

const selfHost = { marketingSite: false, billing: false } as unknown as Capabilities;
const cloud = { marketingSite: true, billing: true } as unknown as Capabilities;
// Holding mode = marketing site shown but signups closed; signup-open = paid cloud.
const holding = { marketingSite: true, selfServeSignup: false } as unknown as Capabilities;
const signupOpen = { marketingSite: true, selfServeSignup: true } as unknown as Capabilities;

describe("resolveCapabilityGuard", () => {
  it("redirects marketing '/' to /dashboard when marketingSite off", () => {
    expect(resolveCapabilityGuard("/", selfHost)).toEqual({ action: "redirect", to: "/dashboard" });
  });
  it("404s /pricing when marketingSite off", () => {
    expect(resolveCapabilityGuard("/pricing", selfHost)).toEqual({ action: "notFound" });
  });
  it("allows '/' when marketingSite on", () => {
    expect(resolveCapabilityGuard("/", cloud)).toBeNull();
  });
  it("404s /api/billing when billing off", () => {
    expect(resolveCapabilityGuard("/api/billing", selfHost)).toEqual({ action: "notFound" });
  });
  it("allows /api/billing when billing on", () => {
    expect(resolveCapabilityGuard("/api/billing", cloud)).toBeNull();
  });
  it("404s /pricing in holding mode (marketingSite on, selfServeSignup off)", () => {
    expect(resolveCapabilityGuard("/pricing", holding)).toEqual({ action: "notFound" });
  });
  it("allows /pricing when selfServeSignup on", () => {
    expect(resolveCapabilityGuard("/pricing", signupOpen)).toBeNull();
  });
});
