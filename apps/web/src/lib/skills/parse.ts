/**
 * Minimal SKILL.md frontmatter parser (A6-1).
 * No external dependencies — hand-rolled to keep zero-dep ethos.
 */

export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
}

/**
 * Parse a SKILL.md file's content into name, description, and body.
 *
 * Format:
 *   ---
 *   name: some-skill
 *   description: What this skill does.
 *   ---
 *   Body markdown…
 *
 * Degradation rules:
 * - Missing/malformed frontmatter → name = fallbackName, description = "", body = full content.
 * - Frontmatter missing `description` → description = "".
 * - Frontmatter missing `name` → name = fallbackName.
 * - CRLF line endings are normalized.
 */
export function parseSkillFrontmatter(content: string, fallbackName: string): ParsedSkill {
  // Normalize CRLF → LF and strip optional BOM.
  const normalized = content.replace(/^﻿/, "").replace(/\r\n/g, "\n");

  // Must start with a frontmatter fence.
  if (!normalized.startsWith("---\n")) {
    return { name: fallbackName, description: "", body: content };
  }

  // Find the closing fence (a line that is exactly "---").
  const lines = normalized.split("\n");
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    // Opening fence found but no closing fence — treat as no frontmatter.
    return { name: fallbackName, description: "", body: content };
  }

  // Parse the key: value lines between the fences.
  const frontmatterLines = lines.slice(1, closingIndex);
  const fm: Record<string, string> = {};
  for (const line of frontmatterLines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) fm[key] = value;
  }

  // Everything after the closing fence is the body.
  const bodyLines = lines.slice(closingIndex + 1);
  const body = bodyLines.join("\n").trimStart();

  return {
    name: fm["name"]?.trim() || fallbackName,
    description: fm["description"]?.trim() ?? "",
    body,
  };
}
