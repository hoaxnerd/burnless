import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface EditModeEmptySlotProps {
  icon: LucideIcon;
  label: string;
  description: string;
  href: string;
}

export function EditModeEmptySlot({
  icon: Icon,
  label,
  description,
  href,
}: EditModeEmptySlotProps) {
  return (
    <div className="h-full rounded-2xl border border-dashed border-surface-200 bg-surface-50/50 flex items-center justify-center animate-fade-in">
      <div className="text-center px-4">
        <div className="inline-flex items-center justify-center rounded-xl bg-surface-100 p-2 mb-3">
          <Icon className="h-5 w-5 text-surface-400" />
        </div>
        <p className="text-sm font-medium text-surface-500 mb-1">{label}</p>
        <p className="text-xs text-surface-400 mb-3 max-w-48 mx-auto leading-relaxed">
          {description}
        </p>
        <Link
          href={href}
          aria-label={`Set up ${label}`}
          className="text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
        >
          Set up &rarr;
        </Link>
      </div>
    </div>
  );
}
