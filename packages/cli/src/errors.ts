/**
 * Exit-code contract (spec §7.4 write-safety + CLI standards):
 *   0 — success
 *   1 — server/tool error (instance unreachable, tool returned isError, OAuth exchange failed)
 *   2 — user/validation error (bad flags, unknown profile, refused confirmation, not logged in)
 * Errors are always written to stderr so `--json` keeps stdout machine-clean.
 */
export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: 1 | 2 = 1
  ) {
    super(message);
    this.name = "CliError";
  }
}

/** User/validation error — always exit code 2. */
export class UsageError extends CliError {
  constructor(message: string) {
    super(message, 2);
    this.name = "UsageError";
  }
}
