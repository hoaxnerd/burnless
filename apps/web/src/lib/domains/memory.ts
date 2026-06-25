/**
 * memory domain module (A5-3).
 *
 * A tiny core module that registers the recall context contributor. No tools, no
 * prompt section, no nav — just the contributor, which self-gates on
 * semanticSearch + a 1536-dim embedder + recall-tier data (see recall-contributor).
 *
 * core:true → always registered, but the contributor injects nothing until all of
 * (semanticSearch ON, 1536-dim embedder, populated recall-tier) hold — so it adds
 * nothing in production where recall-tier is still empty.
 */

import { recallContributor } from "@/lib/memory/recall-contributor";
import type { DomainModule } from "./contracts";

export const memoryDomainModule: DomainModule = {
  id: "memory",
  core: true,
  tools: [],
  handlers: {},
  contextContributors: [recallContributor],
  promptSections: [],
  navEntries: [],
};
