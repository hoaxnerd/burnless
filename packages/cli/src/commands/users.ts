import type { Command } from "commander";
import {
  closeDatabase,
  createUser,
  db,
  getOwnerUser,
  initDatabase,
  listUsers,
  setUserPassword,
  type UserSummary,
} from "@burnless/db";
import { hashPassword } from "@burnless/types";
import { runAction } from "../context";
import { UsageError } from "../errors";
import { readSecret } from "../prompt";

/** True iff the DB singleton is already booted (the `db` proxy resolves without throwing). */
function dbAlreadyBooted(): boolean {
  try {
    // The proxy throws synchronously for an un-booted PGLite singleton; a booted
    // singleton (postgres OR pglite) resolves any property access fine.
    void (db as { dialect?: unknown }).dialect;
    return true;
  } catch {
    return false;
  }
}

/**
 * Boot the local DB singleton, run fn, then close ONLY if we opened it. No running
 * server needed (L1). When a caller (or a test harness) already booted the singleton,
 * we leave it open — PGLite cannot be re-created synchronously, so closing a borrowed
 * handle would break the caller's later reads.
 */
async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  const owned = !dbAlreadyBooted();
  await initDatabase();
  try {
    return await fn();
  } finally {
    if (owned) await closeDatabase();
  }
}

export async function runUsersList(): Promise<UserSummary[]> {
  return withDb(() => listUsers());
}

/** Set/reset a password. No email ⇒ the owner (claims an unclaimed owner). */
export async function runUsersPasswd(input: { email?: string; password: string }): Promise<void> {
  await withDb(async () => {
    const email = input.email ?? (await getOwnerUser())?.email;
    if (!email) throw new UsageError("No user to set a password for (run `burnless bootstrap` first).");
    const hash = await hashPassword(input.password);
    const n = await setUserPassword(email, hash);
    if (n === 0) throw new UsageError(`No user with email "${email}".`);
  });
}

export async function runUsersCreate(input: {
  email: string;
  name?: string;
  password: string;
}): Promise<{ id: string }> {
  return withDb(async () => {
    const hash = await hashPassword(input.password);
    return createUser({ email: input.email, name: input.name, passwordHash: hash });
  });
}

/** `burnless users list | passwd | create` (spec §3, L1 — direct, no server). */
export function registerUsers(program: Command): void {
  const usersCmd = program.command("users").description("Manage local users (owner, recovery)");

  usersCmd
    .command("list")
    .description("List local users")
    .action(async (_opts, cmd: Command) => {
      await runAction(
        cmd,
        async (ctx) => {
          const rows = await runUsersList();
          if (ctx.json) process.stdout.write(JSON.stringify({ users: rows }) + "\n");
          else
            for (const u of rows)
              process.stderr.write(`${u.email}${u.claimed ? "" : " (unclaimed)"} — ${u.id}\n`);
        },
        { allowMissingProfile: true },
      );
    });

  usersCmd
    .command("passwd")
    .description("Set/reset a user's password (default: the owner — claims it). Reads the password from a masked prompt or --stdin.")
    .argument("[email]", "target user email (defaults to the owner)")
    .option("--stdin", "read the new password from stdin instead of a prompt")
    .action(async (email: string | undefined, opts: { stdin?: boolean }, cmd: Command) => {
      await runAction(
        cmd,
        async () => {
          const password = await readSecret({ stdin: opts.stdin, label: "New password: " });
          if (!password) throw new UsageError("Empty password — aborted.");
          await runUsersPasswd({ email, password });
          process.stderr.write(`Password set for ${email ?? "the owner"}.\n`);
        },
        { allowMissingProfile: true },
      );
    });

  usersCmd
    .command("create")
    .description("Create an additional local user. Reads the password from a masked prompt or --stdin.")
    .requiredOption("--email <email>", "the new user's email")
    .option("--name <name>", "the new user's display name")
    .option("--stdin", "read the password from stdin instead of a prompt")
    .action(async (opts: { email: string; name?: string; stdin?: boolean }, cmd: Command) => {
      await runAction(
        cmd,
        async (ctx) => {
          const password = await readSecret({ stdin: opts.stdin, label: "Password: " });
          if (!password) throw new UsageError("Empty password — aborted.");
          const { id } = await runUsersCreate({ email: opts.email, name: opts.name, password });
          if (ctx.json) process.stdout.write(JSON.stringify({ id, email: opts.email }) + "\n");
          else process.stderr.write(`Created user ${opts.email} (${id}).\n`);
        },
        { allowMissingProfile: true },
      );
    });
}
