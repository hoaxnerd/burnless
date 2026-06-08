"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Modal } from "./modal";
import { Button } from "./button";

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Render the confirm action as a destructive (danger) button. */
  destructive?: boolean;
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Controlled confirmation dialog built on <Modal> (and therefore <Overlay>).
 * Prefer the `useConfirm()` hook for imperative call sites; this component is
 * exported for fully-controlled usages.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      {body != null && <div className="text-sm text-surface-600 dark:text-surface-300">{body}</div>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? "danger" : "primary"}
          size="sm"
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

const CLOSED: ConfirmState = { open: false, title: "" };

/**
 * Imperative confirmation. `confirm(opts)` returns a promise that resolves
 * `true` on confirm and `false` on cancel/dismiss. Render the returned
 * `dialog` element once in the component tree.
 *
 * @example
 * const { confirm, dialog } = useConfirm();
 * const ok = await confirm({ title: "Delete?", destructive: true });
 * return <>{dialog}{...}</>;
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>(CLOSED);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState(CLOSED);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    // Resolve any in-flight prompt as cancelled before opening a new one.
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const dialog = (
    <ConfirmDialog
      {...state}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, dialog };
}
