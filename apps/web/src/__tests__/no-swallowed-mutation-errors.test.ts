import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * FEEDBACK-02 guard (BEST-EFFORT, see caveat) — mutation/user-action error paths
 * must not be silently swallowed. A catch block whose entire body is only
 * `console.*` (or empty) surfaces nothing to the user when a delete/save fails
 * (team-details / funding-details delete handlers, even with an eslint-disable
 * comment rationalizing it).
 *
 * Detection (conservative, brace-matched catch bodies over apps/web/src/**.tsx):
 *   (A) empty catch:        catch {}  /  catch (e) {}
 *   (B) console-only catch:  catch (e) { <comments> console.error(...) }  with no
 *       toast / setError / setState / rethrow / return surfacing the failure.
 *
 * CAVEAT: this is a heuristic on user-facing handlers; genuine fire-and-forget
 * background writes that legitimately swallow (preference persistence, telemetry)
 * are NOT distinguished here beyond the path-based ALLOWLIST. The intended fix
 * routes user-initiated mutation failures through toast.error; background writes
 * should carry an explicit justification. Treat flagged sites as candidates.
 */

const WEB_SRC = path.resolve(import.meta.dirname, "..");

const ALLOWED: { match: string; why: string }[] = [
  { match: "/__tests__/", why: "Test files, not production handlers." },
];

function isAllowed(file: string): boolean {
  return ALLOWED.some((a) => file.includes(a.match));
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, acc);
    } else if (entry.endsWith(".tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

/** Find the body (between matching braces) of each `catch (...) { ... }`. */
function catchBodies(src: string): { body: string; line: number }[] {
  const out: { body: string; line: number }[] = [];
  const re = /\bcatch\b\s*(?:\([^)]*\))?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    const body = src.slice(m.index + m[0].length, i - 1);
    const line = src.slice(0, m.index).split("\n").length;
    out.push({ body, line });
  }
  return out;
}

/** Strip comments + whitespace to inspect the "real" statements in a catch body. */
function strip(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .trim();
}

const CONSOLE_ONLY = /^(?:console\s*\.\s*(?:log|error|warn|info|debug)\s*\([\s\S]*?\)\s*;?\s*)+$/;
// Signals that the failure is actually surfaced / handled (NOT swallowed).
const SURFACES = /\btoast\b|set[A-Z][A-Za-z0-9]*\s*\(|throw\b|return\b|setError|notify|alert\(/;

describe("no-swallowed-mutation-errors (FEEDBACK-02, best-effort)", () => {
  it("flags empty or console-only catch blocks that surface no failure to the user", () => {
    const files = walk(WEB_SRC).filter((f) => !isAllowed(f));
    const offenders: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const { body, line } of catchBodies(src)) {
        const s = strip(body);
        if (s === "") {
          offenders.push(`${path.relative(WEB_SRC, file)}:${line} (empty catch)`);
          continue;
        }
        if (CONSOLE_ONLY.test(s) && !SURFACES.test(s)) {
          offenders.push(`${path.relative(WEB_SRC, file)}:${line} (console-only catch)`);
        }
      }
    }

    expect(
      offenders,
      `Swallowed mutation errors found (route user-action failures through toast.error):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
