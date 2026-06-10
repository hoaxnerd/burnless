/**
 * ToolSwitch — the MCP UI's switch primitive.
 *
 * Mockup: tools-in-chat.html `.sw` — 30×18 pill, brand-500 on / surface-300
 * off, 14px knob. Used by the per-tool rows (ManageConnectionPanel) and the
 * AI-sidebar Connections pane (D11 per-connection kill-switch).
 */
export function ToolSwitch({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-[18px] w-[30px] flex-none rounded-full transition-colors ${
        checked ? "bg-brand-500" : "bg-surface-300"
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-3" : "translate-x-0"
        }`}
      />
    </button>
  );
}
