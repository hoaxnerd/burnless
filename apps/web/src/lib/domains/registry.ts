/**
 * DomainRegistry — singleton registry for all domain modules.
 *
 * Pattern cloned from packages/engine/src/integrations.ts ProviderRegistry,
 * extended with async per-domain enable checks and active-surface getters.
 *
 * DORMANT (A3a-2): the registry is populated + exposed via /api/ai-features
 * `enabledDomains` but is NOT yet wired into chat/MCP/scheduler consumers —
 * that is A3a-3. Zero behavior change to existing AI surfaces.
 */

import type { ToolDefinition, ContextContributor, PromptSection } from "@burnless/ai";
import type { DomainModule } from "./contracts";
import { isDomainEnabled } from "@/lib/capabilities";

/** Context passed to getActive* queries (mirrors ContributeCtx but only needs companyId). */
export interface DomainQueryCtx {
  companyId?: string;
}

export class DomainRegistry {
  private modules = new Map<string, DomainModule>();
  /** Flat index of all tool names registered so far — detects duplicates across modules. */
  private toolNames = new Set<string>();

  /**
   * Register a domain module.
   * Throws if the module id or any tool name is already registered.
   */
  register(m: DomainModule): void {
    if (this.modules.has(m.id)) {
      throw new Error(`DomainRegistry: duplicate module id "${m.id}"`);
    }
    for (const t of m.tools) {
      if (this.toolNames.has(t.name)) {
        throw new Error(
          `DomainRegistry: duplicate tool name "${t.name}" (registered by module "${m.id}")`
        );
      }
    }
    // All checks passed — commit.
    for (const t of m.tools) {
      this.toolNames.add(t.name);
    }
    this.modules.set(m.id, m);
  }

  /** Return all registered modules (registration order). */
  getAll(): DomainModule[] {
    return Array.from(this.modules.values());
  }

  /** Return modules that are enabled for this context (async — may read DB for non-core). */
  async getEnabled(ctx: DomainQueryCtx): Promise<DomainModule[]> {
    const results: DomainModule[] = [];
    for (const m of this.modules.values()) {
      const enabled = await isDomainEnabled(m.id, { companyId: ctx.companyId });
      if (enabled) results.push(m);
    }
    return results;
  }

  /** Flat list of ToolDefinitions across all enabled modules. */
  async getActiveTools(ctx: DomainQueryCtx): Promise<ToolDefinition[]> {
    const enabled = await this.getEnabled(ctx);
    return enabled.flatMap((m) => m.tools);
  }

  /** Flat list of ContextContributors across all enabled modules. */
  async getActiveContextContributors(ctx: DomainQueryCtx): Promise<ContextContributor[]> {
    const enabled = await this.getEnabled(ctx);
    return enabled.flatMap((m) => m.contextContributors);
  }

  /** Flat list of PromptSections across all enabled modules. */
  async getActivePromptSections(ctx: DomainQueryCtx): Promise<PromptSection[]> {
    const enabled = await this.getEnabled(ctx);
    return enabled.flatMap((m) => m.promptSections);
  }

  /**
   * Active tools minus those excluded from MCP exposure by each module's mcpExclude predicate.
   * When a module has no mcpExclude, all its tools are MCP-exposed.
   */
  async getActiveMcpExposedTools(ctx: DomainQueryCtx): Promise<ToolDefinition[]> {
    const enabled = await this.getEnabled(ctx);
    return enabled.flatMap((m) =>
      m.mcpExclude ? m.tools.filter((t) => !m.mcpExclude!(t)) : m.tools
    );
  }
}

/** Singleton — populated by registerDomains() in domains/index.ts. */
export const domainRegistry = new DomainRegistry();
