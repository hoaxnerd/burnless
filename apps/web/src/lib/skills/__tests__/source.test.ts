import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { FileSystemSkillSource } from "../source";

function createTempDir(): string {
  return mkdtempSync(join(os.tmpdir(), "burnless-skills-test-"));
}

function seedSkill(baseDir: string, dirName: string, content: string): void {
  const skillDir = join(baseDir, dirName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), content, "utf8");
}

describe("FileSystemSkillSource", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    tempDirs.length = 0;
  });

  function makeTempDir(): string {
    const dir = createTempDir();
    tempDirs.push(dir);
    return dir;
  }

  it("list() returns both skills from a seeded dir", async () => {
    const dir = makeTempDir();
    seedSkill(dir, "skillA", `---
name: skill-a
description: First skill.
---
Body of skill A.
`);
    seedSkill(dir, "skillB", `---
name: skill-b
description: Second skill.
---
Body of skill B.
`);
    const source = new FileSystemSkillSource(dir);
    const list = await source.list();
    expect(list).toHaveLength(2);
    const names = list.map((s) => s.name);
    expect(names).toContain("skill-a");
    expect(names).toContain("skill-b");
  });

  it("list() returns [] for a non-existent directory", async () => {
    const source = new FileSystemSkillSource("/nonexistent/path/that/does/not/exist");
    const list = await source.list();
    expect(list).toEqual([]);
  });

  it("list() returns [] for an empty directory", async () => {
    const dir = makeTempDir();
    const source = new FileSystemSkillSource(dir);
    const list = await source.list();
    expect(list).toEqual([]);
  });

  it("list() skips entries that are not directories", async () => {
    const dir = makeTempDir();
    // Write a file at the top level (not a subdir).
    writeFileSync(join(dir, "not-a-skill.md"), "raw file");
    const source = new FileSystemSkillSource(dir);
    const list = await source.list();
    expect(list).toEqual([]);
  });

  it("list() skips subdirs without SKILL.md", async () => {
    const dir = makeTempDir();
    // Create a subdir but with no SKILL.md inside.
    mkdirSync(join(dir, "no-skill-md"));
    // Create another with SKILL.md.
    seedSkill(dir, "has-skill", `---
name: real-skill
description: Real.
---
Body.
`);
    const source = new FileSystemSkillSource(dir);
    const list = await source.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("real-skill");
  });

  it("load() returns the skill by parsed name", async () => {
    const dir = makeTempDir();
    seedSkill(dir, "my-skill-dir", `---
name: my-skill
description: A skill.
---
Instructions here.
`);
    const source = new FileSystemSkillSource(dir);
    const skill = await source.load("my-skill");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("my-skill");
    expect(skill!.description).toBe("A skill.");
    expect(skill!.body).toContain("Instructions here.");
  });

  it("load() returns skill by dirname when frontmatter name differs", async () => {
    const dir = makeTempDir();
    // No name in frontmatter — falls back to dir name.
    seedSkill(dir, "skillA", `---
description: Skill with no name in frontmatter.
---
Body.
`);
    const source = new FileSystemSkillSource(dir);
    const skill = await source.load("skillA");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("skillA");
  });

  it("load() returns null for a missing skill name", async () => {
    const dir = makeTempDir();
    seedSkill(dir, "existing-skill", `---
name: existing-skill
description: Exists.
---
Body.
`);
    const source = new FileSystemSkillSource(dir);
    const skill = await source.load("missing");
    expect(skill).toBeNull();
  });

  it("load() returns null when dir does not exist", async () => {
    const source = new FileSystemSkillSource("/no/such/dir");
    const skill = await source.load("anything");
    expect(skill).toBeNull();
  });

  it("list() includes description from frontmatter", async () => {
    const dir = makeTempDir();
    seedSkill(dir, "desc-skill", `---
name: described
description: Rich description here.
---
Body.
`);
    const source = new FileSystemSkillSource(dir);
    const list = await source.list();
    expect(list[0]?.description).toBe("Rich description here.");
  });

  it("list() falls back to empty description when missing from frontmatter", async () => {
    const dir = makeTempDir();
    seedSkill(dir, "no-desc", `---
name: no-desc-skill
---
Body.
`);
    const source = new FileSystemSkillSource(dir);
    const list = await source.list();
    expect(list[0]?.description).toBe("");
  });
});
