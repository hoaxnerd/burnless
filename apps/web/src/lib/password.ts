/**
 * Password hashing — RELOCATED to @burnless/types (shared with the burnless CLI for
 * `users passwd`/claim). This shim preserves the `@/lib/password` import path.
 */
export { hashPassword, verifyPassword } from "@burnless/types";
