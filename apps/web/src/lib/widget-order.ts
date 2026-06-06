/**
 * Widget order helpers — single source of truth for resolving a page's
 * persisted widget *order* from stored preferences.
 *
 * Layout model: dashboards persist ONLY an ordered list of widget ids plus a
 * hidden set. Width and height are the widget's own concern (declared span +
 * content-driven height), so they are never stored. This makes a saved
 * arrangement screen-independent — it reflows for any viewport — and removes
 * the legacy class of "saved on a small screen, renders wrong on a big one"
 * bugs that came from persisting per-breakpoint grid coordinates.
 *
 * Backward compatibility: older rows persisted a coordinate layout
 * (`{ widgetId, x, y, w, h }[]`). We derive order from those by reading their
 * visual top-to-bottom, left-to-right sequence (sort by y, then x). New writes
 * only ever store `order`.
 */

/** Legacy persisted layout entry (coordinate-based, pre-fluid-flow). */
export interface LegacyWidgetLayout {
  widgetId: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  autoH?: boolean;
}

/** Per-page persisted layout data — may be new (`order`) or legacy (`layout`). */
export interface StoredPageLayout {
  order?: string[];
  layout?: LegacyWidgetLayout[];
  closedWidgets?: string[];
}

/**
 * Resolve the ordered widget id list from stored page data.
 * Prefers the new `order` field; falls back to deriving order from a legacy
 * coordinate `layout` (visual order = sort by y, then x). Returns [] when
 * nothing is stored, letting callers fall through to their default order.
 */
export function deriveWidgetOrder(pageData?: StoredPageLayout | null): string[] {
  if (!pageData) return [];
  if (Array.isArray(pageData.order)) {
    return pageData.order.filter((id): id is string => typeof id === "string");
  }
  if (Array.isArray(pageData.layout)) {
    return [...pageData.layout]
      .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
      .map((l) => l.widgetId)
      .filter((id): id is string => typeof id === "string");
  }
  return [];
}

/**
 * Merge a saved order with a default order so the rendered sequence always
 * covers every available widget exactly once:
 * - saved ids that still exist keep their saved position,
 * - any default ids not in the saved order are appended in default order
 *   (so widgets added after the user customized their layout still show up),
 * - ids not present in `available` are dropped (stale/removed widgets).
 */
export function resolveOrder(
  savedOrder: string[],
  defaultOrder: string[],
  available: Iterable<string>,
): string[] {
  const availableSet = new Set(available);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const id of savedOrder) {
    if (availableSet.has(id) && !seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }
  for (const id of defaultOrder) {
    if (availableSet.has(id) && !seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }
  return result;
}
