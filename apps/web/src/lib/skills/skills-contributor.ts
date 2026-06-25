/**
 * Tier-1 skills context contributor (A6-2).
 *
 * Lists available skills in the AI system-message context so the model knows
 * what skills exist and can call load_skill to fetch full instructions on demand.
 *
 * Gated by `getCapabilities().skills` — returns [] immediately when off.
 * Graceful degradation: empty skills dir → []; list throws → [].
 */

import type { ContextContributor, ContextSection, ContributeCtx } from "@burnless/ai";
import { getCapabilities } from "@/lib/capabilities";
import { getSkillSource } from "@/lib/skills/source";

export const skillsContributor: ContextContributor = {
  id: "skills-list",
  domain: "skills",
  async sections(_ctx: ContributeCtx): Promise<ContextSection[]> {
    if (!getCapabilities().skills) return [];
    try {
      const skills = await getSkillSource().list();
      if (!skills.length) return [];
      const body = skills
        .map((s) => `- **${s.name}**: ${s.description} (load with load_skill)`)
        .join("\n");
      return [{ heading: "Available skills", body, order: 30 }];
    } catch {
      return [];
    }
  },
};
