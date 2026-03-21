"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  Undo2,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type ToastVariant = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  description?: string;
  duration?: number;
  undoAction?: () => void | Promise<void>;
  dismissing?: boolean;
}

interface ToastOptions {
  variant?: ToastVariant;
  message: string;
  description?: string;
  /** Auto-dismiss duration in ms. Default 4000. Set 0 to disable. */
  duration?: number;
  /** Undo callback — shows Undo button on the toast */
  undoAction?: () => void | Promise<void>;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
  success: (message: string, opts?: Omit<ToastOptions, "variant" | "message">) => string;
  error: (message: string, opts?: Omit<ToastOptions, "variant" | "message">) => string;
  warning: (message: string, opts?: Omit<ToastOptions, "variant" | "message">) => string;
  info: (message: string, opts?: Omit<ToastOptions, "variant" | "message">) => string;
}

/* ── Context ───────────────────────────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* ── Provider ──────────────────────────────────────────────────────────────── */

let globalId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    // Start dismiss animation
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)));
    // Remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (options: ToastOptions): string => {
      const id = `toast-${++globalId}`;
      const duration = options.duration ?? 4000;
      const newToast: Toast = {
        id,
        variant: options.variant ?? "info",
        message: options.message,
        description: options.description,
        duration,
        undoAction: options.undoAction,
      };

      setToasts((prev) => {
        // Max 5 visible toasts — dismiss oldest
        const next = [...prev, newToast];
        if (next.length > 5) next.shift();
        return next;
      });

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }

      return id;
    },
    [dismiss],
  );

  const success = useCallback(
    (message: string, opts?: Omit<ToastOptions, "variant" | "message">) =>
      addToast({ variant: "success", message, ...opts }),
    [addToast],
  );
  const error = useCallback(
    (message: string, opts?: Omit<ToastOptions, "variant" | "message">) =>
      addToast({ variant: "error", message, duration: 6000, ...opts }),
    [addToast],
  );
  const warning = useCallback(
    (message: string, opts?: Omit<ToastOptions, "variant" | "message">) =>
      addToast({ variant: "warning", message, ...opts }),
    [addToast],
  );
  const info = useCallback(
    (message: string, opts?: Omit<ToastOptions, "variant" | "message">) =>
      addToast({ variant: "info", message, ...opts }),
    [addToast],
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const value: ToastContextValue = {
    toast: addToast,
    dismiss,
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastPortal toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/* ── Portal (renders at body level) ────────────────────────────────────────── */

function ToastPortal({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect -- client-only portal mount check
  }, []);

  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div
      className="fixed bottom-0 right-0 z-[9999] flex flex-col-reverse gap-2 p-4 max-w-md w-full pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

/* ── Individual Toast ──────────────────────────────────────────────────────── */

const variantConfig: Record<
  ToastVariant,
  { icon: typeof CheckCircle; bg: string; border: string; iconColor: string }
> = {
  success: {
    icon: CheckCircle,
    bg: "bg-surface-0",
    border: "border-success-500/30",
    iconColor: "text-success-500",
  },
  error: {
    icon: AlertCircle,
    bg: "bg-surface-0",
    border: "border-danger-500/30",
    iconColor: "text-danger-500",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-surface-0",
    border: "border-warning-500/30",
    iconColor: "text-warning-500",
  },
  info: {
    icon: Info,
    bg: "bg-surface-0",
    border: "border-brand-500/30",
    iconColor: "text-brand-500",
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const { icon: Icon, bg, border, iconColor } = variantConfig[toast.variant];

  return (
    <div
      role="alert"
      className={`
        pointer-events-auto flex items-start gap-3 rounded-xl border ${border} ${bg}
        px-4 py-3 shadow-lg backdrop-blur-sm
        ${toast.dismissing ? "animate-toast-out" : "animate-toast-in"}
      `}
    >
      <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${iconColor}`} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-surface-900">{toast.message}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs text-surface-500">{toast.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {toast.undoAction && (
          <button
            onClick={() => {
              toast.undoAction?.();
              onDismiss(toast.id);
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
          >
            <Undo2 className="h-3 w-3" />
            Undo
          </button>
        )}
        <button
          onClick={() => onDismiss(toast.id)}
          className="rounded-lg p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
