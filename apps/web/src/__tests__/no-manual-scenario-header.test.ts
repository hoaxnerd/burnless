import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Regression guard — single-source scenario header.
 *
 * The `X-Scenario-Id` header MUST come from exactly one place: `apiFetch`
 * (`src/lib/api-fetch.ts`), which derives it from the `active-scenario-id`
 * cookie. Manually injecting it in a component — e.g. from a server-rendered
 * `scenarioId` prop or a per-tab sessionStorage value — reintroduces a second,
 * drift-prone source. When that source disagrees with the cookie (cookie
 * deleted, scenario exited in another tab, stale SSR prop), the server's
 * dual-channel check rejects the mutation with a 409 ScenarioSafetyError and
 * the user is locked out of editing. This bug shipped twice; this test stops a
 * third time.
 *
 * The anti-pattern is the object-literal header key `"X-Scenario-Id":` inside a
 * `headers: { ... }` block. Legitimate uses don't match it:
 *   - apiFetch sets it via `headers.set("X-Scenario-Id", ...)`
 *   - server routes read it via `request.headers.get("X-Scenario-Id")`
 */
const SRC = path.resolve(__dirname, "..");
const ANTIPATTERN = /["']X-Scenario-Id["']\s*:/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("single-source scenario header", () => {
  it("no component manually injects the X-Scenario-Id header", () => {
    const offenders = walk(SRC).filter((file) =>
      ANTIPATTERN.test(readFileSync(file, "utf8"))
    );
    expect(
      offenders.map((f) => path.relative(SRC, f)),
      "X-Scenario-Id must only be injected by apiFetch (reads the cookie). " +
        "Use apiFetch() and remove the manual header from these files:"
    ).toEqual([]);
  });
});
