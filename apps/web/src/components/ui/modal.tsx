"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";
import { Overlay } from "./overlay";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Max width variant */
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

export function Modal({ open, onClose, title, children, size = "lg" }: ModalProps) {
  return (
    <Overlay open={open} onClose={onClose} ariaLabel={title}>
      {(panelProps) => (
        <div
          {...panelProps}
          className={`bg-surface-0 rounded-2xl shadow-xl border border-surface-200 w-full ${sizeMap[size]} max-h-[90vh] overflow-auto animate-scale-in outline-none`}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
            <h2 className="text-lg font-semibold text-surface-900">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-6 py-4">{children}</div>
        </div>
      )}
    </Overlay>
  );
}
