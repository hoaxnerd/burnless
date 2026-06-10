import type { Metadata } from "next";
import { ConnectionsGrid } from "@/components/mcp/connections-grid";

export const metadata: Metadata = { title: "Connections" };

/**
 * Connections — MCP server management (mockup: placement.html).
 *
 * The page is a thin server shell; `ConnectionsGrid` (client) owns the header,
 * the connection cards, and the Add-connection modal state, mirroring how
 * other dashboard pages with modals split server/client.
 */
export default function ConnectionsPage() {
  return <ConnectionsGrid />;
}
