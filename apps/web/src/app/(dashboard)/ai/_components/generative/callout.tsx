"use client";

const STYLES: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  success: "border-green-200 bg-green-50 text-green-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-red-200 bg-red-50 text-red-900",
};

export interface GenCalloutProps {
  severity: keyof typeof STYLES;
  title?: string | null;
  body: string;
}

export function GenCallout({ severity, title, body }: GenCalloutProps) {
  return (
    <div className={`my-2 rounded-lg border px-3 py-2 text-sm ${STYLES[severity] ?? STYLES.info}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <p className={title ? "mt-0.5" : ""}>{body}</p>
    </div>
  );
}
