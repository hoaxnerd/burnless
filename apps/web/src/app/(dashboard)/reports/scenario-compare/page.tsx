import { permanentRedirect } from "next/navigation";

// The scenario comparison page consolidated into /scenarios/compare.
// This route remains as a permanent redirect so existing bookmarks and the
// data-room "Scenario Comparison" tile keep working (the tile href has been
// updated to the new location; this preserves any in-the-wild URLs).
export default function ScenarioCompareRedirect() {
  permanentRedirect("/scenarios/compare");
}
