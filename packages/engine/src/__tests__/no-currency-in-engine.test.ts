import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("engine currency-agnostic contract (umbrella §1.6)", () => {
  it("no source file in packages/engine/src contains a hardcoded currency symbol", () => {
    const root = join(__dirname, "..");
    const offenders: string[] = [];
    // Match `$` only when NOT followed by `{` (i.e., not a template-literal
    // interpolation). Other symbols have no template-interpolation collision.
    const SYMBOLS = /\$(?!\{)|[€£¥₹]/;

    function sanitize(src: string): string {
      // Strip line comments.
      let s = src.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
      // Strip block comments.
      s = s.replace(/\/\*[\s\S]*?\*\//g, "");
      // Strip regex literals. Run twice because a `/` inside a character class
      // can split a single regex into two apparent "literals" on the first pass.
      s = s.replace(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, '""');
      s = s.replace(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, '""');
      // Strip leftover `$` that is a regex end-anchor (e.g. `]+$/;` from a
      // partially-stripped character-class regex like `/^[a-z]+$/`).
      s = s.replace(/\$\/[gimsuy]*(?=\W)/g, "");
      // Strip `$` used as String.replace special patterns ($&, $', $`, $n).
      s = s.replace(/\$[&'`\d]/g, "");
      return s;
    }

    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
          const src = readFileSync(p, "utf8");
          if (SYMBOLS.test(sanitize(src))) offenders.push(p);
        }
      }
    }
    walk(root);
    expect(offenders).toEqual([]);
  });
});
