"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

type CopyState = "idle" | "copied" | "failed";

export function CopyButton({
  command,
  className,
  label = "copy",
}: {
  command: string;
  className?: string;
  label?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setState("copied");
      trackEvent("landing_install_copied");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      // Clipboard blocked (insecure context / denied permission) — surface it so the
      // user knows to copy the command manually rather than failing silently.
      setState("failed");
      setTimeout(() => setState("idle"), 2500);
    }
  }
  const aria =
    state === "copied"
      ? "Copied install command"
      : state === "failed"
        ? "Couldn't copy — select the command and copy it manually"
        : "Copy install command";
  const text = state === "copied" ? "✓ copied" : state === "failed" ? "⌘C to copy" : `⧉ ${label}`;
  return (
    <button type="button" onClick={handleCopy} aria-label={aria} className={className}>
      {text}
    </button>
  );
}
