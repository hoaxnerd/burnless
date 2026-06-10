/**
 * Client-side row shapes for the MCP Connections UI.
 *
 * These mirror the JSON returned by the Plan 1 API routes:
 * - `GET /api/mcp/connections` → `McpConnectionDto[]` (raw `mcp_connections` rows)
 * - `GET /api/mcp/connections/[id]/tools` → `McpToolDto[]` (cached capabilities
 *   merged with per-tool prefs + effective permission class)
 */

export interface McpConnectionDto {
  id: string;
  name: string;
  slug: string;
  ownerScope: "company" | "personal";
  transport: "streamable_http" | "stdio";
  endpoint: string;
  authType: "oauth" | "pat" | "none";
  status: "pending" | "connected" | "needs_auth" | "error" | "disabled";
  capabilities: { tools: Array<{ name: string; description?: string }> } | null;
  lastError: string | null;
}

export interface McpToolDto {
  name: string;
  description: string | null;
  enabled: boolean;
  permClass: "read" | "write" | "delete";
  permClassOverride: "read" | "write" | "delete" | null;
}
