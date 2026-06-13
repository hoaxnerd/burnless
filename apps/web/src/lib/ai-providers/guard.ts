import { NextResponse } from "next/server";
import { getCapabilities } from "@/lib/capabilities";

/**
 * Provider config is a self-host feature. On cloud (managedAiProvider ON) keys
 * are server-managed → 403. Inverse of requireCapability. Returns a 403 to bail, else null.
 */
export function requireSelfManagedAi(): NextResponse | null {
  if (getCapabilities().managedAiProvider) {
    return NextResponse.json(
      { error: "AI provider configuration is managed on this deployment", code: "AI_PROVIDER_MANAGED" },
      { status: 403 }
    );
  }
  return null;
}
