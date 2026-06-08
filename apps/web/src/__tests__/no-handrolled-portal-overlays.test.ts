import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * MODAL-SYS-01 guard — source-walk (DASH-02, DASH-03, FUND-10).
 *
 * Contract: dialog/modal overlays must use the shared components/ui/modal.tsx
 * primitive (Escape + focus-trap + labelled close + portal for free), not be
 * hand-rolled. Hand-rolled portal/overlay markup (createPortal, or a `fixed
 * inset-0` scrim/dialog container) outside the shared primitive recreates these
 * concerns inconsistently and drops a11y affordances (FormulaViewer has no
 * Escape handler / no accessible close — DASH-02/DASH-03).
 *
 * Fails on:
 *   - any `createPortal(` call, and
 *   - any hand-rolled `fixed inset-0` overlay scrim (`fixed inset-0 ... bg-black/`)
 *     or inline `role="dialog"` container on a `fixed inset-0` element,
 * OUTSIDE the shared modal primitive (+ a future shared overlay + the toast
 * notification portal). Expected ~9 offender files. When these migrate to the
 * shared <Modal>/<Overlay>, this turns green.
 */

const SRC_ROOT = join(__dirname, "..");

const ALLOWED = [
  // ── The shared dialog primitive ───────────────────────────────────────────
  // modal.tsx IS the sanctioned portal+scrim+Escape+focus-trap implementation.
  "src/components/ui/modal.tsx",
  // ── Future shared overlay primitive (does not exist yet) ──────────────────
  // Pre-allowlisted so a hoisted shared overlay base isn't flagged once it ships.
  "src/components/ui/overlay.tsx",
  // ── Toast notification portal ─────────────────────────────────────────────
  // toast.tsx is a non-dialog notification host (not a modal); its createPortal
  // is a legitimate shared-infra portal, not a hand-rolled dialog.
  "src/components/ui/toast.tsx",
];

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

describe("no-handrolled-portal-overlays (MODAL-SYS-01)", () => {
  it("uses the shared Modal primitive — no hand-rolled createPortal / fixed-inset-0 dialog overlays", () => {
    const files = listTsx(SRC_ROOT)
      .map((abs) => ({ abs, rel: "src/" + abs.slice(SRC_ROOT.length + 1) }))
      .filter(({ rel }) => !isAllowed(rel));

    expect(files.length).toBeGreaterThan(50);

    const offenders: string[] = [];
    for (const { abs, rel } of files) {
      const src = readFileSync(abs, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        const loc = `${rel}:${i + 1}`;
        if (/createPortal\s*\(/.test(line)) {
          offenders.push(`${loc} createPortal`);
        }
        // Hand-rolled scrim/backdrop: a `fixed inset-0` element carrying a
        // black overlay background.
        if (/fixed inset-0[^"'`]*bg-black\//.test(line)) {
          offenders.push(`${loc} fixed-inset-0 scrim`);
        }
        // Hand-rolled dialog container marked role="dialog" on a fixed overlay.
        if (/fixed inset-0/.test(line) && /role=("|')dialog\1/.test(line)) {
          offenders.push(`${loc} fixed-inset-0 dialog container`);
        }
      });
    }

    const fileCount = new Set(offenders.map((o) => o.split(":")[0])).size;
    expect(
      offenders,
      `Hand-rolled portal/overlay dialogs found (${offenders.length} occurrences across ${fileCount} files) — migrate to components/ui/modal.tsx:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
