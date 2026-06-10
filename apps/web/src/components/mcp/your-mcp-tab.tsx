"use client";

/**
 * Your MCP tab (mockup expose-ui.html §1): endpoint card → PAT table →
 * Connected apps → audit teaser. Token modal mounts in Task 12; kill-switch
 * + warning states in Task 13.
 */
import Link from "next/link";
import { useApiTokens, useOauthGrants } from "@/lib/swr/hooks";
import { EndpointCard } from "./endpoint-card";
import { PatTable } from "./pat-table";
import { ConnectedAppsTable } from "./connected-apps-table";

export function YourMcpTab({
  mcpEndpoint,
  userRole,
  tokenModalOpen = false,
  onTokenModalChange,
}: {
  mcpEndpoint: string;
  userRole: string;
  /** Lifted by ConnectionsTabs (header "New token" button). Consumed by the
   *  Task-12 modal; declared now so the tabs wiring type-checks. */
  tokenModalOpen?: boolean;
  onTokenModalChange?: (open: boolean) => void;
}) {
  const tokensSwr = useApiTokens();
  const grantsSwr = useOauthGrants();
  // Task 12 mounts <NewTokenModal> here using tokenModalOpen/onTokenModalChange.
  void tokenModalOpen;
  void onTokenModalChange;
  void userRole;

  return (
    <div className="max-w-[980px]">
      <EndpointCard mcpEndpoint={mcpEndpoint} />
      <PatTable tokens={tokensSwr.data ?? []} onChanged={() => void tokensSwr.mutate()} />
      <ConnectedAppsTable grants={grantsSwr.data ?? []} onChanged={() => void grantsSwr.mutate()} />
      <div className="flex items-center justify-between px-1 py-0.5">
        <span className="text-[11.5px] text-surface-400">
          Every agent call is logged with token, client, and input.
        </span>
        <Link href="/settings" className="text-xs font-semibold text-brand-600">
          View audit log →
        </Link>
      </div>
    </div>
  );
}
