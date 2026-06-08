/**
 * AI-10 — AI conversation-history entries must expose the full title on hover.
 *
 * The HistoryPaneContent list rendered {conv.title} with no title attribute and no
 * controlled truncation, so long prompts clipped mid-word with no reveal. The fix
 * wraps the title in a truncating span carrying title={conv.title ?? 'Untitled
 * conversation'}.
 *
 * HistoryPaneContent is a private helper in a large client page, so this is a
 * source guard (mirrors the repo's other source-walk guards) rather than a render
 * test — it asserts the title attr + a truncate/line-clamp class are present in
 * the history-list render.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "..", "page.tsx"), "utf8");

describe("AI-10 — history list title tooltip", () => {
  it("renders a title attribute falling back to 'Untitled conversation'", () => {
    expect(src).toMatch(/title=\{conv\.title \?\? "Untitled conversation"\}/);
  });

  it("applies a deliberate truncate/line-clamp so the cut is clean", () => {
    // The title span uses a truncate (or line-clamp) utility so overflow clips
    // and the full text is available via the hover tooltip.
    expect(src).toMatch(/(truncate|line-clamp-\d)/);
  });
});
