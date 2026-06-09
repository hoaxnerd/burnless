"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseDialogA11yOptions {
  open: boolean;
  onClose: () => void;
  /**
   * Ref to the focusable content container. Escape-to-close, focus trap,
   * initial-focus and focus-restore all key off this element.
   */
  contentRef: RefObject<HTMLElement | null>;
  /**
   * When true, suppress the dialog-specific behaviours: focus trap and
   * managed initial focus. Escape-to-close, scroll-lock and focus-restore
   * still apply. Combobox-style surfaces (command palette) manage their own
   * focus and roving tabindex, so they opt out of the trap.
   */
  headless?: boolean;
}

/**
 * Shared dialog accessibility behaviour extracted from <Modal>:
 * - Escape-to-close
 * - focus trap (Tab cycles within content) — skipped when `headless`
 * - body scroll-lock while open
 * - initial focus into the first focusable element — skipped when `headless`
 * - focus-restore to the previously focused element on close
 *
 * Pure side-effect hook; renders nothing. Consumers own the DOM.
 */
export function useDialogA11y({ open, onClose, contentRef, headless = false }: UseDialogA11yOptions) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const initialFocusSetRef = useRef(false);

  // Keep onClose ref current without causing effect re-runs
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) {
      initialFocusSetRef.current = false;
      return;
    }

    // Store previously focused element to restore on close
    previousFocusRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";

    // Focus the first focusable element only on initial open (dialog mode only)
    if (!headless && !initialFocusSetRef.current) {
      initialFocusSetRef.current = true;
      requestAnimationFrame(() => {
        if (contentRef.current) {
          const firstFocusable = contentRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            contentRef.current.focus();
          }
        }
      });
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }

      // Focus trap: cycle Tab within content (dialog mode only)
      if (!headless && e.key === "Tab" && contentRef.current) {
        const focusable = contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";

      // Restore focus to previously focused element
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === "function") {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    };
  }, [open, headless, contentRef]);
}

/** Props the consumer must spread onto their panel element. */
export interface OverlayPanelProps {
  ref: RefObject<HTMLDivElement | null>;
  tabIndex?: number;
  role?: "dialog";
  "aria-modal"?: "true";
  "aria-label"?: string;
  onClick: (e: React.MouseEvent) => void;
}

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  /**
   * Render-prop that receives the props to spread onto the panel element.
   * Spreading them wires up the dialog ref, ARIA semantics, and the
   * click-stop that prevents scrim-close when clicking inside the panel.
   */
  children: (panelProps: OverlayPanelProps) => ReactNode;
  /**
   * Headless mode: no role=dialog/aria-modal/tabIndex on the panel, no focus
   * trap, no managed initial focus. Consumers (e.g. command-palette) own their
   * own focus management and ARIA roles. Escape/scroll-lock/focus-restore still
   * apply. Default false (full dialog semantics).
   */
  headless?: boolean;
  /** Extra classes applied to the centering panel wrapper. */
  className?: string;
  /** Override the scrim classes. */
  scrimClassName?: string;
  /** Accessible label for the dialog role (ignored when headless). */
  ariaLabel?: string;
}

/**
 * Portal + scrim + dialog a11y. The single source of overlay behaviour that
 * <Modal>, <ConfirmDialog> and combobox-style surfaces build on.
 *
 * The consumer styles its own panel and spreads the render-prop's
 * `panelProps` onto it, so the dialog ARIA/ref/click-stop land on the
 * consumer's element (byte-compatible with the legacy <Modal> DOM).
 *
 * Headless: panelProps carry no dialog ARIA/tabIndex — for
 * command-palette-style users that manage their own roles and focus.
 */
export function Overlay({
  open,
  onClose,
  children,
  headless = false,
  className = "",
  scrimClassName,
  ariaLabel,
}: OverlayProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useDialogA11y({ open, onClose, contentRef, headless });

  if (!open || typeof document === "undefined") return null;

  const panelProps: OverlayPanelProps = headless
    ? {
        ref: contentRef,
        onClick: (e) => e.stopPropagation(),
      }
    : {
        ref: contentRef,
        tabIndex: -1,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": ariaLabel,
        onClick: (e) => e.stopPropagation(),
      };

  // Portal to document.body so that CSS transforms on ancestor elements
  // (e.g. animate-page-enter) don't break position:fixed centering.
  return createPortal(
    <>
      {/* Scrim */}
      <div
        className={scrimClassName ?? "fixed inset-0 bg-black/40 z-50 animate-fade-in"}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel wrapper */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${className}`.trim()}>
        {children(panelProps)}
      </div>
    </>,
    document.body,
  );
}
