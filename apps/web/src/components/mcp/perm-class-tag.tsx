/**
 * PermClassTag — read/write/delete permission-class chip.
 *
 * Mockup: tools-in-chat.html `.rd` — 9.5px/700 uppercase, 0.04em tracking,
 * 4px radius, 2px×6px padding; read = success tones, write = warning,
 * delete = danger.
 */

const TONES = {
  read: "bg-success-50 text-success-600",
  write: "bg-warning-50 text-warning-700",
  delete: "bg-danger-50 text-danger-700",
} as const;

export function PermClassTag({ cls }: { cls: "read" | "write" | "delete" }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em] ${TONES[cls]}`}
    >
      {cls}
    </span>
  );
}
