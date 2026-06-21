"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

export function CopyButton({
  command,
  className,
  label = "copy",
}: {
  command: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      trackEvent("landing_install_copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (insecure context / denied permission) — no-op
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied install command" : "Copy install command"}
      className={className}
    >
      {copied ? "✓ copied" : `⧉ ${label}`}
    </button>
  );
}
