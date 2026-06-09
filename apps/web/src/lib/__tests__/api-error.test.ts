import { describe, it, expect } from "vitest";
import { extractApiError, toUserMessage } from "../api-error";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("extractApiError (Response)", () => {
  it("pulls a plain { error } string from a 400 body", async () => {
    const msg = await extractApiError(jsonResponse(400, { error: "Name is required" }));
    expect(msg).toBe("Name is required");
  });

  it("does not surface raw JSON when the error field is itself an object", async () => {
    const res = jsonResponse(400, { error: { foo: "bar", nested: [1, 2] } });
    const msg = await extractApiError(res);
    expect(msg).not.toContain("{");
    expect(msg).not.toContain("foo");
    // Falls back to a friendly 400 default.
    expect(msg.length).toBeGreaterThan(0);
  });

  it("joins Zod-style issues arrays", async () => {
    const res = jsonResponse(422, {
      issues: [{ message: "Too short" }, { message: "Invalid email" }],
    });
    expect(await extractApiError(res)).toBe("Too short; Invalid email");
  });

  it("falls back to a status-specific friendly message on empty/garbage body", async () => {
    const res = new Response("not json at all", { status: 500 });
    const msg = await extractApiError(res);
    expect(msg).not.toContain("not json");
    expect(msg.toLowerCase()).toContain("our end");
  });

  it("maps 401 / 403 / 429 to friendly defaults", async () => {
    expect((await extractApiError(jsonResponse(401, {}))).toLowerCase()).toContain("session");
    expect((await extractApiError(jsonResponse(403, {}))).toLowerCase()).toContain("permission");
    expect((await extractApiError(jsonResponse(429, {}))).toLowerCase()).toContain("too many");
  });
});

describe("toUserMessage (sync)", () => {
  it("returns a clean Error.message", () => {
    expect(toUserMessage(new Error("Could not save changes"))).toBe("Could not save changes");
  });

  it("never renders a stack-trace-ish message", () => {
    const e = new Error("Boom\n    at foo (/a/b.ts:1:2)\n    at bar");
    const msg = toUserMessage(e);
    expect(msg).not.toContain("at foo");
    expect(msg).not.toContain("/a/b.ts");
  });

  it("prefers FetchError.info body over the message", () => {
    const e = Object.assign(new Error("Request failed (409)"), {
      status: 409,
      info: { error: "Scenario mismatch" },
    });
    expect(toUserMessage(e)).toBe("Scenario mismatch");
  });

  it("coerces a raw-JSON string to a friendly fallback, not the JSON", () => {
    const msg = toUserMessage('{"error":"x","code":123}');
    expect(msg).not.toContain("{");
    expect(msg).not.toContain("code");
  });

  it("reads a parsed { message } body", () => {
    expect(toUserMessage({ message: "All good but failed" })).toBe("All good but failed");
  });

  it("falls back to a generic string for null/undefined/empty", () => {
    expect(toUserMessage(null)).toMatch(/went wrong/i);
    expect(toUserMessage(undefined)).toMatch(/went wrong/i);
    expect(toUserMessage("")).toMatch(/went wrong/i);
    expect(toUserMessage({})).toMatch(/went wrong/i);
  });
});
