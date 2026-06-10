"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plug, Plus } from "lucide-react";
import { AsyncData, Button, DataEmptyState, useQueryState } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useMcpConnections } from "@/lib/swr/hooks";
import type { McpConnectionDto } from "./types";
import { ConnectionCard } from "./connection-card";
import { AddConnectionModal } from "./add-connection-modal";
import { ManageConnectionPanel } from "./manage-connection-panel";

/** Friendly copy for the OAuth callback's `?error=` codes (api/mcp/oauth/callback). */
const OAUTH_ERROR_COPY: Record<string, string> = {
  missing_code_or_state: "Authorization was cancelled or the provider sent an incomplete response.",
  unknown_connection: "This authorization doesn't match any of your connections.",
  state_mismatch: "Authorization state didn't match — please try connecting again.",
  exchange_failed: "The provider rejected the authorization — please try again.",
  connected_but_unauthorized: "Signed in, but the server still refused the connection.",
};

/**
 * Surfaces the OAuth callback's `?connected=<slug>` / `?error=<code>` query
 * params as toasts, then strips them from the URL. Isolated child so the
 * `useSearchParams()` suspense boundary stays local to this no-op renderer.
 */
function OAuthReturnToasts({ onConnected }: { onConnected: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { success, error } = useToast();
  const fired = useRef(false);
  const connected = searchParams.get("connected");
  const errorCode = searchParams.get("error");

  useEffect(() => {
    if (fired.current || (!connected && !errorCode)) return;
    fired.current = true;
    if (connected) {
      success(`Connected to ${connected}`);
      onConnected();
    } else if (errorCode) {
      error(OAUTH_ERROR_COPY[errorCode] ?? "Authorization failed — please try again.");
    }
    router.replace("/connections", { scroll: false });
  }, [connected, errorCode, success, error, onConnected, router]);

  return null;
}

/**
 * Connections page body — header + connection-card grid + Add-connection modal
 * + Manage panel (mockup: placement.html content area).
 *
 * Owns the modal state for both the add flow (Task 3) and the manage panel
 * (Task 4); the grid itself is pixel-matched to the mockup's `.grid` / `.conn`
 * blocks (2-col, 14px gap, dashed add-card).
 */
export function ConnectionsGrid() {
  const swr = useMcpConnections();
  const query = useQueryState(swr);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<McpConnectionDto | null>(null);

  return (
    <div>
      <Suspense fallback={null}>
        <OAuthReturnToasts onConnected={() => void swr.mutate()} />
      </Suspense>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-surface-900 sm:text-2xl">
            Connections
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            Connect any MCP server. Your Companion can use their tools; you can
            browse their data.
          </p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
          Add connection
        </Button>
      </div>

      <AsyncData
        query={query}
        onRetry={() => void swr.mutate()}
        empty={
          <DataEmptyState
            title="Connect your first MCP server"
            body="Paste a server config or URL — your Companion can use its tools, and you can browse its data."
            icon={Plug}
            action={
              <Button
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setAdding(true)}
              >
                Add connection
              </Button>
            }
          />
        }
      >
        {(connections) => (
          <div className="grid gap-3.5 md:grid-cols-2">
            {connections.map((c) => (
              <ConnectionCard key={c.id} connection={c} onManage={setManaging} />
            ))}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-surface-200 bg-surface-0 text-[13px] font-semibold text-surface-500 transition-colors hover:border-surface-300 hover:text-surface-600"
            >
              <Plus className="h-[18px] w-[18px] text-surface-400" strokeWidth={2} />
              Add a connection
            </button>
          </div>
        )}
      </AsyncData>

      <AddConnectionModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => {
          setAdding(false);
          void swr.mutate();
        }}
      />
      <ManageConnectionPanel
        connection={managing}
        onClose={() => setManaging(null)}
      />
    </div>
  );
}
