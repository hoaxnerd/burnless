/**
 * DomainModule contract — apps/web (references handlers/jobs/caps).
 * Pure types: no DB/Next/I/O at this layer.
 */

import type { ToolDefinition, ContextContributor, PromptSection } from "@burnless/ai";
import type { ToolHandler } from "@/lib/ai-tools/types";

/** Backend nav entry for a domain (icon = lucide name; sidebar maps to component). */
export interface DomainNavEntry {
  id: string;
  href: string;
  label: string;
  /** Lucide icon component name (e.g. "LayoutDashboard"). Sidebar resolves to component. */
  icon: string;
}

/**
 * A DomainModule bundles all the AI surfaces a domain contributes:
 * tools, handlers, context, prompt sections, nav, and MCP exclusion logic.
 *
 * core: true  — always-on regardless of deployment capability or company toggle (finance).
 * capability  — optional CAP_DOMAIN key for non-core domains.
 */
export interface DomainModule {
  id: string;
  core?: boolean;
  /** Optional key into CAP_DOMAIN for non-core domains. */
  capability?: string;
  tools: ToolDefinition[];
  handlers: Record<string, ToolHandler>;
  contextContributors: ContextContributor[];
  promptSections: PromptSection[];
  navEntries: DomainNavEntry[];
  /** Predicate for MCP exclusion. Tools where this returns true are omitted from MCP exposure. */
  mcpExclude?: (t: ToolDefinition) => boolean;
}
