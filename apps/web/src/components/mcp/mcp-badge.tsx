/**
 * McpBadge — violet "MCP" marker flagging an external (MCP-bridged) tool.
 *
 * Mockup: tools-in-chat.html `.ext` — 9px/700 uppercase, 0.04em tracking,
 * accent-600 on accent-50 with accent-100 border, 4px radius, 1px×5px padding.
 */
export function McpBadge() {
  return (
    <span className="flex-none rounded border border-accent-100 bg-accent-50 px-[5px] py-px text-[9px] font-bold uppercase tracking-[0.04em] text-accent-600">
      MCP
    </span>
  );
}
