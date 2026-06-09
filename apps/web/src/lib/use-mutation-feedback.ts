"use client";

/**
 * useMutationFeedback — wrap a mutation call so success/error surface through the
 * existing toast system [FEEDBACK]. On failure the thrown value is normalized via
 * `toUserMessage` (lib/api-error) so the user never sees raw server/Error text.
 *
 * Usage:
 *   const { run, pending } = useMutationFeedback();
 *   await run(() => apiFetch("/api/x", { method: "POST", body }), {
 *     success: "Saved",
 *   });
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { toUserMessage } from "@/lib/api-error";

export interface MutationFeedbackOptions<T> {
  /** Toast message on success. Omit to stay silent on success. */
  success?: string | ((result: T) => string);
  /** Optional description shown under the success toast. */
  successDescription?: string;
  /**
   * Override the error toast message. Receives the normalized string and the
   * raw error. Return a string to replace it, or void/undefined to keep the
   * normalized message.
   */
  error?: string | ((message: string, raw: unknown) => string | void);
  /** Suppress the error toast entirely (caller handles it). Default false. */
  silentError?: boolean;
}

export interface MutationFeedbackResult<T> {
  /**
   * Execute the mutation. Resolves with the result on success, or `undefined`
   * on failure (the error is toasted, not thrown — call `runOrThrow` if you
   * need the throw to propagate).
   */
  run: (
    fn: () => Promise<T>,
    options?: MutationFeedbackOptions<T>,
  ) => Promise<T | undefined>;
  /** Same as `run` but re-throws after toasting, for callers that branch on it. */
  runOrThrow: (
    fn: () => Promise<T>,
    options?: MutationFeedbackOptions<T>,
  ) => Promise<T>;
  /** True while a mutation is in flight. */
  pending: boolean;
}

export function useMutationFeedback<T = unknown>(): MutationFeedbackResult<T> {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  // Guard against state updates after unmount.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const execute = useCallback(
    async (
      fn: () => Promise<T>,
      options: MutationFeedbackOptions<T> | undefined,
      rethrow: boolean,
    ): Promise<T | undefined> => {
      setPending(true);
      try {
        const result = await fn();
        const successMsg =
          typeof options?.success === "function"
            ? options.success(result)
            : options?.success;
        if (successMsg) {
          toast.success(successMsg, {
            description: options?.successDescription,
          });
        }
        return result;
      } catch (raw) {
        const normalized = toUserMessage(raw);
        if (!options?.silentError) {
          let message = normalized;
          if (typeof options?.error === "string") {
            message = options.error;
          } else if (typeof options?.error === "function") {
            message = options.error(normalized, raw) || normalized;
          }
          toast.error(message);
        }
        if (rethrow) throw raw;
        return undefined;
      } finally {
        if (mounted.current) setPending(false);
      }
    },
    [toast],
  );

  const run = useCallback(
    (fn: () => Promise<T>, options?: MutationFeedbackOptions<T>) =>
      execute(fn, options, false),
    [execute],
  );

  const runOrThrow = useCallback(
    (fn: () => Promise<T>, options?: MutationFeedbackOptions<T>) =>
      execute(fn, options, true) as Promise<T>,
    [execute],
  );

  return { run, runOrThrow, pending };
}
