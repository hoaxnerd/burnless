import type { McpConnectionDto } from "./types";

/**
 * StatusPill — connection health chip on a connection card.
 *
 * Mockup: placement.html `.pill` — 20px-radius chip, 10.5px/600, 3px×9px
 * padding, leading 6px dot at 5px gap. Connected appends the auth flavor
 * ("· OAuth" / "· token") per the mockup cards.
 */

const LABELS: Record<McpConnectionDto["status"], string> = {
  connected: "Connected",
  needs_auth: "Needs sign-in",
  pending: "Connecting…",
  error: "Error",
  disabled: "Disabled",
};

export function StatusPill({
  status,
  authType,
}: {
  status: McpConnectionDto["status"];
  authType: McpConnectionDto["authType"];
}) {
  const ok = status === "connected";
  const warn = status === "needs_auth" || status === "pending";
  const tone = ok
    ? "bg-success-50 text-success-600"
    : warn
      ? "bg-warning-50 text-warning-600"
      : "bg-danger-50 text-danger-600";
  const dot = ok ? "bg-success-500" : warn ? "bg-warning-500" : "bg-danger-500";
  const suffix = ok
    ? authType === "oauth"
      ? " · OAuth"
      : authType === "pat"
        ? " · token"
        : ""
    : "";
  return (
    <span
      className={`inline-flex flex-none items-center gap-[5px] rounded-full px-[9px] py-[3px] text-[10.5px] font-semibold ${tone}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {LABELS[status]}
      {suffix}
    </span>
  );
}
