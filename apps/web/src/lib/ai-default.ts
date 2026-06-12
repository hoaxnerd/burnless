import { getEdition } from "@/lib/capabilities";

/**
 * Initial value for aiFeatureFlags.masterEnabled at company creation (#34).
 * AI is ON by default for BOTH editions:
 *  - cloud: a managed provider always exists.
 *  - self_host: if no provider key is set yet, AI degrades gracefully (chat
 *    returns a friendly stub); the moment a key lands it "just works" because
 *    the switch was already on. We must NOT persist a `false` merely because a
 *    key is absent — only an explicit user toggle sets it false.
 * Centralized + edition-aware so a future cloud/local divergence has one home.
 */
export function initialAiMasterEnabled(): boolean {
  void getEdition(); // edition seam — both editions currently default ON
  return true;
}
