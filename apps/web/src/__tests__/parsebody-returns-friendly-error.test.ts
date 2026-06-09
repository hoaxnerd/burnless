import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

// We test the REAL parseBody. api-helpers.ts transitively imports `./auth`
// (next-auth) and the `@burnless/db` barrel, neither of which load cleanly
// under vitest. Stub only those transitive deps so the real api-helpers module
// (and the real parseBody under test) evaluates. parseBody itself uses none of
// the mocked exports.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@burnless/db", () => ({
  db: {},
  companies: {},
  getCompanyForUser: vi.fn(),
}));

const { parseBody } = await import("@/lib/api-helpers");

/**
 * GUARD [ERR-01]: parseBody must NOT serialize a raw ZodError.message (the
 * JSON.stringify'd issue array) into the 400 error body. ZodError.message is a
 * machine-readable JSON array of issue objects (`[{"code":...,"path":[...]}]`),
 * not a human sentence. Surfacing it verbatim is the systemic source of every
 * "raw Zod JSON shown to user" QA finding (FUND-02, TEAM-05, SET-01, …).
 *
 * RED NOW: parseBody's catch does `e.message` → for a ZodError that is the raw
 * JSON issue array. When the fix lands (a friendlyZodMessage helper), this
 * turns GREEN.
 */
describe("parseBody returns a human-readable validation error (ERR-01)", () => {
  const schema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters"),
    age: z.number().int(),
  });

  function makeRequest(body: unknown): Request {
    return new Request("https://example.test/api/thing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function getErrorString(req: Request): Promise<string> {
    const result = await parseBody(req, schema);
    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("expected error branch");
    const payload = (await result.error.json()) as { error: unknown };
    expect(typeof payload.error).toBe("string");
    return payload.error as string;
  }

  it("does NOT return a JSON-stringified Zod issue array as the error body", async () => {
    const req = makeRequest({ name: "ab", age: "not-a-number" });
    const errStr = await getErrorString(req);

    // A raw ZodError.message is a JSON array like:
    //   [ { "code": "too_small", "path": ["name"], "message": "..." }, ... ]
    // The friendly contract forbids that machine shape leaking to the user.
    const trimmed = errStr.trimStart();
    const looksLikeJsonArray = trimmed.startsWith("[") || trimmed.startsWith("{");
    expect(
      looksLikeJsonArray,
      `parseBody returned a raw JSON-looking error body to the user:\n${errStr}`
    ).toBe(false);

    expect(
      errStr.includes('"code"'),
      `parseBody error body contains a raw Zod issue "code" token:\n${errStr}`
    ).toBe(false);

    expect(
      errStr.includes('"path"'),
      `parseBody error body contains a raw Zod issue "path" token:\n${errStr}`
    ).toBe(false);

    // Sanity: it should not parse as JSON (a human sentence won't).
    let parsedAsJson = false;
    try {
      JSON.parse(errStr);
      parsedAsJson = true;
    } catch {
      parsedAsJson = false;
    }
    expect(
      parsedAsJson,
      `parseBody error body parsed as JSON (should be a plain sentence):\n${errStr}`
    ).toBe(false);
  });
});
