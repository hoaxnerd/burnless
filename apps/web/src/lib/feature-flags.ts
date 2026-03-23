/**
 * Feature flag and A/B testing infrastructure.
 *
 * Client-side: use the React hooks exported from this module.
 * Server-side (API routes, RSCs): use getServerFeatureFlag().
 *
 * Flags are managed in PostHog. To create a new flag:
 *   1. Go to PostHog → Feature Flags → New
 *   2. Set a key (e.g. "new-onboarding-flow")
 *   3. Choose boolean or multivariate
 *   4. Set rollout percentage / targeting rules
 *   5. Use the key in code via hooks or server helper
 */

import { PostHog as PostHogNode } from "posthog-node";

// ── Server-side client (singleton) ──────────────────────────────────────────

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let serverClient: PostHogNode | null = null;

function getServerClient(): PostHogNode | null {
  if (!POSTHOG_KEY) return null;
  if (!serverClient) {
    serverClient = new PostHogNode(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return serverClient;
}

// ── Server-side feature flag evaluation ─────────────────────────────────────

/**
 * Evaluate a feature flag on the server (API routes, RSCs).
 *
 * @param key - The feature flag key from PostHog
 * @param distinctId - The user/company ID to evaluate for
 * @param groups - Optional group properties (e.g. { company: companyId })
 * @returns The flag value: boolean, string variant, or undefined if unavailable
 */
export async function getServerFeatureFlag(
  key: string,
  distinctId: string,
  groups?: Record<string, string>,
): Promise<boolean | string | undefined> {
  const client = getServerClient();
  if (!client) return undefined;

  try {
    const value = await client.getFeatureFlag(key, distinctId, {
      groups,
    });
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check if a boolean feature flag is enabled on the server.
 *
 * @returns true if enabled, false otherwise (safe default)
 */
export async function isServerFeatureEnabled(
  key: string,
  distinctId: string,
  groups?: Record<string, string>,
): Promise<boolean> {
  const value = await getServerFeatureFlag(key, distinctId, groups);
  return value === true;
}

/**
 * Get all feature flags for a user on the server.
 * Useful for passing to client as initial state.
 */
export async function getAllServerFeatureFlags(
  distinctId: string,
  groups?: Record<string, string>,
): Promise<Record<string, boolean | string>> {
  const client = getServerClient();
  if (!client) return {};

  try {
    const flags = await client.getAllFlags(distinctId, { groups });
    return flags as Record<string, boolean | string>;
  } catch {
    return {};
  }
}
