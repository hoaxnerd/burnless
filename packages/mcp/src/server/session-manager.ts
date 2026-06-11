/**
 * In-memory MCP session manager (expose spec §4.2/§4.6). globalThis singleton
 * (HMR-safe — same pattern as connection-manager.ts). In-memory is SOUND for
 * the deployment target: one standalone Node container (see spec §4.6;
 * multi-replica needs sticky sessions or Redis — documented follow-up).
 */
import type { BridgedServer } from "./http-bridge";

export interface McpClientInfo {
  name?: string;
  version?: string;
}

/** Mutable per-session protocol state. `scopes` are opaque strings here —
 *  the web layer assigns meaning (read/write/delete) and REFRESHES them on
 *  every request (re-cap per call, spec §4.3 step 2). `scenarioId` is the
 *  session-scoped scenario carrier (spec §4.4 — no cookies/headers). */
export interface McpSessionState {
  scenarioId: string | null;
  scopes: string[];
}

export interface McpSession {
  id: string;
  bridge: BridgedServer;
  state: McpSessionState;
  /** Identity of the credential that minted the session, e.g. "pat:<id>".
   *  A session id presented with a different credential is treated as
   *  unknown (404) — hijack guard (spec §4.3 step 4). */
  credentialKey: string;
  clientInfo: McpClientInfo | null;
  lastSeenAt: number;
}

const DEFAULT_IDLE_MS = 30 * 60 * 1000;

export class McpSessionManager {
  private sessions = new Map<string, McpSession>();

  constructor(
    private idleMs: number = DEFAULT_IDLE_MS,
    private now: () => number = Date.now
  ) {}

  create(entry: Omit<McpSession, "id" | "lastSeenAt">): McpSession {
    this.sweep();
    const session: McpSession = {
      ...entry,
      id: crypto.randomUUID(),
      lastSeenAt: this.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string, credentialKey: string): McpSession | null {
    this.sweep();
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.credentialKey !== credentialKey) return null;
    session.lastSeenAt = this.now();
    return session;
  }

  async terminate(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;
    this.sessions.delete(id);
    try {
      await session.bridge.close();
    } catch {
      // already closed — fine
    }
    return true;
  }

  /** Lazy idle eviction on every access — no timers (test/HMR-safe). */
  private sweep(): void {
    const cutoff = this.now() - this.idleMs;
    for (const [id, session] of this.sessions) {
      if (session.lastSeenAt < cutoff) {
        this.sessions.delete(id);
        void session.bridge.close().catch(() => {});
      }
    }
  }
}

const globalForSessions = globalThis as unknown as {
  __burnless_mcp_sessions?: McpSessionManager;
};

export function getMcpSessionManager(): McpSessionManager {
  if (!globalForSessions.__burnless_mcp_sessions) {
    globalForSessions.__burnless_mcp_sessions = new McpSessionManager();
  }
  return globalForSessions.__burnless_mcp_sessions;
}
