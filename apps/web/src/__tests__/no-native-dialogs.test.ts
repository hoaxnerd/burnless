import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * S2-NATIVE-DIALOG / MODAL-SYS-02 guard — source-walk.
 *
 * Contract: destructive-action confirmation must go through the app's themed
 * Modal/ConfirmDialog primitive, never the native blocking window.confirm()/
 * confirm()/alert()/prompt(). The native dialog is non-themeable, breaks the
 * design language, and isn't announced as an app dialog (REV-02 + the three team
 * delete handlers).
 *
 * Fails on any window.confirm/alert/prompt or bare confirm(/alert(/prompt(
 * across all *.ts/*.tsx under apps/web/src (excluding test files), after
 * excluding React identifiers (onConfirm, confirmText, confirmLabel,
 * requiresConfirmation) and `.confirm(`-style method calls on objects.
 *
 * Accuracy carve-outs (NOT silencing — these remove false positives, the
 * native dialogs they could mask are still caught):
 *   1. Comments are stripped before matching. Prose like "the rename prompt
 *      (skip path)" or "explicit confirm (card menu)" is documentation, not a
 *      call. (line `//`, trailing `//`, and `/* … *\/` block comments).
 *   2. The themed `useConfirm()` helper resolves to a bare `confirm(opts)`
 *      call. In a file that imports/uses `useConfirm`, a bare `confirm(` is the
 *      app's own confirm primitive — the replacement for the native dialog, not
 *      a violation. `window.confirm(` / `window.alert(` / `window.prompt(` and
 *      bare `alert(` / `prompt(` are ALWAYS still flagged, in every file.
 *
 * Expected after Phase 6 cleanup: 0 offenders (the last native dialog,
 * invite-codes-tab.tsx, migrated to useConfirm()). When a new native dialog is
 * introduced, this turns red again.
 */

const SRC_ROOT = join(__dirname, "..");

const ALLOWED: string[] = [
  // Sanctioned in-app confirm primitives. Their JSDoc documents a `confirm(opts)`
  // signature (the themed confirm helper), which trips the bare-`confirm(` matcher.
  // These ARE the replacement for native dialogs — allowlisting is not a weakening.
  "src/components/ui/confirm-dialog.tsx",
  "src/components/ui/confirm-button.tsx",
];

function isAllowed(relPath: string): boolean {
  return ALLOWED.some((p) => relPath === p || relPath.startsWith(p));
}

function listSources(dir: string): string[] {
  const acc: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) {
      acc.push(...listSources(full));
    } else if (
      (e.endsWith(".ts") || e.endsWith(".tsx")) &&
      !e.endsWith(".test.ts") &&
      !e.endsWith(".test.tsx") &&
      !e.endsWith(".setup.ts") &&
      !e.endsWith(".d.ts")
    ) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Matches a native-dialog invocation:
 *   window.confirm( | window.alert( | window.prompt(
 *   confirm( | alert( | prompt(   — only when NOT preceded by `.` or an
 *   identifier char (so onConfirm, confirmText, foo.confirm(, etc. don't match).
 */
const NATIVE_DIALOG = /(?<![.\w])(?:window\.)?(confirm|alert|prompt)\s*\(/g;

/** Always-native: `window.`-prefixed dialogs, or bare `alert(`/`prompt(`. */
const ALWAYS_NATIVE = /(?<![.\w])(?:window\.(?:confirm|alert|prompt)|alert|prompt)\s*\(/;

/**
 * Strip comments so prose mentioning "confirm" / "prompt" inside a `//` or
 * `/* … *\/` comment is not mis-read as a call. Crude (string-literal-unaware)
 * but sufficient for this guard — it only ever risks UNDER-reporting inside a
 * string, and there are no native-dialog calls hidden in string literals.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

describe("no-native-dialogs (S2-NATIVE-DIALOG / MODAL-SYS-02)", () => {
  it("uses the app Modal/ConfirmDialog — never native window.confirm/alert/prompt", () => {
    const files = listSources(SRC_ROOT)
      .map((abs) => ({ abs, rel: "src/" + abs.slice(SRC_ROOT.length + 1) }))
      .filter(({ rel }) => !isAllowed(rel));

    expect(files.length).toBeGreaterThan(50);

    const offenders: string[] = [];
    for (const { abs, rel } of files) {
      const raw = readFileSync(abs, "utf8");
      // A file that uses the themed `useConfirm()` hook gets to call the bare
      // `confirm(...)` helper it returns — that bare call is the SANCTIONED
      // replacement, not a native dialog. `window.confirm(` etc. stay flagged.
      const usesThemedConfirm = /\buseConfirm\b/.test(raw);
      const lines = stripComments(raw).split("\n");
      lines.forEach((line, i) => {
        NATIVE_DIALOG.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = NATIVE_DIALOG.exec(line))) {
          const matched = m[0].trim();
          // The themed-confirm carve-out only covers the bare `confirm(`
          // identifier; anything always-native is still an offender.
          const alwaysNative = ALWAYS_NATIVE.test(matched);
          if (m[1] === "confirm" && !alwaysNative && usesThemedConfirm) continue;
          offenders.push(`${rel}:${i + 1} ${matched}`);
        }
      });
    }

    expect(
      offenders,
      `Native blocking dialogs found (${offenders.length}) — replace with useConfirm()/<ConfirmDialog>:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
