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
 * Expected: 4 offenders. When they migrate to useConfirm()/<ConfirmDialog>,
 * this turns green.
 */

const SRC_ROOT = join(__dirname, "..");

const ALLOWED: string[] = [
  // (none — there is no legitimate native dialog in app source)
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

describe("no-native-dialogs (S2-NATIVE-DIALOG / MODAL-SYS-02)", () => {
  it("uses the app Modal/ConfirmDialog — never native window.confirm/alert/prompt", () => {
    const files = listSources(SRC_ROOT)
      .map((abs) => ({ abs, rel: "src/" + abs.slice(SRC_ROOT.length + 1) }))
      .filter(({ rel }) => !isAllowed(rel));

    expect(files.length).toBeGreaterThan(50);

    const offenders: string[] = [];
    for (const { abs, rel } of files) {
      const src = readFileSync(abs, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        NATIVE_DIALOG.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = NATIVE_DIALOG.exec(line))) {
          offenders.push(`${rel}:${i + 1} ${m[0].trim()}`);
        }
      });
    }

    expect(
      offenders,
      `Native blocking dialogs found (${offenders.length}) — replace with useConfirm()/<ConfirmDialog>:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
