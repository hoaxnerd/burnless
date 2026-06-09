import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * A11Y-CTRL-01 / A11Y-CTRL-04 guard (BEST-EFFORT, see caveat) — an icon-only
 * <button> must carry an accessible name (aria-label / aria-labelledby / title).
 * A bare `<button><X /></button>` resolves to an empty accessible name, so screen
 * readers announce nothing (DASH-03 FormulaViewer close; the same class as the
 * AI-04 send button).
 *
 * Detection is deliberately CONSERVATIVE to avoid noise: a button is flagged only
 * when its inner content, after removing icon tags (self-closing Capitalized
 * components + <svg>…</svg>) and JSX fragments, is EMPTY — i.e. it contains an
 * icon and literally nothing else (no text node, no label expression). Buttons
 * whose label lives in a `{ternary}` or `{variable}` are NOT flagged (we cannot
 * prove statically whether they resolve to text), so this test under-reports.
 *
 * CAVEAT: because of that conservatism, some genuine icon-only buttons whose two
 * branches are both icons inside a single `{isLoading ? <A/> : <B/>}` ternary
 * (e.g. ai/_components/chat-input.tsx send button, AI-04) are NOT caught here.
 * Treat this as a floor, not a ceiling.
 *
 * ALLOWLIST: the future shared IconButton/Button primitive and test files only.
 */

const WEB_SRC = path.resolve(import.meta.dirname, "..");

const ALLOWED: { match: string; why: string }[] = [
  {
    match: "/__tests__/",
    why: "Test files, not production UI.",
  },
  {
    match: "/components/ui/button.tsx",
    why: "The shared <Button> primitive renders {children}; not inherently icon-only. The fix for this class is a dedicated <IconButton> that requires a label.",
  },
  {
    match: "/components/ui/icon-button.tsx",
    why: "Reserved for the future shared IconButton primitive that will enforce a required label prop.",
  },
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

const BUTTON_RE = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
const ICON_TAG = /<[A-Z][A-Za-z0-9]*\b[^>]*?\/>/g; // self-closing Capitalized component
const SVG_BLOCK = /<svg\b[\s\S]*?<\/svg>/g;
const FRAGMENT = /<\/?>/g;

/** Reduce a button's inner JSX to whatever is NOT an icon. Empty result => icon-only. */
function reduceInner(inner: string): string {
  let s = inner.replace(SVG_BLOCK, "").replace(ICON_TAG, "").replace(FRAGMENT, "");
  // Collapse expressions that, after icon removal, are only whitespace/ternary glue.
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/\{[\s?:()]*\}/g, "");
  }
  return s.trim();
}

function scan(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const offenders: string[] = [];
  let m: RegExpExecArray | null;
  BUTTON_RE.lastIndex = 0;
  while ((m = BUTTON_RE.exec(src)) !== null) {
    const attrs = m[1]!;
    const inner = m[2]!;
    if (/aria-label|aria-labelledby|title=/.test(attrs)) continue;
    if (inner.includes("{children}") || inner.includes("{label")) continue;
    const hasIcon = ICON_TAG.test(inner) || SVG_BLOCK.test(inner);
    ICON_TAG.lastIndex = 0;
    SVG_BLOCK.lastIndex = 0;
    if (!hasIcon) continue;
    if (reduceInner(inner) === "") {
      const line = src.slice(0, m.index).split("\n").length;
      offenders.push(`${path.relative(WEB_SRC, file)}:${line}`);
    }
  }
  return offenders;
}

describe("icon-buttons-have-accessible-name (A11Y-CTRL-01 / A11Y-CTRL-04, best-effort)", () => {
  it("flags icon-only <button> elements with no accessible name", () => {
    const offenders = walk(WEB_SRC)
      .filter((f) => !isAllowed(f))
      .flatMap(scan);

    expect(
      offenders,
      `Icon-only buttons without an accessible name (add aria-label / use a labelled IconButton):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
