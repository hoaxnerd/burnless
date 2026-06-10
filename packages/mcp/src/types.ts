/** Permission class in the app's existing read/write/delete model (spec D5). */
export type McpPermClass = "read" | "write" | "delete";

export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
}

/** A tool as discovered from an MCP server (subset of the SDK Tool type we persist). */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
}

/** Connection runtime spec — mirrors the mcp_connections row, decoupled from Drizzle. */
export interface McpConnectionSpec {
  id: string;
  slug: string;
  transport: "streamable_http" | "stdio";
  endpoint: string;
  args?: string[] | null;
  env?: Record<string, string> | null;
  authType: "oauth" | "pat" | "none";
}

export type McpSecret =
  | { accessToken: string; refreshToken?: string; expiresAt?: string }
  | { token: string };

export class McpConfigError extends Error {}
