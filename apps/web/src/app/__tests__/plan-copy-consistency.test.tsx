/**
 * PUB-08 — Marketing copy must not describe Team/Enterprise plans as live.
 *
 * Only Free + Pro are enabled (plans.config getEnabledPlans). The pricing FAQ,
 * help FAQ, and contact page previously described Team collaboration / Enterprise
 * plans as available today (one even contradicted plans.config's per-seat pricing).
 * This guard reads the raw source of those three marketing surfaces and asserts
 * the disabled-tier copy is phrased as future ("coming soon"), not live.
 *
 * It is a content guard, not a render test — happy-dom is irrelevant; we read the
 * files from disk so the copy can't silently regress.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("PUB-08 — marketing plan copy consistency", () => {
  it("pricing FAQ markets Team collaboration as coming soon, not live", () => {
    const src = read("pricing/page.tsx");
    expect(src).toMatch(/coming soon/i);
    // Must not claim unlimited team members at no per-seat cost as a live feature.
    expect(src).not.toMatch(/unlimited team members at no extra per-seat cost/i);
  });

  it("help FAQ phrases team plans as coming soon", () => {
    const src = read("help/page.tsx");
    // The old copy asserted "Team plans allow multiple users" as a live capability.
    expect(src).not.toMatch(/Team plans allow multiple users/i);
    expect(src).toMatch(/coming soon/i);
  });

  it("contact page does not advertise Enterprise plans as live", () => {
    const src = read("contact/page.tsx");
    expect(src).not.toMatch(/Enterprise plans/);
  });
});
