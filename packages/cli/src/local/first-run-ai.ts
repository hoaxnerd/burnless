/**
 * Interactive first-run AI setup (spec §4). At first `start` on a TTY with no AI
 * configured, offer to set a provider+key, written to instance.env (env-seed path —
 * works pre-company; onboarding's AI reads it via the resolution env fallback).
 * Orchestration takes injected prompt/verify deps so it's testable; start.ts wires the
 * real readline prompts.
 */
import { defaultBaseUrl, type ProviderKind } from "./ai-catalog";
import { setInstanceEnvVar } from "./home";

const KNOWN_KEY_ENVS = ["AI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"];

export function shouldOfferAiSetup(opts: { isTTY: boolean; env: NodeJS.ProcessEnv }): boolean {
  if (!opts.isTTY) return false;
  if (opts.env.AI_PROVIDER) return false;
  return !KNOWN_KEY_ENVS.some((k) => (opts.env[k]?.length ?? 0) > 0);
}

export function persistAiConfig(opts: {
  kind: ProviderKind; apiKey: string; baseUrl?: string; home?: string; env?: NodeJS.ProcessEnv;
}): void {
  const env = opts.env ?? process.env;
  setInstanceEnvVar("AI_PROVIDER", opts.kind, opts.home);
  setInstanceEnvVar("AI_API_KEY", opts.apiKey, opts.home);
  env.AI_PROVIDER = opts.kind;
  env.AI_API_KEY = opts.apiKey;
  if (opts.baseUrl) {
    setInstanceEnvVar("AI_BASE_URL", opts.baseUrl, opts.home);
    env.AI_BASE_URL = opts.baseUrl;
  }
}

export interface FirstRunAiDeps {
  home?: string;
  env?: NodeJS.ProcessEnv;
  chooseKind: () => Promise<ProviderKind | null>;
  readApiKey: () => Promise<string>;
  verify: (input: { baseUrl: string; apiKey?: string | null }) => Promise<{ ok: boolean; detail: string }>;
}

export async function runFirstRunAiSetup(deps: FirstRunAiDeps): Promise<{ configured: boolean; detail?: string }> {
  const kind = await deps.chooseKind();
  if (!kind) return { configured: false };
  const apiKey = await deps.readApiKey();
  if (!apiKey) return { configured: false, detail: "no key entered" };
  const baseUrl = defaultBaseUrl(kind);
  if (baseUrl) {
    const r = await deps.verify({ baseUrl, apiKey });
    if (!r.ok) return { configured: false, detail: r.detail };
  }
  persistAiConfig({ kind, apiKey, baseUrl, home: deps.home, env: deps.env });
  return { configured: true };
}
