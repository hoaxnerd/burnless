/**
 * Recall context contributor (A5-3).
 *
 * Injects the top-K semantically-recalled memories (recall-tier) into the system
 * message. Self-gating in strict order so it contributes NOTHING and adds ZERO
 * cost in production (recall-tier is empty until a consumer populates it):
 *
 *   1. semanticSearch capability OFF                  → []
 *   2. no 1536-dim embedder (MemoryStore.searchable)  → []
 *   3. company has NO recall-tier row (cheap guard)   → []  (no embedding call)
 *   4. embed + cosine-search; no hits                 → []
 *   5. any error                                       → []  (never breaks a turn)
 *
 * The order-3 guard is load-bearing: A5-3 flips `semanticSearch` ON for cloud, so
 * without it the contributor would embed on EVERY cloud chat turn against an empty
 * recall-tier (wasted latency + cost). `hasRecallMemory` is a single cheap indexed
 * query that returns false in prod, short-circuiting before the embedding API.
 */

import type {
  ContextContributor,
  ContextSection,
  ContributeCtx,
} from "@burnless/ai";
import { hasRecallMemory } from "@burnless/db";
import { getCapabilities } from "@/lib/capabilities";
import { MemoryStore } from "./memory-store";

const DOMAIN = "memory";

export const recallContributor: ContextContributor = {
  id: "memory-recall",
  domain: DOMAIN,
  async sections(ctx: ContributeCtx): Promise<ContextSection[]> {
    // 1. Capability gate — semanticSearch off (self-host default) → nothing.
    if (!getCapabilities().semanticSearch) return [];

    // 2. Runtime backstop: a 1536-dim embedder must be available.
    const store = new MemoryStore();
    if (!store.searchable) return [];

    try {
      // 3. Cost guard: skip embedding entirely when recall-tier is empty (prod).
      if (!(await hasRecallMemory(ctx.companyId))) return [];

      // 4. Embed + cosine-search recall-tier rows for this company.
      // TODO(memory-consumer): pass the live user message via ContributeCtx when a
      // recall consumer lands — until then we search a benign company-scoped query.
      const hits = await store.search(ctx.companyId, ctx.companyId, { topK: 5 });
      if (!hits.length) return [];
      return [
        {
          heading: "Relevant context from memory",
          body: hits.map((h) => `- ${h.content}`).join("\n"),
          order: 20,
        },
      ];
    } catch {
      // 5. Graceful degradation — a memory failure must never break the chat turn.
      return [];
    }
  },
};
