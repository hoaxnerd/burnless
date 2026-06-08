/**
 * api-error — the SINGLE client-side error normalizer [ERR-02].
 *
 * Turns a fetch `Response`, a thrown `Error`, a `FetchError`, or a parsed
 * `{ error }` body into a human-readable string. Defensively coerces non-string
 * error shapes (objects, arrays, Zod issue trees) so we NEVER render raw JSON or
 * a stack-ish `Error.message` straight to the user.
 *
 * This is the allowlisted home expected by the no-raw-server-error-render guard
 * (`apps/web/src/__tests__/no-raw-server-error-render.test.ts` allowlists
 * `/lib/api-error.ts`). Every client error sink should route through
 * `toUserMessage(...)` / `extractApiError(...)`.
 */

const GENERIC_FALLBACK = "Something went wrong. Please try again.";

/** Looks like raw JSON ({...} or [...]) — never surface this verbatim. */
function looksLikeRawJson(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  return (
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"))
  );
}

/** Looks like a stack trace / machine-y Error.message we shouldn't show. */
function looksLikeStack(s: string): boolean {
  return /\n\s*at\s+/.test(s) || s.includes("\n    at ");
}

/**
 * Coerce any value into a clean, user-safe string — or null if nothing usable.
 * Strings that look like raw JSON / stack traces are rejected (return null).
 */
function coerceString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (looksLikeRawJson(trimmed)) return null;
    if (looksLikeStack(trimmed)) return null;
    return trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

/**
 * Pull a usable message out of a parsed error body. Handles the common shapes:
 *  - `{ error: "..." }`
 *  - `{ message: "..." }`
 *  - `{ error: { message: "..." } }`
 *  - `{ errors: [{ message }] }` / Zod-ish `{ issues: [{ message }] }`
 */
function fromBody(body: unknown): string | null {
  if (body == null || typeof body !== "object") return coerceString(body);

  const obj = body as Record<string, unknown>;

  // Direct string fields.
  const direct = coerceString(obj.error) ?? coerceString(obj.message);
  if (direct) return direct;

  // Nested `{ error: { message } }`.
  if (obj.error && typeof obj.error === "object") {
    const nested = coerceString((obj.error as Record<string, unknown>).message);
    if (nested) return nested;
  }

  // Arrays of issues (Zod flatten / generic validation).
  for (const key of ["issues", "errors", "details"]) {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length > 0) {
      const msgs = arr
        .map((it) =>
          typeof it === "string"
            ? coerceString(it)
            : coerceString((it as Record<string, unknown>)?.message),
        )
        .filter((m): m is string => Boolean(m));
      if (msgs.length > 0) return msgs.join("; ");
    }
  }

  return null;
}

/** Map an HTTP status to a friendly default when the body yields nothing. */
function statusFallback(status: number): string {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "We could not find what you were looking for.";
  if (status === 409) return "This conflicts with the current state. Please refresh and retry.";
  if (status === 429) return "Too many requests. Please slow down and try again.";
  if (status >= 500) return "Something went wrong on our end. Please try again shortly.";
  if (status >= 400) return "That request could not be completed.";
  return GENERIC_FALLBACK;
}

/**
 * extractApiError — normalize a fetch `Response`, a thrown error, or a parsed
 * body into a user-safe string.
 *
 * Sync for non-Response inputs; async (awaits `response.json()`) for a Response.
 */
export function extractApiError(input: Response): Promise<string>;
export function extractApiError(input: unknown): string;
export function extractApiError(input: unknown): string | Promise<string> {
  // fetch Response — read the JSON body, then fall back to status.
  if (typeof Response !== "undefined" && input instanceof Response) {
    const res = input;
    return res
      .clone()
      .json()
      .then(
        (body) => fromBody(body) ?? statusFallback(res.status),
        () => statusFallback(res.status),
      );
  }

  return toUserMessage(input);
}

/**
 * toUserMessage — synchronous, total normalizer. Given anything (Error,
 * FetchError, string, parsed body, unknown), returns a user-safe message,
 * always falling back to a generic string. Never returns raw JSON / stacks.
 */
export function toUserMessage(err: unknown): string {
  if (err == null) return GENERIC_FALLBACK;

  // FetchError (from swr/fetcher) carries .info (the parsed body) + .status.
  if (err instanceof Error) {
    const info = (err as { info?: unknown }).info;
    const fromInfo = info != null ? fromBody(info) : null;
    if (fromInfo) return fromInfo;

    const status = (err as { status?: unknown }).status;
    const fromMsg = coerceString(err.message);
    if (fromMsg) return fromMsg;

    if (typeof status === "number") return statusFallback(status);
    return GENERIC_FALLBACK;
  }

  if (typeof err === "string") {
    return coerceString(err) ?? GENERIC_FALLBACK;
  }

  // Parsed body or arbitrary object.
  return fromBody(err) ?? GENERIC_FALLBACK;
}
