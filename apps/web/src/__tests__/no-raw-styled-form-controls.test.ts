import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * S1-1 / A11Y-CTRL-03 guard — broad source-walk.
 *
 * Contract: there is NO canonical <Input>/<Select>/<Textarea>/<Field> primitive,
 * so raw <input>/<select>/<textarea> tags are styled ad-hoc across ~47 files with
 * divergent rounding/padding/focus/dark-mode signatures (REV-03, ONB-04, PUB-05/06/07,
 * TEAM-07, AI-03/04, SHELL-03, FUND-12, XC-04).
 *
 * This test fails on ANY raw <input>/<select>/<textarea> bearing a styling className
 * (rounded / border / px / py / focus:ring / bg-surface on the tag) anywhere under
 * the apps/web/src tree. When the canonical kit lands and call sites migrate to it,
 * the offender list empties and this turns green.
 *
 * Mirrors the recursive-walker + small-justified-allowlist style of
 * no-hardcoded-currency.test.ts (offenders are printed in the failed assertion).
 *
 * (The pre-existing narrow no-raw-form-inputs.test.ts is left untouched.)
 */

// __dirname = apps/web/src/__tests__  ->  scan all of apps/web/src
const SRC_ROOT = join(__dirname, "..");

/**
 * Allowlist (prefix or exact). Each entry is genuinely-exempt — never a current
 * offender, or the test would go green and stop catching the real violations.
 */
const ALLOWED = [
  // ── The typed value primitives kit (Phase 3 F) ────────────────────────────
  // Currency/Number/Percentage/Date primitives are the sanctioned styled controls.
  "src/components/forms/primitives/",

  // ── Transitional label+error wrapper ──────────────────────────────────────
  // form-field.tsx is the existing (single-input) wrapper the unified fix will
  // refactor to delegate to <Field>+<Input>; allowed transitionally.
  "src/components/ui/form-field.tsx",

  // ── Future canonical base-control kit (does not exist yet) ─────────────────
  // The unified fix adds these in components/ui; pre-allowlisted so the migrated
  // primitives themselves are not flagged once they ship.
  "src/components/ui/input.tsx",
  "src/components/ui/select.tsx",
  "src/components/ui/textarea.tsx",
  "src/components/ui/field.tsx",
];

/** input types that are structurally unstyled / not text-field controls. */
const EXEMPT_INPUT_TYPE = /type=["'](hidden|file|checkbox|radio)["']/;

/** A className value that proves the bare tag was hand-styled. */
const STYLE_SIGNATURE = /rounded-|(?:^|\s|"|`|')border(?:-|\s|"|`|')|px-|py-|focus:ring|bg-surface/;

function isAllowed(relPath: string): boolean {
  return ALLOWED.some((p) => relPath === p || relPath.startsWith(p));
}

function listTsx(dir: string): string[] {
  const acc: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) acc.push(...listTsx(full));
    else if (e.endsWith(".tsx") && !e.endsWith(".test.tsx")) acc.push(full);
  }
  return acc;
}

/**
 * Extract the full opening-tag text (from `<tag` to its closing `>`), tolerating
 * JSX attributes that span multiple lines and `>` characters inside `{...}` exprs.
 */
function findControlTags(src: string): { tag: string; index: number }[] {
  const out: { tag: string; index: number }[] = [];
  const re = /<(input|select|textarea)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let end = -1;
    for (let i = re.lastIndex; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth <= 0) {
        end = i;
        break;
      }
    }
    if (end < 0) continue;
    out.push({ tag: src.slice(m.index, end + 1), index: m.index });
  }
  return out;
}

describe("no-raw-styled-form-controls (S1-1 / A11Y-CTRL-03)", () => {
  it("has no hand-styled raw <input>/<select>/<textarea> outside the form-control kit", () => {
    const files = listTsx(SRC_ROOT)
      .map((abs) => ({ abs, rel: "src/" + abs.slice(SRC_ROOT.length + 1) }))
      .filter(({ rel }) => !isAllowed(rel));

    // Sanity: the walk must actually find files.
    expect(files.length).toBeGreaterThan(50);

    const offenders: string[] = [];
    for (const { abs, rel } of files) {
      const src = readFileSync(abs, "utf8");
      for (const { tag, index } of findControlTags(src)) {
        if (EXEMPT_INPUT_TYPE.test(tag)) continue;
        if (!STYLE_SIGNATURE.test(tag)) continue;
        const line = src.slice(0, index).split("\n").length;
        const kind = tag.match(/<(input|select|textarea)/)?.[1] ?? "control";
        offenders.push(`${rel}:${line} <${kind}>`);
      }
    }

    const fileCount = new Set(offenders.map((o) => o.split(":")[0])).size;
    expect(
      offenders,
      `Hand-styled raw form controls found (${offenders.length} occurrences across ${fileCount} files) — migrate to the canonical <Input>/<Select>/<Textarea> kit:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
