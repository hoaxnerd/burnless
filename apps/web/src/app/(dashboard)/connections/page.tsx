import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getCompanyForUser } from "@burnless/db";
import { env } from "@/lib/env";
import { ConnectionsTabs } from "@/components/mcp/connections-tabs";

export const metadata: Metadata = { title: "Connections" };

/**
 * Connections — the MCP home (expose spec B6): Connected (consume grid) |
 * Your MCP (expose surface) as two tabs of one page. Server shell resolves
 * the endpoint URL + the caller's role (kill-switch gating, Task 13);
 * ConnectionsTabs (client) owns tab + modal state.
 */
export default async function ConnectionsPage() {
  const session = await auth();
  const membership = session?.user?.id ? await getCompanyForUser(session.user.id) : null;
  return (
    <ConnectionsTabs
      mcpEndpoint={`${env.APP_URL}/mcp`}
      userRole={membership?.role ?? "viewer"}
    />
  );
}
