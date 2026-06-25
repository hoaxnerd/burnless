/**
 * SkillSource interface and filesystem implementation (A6-1).
 * Server-only — uses node:fs. Never import in client/edge code.
 */

import { join } from "node:path";
import os from "node:os";
import fs from "node:fs";
import { parseSkillFrontmatter } from "./parse";

export interface SkillMeta {
  name: string;
  description: string;
}

export interface Skill extends SkillMeta {
  body: string;
}

export interface SkillSource {
  list(): Promise<SkillMeta[]>;
  load(name: string): Promise<Skill | null>;
}

/** Resolved skills directory path. */
export function skillsDir(): string {
  return (
    process.env["BURNLESS_SKILLS_DIR"]?.trim() ||
    join(os.homedir(), ".burnless", "skills")
  );
}

/**
 * Filesystem-backed SkillSource.
 * Constructor takes an explicit dir so tests can pass a temp path without
 * touching HOME or env vars. getSkillSource() wraps it with the env default.
 *
 * Structure: <dir>/<skill-name>/SKILL.md
 *
 * Graceful degradation:
 * - Non-existent dir → list() returns []
 * - Dir entry missing SKILL.md → skipped
 * - Malformed SKILL.md → name/description degrade (see parseSkillFrontmatter)
 * - Any fs error → []  / null (never throws)
 */
export class FileSystemSkillSource implements SkillSource {
  constructor(private readonly dir: string) {}

  async list(): Promise<SkillMeta[]> {
    try {
      if (!fs.existsSync(this.dir)) return [];
      const entries = fs.readdirSync(this.dir, { withFileTypes: true });
      const skills: SkillMeta[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillMdPath = join(this.dir, entry.name, "SKILL.md");
        if (!fs.existsSync(skillMdPath)) continue;
        try {
          const content = fs.readFileSync(skillMdPath, "utf8");
          const parsed = parseSkillFrontmatter(content, entry.name);
          skills.push({ name: parsed.name, description: parsed.description });
        } catch {
          // Malformed or unreadable SKILL.md — skip this entry.
        }
      }
      return skills;
    } catch {
      return [];
    }
  }

  async load(name: string): Promise<Skill | null> {
    try {
      if (!fs.existsSync(this.dir)) return null;
      const entries = fs.readdirSync(this.dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillMdPath = join(this.dir, entry.name, "SKILL.md");
        if (!fs.existsSync(skillMdPath)) continue;
        try {
          const content = fs.readFileSync(skillMdPath, "utf8");
          const parsed = parseSkillFrontmatter(content, entry.name);
          // Match by parsed name or by directory name.
          if (parsed.name === name || entry.name === name) {
            return { name: parsed.name, description: parsed.description, body: parsed.body };
          }
        } catch {
          // Skip unreadable entries.
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}

/** Returns the default filesystem-backed SkillSource using env-resolved dir. */
export function getSkillSource(): SkillSource {
  return new FileSystemSkillSource(skillsDir());
}
