/**
 * skills-contributor.test.ts (A6-2)
 *
 * Tests the tier-1 skills listing ContextContributor.
 * Mocks getCapabilities and getSkillSource to exercise all degradation paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Capability mock ───────────────────────────────────────────────────────────
type PartialCaps = { skills: boolean };
const capsMock: ReturnType<typeof vi.fn> = vi.fn(() => ({ skills: true } as PartialCaps));

vi.mock("@/lib/capabilities", () => ({
  getCapabilities: () => capsMock() as PartialCaps,
  requireCapability: vi.fn(() => null),
}));

vi.mock("@/lib/domain-gating", () => ({
  isDomainEnabled: vi.fn(async () => true),
  requireDomainEnabled: vi.fn(async () => null),
}));

// ── SkillSource mock ──────────────────────────────────────────────────────────
type SkillMetaItem = { name: string; description: string };
const listMock: ReturnType<typeof vi.fn> = vi.fn(async () => [] as SkillMetaItem[]);
const loadMock = vi.fn(async () => null);

vi.mock("@/lib/skills/source", () => ({
  getSkillSource: vi.fn(() => ({ list: listMock, load: loadMock })),
  skillsDir: vi.fn(() => "/fake/skills"),
  FileSystemSkillSource: vi.fn(),
}));

beforeEach(() => {
  capsMock.mockReturnValue({ skills: true });
  listMock.mockResolvedValue([]);
  loadMock.mockResolvedValue(null);
});

describe("skillsContributor.sections()", () => {
  const ctx = { companyId: "c1" };

  it("returns [] when skills capability is off", async () => {
    capsMock.mockReturnValue({ skills: false });
    const { skillsContributor } = await import("../skills-contributor");
    const sections = await skillsContributor.sections(ctx);
    expect(sections).toEqual([]);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns [] when skill list is empty", async () => {
    listMock.mockResolvedValueOnce([]);
    const { skillsContributor } = await import("../skills-contributor");
    const sections = await skillsContributor.sections(ctx);
    expect(sections).toEqual([]);
  });

  it("returns one section with heading 'Available skills' and order 30 when skills exist", async () => {
    listMock.mockResolvedValueOnce([
      { name: "board-deck-prep", description: "How to prep a board deck." },
      { name: "runway-analysis", description: "Deep dive into runway." },
    ]);
    const { skillsContributor } = await import("../skills-contributor");
    const sections = await skillsContributor.sections(ctx);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe("Available skills");
    expect(sections[0]!.order).toBe(30);
    expect(sections[0]!.body).toContain("**board-deck-prep**: How to prep a board deck. (load with load_skill)");
    expect(sections[0]!.body).toContain("**runway-analysis**: Deep dive into runway. (load with load_skill)");
  });

  it("returns [] when list() throws (graceful degradation)", async () => {
    listMock.mockRejectedValueOnce(new Error("fs error"));
    const { skillsContributor } = await import("../skills-contributor");
    const sections = await skillsContributor.sections(ctx);
    expect(sections).toEqual([]);
  });
});
