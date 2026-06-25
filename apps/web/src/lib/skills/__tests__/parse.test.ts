import { describe, it, expect } from "vitest";
import { parseSkillFrontmatter } from "../parse";

describe("parseSkillFrontmatter", () => {
  it("parses well-formed frontmatter", () => {
    const content = `---
name: board-deck-prep
description: How to assemble a board-ready deck.
---
Step-by-step instructions here.
`;
    const result = parseSkillFrontmatter(content, "fallback");
    expect(result.name).toBe("board-deck-prep");
    expect(result.description).toBe("How to assemble a board-ready deck.");
    expect(result.body).toBe("Step-by-step instructions here.\n");
  });

  it("returns fallbackName and empty description when no frontmatter", () => {
    const content = "Just plain text without any frontmatter.";
    const result = parseSkillFrontmatter(content, "my-skill");
    expect(result.name).toBe("my-skill");
    expect(result.description).toBe("");
    expect(result.body).toBe(content);
  });

  it("uses fallbackName when frontmatter is missing `name`", () => {
    const content = `---
description: A description without name.
---
Body text.
`;
    const result = parseSkillFrontmatter(content, "dir-name");
    expect(result.name).toBe("dir-name");
    expect(result.description).toBe("A description without name.");
    expect(result.body).toBe("Body text.\n");
  });

  it("returns empty description when frontmatter missing `description`", () => {
    const content = `---
name: my-skill
---
Body here.
`;
    const result = parseSkillFrontmatter(content, "fallback");
    expect(result.name).toBe("my-skill");
    expect(result.description).toBe("");
    expect(result.body).toBe("Body here.\n");
  });

  it("handles CRLF line endings", () => {
    const content = "---\r\nname: crlf-skill\r\ndescription: CRLF test.\r\n---\r\nBody with CRLF.\r\n";
    const result = parseSkillFrontmatter(content, "fallback");
    expect(result.name).toBe("crlf-skill");
    expect(result.description).toBe("CRLF test.");
    expect(result.body).toContain("Body with CRLF.");
  });

  it("ignores unknown frontmatter keys", () => {
    const content = `---
name: skill-with-extras
description: Desc.
allowed-tools: some-tool
future-key: value
---
Body.
`;
    const result = parseSkillFrontmatter(content, "fallback");
    expect(result.name).toBe("skill-with-extras");
    expect(result.description).toBe("Desc.");
    expect(result.body).toBe("Body.\n");
  });

  it("handles missing closing fence as no frontmatter", () => {
    const content = `---
name: no-closing
description: Missing closing fence.
Body that follows.
`;
    const result = parseSkillFrontmatter(content, "fallback-dir");
    expect(result.name).toBe("fallback-dir");
    expect(result.description).toBe("");
    expect(result.body).toBe(content);
  });

  it("trims body leading whitespace/newlines", () => {
    const content = `---
name: trimmed
description: Trim body.
---

  Body after blank line.
`;
    const result = parseSkillFrontmatter(content, "fallback");
    expect(result.body.startsWith("Body after")).toBe(true);
  });

  it("handles value with colon in it (splits on first colon only)", () => {
    const content = `---
name: colon-test
description: See: https://example.com for details.
---
Body.
`;
    const result = parseSkillFrontmatter(content, "fallback");
    expect(result.description).toBe("See: https://example.com for details.");
  });
});
