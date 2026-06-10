/**
 * ScopeBadge — Company/Personal ownership chip on a connection card.
 *
 * Mockup: placement.html `.scope` / `.scope.personal` — 10px/600 uppercase,
 * 0.04em tracking, 6px radius (token --radius-sm), 2px×7px padding; company =
 * surface chip, personal = accent.
 */
export function ScopeBadge({ scope }: { scope: "company" | "personal" }) {
  const base =
    "ml-auto flex-none rounded-sm border px-[7px] py-[2px] text-[10px] font-semibold uppercase tracking-[0.04em]";
  return scope === "personal" ? (
    <span className={`${base} border-accent-100 bg-accent-50 text-accent-600`}>
      Personal
    </span>
  ) : (
    <span className={`${base} border-surface-200 bg-surface-100 text-surface-500`}>
      Company
    </span>
  );
}
