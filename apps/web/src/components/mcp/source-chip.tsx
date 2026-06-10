import { glyphStyle } from "./provider-colors";

/**
 * SourceChip — MCP connection-slug chip on a chat-timeline tool step.
 *
 * Mockup: tools-in-chat.html `.src` — mono 10.5px/500, white text, 2px×6px
 * padding, 5px radius, provider brand background (PROVIDER_COLORS; highlight
 * token fallback for unknown slugs, matching `.src.pg`).
 */
export function SourceChip({ slug }: { slug: string }) {
  return (
    <span
      className="flex-none rounded-[5px] px-1.5 py-[2px] font-mono text-[10.5px] font-medium text-white"
      style={glyphStyle(slug)}
    >
      {slug}
    </span>
  );
}
