// apps/web/src/app/(dashboard)/ai/_components/timeline/result-container.tsx
"use client";
/** Compact, size-locked wrapper for result artifacts (spec §7.2). Caps width at
 *  ~420px on desktop; full-width + horizontal-scroll for wide content on mobile. */
export function ResultContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[420px] overflow-x-auto">
      {children}
    </div>
  );
}
