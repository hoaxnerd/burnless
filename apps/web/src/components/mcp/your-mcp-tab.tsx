"use client";

/**
 * Your MCP tab (mockup expose-ui.html §1): endpoint card → PAT table →
 * Connected apps → audit teaser. Token modal mounts in Task 12; kill-switch
 * + warning states in Task 13.
 */
import Link from "next/link";
import { useApiTokens, useOauthGrants } from "@/lib/swr/hooks";
import { useCompany } from "@/lib/swr/hooks";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-fetch";
import { EndpointCard } from "./endpoint-card";
import { PatTable } from "./pat-table";
import { ConnectedAppsTable } from "./connected-apps-table";
import { NewTokenModal } from "./new-token-modal";

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
  const companySwr = useCompany();
  const { error: toastError } = useToast();
  const serverEnabled = (companySwr.data?.mcpServerEnabled as boolean | undefined) ?? true;
  const canToggle = userRole === "owner" || userRole === "admin";

  async function toggleServer(enabled: boolean) {
    // optimistic flip, rollback on failure
    void companySwr.mutate(
      companySwr.data ? { ...companySwr.data, mcpServerEnabled: enabled } : companySwr.data,
      { revalidate: false }
    );
    try {
      const res = await apiFetch("/api/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpServerEnabled: enabled }),
      });
      if (!res.ok) throw new Error("toggle failed");
    } catch {
      toastError("Could not change agent access — please retry.");
    } finally {
      void companySwr.mutate();
    }
  }

  return (
    <div className="max-w-[980px]">
      <EndpointCard
        mcpEndpoint={mcpEndpoint}
        serverEnabled={serverEnabled}
        canToggle={canToggle}
        onToggle={(enabled) => void toggleServer(enabled)}
      />
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
      <NewTokenModal
        open={tokenModalOpen}
        onClose={() => onTokenModalChange?.(false)}
        onMinted={() => void tokensSwr.mutate()}
        userRole={userRole}
      />
    </div>
  );
}
