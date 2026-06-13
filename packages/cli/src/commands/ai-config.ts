import type { Command } from "commander";
import { runAction } from "../context";
import { UsageError } from "../errors";
import { prepareArtifactEnv } from "../local/artifact";
import { isKnownKind, PROVIDER_KINDS, type ProviderKind } from "../local/ai-catalog";
import { mAdd, mDefault, mList } from "../local/ai-model-ops";
import {
  pAdd, pDisable, pEnable, pList, pRemove, pSetDefault, pSetKey, resolveProviderForTest, verifyConnection,
} from "../local/ai-provider-ops";
import { readSecret } from "../prompt";

export function isLocalProfile(baseUrl: string): boolean {
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return false;
  }
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

/** Provider config from the CLI manages the LOCAL instance only; remote = deferred (auth bridge TBD). */
export function assertLocalProfile(baseUrl: string): void {
  if (isLocalProfile(baseUrl)) return;
  throw new UsageError(
    "AI provider config from the CLI manages the LOCAL instance only. For a remote/cloud " +
      "instance, use its Settings → AI tab. (Remote CLI provider config is a planned follow-up.)",
  );
}

/** `burnless provider list|add|test|enable|disable|remove|default` */
export function registerProvider(program: Command): void {
  const provider = program.command("provider").description("Manage AI providers (local instance)");

  provider.command("list").action(async (_opts, cmd: Command) => {
    await runAction(cmd, async (ctx) => {
      assertLocalProfile(ctx.profile.baseUrl);
      prepareArtifactEnv(); // local branch only: inject staged migrations dir for the @burnless/db query — no-op in dev
      const rows = await pList();
      if (ctx.json) process.stdout.write(JSON.stringify({ providers: rows }) + "\n");
      else
        for (const p of rows)
          process.stderr.write(
            `${p.name} [${p.kind}]${p.isDefault ? " *default" : ""}${p.enabled ? "" : " (disabled)"} — ` +
              `${p.apiKeySet ? "key set" : "no key"}, ${p.modelCount} model(s)\n`,
          );
    }, { allowMissingProfile: true });
  });

  provider
    .command("add")
    .argument("<name>", "a label for this provider")
    .requiredOption("--kind <kind>", `provider kind (${PROVIDER_KINDS.join("|")})`)
    .option("--base-url <url>", "API base URL (prefilled for openrouter/ollama)")
    .option("--key-stdin", "read the API key from stdin (else a masked prompt; omit for keyless e.g. ollama)")
    .option("--no-key", "create without an API key (e.g. ollama)")
    .action(async (name: string, opts: { kind: string; baseUrl?: string; keyStdin?: boolean; key?: boolean }, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        assertLocalProfile(ctx.profile.baseUrl);
        prepareArtifactEnv(); // local branch only: inject staged migrations dir for the @burnless/db query — no-op in dev
        if (!isKnownKind(opts.kind)) throw new UsageError(`Unknown kind "${opts.kind}" (expected ${PROVIDER_KINDS.join("|")}).`);
        const kind = opts.kind as ProviderKind;
        let apiKey: string | undefined;
        if (opts.key !== false) {
          apiKey = await readSecret({ stdin: opts.keyStdin, label: "API key: " });
          if (!apiKey) throw new UsageError("Empty API key — pass --no-key for a keyless provider.");
        }
        const created = await pAdd({ name, kind, baseUrl: opts.baseUrl, apiKey });
        if (ctx.json) process.stdout.write(JSON.stringify({ id: created.id, name: created.name }) + "\n");
        else process.stderr.write(`Added provider ${created.name} (${created.kind})${created.isDefault ? ", set as default" : ""}.\n`);
      }, { allowMissingProfile: true });
    });

  provider
    .command("test")
    .argument("<name>")
    .action(async (name: string, _opts, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        assertLocalProfile(ctx.profile.baseUrl);
        prepareArtifactEnv(); // local branch only: inject staged migrations dir for the @burnless/db query — no-op in dev
        const { baseUrl, apiKey } = await resolveProviderForTest(name);
        if (!baseUrl) throw new UsageError(`Provider "${name}" has no base URL to test (vendor providers test from the UI).`);
        const r = await verifyConnection({ baseUrl, apiKey });
        if (ctx.json) process.stdout.write(JSON.stringify(r) + "\n");
        else process.stderr.write(`${r.ok ? "OK" : "FAILED"}: ${r.detail}\n`);
        if (!r.ok) process.exitCode = 1;
      }, { allowMissingProfile: true });
    });

  for (const [verb, fn, msg] of [
    ["enable", pEnable, "enabled"],
    ["disable", pDisable, "disabled"],
    ["default", pSetDefault, "set as default"],
  ] as const) {
    provider
      .command(verb)
      .argument("<name>")
      .action(async (name: string, _opts, cmd: Command) => {
        await runAction(cmd, async (ctx) => {
          assertLocalProfile(ctx.profile.baseUrl);
          prepareArtifactEnv(); // local branch only: inject staged migrations dir for the @burnless/db query — no-op in dev
          await fn(name);
          process.stderr.write(`Provider ${name} ${msg}.\n`);
        }, { allowMissingProfile: true });
      });
  }

  provider
    .command("remove")
    .argument("<name>")
    .action(async (name: string, _opts, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        assertLocalProfile(ctx.profile.baseUrl);
        prepareArtifactEnv(); // local branch only: inject staged migrations dir for the @burnless/db query — no-op in dev
        const ok = await pRemove(name);
        process.stderr.write(ok ? `Removed provider ${name}.\n` : `No provider named ${name}.\n`);
      }, { allowMissingProfile: true });
    });
}

/** `burnless key set <provider>` — masked stdin / --stdin; never positional. */
export function registerKey(program: Command): void {
  const key = program.command("key").description("Manage AI provider API keys (local instance)");
  key
    .command("set")
    .argument("<provider>", "provider name")
    .option("--stdin", "read the key from stdin instead of a prompt")
    .action(async (providerName: string, opts: { stdin?: boolean }, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        assertLocalProfile(ctx.profile.baseUrl);
        prepareArtifactEnv(); // local branch only: inject staged migrations dir for the @burnless/db query — no-op in dev
        const apiKey = await readSecret({ stdin: opts.stdin, label: "API key: " });
        if (!apiKey) throw new UsageError("Empty key — aborted.");
        await pSetKey(providerName, apiKey);
        process.stderr.write(`Key set for ${providerName}.\n`);
      }, { allowMissingProfile: true });
    });
}

/** `burnless model list <provider> | add <provider> <id> | default <provider> <id>` */
export function registerModel(program: Command): void {
  const model = program.command("model").description("Manage AI provider models (local instance)");

  model
    .command("list")
    .argument("<provider>", "provider name")
    .action(async (providerName: string, _opts, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        assertLocalProfile(ctx.profile.baseUrl);
        prepareArtifactEnv(); // local branch only: inject staged migrations dir for the @burnless/db query — no-op in dev
        const rows = await mList(providerName);
        if (ctx.json) process.stdout.write(JSON.stringify({ models: rows }) + "\n");
        else for (const m of rows) process.stderr.write(`${m.modelId}${m.isDefault ? " *default" : ""} [${m.source}]\n`);
      }, { allowMissingProfile: true });
    });

  model
    .command("add")
    .argument("<provider>")
    .argument("<modelId>")
    .action(async (providerName: string, modelId: string, _opts, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        assertLocalProfile(ctx.profile.baseUrl);
        prepareArtifactEnv(); // local branch only: inject staged migrations dir for the @burnless/db query — no-op in dev
        await mAdd(providerName, modelId);
        process.stderr.write(`Added model ${modelId} to ${providerName}.\n`);
      }, { allowMissingProfile: true });
    });

  model
    .command("default")
    .argument("<provider>")
    .argument("<modelId>")
    .action(async (providerName: string, modelId: string, _opts, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        assertLocalProfile(ctx.profile.baseUrl);
        prepareArtifactEnv(); // local branch only: inject staged migrations dir for the @burnless/db query — no-op in dev
        await mDefault(providerName, modelId);
        process.stderr.write(`Default model for ${providerName} set to ${modelId}.\n`);
      }, { allowMissingProfile: true });
    });
}
