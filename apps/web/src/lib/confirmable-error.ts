/**
 * Generic "this mutation needs explicit confirmation" error. Throw from a
 * route handler when the client must re-submit with `?confirm=true` (or an
 * equivalent body flag) to proceed. `withErrorHandler` serializes it to a
 * structured 409 so the client can render a confirm dialog and retry.
 *
 * Use when the action is safe and recoverable but non-obvious enough that
 * a one-click accident is worse than a two-click acknowledgement.
 */
export class ConfirmableError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ConfirmableError";
  }
}

export interface ConfirmableResponse {
  error: string;
  code: string;
  requiresConfirmation: true;
  details?: Record<string, unknown>;
}

export function serializeConfirmable(err: ConfirmableError): ConfirmableResponse {
  const base: ConfirmableResponse = {
    error: err.message,
    code: err.code,
    requiresConfirmation: true,
  };
  if (err.details !== undefined) {
    base.details = err.details;
  }
  return base;
}
