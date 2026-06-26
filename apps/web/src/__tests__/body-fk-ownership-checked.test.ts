import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * GUARD [AUTHZ-02] (best-effort — see caveat): POST handlers that accept a
 * business FK id (`accountId`) from the REQUEST BODY must verify that the
 * referenced row belongs to the caller's company before persisting it.
 *
 * Why: `requireCompanyAccess` scopes the INSERT's own companyId (from ctx), but
 * never compares the body-supplied FK's parent companyId. A member of company A
 * can POST an `accountId` belonging to company B and attach a transaction /
 * mapping to a foreign account id.
 *
 * Reference (CORRECT) patterns the offenders should match:
 *   - forecast-lines/bulk/route.ts — verifies destination accountId belongs to company
 *   - import/route.ts — validates all referenced accountIds belong to the company
 *
 * Detection here is intentionally narrow (the two named offenders), asserting
 * each handler references an ownership-check token (`assertOwnedIds`, a
 * `findByIdForCompany`, or an `eq(<table>.companyId, ...)` / `.companyId` scoped
 * lookup). RED NOW: neither transactions nor merchant-mappings does any of these.
 *
 * CAVEAT: regex-level — a future ownership helper with a different name would
 * need to be added to OWNERSHIP_TOKENS. This is a tripwire, not an AST proof.
 */

const API_DIR = path.resolve(import.meta.dirname, "../app/api");

// Routes that take accountId from the request body and insert/persist it.
const TARGET_ROUTES = ["transactions/route.ts", "merchant-mappings/route.ts"];

// Tokens that indicate a company-ownership check was performed on the
// body-supplied accountId specifically. A bare `eq(<thisTable>.companyId, ...)`
// (which only scopes the entity's OWN table) does NOT count — the check must
// resolve the referenced ACCOUNT row against the company.
const OWNERSHIP_TOKENS = [
  "assertOwnedIds",
  "findByIdForCompany",
  // A companyId-scoped lookup against the accounts table (financialAccounts /
  // accounts), i.e. verifying the referenced accountId's parent belongs to ctx.
  /financialAccounts\.companyId/,
  /\baccounts\.companyId/,
];

describe("body-supplied FK ids are ownership-checked (AUTHZ-02)", () => {
  it("transactions + merchant-mappings POST verify body accountId belongs to the company", () => {
    const offenders: string[] = [];

    for (const rel of TARGET_ROUTES) {
      const routePath = path.join(API_DIR, rel);
      const src = readFileSync(routePath, "utf8");

      // The Zod body schema may live inline in route.ts OR in a sibling
      // schemas.ts — Next.js 16 forbids non-handler exports from a route file,
      // so an extracted `<route-dir>/schemas.ts` is the canonical home for the
      // request schema (e.g. transactions/schemas.ts holds `accountId: z.string()`).
      // Scan both for the field-presence check; the ownership-token check below
      // still asserts against route.ts, where the handler performs the lookup.
      const schemaPath = routePath.replace(/route\.ts$/, "schemas.ts");
      const fieldSrc = existsSync(schemaPath)
        ? `${src}\n${readFileSync(schemaPath, "utf8")}`
        : src;

      // Confirm the route really takes accountId from the body (guards the test
      // against silently passing if the route is refactored away).
      const takesBodyAccountId = /accountId\s*:\s*z\.string\(\)/.test(fieldSrc);
      if (!takesBodyAccountId) {
        offenders.push(
          `apps/web/src/app/api/${rel}: expected a body \`accountId: z.string()\` field (test target moved?)`
        );
        continue;
      }

      const checked = OWNERSHIP_TOKENS.some((t) =>
        typeof t === "string" ? src.includes(t) : t.test(src)
      );
      if (!checked) {
        offenders.push(
          `apps/web/src/app/api/${rel}: body accountId persisted with NO company-ownership check`
        );
      }
    }

    expect(
      offenders,
      `Body-supplied FK ids not ownership-checked — ${offenders.length} found ` +
        `(reference assertOwnedIds / findByIdForCompany / a companyId-scoped lookup):\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
