/**
 * skills AI tool handlers (A6-2).
 *
 * One read tool — load_skill({ name }) — returns the full body of a named skill
 * from the filesystem-backed SkillSource. Gated by `getCapabilities().skills`
 * (belt-and-suspenders; the domain gate normally prevents the tool from being
 * offered at all in cloud deployments).
 *
 * Never throws — wraps in try/catch and returns error JSON.
 */

import { z } from "zod";
import type { ToolHandler } from "./types";
import { getCapabilities } from "@/lib/capabilities";
import { getSkillSource } from "@/lib/skills/source";

const LoadSkillSchema = z.object({
  name: z.string().min(1, "name is required"),
});

const loadSkill: ToolHandler = async (input) => {
  try {
    if (!getCapabilities().skills) {
      return JSON.stringify({ success: false, error: "Skills are not enabled on this deployment" });
    }
    const parsed = LoadSkillSchema.safeParse(input);
    if (!parsed.success) {
      return JSON.stringify({ success: false, error: parsed.error.message });
    }
    const { name } = parsed.data;
    const skill = await getSkillSource().load(name);
    if (!skill) {
      return JSON.stringify({ success: false, error: "Skill not found" });
    }
    return JSON.stringify({ success: true, name: skill.name, body: skill.body });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ success: false, error: msg });
  }
};

export const skillsHandlers: Record<string, ToolHandler> = {
  load_skill: loadSkill,
};

export const skillsSchemas: Record<string, z.ZodType> = {
  load_skill: LoadSkillSchema,
};
