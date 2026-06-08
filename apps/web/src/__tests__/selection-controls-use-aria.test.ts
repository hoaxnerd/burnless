// apps/web/src/__tests__/selection-controls-use-aria.test.ts
//
// Guard for systemic issue A11Y-CTRL-02 ("Selection state of segmented/toggle/
// mode controls conveyed by color only — aria-pressed used in ZERO files
// app-wide") and QA finding AI-03 (permission-level buttons convey selection by
// color only).
//
// Contract: a <button> in a segmented / permission / mode toggle that reflects
// an active/selected state (gating its className on a `selected` / `isActive`
// boolean) MUST also expose that state programmatically via one of:
//   aria-pressed | role="radio" + aria-checked | role="tab" + aria-selected
// so the active option is perceivable to assistive tech and color-blind users,
// not by brand color alone.
//
// BEST-EFFORT / CAVEAT: this is a targeted source-walk of the SPECIFIC toggle
// control files the QA named (the AI permission-level buttons + the dashboard
// mode toggle), not a whole-tree walk — segmented-selection detection app-wide
// is noisy (24 color-only selectors across many idioms). The robust app-wide
// version lands once the shared <SegmentedControl> primitive exists (the
// A11Y-CTRL-02 unifiedFix) and files migrate onto it. The detection mirrors the
// no-hardcoded-currency.test.ts style: read source, regex, print offenders.
//
// RED today: `aria-pressed` appears in ZERO files repo-wide and neither target
// reflects selection programmatically — so both selected-state buttons are
// flagged.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

// __dirname = apps/web/src/__tests__ -> src/
const SRC = join(__dirname, "..");

// The specific segmented/toggle/mode control files this guard pins.
const TARGET_FILES = [
  "app/(dashboard)/ai/_components/ai-permissions-panel.tsx", // AI-03 permission-level buttons
  "app/(dashboard)/dashboard/mode-switcher.tsx", // dashboard intelligence/dynamic/custom mode toggle
];

// A button "reflects selection state" if its open tag (or the className
// expression inside it) is gated on one of these selection flags.
const SELECTION_FLAG_RE = /\b(selected|isActive|isSelected|active)\b/;

// Programmatic selected-state signals that satisfy the contract.
const ARIA_STATE_RE =
  /aria-pressed|aria-checked|aria-selected|role=["'](radio|tab)["']/;

/**
 * Extract each `<button ... >` opening tag from source. We scan from each
 * `<button` to the next top-level `>` that closes the opening tag, tolerating
 * `>` characters inside `{...}` expressions and quoted strings.
 */
function extractButtonOpenTags(src: string): { tag: string; line: number }[] {
  const tags: { tag: string; line: number }[] = [];
  const re = /<button\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index;
    let i = start;
    let depthCurly = 0;
    let quote: string | null = null;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === "{") depthCurly++;
      else if (ch === "}") depthCurly--;
      else if (ch === ">" && depthCurly === 0) break;
    }
    const tag = src.slice(start, i + 1);
    const line = src.slice(0, start).split("\n").length;
    tags.push({ tag, line });
  }
  return tags;
}

describe("selection-controls-use-aria (A11Y-CTRL-02 / AI-03)", () => {
  it("sanity: target toggle files exist and are readable", () => {
    for (const rel of TARGET_FILES) {
      expect(() => readFileSync(join(SRC, rel), "utf8")).not.toThrow();
    }
  });

  it("segmented/mode toggle buttons that reflect selection expose it via aria-pressed/role=radio/aria-checked", () => {
    const offenders: string[] = [];

    for (const rel of TARGET_FILES) {
      const abs = join(SRC, rel);
      const src = readFileSync(abs, "utf8");
      for (const { tag, line } of extractButtonOpenTags(src)) {
        const reflectsSelection = SELECTION_FLAG_RE.test(tag);
        const hasAriaState = ARIA_STATE_RE.test(tag);
        if (reflectsSelection && !hasAriaState) {
          const flat = tag.replace(/\s+/g, " ").trim().slice(0, 100);
          offenders.push(`${relative(SRC, abs)}:${line}  ${flat}…`);
        }
      }
    }

    expect(
      offenders,
      `Toggle/segmented selection buttons missing a programmatic selected-state ` +
        `(need aria-pressed | role="radio"+aria-checked | role="tab"+aria-selected) — ` +
        `selection is color-only (A11Y-CTRL-02 / AI-03):\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("aria-pressed is used in at least one toggle control (currently ZERO app-wide — the core A11Y-CTRL-02 symptom)", () => {
    // When the fix lands (the shared SegmentedControl primitive or inline
    // aria-pressed/role=radio on these buttons), at least one of the target
    // files will carry a programmatic selected-state attribute.
    const anyAriaState = TARGET_FILES.some((rel) =>
      ARIA_STATE_RE.test(readFileSync(join(SRC, rel), "utf8"))
    );
    expect(
      anyAriaState,
      "Neither the AI permission buttons nor the dashboard mode toggle expose a " +
        "programmatic selected-state (aria-pressed/role=radio/aria-checked). " +
        "Selection is conveyed by brand color only."
    ).toBe(true);
  });
});
