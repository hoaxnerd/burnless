/**
 * Runtime-tunable AI limits, resolved from env (the only source — see spec §3
 * decision 5). Operators set these via `burnless config set <KEY> <VALUE>`
 * (writes ~/.burnless/instance.env, sourced at boot). Read per-call so a value
 * change takes effect on the next process start. Mirrors the `num()` pattern in
 * apps/web/src/lib/automations/safety.ts.
 */

/** Positive integer env (>= min, default min=1). Non-finite/too-small → fallback. */
function intEnv(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

/** Token budget env: 0 is VALID and means "no artificial cap". Negatives → fallback. */
function tokenEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export interface AiLimits {
  maxToolIterations: number;
  maxOutputTokens: number; // 0 = uncapped
  repeatSoftLimit: number;
  repeatHardLimit: number;
  onboardingMaxLoops: number;
}

export function getAiLimits(): AiLimits {
  const repeatSoftLimit = intEnv("BURNLESS_AI_REPEAT_SOFT_LIMIT", 3);
  const repeatHardLimit = intEnv("BURNLESS_AI_REPEAT_HARD_LIMIT", 5);
  return {
    maxToolIterations: intEnv("BURNLESS_AI_MAX_TOOL_ITERATIONS", 25),
    maxOutputTokens: tokenEnv("BURNLESS_AI_MAX_OUTPUT_TOKENS", 0),
    repeatSoftLimit,
    // Guarantee hard >= soft so the guard's soft<=n<hard window is never empty.
    repeatHardLimit: Math.max(repeatSoftLimit, repeatHardLimit),
    onboardingMaxLoops: intEnv("BURNLESS_AI_ONBOARDING_MAX_LOOPS", 50),
  };
}
