/**
 * `burnless login` (spec §7.3): PAT by default (--with-token reads stdin for
 * CI; interactive paste on a TTY), --oauth for the browser flow. PAT logins
 * are verified against the instance (open session + listTools) BEFORE the
 * credential is stored, so a typo'd token never pollutes the keychain.
 */
import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import { runAction, upsertProfile } from "../context";
import { saveCredential } from "../credentials";
import { UsageError } from "../errors";
import type { Keychain } from "../keychain";
import { openSession, type McpSession } from "../mcp-session";
import { loginOAuth } from "../oauth";

export interface PatLoginDeps {
  keychain: Keychain;
  sessionFactory?: (opts: { baseUrl: string; token: string }) => Promise<McpSession>;
}

const PAT_PATTERN = /^bl_pat_[A-Za-z0-9_-]+$/; // spec §5.1 PAT format

/** Returns the remote tool count on success (used for the success message). */
export async function performPatLogin(
  opts: { baseUrl: string; profileName: string; token: string },
  deps: PatLoginDeps
): Promise<number> {
  const token = opts.token.trim();
  if (!PAT_PATTERN.test(token)) {
    throw new UsageError(
      'That does not look like a Burnless PAT (expected the "bl_pat_" prefix). Mint one on Connections → Your MCP.'
    );
  }
  const sessionFactory = deps.sessionFactory ?? openSession;
  const session = await sessionFactory({ baseUrl: opts.baseUrl, token });
  try {
    const tools = await session.listTools(); // proves the token authenticates (spec §5.4)
    await saveCredential(deps.keychain, opts.profileName, { kind: "pat", token });
    return tools.length;
  } finally {
    await session.close();
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function promptForToken(): Promise<string> {
  if (process.stdin.isTTY !== true) {
    throw new UsageError(
      "stdin is not a terminal. Pipe the token with --with-token, e.g. `echo $BURNLESS_TOKEN | burnless login --with-token`."
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question("Paste your PAT (bl_pat_…): ");
  rl.close();
  return answer.trim();
}

export function registerLogin(program: Command): void {
  program
    .command("login")
    .description("Authenticate against a Burnless instance (PAT by default; --oauth for the browser flow)")
    .option("--url <baseUrl>", "instance base URL (saved to the profile)")
    .option("--with-token", "read a PAT from stdin (CI-friendly)")
    .option("--oauth", "use the OAuth browser flow instead of a PAT")
    .action(async (opts: { url?: string; withToken?: boolean; oauth?: boolean }, cmd: Command) => {
      await runAction(
        cmd,
        async (ctx) => {
          const baseUrl = (opts.url ?? ctx.profile.baseUrl).replace(/\/+$/, "");
          if (opts.oauth === true) {
            await loginOAuth({ baseUrl, profileName: ctx.profileName, keychain: ctx.keychain });
            upsertProfile(ctx, { baseUrl, authMode: "oauth" });
            return;
          }
          const token = opts.withToken === true ? await readStdin() : await promptForToken();
          const toolCount = await performPatLogin(
            { baseUrl, profileName: ctx.profileName, token },
            { keychain: ctx.keychain }
          );
          upsertProfile(ctx, { baseUrl, authMode: "pat" });
          process.stderr.write(
            `Logged in to ${baseUrl} as profile "${ctx.profileName}" (${toolCount} tools available).\n`
          );
        },
        { allowMissingProfile: true } // login may create a brand-new profile
      );
    });
}
