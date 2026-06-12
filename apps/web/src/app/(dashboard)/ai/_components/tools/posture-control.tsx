"use client";

import { SegmentedControl } from "@/components/ui";

/**
 * PostureControl — the standing `ask · session · always` posture segmented
 * control shared by the Web (web-search / browser-use) and Workspace
 * (read / write / delete) rows. Mockup `.seg`: "Ask first" · "This chat" ·
 * "Always". `delete` is destructive and never offers Always (§5).
 *
 * Posture is a per-user STANDING default (`aiPermissionDefaults`) — distinct
 * from the per-chat enablement layer the EnableSwitch governs.
 */
export type PostureMode = "ask" | "session" | "always";

const FULL_OPTIONS: { value: PostureMode; label: string }[] = [
  { value: "ask", label: "Ask first" },
  { value: "session", label: "This chat" },
  { value: "always", label: "Always" },
];
const NO_ALWAYS_OPTIONS = FULL_OPTIONS.filter((o) => o.value !== "always");

export function PostureControl({
  label,
  value,
  onChange,
  allowAlways = true,
}: {
  label: string;
  value: PostureMode;
  onChange: (value: PostureMode) => void;
  /** `false` for delete — no permanent-allow option. */
  allowAlways?: boolean;
}) {
  const options = allowAlways ? FULL_OPTIONS : NO_ALWAYS_OPTIONS;
  return (
    <SegmentedControl<PostureMode>
      label={label}
      size="sm"
      value={value}
      onChange={onChange}
      options={options.map((o) => ({ value: o.value, label: o.label }))}
    />
  );
}
