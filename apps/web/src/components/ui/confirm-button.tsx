"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "./icon-button";

interface ConfirmButtonProps {
  /** Icon for the resting (unarmed) state. */
  icon: ReactNode;
  /** Icon for the armed state. Defaults to the resting icon. */
  armedIcon?: ReactNode;
  /** Accessible name in the resting state (e.g. "Delete row"). */
  label: string;
  /** Accessible name in the armed state (e.g. "Confirm delete"). */
  armedLabel?: string;
  onConfirm: () => void;
  /** Auto-disarm after this many ms of inactivity. Default 3000. */
  resetMs?: number;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
}

/**
 * Two-click destructive control built on <IconButton>. First click "arms" the
 * button (visual + `aria-pressed=true` + an aria-live announcement); second
 * click within `resetMs` confirms. Blur or timeout disarms.
 *
 * State is conveyed beyond color: the armed state swaps the accessible name,
 * may swap the icon, and announces via an `aria-live` region (A11Y-CTRL-02).
 */
export function ConfirmButton({
  icon,
  armedIcon,
  label,
  armedLabel = "Confirm",
  onConfirm,
  resetMs = 3000,
  size = "md",
  disabled = false,
  className = "",
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  function disarm() {
    clearTimer();
    setArmed(false);
  }

  function handleClick() {
    if (!armed) {
      setArmed(true);
      clearTimer();
      timerRef.current = setTimeout(() => setArmed(false), resetMs);
      return;
    }
    disarm();
    onConfirm();
  }

  return (
    <>
      <IconButton
        icon={armed ? (armedIcon ?? icon) : icon}
        aria-label={armed ? armedLabel : label}
        aria-pressed={armed}
        variant={armed ? "danger" : "ghost"}
        size={size}
        disabled={disabled}
        className={className}
        onClick={handleClick}
        onBlur={disarm}
      />
      {/* Announce the armed transition to assistive tech. */}
      <span className="sr-only" role="status" aria-live="polite">
        {armed ? `${label} armed — activate again to confirm` : ""}
      </span>
    </>
  );
}
