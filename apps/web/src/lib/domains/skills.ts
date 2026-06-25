/**
 * skills domain module (A6-2).
 *
 * Bundles the load_skill tool, the tier-1 skills listing contributor, and the
 * skills prompt section. Capability-gated: `capability: "skills"` makes
 * isDomainEnabled return false when getCapabilities().skills === false (cloud),
 * causing the entire domain — tools, context, and prompt — to disappear
 * automatically via the registry's getEnabled() path.
 *
 * core: false — capability-gated (self-host only until cloud/DB-backed skills land).
 */

import type { ToolDefinition, PromptSection } from "@burnless/ai";
import { skillsHandlers } from "@/lib/ai-tools/skills";
import { skillsContributor } from "@/lib/skills/skills-contributor";
import type { DomainModule } from "./contracts";

const DOMAIN = "skills";

export const skillsTools: ToolDefinition[] = [
  {
    name: "load_skill",
    description:
      "Load the full instructions for a named skill (from the Available skills list) when it's relevant to the user's request.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The skill name to load." },
      },
      required: ["name"],
    },
  },
];

const skillsPrompt: PromptSection = {
  id: "skills-prompt",
  domain: DOMAIN,
  order: 30,
  body: "Some capabilities are provided as skills. The Available skills list shows what exists; call `load_skill(name)` to load a skill's full instructions when it's relevant, then follow them.",
};

export const skillsDomainModule: DomainModule = {
  id: DOMAIN,
  core: false,
  capability: "skills",
  tools: skillsTools,
  handlers: skillsHandlers,
  contextContributors: [skillsContributor],
  promptSections: [skillsPrompt],
  navEntries: [],
};
